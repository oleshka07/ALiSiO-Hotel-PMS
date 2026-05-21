/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '../domain/teya-client';
import { getDb } from '@core/db';
import { eventBus } from '@core/event-bus';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';
// TODO: replace with eventBus.emit('crm.payment_received') when crm module is migrated
import { onPaymentReceived } from '@/lib/crm/stage-transitions';
// TODO: replace with eventBus subscription in @finance once subscriber bootstrap exists
import { generateInvoiceForReservation } from '@finance';

function resolveIntentKind(metadata: Record<string, string> | undefined): string {
  const source = metadata?.source || '';
  if (source === 'guest_booking_payment') return 'booking_balance';
  if (source === 'guest_cart') return 'service_cart';
  if (source === 'guest_page') return 'service_standalone';
  if (source === 'crm_deposit') return 'booking_deposit';
  if (metadata?.reservation_id) return 'booking_full';
  return 'unknown';
}

/**
 * Insert a payment_webhook_log row. Truncate raw payload to 8KB to keep
 * the table light. Wrapped in try/catch — audit logging must NEVER break
 * the webhook handler.
 */
function logWebhook(
  db: any,
  result: 'recorded' | 'no_match' | 'duplicate' | 'signature_invalid' | 'parse_error' | 'unhandled' | 'error',
  fields: Partial<{
    eventType: string; sessionId: string; transactionId: string; paymentRef: string;
    amount: number; currency: string; reservationId: string; operationId: string;
    errorMessage: string; rawPayload: string;
  }>,
): void {
  try {
    db.prepare(`
      INSERT INTO payment_webhook_log
        (provider, event_type, session_id, transaction_id, payment_ref,
         amount, currency, result, error_message, reservation_id, operation_id, raw_payload)
      VALUES ('teya', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fields.eventType || null, fields.sessionId || null, fields.transactionId || null,
      fields.paymentRef || null, fields.amount ?? null, fields.currency || null,
      result, fields.errorMessage || null,
      fields.reservationId || null, fields.operationId || null,
      fields.rawPayload ? fields.rawPayload.substring(0, 8192) : null,
    );
  } catch (e: any) {
    console.error('[Teya Webhook] Audit log insert failed (non-fatal):', e.message);
  }
}

export async function teyaWebhook(req: Request): Promise<NextResponse> {
  let rawBodyForLog = '';
  let dbForLog: any = null;
  try {
    const rawBody = await req.text();
    rawBodyForLog = rawBody;
    const signature = req.headers.get('x-teya-signature') || '';

    console.log('[Teya Webhook] RAW PAYLOAD:', rawBody.substring(0, 3000));

    const db = getDb();
    dbForLog = db;

    if (signature && !verifyWebhookSignature(rawBody, signature)) {
      console.error('[Teya Webhook] Invalid signature');
      logWebhook(db, 'signature_invalid', { rawPayload: rawBody });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch (parseErr: any) {
      logWebhook(db, 'parse_error', { rawPayload: rawBody, errorMessage: parseErr.message });
      return NextResponse.json({ received: true, error: 'parse_error' });
    }

    const eventType = event.type || event.event_type || event.event
      || event.eventType || event.action || detectEventType(event);

    console.log('[Teya Webhook] Parsed event:', eventType);

    const metadata = event.data?.metadata || event.metadata;
    const intentKind = resolveIntentKind(metadata);
    const refs = extractPaymentRef(event);

    if (isPaymentSuccess(eventType, event)) {
      const outcome = handlePaymentSuccess(db, event, eventType);
      logWebhook(db, outcome.result, {
        eventType, sessionId: refs.sessionId, transactionId: refs.transactionId,
        paymentRef: outcome.effectiveRef || refs.sessionId || refs.transactionId,
        amount: refs.amount, currency: refs.currency,
        reservationId: outcome.reservationId,
        rawPayload: rawBody,
      });
      if (refs.sessionId) {
        await eventBus
          .emit('payment.completed', {
            sessionId: refs.sessionId,
            provider: 'teya',
            intentKind,
            paymentId: refs.sessionId || refs.transactionId,
            amount: refs.amount > 1000 ? refs.amount / 100 : refs.amount,
            currency: refs.currency,
          })
          .catch((e: any) => console.error('[Teya Webhook] emit completed error:', e));
      }
    } else if (isPaymentFailed(eventType, event)) {
      handlePaymentFailed(db, event);
      logWebhook(db, 'recorded', {
        eventType, sessionId: refs.sessionId, transactionId: refs.transactionId,
        amount: refs.amount, currency: refs.currency, rawPayload: rawBody,
      });
      if (refs.sessionId) {
        await eventBus
          .emit('payment.failed', { sessionId: refs.sessionId, provider: 'teya', intentKind })
          .catch((e: any) => console.error('[Teya Webhook] emit failed error:', e));
      }
    } else if (isRefund(eventType)) {
      handleRefund(db, event);
      logWebhook(db, 'recorded', {
        eventType, sessionId: refs.sessionId, transactionId: refs.transactionId,
        amount: refs.amount, currency: refs.currency, rawPayload: rawBody,
      });
    } else {
      console.log('[Teya Webhook] Unhandled event:', eventType);
      logWebhook(db, 'unhandled', { eventType, rawPayload: rawBody });
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Teya Webhook] Error:', message);
    if (dbForLog) {
      logWebhook(dbForLog, 'error', { errorMessage: message, rawPayload: rawBodyForLog });
    }
    return NextResponse.json({ received: true, error: message });
  }
}

function detectEventType(event: any): string {
  if (event.status === 'CAPTURED' || event.status === 'COMPLETED' || event.status === 'PAID') return 'payment.succeeded.v1';
  if (event.status === 'FAILED' || event.status === 'DECLINED') return 'payment.failed.v1';
  if (event.status === 'REFUNDED') return 'refund.succeeded.v1';
  if (event.data?.status === 'CAPTURED' || event.data?.status === 'COMPLETED') return 'payment.succeeded.v1';
  if (event.data?.status === 'FAILED' || event.data?.status === 'DECLINED') return 'payment.failed.v1';
  return 'unknown';
}

function isPaymentSuccess(eventType: string, event: any): boolean {
  return eventType === 'payment.succeeded.v1' || eventType === 'checkout.session.completed'
    || eventType === 'payment.captured' || event.status === 'CAPTURED' || event.status === 'COMPLETED';
}
function isPaymentFailed(eventType: string, event: any): boolean {
  return eventType === 'payment.failed.v1' || event.status === 'FAILED' || event.status === 'DECLINED';
}
function isRefund(eventType: string): boolean { return eventType === 'refund.succeeded.v1'; }

function extractPaymentRef(event: any): { sessionId: string; transactionId: string; amount: number; currency: string } {
  const data = event.data || event;
  // Try all known field names for session/checkout ID
  const sessionId =
    data.checkout_session_id ||
    data.session_id ||
    data.checkout_session?.id ||
    event.checkout_session_id ||
    event.session_id ||
    event.data?.checkout_session?.id ||
    '';
  const transactionId = data.id || data.transaction_id || event.id || '';
  const amount = data.amount?.value || data.amount || event.amount?.value || event.amount || 0;
  const currency = data.amount?.currency || data.currency || event.amount?.currency || 'CZK';
  console.log('[Teya Webhook] Extracted refs:', { sessionId, transactionId, amount, currency });
  return { sessionId, transactionId, amount, currency };
}

interface SuccessOutcome {
  result: 'recorded' | 'no_match';
  effectiveRef?: string;
  reservationId?: string;
}

function handlePaymentSuccess(db: any, event: any, eventType: string): SuccessOutcome {
  const { sessionId, transactionId, amount, currency } = extractPaymentRef(event);
  const paymentRef = sessionId || transactionId;
  if (!paymentRef) {
    console.log('[Teya Webhook] No payment reference found in success event');
    return { result: 'no_match' };
  }
  console.log('[Teya Webhook] Processing payment success:', { eventType, sessionId, transactionId, amount, currency });

  const result1 = db.prepare("UPDATE booking_service_orders SET payment_status = 'paid' WHERE payment_id = ? AND payment_status IN ('pending', 'none')").run(paymentRef);
  const result2 = db.prepare("UPDATE service_orders SET payment_status = 'paid', status = 'confirmed' WHERE payment_id = ? AND payment_status IN ('pending', 'none')").run(paymentRef);
  const result3 = db.prepare("UPDATE reservations SET status = 'confirmed', payment_status = 'paid', updated_at = datetime('now') WHERE id IN (SELECT reservation_id FROM booking_service_orders WHERE payment_id = ?) AND status = 'tentative'").run(paymentRef);
  const result4 = db.prepare("UPDATE reservations SET status = 'confirmed', payment_status = 'paid', updated_at = datetime('now') WHERE payment_id = ? AND status = 'tentative'").run(paymentRef);
  // Also handle booking payments from guest page (reservation already 'confirmed' but payment_status='unpaid')
  const result5 = db.prepare("UPDATE reservations SET payment_status = 'paid', updated_at = datetime('now') WHERE payment_id = ? AND payment_status IN ('unpaid', 'payment_requested')").run(paymentRef);
  db.prepare("UPDATE service_time_slots SET booking_session_id = NULL, notes = 'paid' WHERE booking_session_id = ?").run(paymentRef);

  const totalResChanges = result3.changes + result4.changes + result5.changes;
  console.log('[Teya Webhook] Payment confirmed:', { paymentRef, amount, currency, bookingOrders: result1.changes, serviceOrders: result2.changes, reservations: totalResChanges });

  // Track changes from BOTH primary + fallback paths so the gates below
  // fire even when Teya labelled the order with transactionId rather than
  // sessionId. Previously only result1/result2 were checked, so fallback
  // hits silently updated orders but never created a fin_operation, sent
  // the Telegram notification, or generated the invoice — guests saw
  // "paid" on the page but nothing showed in finance.
  let txBsoChanges = 0;
  let txSoChanges = 0;
  let effectiveRef = paymentRef;
  if (result2.changes === 0 && !result1.changes && transactionId && transactionId !== paymentRef) {
    const txFallback  = db.prepare("UPDATE service_orders SET payment_status = 'paid', status = 'confirmed' WHERE payment_id = ? AND payment_status IN ('pending', 'none')").run(transactionId);
    const txFallback2 = db.prepare("UPDATE booking_service_orders SET payment_status = 'paid' WHERE payment_id = ? AND payment_status IN ('pending', 'none')").run(transactionId);
    txSoChanges = txFallback.changes;
    txBsoChanges = txFallback2.changes;
    if (txSoChanges > 0 || txBsoChanges > 0) effectiveRef = transactionId;
    console.log('[Teya Webhook] Fallback by transactionId:', { transactionId, so: txSoChanges, bso: txBsoChanges, effectiveRef });
  }

  const bsoTotal = result1.changes + txBsoChanges;
  const soTotal  = result2.changes + txSoChanges;

  if (soTotal > 0) {
    try {
      db.prepare(`
        UPDATE cart_events SET abandon_notified_at = datetime('now')
        WHERE reservation_id IN (
          SELECT reservation_id FROM service_orders WHERE payment_id = ?
        ) AND abandon_notified_at IS NULL
      `).run(effectiveRef);
    } catch { /* non-critical */ }
  }

  let recorded: { reservationId?: string } | undefined;
  if (bsoTotal > 0 || soTotal > 0) recorded = recordPayment(db, effectiveRef, amount, currency);
  if (bsoTotal > 0) sendWidgetOrderTG(db, effectiveRef, currency);
  if (soTotal > 0)  sendGuestOrderTG(db, effectiveRef, currency);

  // Booking payment via guest page (pay-booking) — send dedicated TG notification
  if (result5.changes > 0) {
    sendBookingPaymentTG(db, effectiveRef, amount, currency);
  }

  // Auto-generate invoice when a reservation transitions to fully paid via webhook.
  // Until now this only happened on manual PATCH (admin marking paid). Public Teya
  // payments would mark payment_status='paid' but never call generateInvoiceForReservation,
  // leaving recently-paid bookings without an invoice (PAVEL MICHALEK, Ann-Kathrin Rechner).
  if (result3.changes > 0 || result4.changes > 0 || result5.changes > 0 || bsoTotal > 0) {
    try {
      const paid = db.prepare(`
        SELECT DISTINCT r.id FROM reservations r
        WHERE r.payment_status = 'paid'
          AND (r.payment_id = ?
               OR r.id IN (SELECT reservation_id FROM booking_service_orders WHERE payment_id = ? AND reservation_id IS NOT NULL))
      `).all(effectiveRef, effectiveRef) as Array<{ id: string }>;
      for (const row of paid) {
        const invId = generateInvoiceForReservation(row.id);
        console.log('[Teya Webhook] Auto-invoice for reservation', row.id, '→', invId);
      }
    } catch (e: any) {
      console.error('[Teya Webhook] Auto-invoice error:', e.message);
    }
  }

  try {
    const leadByPayment = db.prepare(`
      SELECT l.id, l.stage, l.estimated_value, r.total_price FROM crm_leads l
      JOIN reservations r ON r.id = l.reservation_id
      WHERE l.reservation_id IN (
        SELECT so.reservation_id FROM service_orders so WHERE so.payment_id = ?
        UNION SELECT bso.reservation_id FROM booking_service_orders bso WHERE bso.payment_id = ?
      ) LIMIT 1
    `).get(effectiveRef, effectiveRef) as any;
    if (leadByPayment) {
      const totalPrice = leadByPayment.total_price || leadByPayment.estimated_value || 0;
      onPaymentReceived(leadByPayment.id, leadByPayment.stage, !!(amount && totalPrice > 0 && amount >= totalPrice * 0.9));
    }
  } catch (stageErr: any) { console.error('[Teya Webhook] Stage transition error:', stageErr.message); }

  void result4;

  if (bsoTotal === 0 && soTotal === 0 && totalResChanges === 0) {
    return { result: 'no_match', effectiveRef };
  }
  return {
    result: 'recorded',
    effectiveRef,
    reservationId: recorded?.reservationId,
  };
}

function handlePaymentFailed(db: any, event: any) {
  const { sessionId } = extractPaymentRef(event);
  if (!sessionId) return;
  db.prepare("UPDATE booking_service_orders SET payment_status = 'failed' WHERE payment_id = ? AND payment_status = 'pending'").run(sessionId);
  db.prepare("UPDATE service_orders SET payment_status = 'failed' WHERE payment_id = ? AND payment_status = 'pending'").run(sessionId);
  db.prepare('UPDATE service_time_slots SET booked_count = MAX(0, booked_count - 1), booking_session_id = NULL WHERE booking_session_id = ?').run(sessionId);
  console.log('[Teya Webhook] Payment failed, slots released:', sessionId);
}

function handleRefund(db: any, event: any) {
  const { sessionId, transactionId } = extractPaymentRef(event);
  const ref = sessionId || transactionId;
  if (!ref) return;
  db.prepare("UPDATE booking_service_orders SET payment_status = 'refunded' WHERE payment_id = ? AND payment_status = 'paid'").run(ref);
  db.prepare("UPDATE service_orders SET payment_status = 'refunded', status = 'cancelled' WHERE payment_id = ? AND payment_status = 'paid'").run(ref);
  console.log('[Teya Webhook] Refund confirmed:', ref);
}

function recordPayment(
  db: any, paymentRef: string, _amount: number, _currency: string,
): { reservationId?: string } | undefined {
  // PMS-side state (booking_service_orders / service_orders / reservations)
  // is already updated above by the main handler — that's what guests see
  // as «оплачено» on the guest portal and what PMS check-in reads.
  //
  // Finance-side fin_operations creation was removed: Teya widget payments
  // sit on the Teya merchant account until weekly sweep, and we record
  // them as facts only when the bank statement arrives via /finance/bank
  // inbox. Until then, the gross-up vs the bank deposit is handled by the
  // Teya statement upload flow (clean-7).
  try {
    const order = db.prepare(`
      SELECT reservation_id FROM booking_service_orders WHERE payment_id = ?
      UNION ALL
      SELECT reservation_id FROM service_orders WHERE payment_id = ? LIMIT 1
    `).get(paymentRef, paymentRef) as { reservation_id?: string } | undefined;
    return order ? { reservationId: order.reservation_id } : undefined;
  } catch (e: any) {
    console.error('[Teya Webhook] recordPayment lookup failed:', e.message);
    return undefined;
  }
}

function sendWidgetOrderTG(db: any, paymentRef: string, currency: string) {
  try {
    const orders = db.prepare(`
      SELECT bso.*, ads.name as service_name, ads.name_en,
             mi.name_en as menu_item_name,
             r.id AS reservation_id, r.check_in, r.check_out, r.is_multi_room,
             g.first_name, g.last_name, u.name as unit_name
      FROM booking_service_orders bso
      JOIN additional_services ads ON bso.service_id = ads.id
      LEFT JOIN menu_items mi ON bso.menu_item_id = mi.id
      LEFT JOIN reservations r ON bso.reservation_id = r.id
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE bso.payment_id = ?
    `).all(paymentRef) as any[];
    if (!orders.length) return;
    const first = orders[0];
    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const guestName = first.first_name ? `${esc(first.first_name)} ${esc(first.last_name)}` : 'Зовнішній клієнт';
    const grandTotal = orders.reduce((s: number, o: any) => s + (o.total_price || 0), 0);
    const itemLines = orders.map((o: any) => {
      const name = o.menu_item_name || o.name_en || o.service_name;
      let timeTag = '';
      if (o.options_json) { try { const opts = JSON.parse(o.options_json); timeTag = ` ⏰ ${String(opts.startHour).padStart(2,'0')}:00–${String(opts.startHour + opts.hours).padStart(2,'0')}:00`; } catch { /* */ } }
      const dateTag = o.service_date ? ` · 📅 ${o.service_date}` : '';
      return `  • ${esc(name)} ×${o.quantity}${dateTag}${timeTag} — ${o.total_price} ${currency || 'CZK'}`;
    });
    const text = [
      `💳 <b>Оплата послуги підтверджена</b>`, ``,
      `👤 ${guestName}`,
      first.unit_name ? `🏠 ${esc(first.unit_name)}` : '',
      first.is_multi_room ? `\n⚠️ <b>MULTI-ROOM</b>` : '',
      ``, ...itemLines, ``,
      orders.length > 1 ? `💰 Разом: ${grandTotal} ${currency || 'CZK'} — ✅ Оплачено` : `💰 ${grandTotal} ${currency || 'CZK'} — ✅ Оплачено`,
      first.reservation_id ? `\n🔖 <code>${esc(first.reservation_id)}</code>` : '',
    ].filter(Boolean).join('\n');
    sendTelegramMessage(text).catch((e: any) => console.error('[Teya Webhook] Widget TG send failed:', e.message));
  } catch (e: any) { console.error('[Teya Webhook] sendWidgetOrderTG error:', e.message); }
}

function sendGuestOrderTG(db: any, paymentRef: string, currency: string) {
  try {
    const orders = db.prepare(`
      SELECT so.*, ads.name as service_name, ads.name_en, ads.service_type,
             r.id AS reservation_id, r.check_in, r.check_out, r.is_multi_room,
             g.first_name, g.last_name, u.name as unit_name
      FROM service_orders so JOIN additional_services ads ON so.service_id = ads.id
      JOIN reservations r ON so.reservation_id = r.id JOIN guests g ON r.guest_id = g.id JOIN units u ON r.unit_id = u.id
      WHERE so.payment_id = ?
    `).all(paymentRef) as any[];
    if (!orders.length) return;
    const first = orders[0];
    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const grandTotal = orders.reduce((s: number, o: any) => s + (o.total_price || 0), 0);
    const itemLines = orders.map((o: any) => {
      const dateTag = o.service_date ? ` · 📅 ${o.service_date}` : '';
      let timeTag = '';
      if (o.notes && o.service_type === 'slot_booking') { try { const n = JSON.parse(o.notes); if (n.startHour != null) timeTag = ` ⏰ ${String(n.startHour).padStart(2,'0')}:00–${String(n.startHour + (n.hours || 1)).padStart(2,'0')}:00`; } catch { /* */ } }
      return `  • ${esc(o.name_en || o.service_name)} ×${o.quantity}${dateTag}${timeTag} — ${o.total_price} ${currency}`;
    });
    const text = [
      `💳 <b>Оплата підтверджена</b>`, ``,
      `👤 ${esc(first.first_name)} ${esc(first.last_name)}`,
      `🏠 ${esc(first.unit_name)}`,
      `📅 ${first.check_in} — ${first.check_out}`,
      first.is_multi_room ? `\n⚠️ <b>MULTI-ROOM</b> — guest's booking spans multiple cabins; unit shown is one of them.` : '',
      ``,
      ...itemLines, ``,
      orders.length > 1 ? `💰 Разом: ${grandTotal} ${currency} — ✅ Оплачено` : `💰 ${grandTotal} ${currency} — ✅ Оплачено`,
      first.reservation_id ? `\n🔖 <code>${esc(first.reservation_id)}</code>` : '',
    ].filter(Boolean).join('\n');
    sendTelegramMessage(text).catch(() => {});
  } catch { /* non-critical */ }
}

function sendBookingPaymentTG(db: any, paymentRef: string, amount: number, currency: string) {
  try {
    const res = db.prepare(`
      SELECT r.id, r.check_in, r.check_out, r.total_price, r.currency,
             g.first_name, g.last_name, u.name as unit_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE r.payment_id = ?
    `).get(paymentRef) as any;
    if (!res) { console.log('[Teya Webhook] sendBookingPaymentTG: no reservation found for', paymentRef); return; }
    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const displayAmount = amount > 100 ? Math.round(amount / 100) : amount; // Teya sends minor units
    const text = [
      `✅ <b>Оплата бронювання підтверджена</b>`, ``,
      `👤 ${esc(res.first_name)} ${esc(res.last_name)}`,
      res.unit_name ? `🏠 ${esc(res.unit_name)}` : '',
      `📅 ${res.check_in} — ${res.check_out}`,
      `💰 ${displayAmount} ${currency || res.currency || 'CZK'} — ✅ Оплачено`,
      ``,
      `🔖 <code>${esc(res.id)}</code>`,
    ].filter(Boolean).join('\n');
    console.log('[Teya Webhook] Sending booking payment TG for', res.first_name, res.last_name);
    sendTelegramMessage(text).catch((e: any) => console.error('[Teya Webhook] TG send failed:', e.message));
  } catch (e: any) { console.error('[Teya Webhook] sendBookingPaymentTG error:', e.message); }
}
