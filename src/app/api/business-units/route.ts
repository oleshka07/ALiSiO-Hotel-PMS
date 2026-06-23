import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function GET() {
  try {
    const db = getDb();
    const units = db.prepare(`
      SELECT id, name, unit_type, is_active, sort_order, parent_id
      FROM business_units
      WHERE is_active = 1
      ORDER BY sort_order, name
    `).all();
    return NextResponse.json(units);
  } catch (error: unknown) {
    console.error('GET /api/business-units error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
