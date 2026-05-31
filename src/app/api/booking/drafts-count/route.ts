import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function GET() {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM reservations r
    JOIN units u ON u.id = r.unit_id
    WHERE u.is_pool = 1 AND r.status IN ('draft', 'confirmed', 'tentative')
  `).get() as { count: number };

  // Diagnostic: log which bookings are counted
  if ((row?.count || 0) > 0) {
    const details = db.prepare(`
      SELECT r.id, r.status, r.check_in, r.check_out,
             g.first_name, g.last_name, u.code as unit_code
      FROM reservations r
      JOIN units u ON u.id = r.unit_id
      LEFT JOIN guests g ON g.id = r.guest_id
      WHERE u.is_pool = 1 AND r.status IN ('draft', 'confirmed', 'tentative')
      ORDER BY r.check_in
    `).all();
    console.log(`[drafts-count] ${row.count} pool bookings:`, JSON.stringify(details));
  }

  return NextResponse.json({ count: row?.count || 0 });
}

export const runtime = 'nodejs';
