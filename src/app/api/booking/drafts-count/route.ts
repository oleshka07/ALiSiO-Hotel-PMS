import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function GET() {
  const db = getDb();
  // Count pool bookings, excluding OTA/channel blocks (fake reservations
  // injected by iCal/Hostex that are not real guests).
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM reservations r
    JOIN units u ON u.id = r.unit_id
    JOIN guests g ON g.id = r.guest_id
    WHERE u.is_pool = 1
      AND r.status IN ('draft', 'confirmed', 'tentative')
      AND LOWER(g.first_name || ' ' || g.last_name) NOT LIKE '%ota%block%'
      AND LOWER(g.first_name || ' ' || g.last_name) NOT LIKE '%channel%block%'
      AND LOWER(g.first_name || ' ' || g.last_name) NOT LIKE '%hostex%block%'
  `).get() as { count: number };
  return NextResponse.json({ count: row?.count || 0 });
}

export const runtime = 'nodejs';
