/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

/**
 * Admin endpoint to manually fix service order payment status.
 * POST /api/service-orders/fix-payment
 * Body: { reservationId?, guestName?, sessionId?, markAllPaid?: boolean }
 *
 * Used when:
 * - Teya webhook was lost / payment ID mismatch
 * - Admin needs to manually confirm payment
 */
export async function fixServiceOrderPayment(req: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await req.json();
    const { orderId, orderIds, reservationId, sessionId, markAllPaid } = body;

    const results: any[] = [];

    // Case 1: Fix specific order(s) by ID
    if (orderId || orderIds) {
      const ids: string[] = orderId ? [orderId] : orderIds;
      for (const id of ids) {
        const r1 = db.prepare(
          "UPDATE service_orders SET payment_status = 'paid', status = 'confirmed' WHERE id = ? AND payment_status IN ('pending', 'none')"
        ).run(id);
        const r2 = db.prepare(
          "UPDATE booking_service_orders SET payment_status = 'paid', status = 'confirmed' WHERE id = ? AND payment_status IN ('pending', 'none')"
        ).run(id);
        results.push({ id, so: r1.changes, bso: r2.changes });
      }
    }

    // Case 2: Fix all pending orders for a reservation
    if (reservationId && markAllPaid) {
      const r1 = db.prepare(
        "UPDATE service_orders SET payment_status = 'paid', status = 'confirmed' WHERE reservation_id = ? AND payment_status IN ('pending', 'none')"
      ).run(reservationId);
      const r2 = db.prepare(
        "UPDATE booking_service_orders SET payment_status = 'paid', status = 'confirmed' WHERE reservation_id = ? AND payment_status IN ('pending', 'none')"
      ).run(reservationId);
      results.push({ reservationId, so: r1.changes, bso: r2.changes });
    }

    // Case 3: Fix by Teya session ID (retroactive webhook replay)
    if (sessionId) {
      const r1 = db.prepare(
        "UPDATE service_orders SET payment_status = 'paid', status = 'confirmed' WHERE payment_id = ? AND payment_status IN ('pending', 'none')"
      ).run(sessionId);
      const r2 = db.prepare(
        "UPDATE booking_service_orders SET payment_status = 'paid', status = 'confirmed' WHERE payment_id = ? AND payment_status IN ('pending', 'none')"
      ).run(sessionId);
      results.push({ sessionId, so: r1.changes, bso: r2.changes });
    }

    const totalFixed = results.reduce((s, r) => s + (r.so || 0) + (r.bso || 0), 0);
    console.log('[Fix Payment] Manual fix applied:', results);

    return NextResponse.json({ ok: true, fixed: totalFixed, details: results });
  } catch (err: any) {
    return NextResponse.json({ error: publicMessage(err) }, { status: 500 });
  }
}

/**
 * GET /api/service-orders/fix-payment?reservationId=...
 * Returns pending service orders for a reservation (for inspection)
 */
export async function getPendingOrders(req: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const reservationId = new URL(req.url).searchParams.get('reservationId');
    const guestName = new URL(req.url).searchParams.get('guestName');

    let rows: any[];

    if (reservationId) {
      rows = db.prepare(`
        SELECT so.id, 'guest_page' as source, so.payment_status, so.status, so.payment_id,
               so.service_date, so.total_price, ads.name as service_name, so.created_at
        FROM service_orders so
        LEFT JOIN additional_services ads ON so.service_id = ads.id
        WHERE so.reservation_id = ?
        UNION ALL
        SELECT bso.id, 'widget' as source, bso.payment_status, bso.status, bso.payment_id,
               bso.service_date, bso.total_price, ads.name as service_name, bso.created_at
        FROM booking_service_orders bso
        LEFT JOIN additional_services ads ON bso.service_id = ads.id
        WHERE bso.reservation_id = ?
        ORDER BY created_at DESC
      `).all(reservationId, reservationId);
    } else if (guestName) {
      const [first, ...lastParts] = (guestName || '').split(' ');
      const last = lastParts.join(' ');
      rows = db.prepare(`
        SELECT so.id, 'guest_page' as source, so.payment_status, so.status, so.payment_id,
               so.service_date, so.total_price, ads.name as service_name, so.created_at,
               g.first_name, g.last_name, r.id as reservation_id
        FROM service_orders so
        LEFT JOIN additional_services ads ON so.service_id = ads.id
        JOIN reservations r ON so.reservation_id = r.id
        JOIN guests g ON r.guest_id = g.id
        WHERE g.first_name LIKE ? OR g.last_name LIKE ?
        ORDER BY so.created_at DESC LIMIT 30
      `).all(`%${first}%`, `%${last || first}%`);
    } else {
      // Return all pending
      rows = db.prepare(`
        SELECT so.id, 'guest_page' as source, so.payment_status, so.status, so.payment_id,
               so.service_date, so.total_price, ads.name as service_name, so.created_at,
               g.first_name, g.last_name, r.id as reservation_id
        FROM service_orders so
        LEFT JOIN additional_services ads ON so.service_id = ads.id
        JOIN reservations r ON so.reservation_id = r.id
        JOIN guests g ON r.guest_id = g.id
        WHERE so.payment_status = 'pending'
        ORDER BY so.created_at DESC LIMIT 50
      `).all();
    }

    return NextResponse.json({ orders: rows, total: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: publicMessage(err) }, { status: 500 });
  }
}
