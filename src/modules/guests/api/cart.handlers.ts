/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as repo from '../data/guest-actions.repo';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';
import { sendEmail } from '@/lib/email';
import { publicMessage } from '@core/security/public-error';

// ─── POST /api/guest/[token]/cart ────────────────────────────────────────────
export async function handleCartEvent(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const body = await request.json();
    const {
      event_type, service_id, quantity, phase, cart_total, items,
    } = body;

    if (!event_type) {
      return NextResponse.json({ error: 'event_type is required' }, { status: 400 });
    }

    // Resolve reservation
    const reservationId = repo.getReservationIdByToken(token);

    // Log the event
    repo.logCartEvent({
      reservationId,
      guestToken: token,
      serviceId: service_id ?? null,
      eventType: event_type,
      quantity: quantity ?? 1,
      phase: phase ?? null,
      cartTotal: cart_total ?? null,
      itemsJson: items ? JSON.stringify(items) : null,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Cart Event] error:', error?.message);
    return NextResponse.json({ error: publicMessage(error, 'Failed') }, { status: 500 });
  }
}

// ─── Cart abandon notification (called from portal.handlers on page open) ────
export async function sendAbandonNotifications(
  guestToken: string,
  propertyName: string,
): Promise<void> {
  try {
    const event = repo.getPendingAbandonNotifications(guestToken, 30);
    if (!event) return;

    // Parse cart items from JSON snapshot
    let items: any[] = [];
    try { items = JSON.parse(event.items_json || '[]'); } catch { items = []; }

    const guestName = [event.first_name, event.last_name].filter(Boolean).join(' ') || 'Guest';
    const currency = items[0]?.currency || 'Kč';
    const total = event.cart_total ? `${event.cart_total} ${currency}` : '—';
    const guestPageUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://alisio.swipescape.eu'}/guest/${guestToken}`;

    const itemLines = items.map((i: any) =>
      `  • ${i.serviceName || i.name || '?'} ×${i.quantity} — ${(i.price * i.quantity).toFixed(0)} ${i.currency || 'Kč'}`
    ).join('\n');

    // ── Telegram notification ──────────────────────────────────────────────
    const escHtml = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tgText = [
      `📦 <b>Abandoned Cart</b> — ${escHtml(propertyName)}`,
      ``,
      `👤 ${escHtml(guestName)}`,
      `🏠 ${escHtml(event.unit_name || '—')}`,
      `📅 Check-in: ${event.check_in || '—'}`,
      `📋 Phase: ${event.phase || '—'}`,
      ``,
      `🛒 Items:`,
      ...items.map((i: any) =>
        `  • ${escHtml(i.serviceName || i.name || '?')} ×${i.quantity} — ${(i.price * i.quantity).toFixed(0)} ${i.currency || 'Kč'}`
      ),
      ``,
      `💰 Total: ${total}`,
      ``,
      `🔗 <a href="${guestPageUrl}">Guest page</a>`,
    ].join('\n');

    sendTelegramMessage(tgText).catch((e: any) =>
      console.error('[Cart Abandon] TG error:', e.message)
    );

    // ── Email to guest ─────────────────────────────────────────────────────
    if (event.guest_email) {
      const itemsHtml = items.map((i: any) =>
        `<tr>
          <td style="padding:6px 0;border-bottom:1px solid #eee">${i.icon || '✨'} ${i.serviceName || i.name || '?'}</td>
          <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">
            ${i.quantity > 1 ? `×${i.quantity} ` : ''}<b>${(i.price * i.quantity).toFixed(0)} ${i.currency || 'Kč'}</b>
          </td>
        </tr>`
      ).join('');

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#1a1a1a">
  <div style="background:linear-gradient(135deg,#2d6a4f,#40916c);padding:24px;border-radius:12px;text-align:center;margin-bottom:24px">
    <h1 style="color:#fff;margin:0;font-size:22px">🛒 Your cart is waiting!</h1>
    <p style="color:#d8f3dc;margin:8px 0 0">Services for your stay at ${propertyName}</p>
  </div>

  <p>Hi <b>${guestName}</b>,</p>
  <p>You left some services in your cart for your stay at <b>${propertyName}</b>
    (${event.check_in || ''} – ${event.check_out || ''}).</p>

  <table style="width:100%;border-collapse:collapse;margin:20px 0">
    ${itemsHtml}
    <tr>
      <td style="padding:10px 0;font-weight:700">Total</td>
      <td style="padding:10px 0;font-weight:700;text-align:right;color:#2d6a4f">${total}</td>
    </tr>
  </table>

  <div style="text-align:center;margin:28px 0">
    <a href="${guestPageUrl}"
       style="background:#2d6a4f;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px">
      Go to my guest page →
    </a>
  </div>

  <p style="color:#666;font-size:13px">See you soon!<br><b>${propertyName} team</b></p>
</body>
</html>`;

      await sendEmail({
        to: event.guest_email,
        subject: `Your services at ${propertyName} are waiting 🛒`,
        html: emailHtml,
        text: `Hi ${guestName},\n\nYou left items in your cart:\n${itemLines}\n\nTotal: ${total}\n\nComplete your order: ${guestPageUrl}`,
      }).catch((e: any) => console.error('[Cart Abandon] Email error:', e.message));
    }

    // Mark as notified
    repo.markAbandonNotified(event.id);
    console.log(`[Cart Abandon] Notified for token ${guestToken}`);
  } catch (err: any) {
    console.error('[Cart Abandon] sendAbandonNotifications error:', err.message);
  }
}
