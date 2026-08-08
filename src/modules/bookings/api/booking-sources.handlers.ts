/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function listBookingSources() {
  try {
    const db = getDb();
    const sources = db.prepare(
      'SELECT * FROM booking_sources ORDER BY sort_order, name'
    ).all();
    return NextResponse.json(sources);
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function createBookingSource(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, code, icon_letter, color, sort_order, commission_percent } = body;

    if (!name || !code) {
      return NextResponse.json({ error: 'name and code are required' }, { status: 400 });
    }

    const prop = db.prepare('SELECT id FROM properties LIMIT 1').get() as any;
    if (!prop) {
      return NextResponse.json({ error: 'No property found' }, { status: 400 });
    }

    const existing = db.prepare('SELECT id FROM booking_sources WHERE code = ?').get(code);
    if (existing) {
      return NextResponse.json({ error: 'Source code already exists' }, { status: 400 });
    }

    const id = `bs_${Date.now()}`;
    db.prepare(
      'INSERT INTO booking_sources (id, property_id, name, code, icon_letter, color, sort_order, commission_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, prop.id, name, code, icon_letter || '?', color || '#6c7086', sort_order || 0, commission_percent || 0);

    const created = db.prepare('SELECT * FROM booking_sources WHERE id = ?').get(id);
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
