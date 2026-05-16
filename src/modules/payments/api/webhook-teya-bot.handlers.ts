import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@core/db';
import { eventBus } from '@core/event-bus';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

const WEBHOOK_KEYS: Record<string, string> = {
  camping: process.env.TEYA_CAMPING_WEBHOOK_KEY || '',
  glamping: process.env.TEYA_GLAMPING_WEBHOOK_KEY || '',
};

function verifySignature(body: string, signature: string): boolean {
  if (!signature) return false;
  for (const [, rawKey] of Object.entries(WEBHOOK_KEYS)) {
    if (!rawKey) continue;
    try {
      const pemKey = rawKey.startsWith('-----BEGIN') ? rawKey : `-----BEGIN PUBLIC KEY-----\n${rawKey}\n-----END PUBLIC KEY-----`;
      const verifier = crypto.createVerify('SHA256');
      verifier.update(body);
      if (verifier.verify(pemKey, signature, 'base64')) return true;
    } catch { /* try next key */ }
  }
  return false;
}

async function handleCrmDepositPaid(metadata: Record<string, string>, amountCzk: number, sessionId: string) {
  try {
    const db = getDb();
    const reservationIds = (metadata.reservation_ids || '').split(',').filter(Boolean);
    const leadId = metadata.lead_id || '';
    const guestName = metadata.guest_name || 'Гість';
    const depositPercent = metadata.deposit_percent || '30';

    if (!reservationIds.length) {
      console.error('[Teya Deposit] No reservation_ids in metadata');
      return;
    }

    const paidAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

    for (const resId of reservationIds) {
      db.prepare(`
        UPDATE reservations SET
          status = 'confirmed',
          payment_status = 'prepaid',
          deposit_status = 'paid',
          deposit_paid_at = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(paidAt, resId);

      // Legacy: this used to INSERT into the `payments` table, which was
      // dropped in the finance refactor (clean-7). PMS-side state above
      // (reservations.payment_status = 'prepaid') is now the source of
      // truth; the fin_operation only appears once the bank statement
      // import sees the matching Teya payout.
    }

    if (leadId) {
      db.prepare(`UPDATE crm_leads SET stage = 'booked', updated_at = datetime('now') WHERE id = ?`).run(leadId);
    }

    const res = db.prepare(`
      SELECT r.check_in, r.check_out, r.total_price, u.code as unit_code
      FROM reservations r JOIN units u ON r.unit_id = u.id
      WHERE r.id = ?
    `).get(reservationIds[0]) as { check_in: string; check_out: string; total_price: number; unit_code: string } | undefined;

    const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const msg = [
      `💳 <b>Передплата отримана! Бронювання підтверджено.</b>`,
      ``,
      `👤 ${esc(guestName)}`,
      res ? `📍 ${esc(res.unit_code || '')} · ${res.check_in} – ${res.check_out}` : '',
      reservationIds.length > 1 ? `🏕 Місць: ${reservationIds.length}` : '',
      ``,
      `💰 Передплата: <b>${amountCzk.toLocaleString()} CZK</b>`,
      res ? `📊 Повна вартість: ${((res.total_price || 0) * reservationIds.length).toLocaleString()} CZK` : '',
      `✅ Статус: <b>Підтверджено (prepaid)</b>`,
    ].filter(Boolean).join('\n');

    await sendTelegramMessage(msg).catch(e => console.error('[Teya Deposit] TG notify error:', e.message));
    console.log(`[Teya Deposit] Confirmed ${reservationIds.length} reservations for lead ${leadId}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Teya Deposit] Auto-confirm error:', message);
  }
}

export async function teyaBotWebhook(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-teya-signature') || '';

    if (signature && !verifySignature(rawBody, signature)) {
      console.error('[Teya-Bot Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type || event.event_type;
    console.log('[Teya-Bot Webhook] Event:', eventType, JSON.stringify(event).slice(0, 500));

    const metadata = event.data?.metadata || {};
    const company = metadata.company || 'unknown';
    const companyLabel = company === 'camping' ? '⛺ Кемпінг' : '🏕 Глемпінг';

    const intentKind = metadata.source === 'crm_deposit' ? 'booking_deposit' : 'unknown';

    switch (eventType) {
      case 'payment.succeeded.v1': {
        const transactionId = event.data?.id || '';
        const sessionId = event.data?.checkout_session_id || '';
        const amount = event.data?.amount?.value || 0;
        const currency = event.data?.amount?.currency || 'CZK';
        const amountCzk = Math.round(amount / 100);

        if (metadata.source === 'crm_deposit') {
          await handleCrmDepositPaid(metadata, amountCzk, sessionId);
        } else {
          await sendTelegramMessage(
            `✅ <b>Оплата отримана!</b>\n\n💳 ${companyLabel}\n💰 Сума: <b>${amountCzk} ${currency}</b>\n🆔 Session: <code>${sessionId}</code>\n🔗 Transaction: <code>${transactionId}</code>`
          ).catch(() => {});
        }

        if (sessionId) {
          eventBus
            .emit('payment.completed', {
              sessionId,
              provider: 'teya',
              intentKind,
              paymentId: sessionId,
              amount: amountCzk,
              currency,
            })
            .catch((e) => console.error('[Teya-Bot Webhook] emit completed error:', e));
        }
        break;
      }
      case 'payment.failed.v1': {
        const sessionId = event.data?.checkout_session_id || '';
        const isDeposit = metadata.source === 'crm_deposit';
        const guestName = metadata.guest_name || '';
        await sendTelegramMessage(
          `❌ <b>Оплата не пройшла</b>\n\n${isDeposit ? `👤 ${guestName}\n💳 Депозит CRM` : `💳 ${companyLabel}`}\n🆔 Session: <code>${sessionId}</code>`
        ).catch(() => {});

        if (sessionId) {
          eventBus
            .emit('payment.failed', { sessionId, provider: 'teya', intentKind })
            .catch((e) => console.error('[Teya-Bot Webhook] emit failed error:', e));
        }
        break;
      }
      case 'refund.succeeded.v1': {
        const amount = event.data?.amount || 0;
        const amountCzk = Math.round(amount / 100);
        await sendTelegramMessage(
          `🔄 <b>Повернення коштів</b>\n\n💳 ${companyLabel}\n💰 Сума: <b>${amountCzk} CZK</b>`
        ).catch(() => {});
        break;
      }
      default:
        console.log('[Teya-Bot Webhook] Unhandled event:', eventType);
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Teya-Bot Webhook] Error:', message);
    return NextResponse.json({ received: true, error: message });
  }
}
