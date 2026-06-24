import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const units = db.prepare(`SELECT id, name FROM units WHERE name LIKE '%A1%' OR name LIKE '%A2%' OR name LIKE '%B1 - Stealth%' OR name LIKE '%B2 - Stealth%' OR name LIKE '%B3%' OR name LIKE '%B4%'`).all() as any[];
    
    const query = db.prepare(`
      SELECT 
        r.check_in, 
        r.check_out, 
        r.total_price, 
        r.currency, 
        r.total_rate_eur, 
        r.status, 
        r.source, 
        r.nights,
        g.first_name,
        g.last_name
      FROM reservations r
      LEFT JOIN guests g ON r.guest_id = g.id
      WHERE r.unit_id = ? 
        AND r.check_out >= '2026-05-01' 
        AND r.check_in <= '2026-05-31'
      ORDER BY r.check_in ASC
    `);

    const result: Record<string, any[]> = {};
    for (const u of units) {
      if (u.name.includes('BB') || u.name.includes('FB')) continue;
      result[u.name] = query.all(u.id) as any[];
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
