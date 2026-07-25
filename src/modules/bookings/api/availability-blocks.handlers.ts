/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function listAvailabilityBlocks() {
  try {
    const db = getDb();

    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='availability_blocks'"
    ).get();

    if (!tableExists) {
      return NextResponse.json([]);
    }

    const blocks = db.prepare(`
      SELECT id, unit_id, date_from, date_to, reason, notes, hostex_code, created_at
      FROM availability_blocks
      ORDER BY date_from ASC
    `).all();

    return NextResponse.json(blocks);
  } catch (e: any) {
    console.error('GET /api/availability-blocks error:', e.message);
    return NextResponse.json([]);
  }
}

export async function createAvailabilityBlock(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { unit_id, date_from, date_to, reason, notes } = body;
    if (!unit_id || !date_from || !date_to) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const id = `blk_${Date.now()}_${Math.random().toString(36).substring(2,7)}`;
    db.prepare(`
      INSERT INTO availability_blocks (id, unit_id, date_from, date_to, reason, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, unit_id, date_from, date_to, reason || 'maintenance', notes || null);
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function deleteAvailabilityBlock(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    db.prepare('DELETE FROM availability_blocks WHERE id = ?').run(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
