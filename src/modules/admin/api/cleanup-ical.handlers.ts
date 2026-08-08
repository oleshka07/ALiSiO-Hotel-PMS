/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function previewIcalCleanup() {
  try {
    const db = getDb();

    const icalReservations = db.prepare(`
      SELECT r.id, r.check_in, r.check_out, r.status, r.source,
             r.external_uid, r.notes,
             g.first_name || ' ' || COALESCE(g.last_name, '') as guest_name,
             u.name as unit_name
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE (r.id LIKE 'r_ical_%' OR r.external_uid LIKE 'ical_%')
        AND r.hostex_reservation_code IS NULL
      ORDER BY r.check_in ASC
    `).all() as any[];

    const paymentCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM fin_operations
      WHERE reservation_id IN (
        SELECT id FROM reservations
        WHERE (id LIKE 'r_ical_%' OR external_uid LIKE 'ical_%')
          AND hostex_reservation_code IS NULL
      )
    `).get() as any;

    const icalOnlyGuests = db.prepare(`
      SELECT COUNT(*) as cnt FROM guests
      WHERE id LIKE 'g_ical_%'
        AND id NOT IN (
          SELECT DISTINCT guest_id FROM reservations
          WHERE (id NOT LIKE 'r_ical_%' AND external_uid NOT LIKE 'ical_%')
            OR hostex_reservation_code IS NOT NULL
        )
    `).get() as any;

    return NextResponse.json({
      preview: true,
      toDelete: {
        reservations: icalReservations.length,
        payments: paymentCount?.cnt || 0,
        icalOnlyGuests: icalOnlyGuests?.cnt || 0,
      },
      reservations: icalReservations,
      message: 'Send DELETE request to this endpoint to confirm cleanup',
    });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function deleteIcalCleanup(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('confirm') !== 'yes') {
      return NextResponse.json({ error: 'Add ?confirm=yes to confirm deletion' }, { status: 400 });
    }

    const db = getDb();

    const toDelete = db.prepare(`
      SELECT id, guest_id FROM reservations
      WHERE (id LIKE 'r_ical_%' OR external_uid LIKE 'ical_%')
        AND hostex_reservation_code IS NULL
    `).all() as any[];

    const ids = toDelete.map((r: any) => r.id);
    const guestIds = [...new Set(toDelete.map((r: any) => r.guest_id).filter(Boolean))];

    if (ids.length === 0) {
      return NextResponse.json({ message: 'Nothing to clean up — no iCal bookings found', deleted: 0 });
    }

    let deletedPayments = 0;
    let deletedReservations = 0;
    let deletedGuests = 0;

    const tx = db.transaction(() => {
      for (const id of ids) {
        db.prepare('UPDATE bank_transactions SET matched_operation_id = NULL WHERE matched_operation_id IN (SELECT id FROM fin_operations WHERE reservation_id = ?)').run(id);
        const r = db.prepare('DELETE FROM fin_operations WHERE reservation_id = ?').run(id);
        deletedPayments += r.changes;
      }
      for (const id of ids) {
        const r = db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
        deletedReservations += r.changes;
      }
      for (const guestId of guestIds) {
        if (!guestId || !String(guestId).startsWith('g_ical_')) continue;
        const remaining = db.prepare('SELECT COUNT(*) as cnt FROM reservations WHERE guest_id = ?').get(guestId) as any;
        if ((remaining?.cnt || 0) === 0) {
          db.prepare('DELETE FROM guests WHERE id = ?').run(guestId);
          deletedGuests++;
        }
      }
    });

    tx();

    console.log(`[Cleanup] Deleted ${deletedReservations} iCal reservations, ${deletedPayments} payments, ${deletedGuests} guests`);

    return NextResponse.json({
      success: true,
      deleted: { reservations: deletedReservations, payments: deletedPayments, guests: deletedGuests },
      message: `Cleaned up ${deletedReservations} iCal bookings successfully`,
    });
  } catch (e: any) {
    console.error('[Cleanup] Error:', e);
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
