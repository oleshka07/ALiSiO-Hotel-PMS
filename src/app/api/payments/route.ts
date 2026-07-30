/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createPaymentOperation } from '@/modules/finance/api/payment-bridge';
import { getOptionalActor } from '@/modules/finance/api/operations.handlers';

// Legacy /api/payments endpoint — reads/writes via fin_operations.
//
// The endpoint REQUIRES either reservation_id or group_id. Without a filter
// it used to return every payment system-wide (dump-all bug surfaced when
// GroupViewModal called it with group_id which was silently ignored).
//
// As of clean-3 there are no signal vs real duplicates any more — every
// fin_operation row represents real money. The dedup logic that used to
// live here is gone with the is_pms_signal column.
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('reservation_id');
    const groupId = searchParams.get('group_id');
    const parentId = searchParams.get('parent_id');

    if (!reservationId && !groupId && !parentId) {
      return NextResponse.json(
        { error: 'reservation_id, parent_id, or group_id query param is required' },
        { status: 400 },
      );
    }

    const where: string[] = ["o.reservation_id IS NOT NULL", "o.status = 'completed'"];
    const params: any[] = [];
    if (reservationId) {
      // Include payments for this reservation AND all its children
      where.push('(o.reservation_id = ? OR o.reservation_id IN (SELECT id FROM reservations WHERE parent_id = ?))');
      params.push(reservationId, reservationId);
    } else if (parentId) {
      where.push('(o.reservation_id = ? OR o.reservation_id IN (SELECT id FROM reservations WHERE parent_id = ?))');
      params.push(parentId, parentId);
    } else if (groupId) {
      // Legacy: group_id from old reservation_groups
      where.push('o.reservation_id IN (SELECT id FROM reservations WHERE group_id = ?)');
      params.push(groupId);
    }

    const rows = db.prepare(`
      SELECT o.id, o.reservation_id, o.amount, o.currency, o.method,
             o.payment_subtype AS type,
             o.status, o.paid_at, o.comment AS notes, o.source_ref,
             o.op_type
      FROM fin_operations o
      WHERE ${where.join(' AND ')}
      ORDER BY o.paid_at DESC
    `).all(...params);
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Methods that represent real money in our hands at the moment of click —
// only `cash` qualifies. Card / bank / platform / invoice / online are
// PMS-side markers: the actual money still has to arrive via Teya sync,
// bank statement import, or channel statement, and creating a fin_operation
// here would double-count the same money once the real source lands.
const CASH_METHODS = new Set(['cash']);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { reservation_id, amount, method = 'cash', type = 'partial', notes, paid_at } = body;
    if (!reservation_id || !amount) {
      return NextResponse.json({ error: 'reservation_id and amount are required' }, { status: 400 });
    }

    // Cash on hand → real money, create the fin_operation as before.
    // Capture who recorded it (Andriy taking cash at check-in shows up
    // attributed to him in the operations audit log, not anonymous).
    if (CASH_METHODS.has(method)) {
      const actor = await getOptionalActor();

      // Route to the logged-in user's personal cash account.
      // Each admin has a default_cash_account_id in app_users (e.g. Андрій → 'Андріїв cash').
      // Without this, every cash payment falls to the first cash account by sort_order (Олег's).
      let accountId: string | undefined;
      if (actor?.id) {
        const userRow = db.prepare(
          'SELECT default_cash_account_id FROM app_users WHERE id = ?'
        ).get(actor.id) as { default_cash_account_id: string | null } | undefined;
        accountId = userRow?.default_cash_account_id || undefined;
      }

      const formattedComment = actor?.name
        ? `Внесено: ${actor.name}${notes ? ' · ' + notes : ''}`
        : (notes || null);

      const { operationId } = createPaymentOperation({
        reservationId: reservation_id,
        amount: Math.abs(Number(amount)),
        method,
        paymentSubtype: type,
        source: 'manual',
        status: 'completed',
        paidAt: paid_at || new Date().toISOString(),
        comment: formattedComment,
        actor,
        accountId,
      });
      return NextResponse.json({ id: operationId, ok: true, kind: 'fin_operation' }, { status: 201 });
    }

    // Marker path — no fin_operation. Only update reservation.payment_status
    // and write an audit row to booking_activity_log so the operator has a
    // trail of who marked what.
    const res = db.prepare(
      'SELECT id, total_price, payment_status, is_prepaid FROM reservations WHERE id = ?',
    ).get(reservation_id) as { id: string; total_price: number; payment_status: string; is_prepaid: number } | undefined;
    if (!res) return NextResponse.json({ error: 'reservation not found' }, { status: 404 });

    // Channel-prepaid reservations (Hostex Booking/Airbnb/VRBO with is_prepaid=1)
    // are paid by the platform — never downgrade their status from a marker.
    let statusChanged = false;
    if (res.is_prepaid !== 1) {
      let nextStatus = res.payment_status;
      if (type === 'full')              nextStatus = 'paid';
      else if (type === 'refund')       nextStatus = 'unpaid';
      else if (type === 'deposit')      nextStatus = 'partial';
      else if (type === 'partial')      nextStatus = 'partial';
      if (nextStatus !== res.payment_status) {
        db.prepare('UPDATE reservations SET payment_status = ?, updated_at = datetime(\'now\') WHERE id = ?')
          .run(nextStatus, reservation_id);
        statusChanged = true;
      }
    }

    try {
      const detailsLine = `${method} ${type} ${Math.abs(Number(amount))}${notes ? ' — ' + notes : ''}`;
      db.prepare(
        "INSERT INTO booking_activity_log (id, reservation_id, action, details) VALUES (?, ?, 'payment_marker', ?)",
      ).run(`al_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, reservation_id, detailsLine);
    } catch { /* non-critical */ }

    return NextResponse.json({
      ok: true,
      kind: 'marker',
      method,
      statusChanged,
      message:
        'Позначка збережена. Реальна транзакція з\'явиться в Операціях коли надійде з Teya / банку / платформи.',
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
