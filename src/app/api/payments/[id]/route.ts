import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { recalcReservationPaymentStatus } from '@/modules/finance/api/operations.handlers';
import { publicMessage } from '@core/security/public-error';

// Legacy DELETE /api/payments/:id — deletes the fin_operations row.
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const op = db.prepare("SELECT reservation_id FROM fin_operations WHERE id = ?").get(id) as any;
    if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    db.prepare('UPDATE bank_transactions SET matched_operation_id = NULL WHERE matched_operation_id = ?').run(id);
    db.prepare('DELETE FROM fin_operations WHERE id = ?').run(id);
    if (op.reservation_id) recalcReservationPaymentStatus(db, op.reservation_id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
