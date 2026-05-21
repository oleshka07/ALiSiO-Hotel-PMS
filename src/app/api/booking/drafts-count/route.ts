import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function GET() {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM reservations r
    JOIN units u ON u.id = r.unit_id
    WHERE u.is_pool = 1 AND r.status IN ('draft', 'confirmed', 'tentative')
  `).get() as { count: number };
  return NextResponse.json({ count: row?.count || 0 });
}

export const runtime = 'nodejs';
