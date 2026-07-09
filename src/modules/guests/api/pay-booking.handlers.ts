/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createPaymentSession, resolveCredentialsForReservation } from '@payments';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

export async function payForBooking(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const db = getDb();

    // ── Resolve reservation by guest_page_token ─────────────────
    const reservation = db.prepare(`
      SELECT r.id, r.total_price, r.currency, r.payment_status, r.check_in, r.check_out,
             r.guest_page_expires_at,
             g.first_name, g.last_name,
             u.name as unit_name,
             p.phone as property_phone
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      LEFT JOIN properties p ON r.property_id = p.id
      WHERE r.guest_page_token = ?
    `).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check expiry
    const now = new Date();
    if (reservation.guest_page_expires_at && now > new Date(reservation.guest_page_expires_at)) {
      return NextResponse.json({ error: 'Booking page expired' }, { status: 410 });
    }

    // ── Calculate remaining amount ──────────────────────────────
    const paid = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN op_type = 'income' THEN amount ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN op_type = 'refund' THEN amount ELSE 0 END), 0) as net_paid
      FROM fin_operations WHERE reservation_id = ? AND status = 'completed'
    `).get(reservation.id) as any;

    const netPaid = paid?.net_paid || 0;
    const remaining = Math.max(0, reservation.total_price - netPaid);

    if (remaining <= 0) {
      return NextResponse.json({ error: 'Booking is already fully paid' }, { status: 400 });
    }

    // ── Already paid (status check) ────────────────────────────
    if (reservation.payment_status === 'paid') {
      return NextResponse.json({ error: 'Booking is already paid' }, { status: 400 });
    }

    const guestName = `${reservation.first_name} ${reservation.last_name}`;
    const description = `Booking ${reservation.unit_name || ''} · ${reservation.check_in}–${reservation.check_out}`;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://alisio.swipescape.eu';

    console.log(`[Guest Pay Booking] ${guestName} | ${description} | remaining: ${remaining} ${reservation.currency}`);

    // ── Resolve per-site Teya credentials ────────────────────────
    // If this reservation was booked via a widget site (source = 'widget:<siteId>'),
    // route the payment to that site's Teya store. Otherwise fall back to ENV globals.
    const siteCredentials = resolveCredentialsForReservation(reservation.id);

    // ── Create Teya session ────────────────────────────────────
    // NOTE: We do NOT pass successUrl/cancelUrl to Teya because their v2 API
    // rejects `{CHECKOUT_SESSION_ID}` template variables in URLs. Instead we
    // rely on the Teya webhook (payment.succeeded.v1) to update the reservation
    // status, and on the client-side redirect after the hosted checkout closes.
    const session = await createPaymentSession({
      kind: 'booking_balance',
      amount: remaining,
      currency: reservation.currency || 'CZK',
      description,
      lineItems: [{
        description,
        quantity: 1,
        unitPriceMajor: remaining,
      }],
      metadata: {
        reservation_id: reservation.id,
        source: 'guest_booking_payment',
        token,
      },
      credentials: siteCredentials,
      successUrl: `${baseUrl}/api/booking/payment-return?status=success&return=${encodeURIComponent(`/guest/${token}`)}&reservation_id=${reservation.id}`,
      cancelUrl: `${baseUrl}/guest/${token}?payment=cancelled`,
    });

    // Update reservation payment_id for webhook matching
    try {
      const db2 = getDb();
      db2.prepare('UPDATE reservations SET payment_id = ? WHERE id = ?').run(session.sessionId, reservation.id);
    } catch { /* non-critical */ }

    // ── Telegram notification ──────────────────────────────────
    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    sendTelegramMessage([
      `💳 <b>Оплата бронювання · 📱 Гостьова</b>`,
      ``,
      `👤 ${esc(guestName)}`,
      `🏠 ${esc(reservation.unit_name || '')}`,
      `📅 ${reservation.check_in} — ${reservation.check_out}`,
      `💰 ${remaining} ${reservation.currency || 'CZK'} (залишок)`,
      `💳 Створено платіж · очікує оплати через Teya`,
    ].join('\n')).catch(() => {});

    return NextResponse.json({
      success: true,
      session_url: session.sessionUrl,
      session_id: session.sessionId,
      amount: remaining,
      currency: reservation.currency || 'CZK',
    });

  } catch (error: any) {
    console.error('[Guest Pay Booking] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Payment failed' }, { status: 500 });
  }
}
