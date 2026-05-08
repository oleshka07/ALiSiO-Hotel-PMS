/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createPaymentOperation } from '@/modules/finance/api/payment-bridge';

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { reservation_id, amount, method = 'cash', type = 'partial', notes, paid_at } = body;
    if (!reservation_id || !amount) {
      return NextResponse.json({ error: 'reservation_id and amount are required' }, { status: 400 });
    }
    const { operationId } = createPaymentOperation({
      reservationId: reservation_id,
      amount: Math.abs(Number(amount)),
      method,
      paymentSubtype: type,
      source: 'manual',
      status: 'completed',
      paidAt: paid_at || new Date().toISOString(),
      comment: notes || null,
    });
    return NextResponse.json({ id: operationId, ok: true }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
