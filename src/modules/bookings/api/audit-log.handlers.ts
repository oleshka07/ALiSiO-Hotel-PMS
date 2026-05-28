/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@core/db';
import { getSessionUser } from '@/lib/auth';

/** Actor helper — same pattern as finance module's getOptionalActor */
export async function getBookingActor(): Promise<{ id: string; name: string } | null> {
  try {
    const store = await cookies();
    const sessionId = store.get('session_id')?.value;
    const user = getSessionUser(sessionId);
    if (!user) return null;
    return { id: user.id, name: user.full_name };
  } catch { return null; }
}

/** Build a human-readable label for a booking that survives deletion */
export function buildBookingLabel(db: any, reservationId: string): string {
  try {
    const row = db.prepare(`
      SELECT r.check_in, r.check_out, r.source, u.code as unit_code,
             g.first_name, g.last_name
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE r.id = ?
    `).get(reservationId) as any;
    if (!row) return reservationId;
    return `${row.first_name || ''} ${row.last_name || ''} · ${row.unit_code || ''} · ${row.check_in}–${row.check_out}`.trim();
  } catch { return reservationId; }
}

/** Write an audit entry to booking_activity_log */
export function writeBookingAudit(
  db: any,
  reservationId: string,
  action: string,
  details: string,
  actor: { id: string; name: string } | null,
  beforeRow: any,
  afterRow: any,
  bookingLabel?: string,
): void {
  const id = `bal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    const label = bookingLabel || buildBookingLabel(db, reservationId);
    db.prepare(`
      INSERT INTO booking_activity_log
        (id, reservation_id, action, details, user_id, user_name, before_json, after_json, booking_label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, reservationId, action, details,
      actor?.id || null, actor?.name || null,
      beforeRow ? JSON.stringify(beforeRow) : null,
      afterRow ? JSON.stringify(afterRow) : null,
      label,
    );
  } catch (e: any) {
    console.error('[booking_activity_log] write failed (non-fatal):', e?.message);
  }
}

/** GET /api/audit/bookings — owner-only audit trail */
export async function listBookingAudit(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth check: owner only
    const store = await cookies();
    const sessionId = store.get('session_id')?.value;
    const user = getSessionUser(sessionId);
    if (!user || user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('reservation_id');
    const limit = Math.min(200, parseInt(searchParams.get('limit') || '50', 10));
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let sql = `
      SELECT id, reservation_id, action, details, user_id, user_name,
             before_json, after_json, booking_label, created_at
      FROM booking_activity_log
    `;
    const params: any[] = [];

    if (reservationId) {
      sql += ' WHERE reservation_id = ?';
      params.push(reservationId);
    }

    sql += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    console.error('GET /api/audit/bookings error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}
