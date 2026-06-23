import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { randomBytes } from 'crypto';

export async function GET() {
  const db = getDb();
  const locations = db.prepare(`
    SELECT l.*, p.name as parent_name
    FROM locations l
    LEFT JOIN locations p ON p.id = l.parent_id
    ORDER BY l.sort_order, l.name
  `).all();
  return NextResponse.json(locations);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const id = `loc_${Date.now()}_${randomBytes(3).toString('hex')}`;
  const db = getDb();
  db.prepare(`
    INSERT INTO locations (id, name, type, parent_id, code, icon, color, sort_order, show_in_tasks, show_in_finance, show_in_booking, show_in_investor, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.name,
    body.type || 'unit',
    body.parent_id || null,
    body.code || null,
    body.icon || null,
    body.color || '#6c7086',
    body.sort_order || 0,
    body.show_in_tasks ? 1 : 0,
    body.show_in_finance ? 1 : 0,
    body.show_in_booking ? 1 : 0,
    body.show_in_investor ? 1 : 0,
    body.notes || null,
  );
  const created = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
  return NextResponse.json(created, { status: 201 });
}
