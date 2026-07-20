/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createPaymentLink } from '../domain/teya-client';
import { getDefaultStore } from './create-payment-session';

/**
 * POST /api/bookings/[id]/payment-link
 *
 * Creates a Teya Pay-by-Link for a reservation with UNLIMITED lifetime (no
 * expiry) and merchant_reference = reservation_id, so the payment.succeeded
 * webhook auto-links the payment and marks the invoice confirmed. Optional body:
 * { amount, currency } to override the reservation total.
 */
export async function createReservationPaymentLink(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const body = await req.json().catch(() => ({} as any));

    const res = db.prepare(
      'SELECT id, total_price, currency FROM reservations WHERE id = ?'
    ).get(id) as { id: string; total_price: number; currency: string } | undefined;
    if (!res) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });

    const amountMajor = Number(body.amount) > 0 ? Number(body.amount) : (res.total_price || 0);
    if (!amountMajor || amountMajor <= 0) {
      return NextResponse.json({ error: 'Сума бронювання невідома — вкажіть amount.' }, { status: 400 });
    }
    const currency = (body.currency || res.currency || 'CZK').toUpperCase();
    const creds = getDefaultStore();
    if (!creds.client_id || !creds.store_id) {
      return NextResponse.json({ error: 'Teya не налаштовано (TEYA_CLIENT_ID / STORE_ID).' }, { status: 400 });
    }

    const link = await createPaymentLink({
      amount: Math.round(amountMajor * 100),   // minor units
      currency,
      description: `Booking #${id.substring(0, 8)}`,
      merchantReference: id,                    // reservation id → webhook auto-link
      metadata: { reservation_id: id, source: 'pms_paylink' },
      credentials: creds,
    });

    // Store the link id so the webhook (and staff) can find the reservation.
    try { db.prepare('UPDATE reservations SET payment_id = ? WHERE id = ?').run(link.id, id); } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, url: link.url, id: link.id, status: link.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[PayLink] create error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
