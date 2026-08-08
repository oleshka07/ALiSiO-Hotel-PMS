/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function updateBookingSource(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { name, code, icon_letter, color, sort_order, is_active, commission_percent } = body;

    const existing = db.prepare('SELECT * FROM booking_sources WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    if (code && code !== existing.code) {
      const dup = db.prepare('SELECT id FROM booking_sources WHERE code = ? AND id != ?').get(code, id);
      if (dup) {
        return NextResponse.json({ error: 'Source code already exists' }, { status: 400 });
      }
    }

    db.prepare(`
      UPDATE booking_sources SET
        name = ?, code = ?, icon_letter = ?, color = ?, sort_order = ?, is_active = ?,
        commission_percent = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name ?? existing.name,
      code ?? existing.code,
      icon_letter ?? existing.icon_letter,
      color ?? existing.color,
      sort_order ?? existing.sort_order,
      is_active ?? existing.is_active,
      commission_percent ?? existing.commission_percent ?? 0,
      id
    );

    const updated = db.prepare('SELECT * FROM booking_sources WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function deleteBookingSource(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM booking_sources WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const usageCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM reservations WHERE source = ?'
    ).get(existing.code) as any;

    if (usageCount?.cnt > 0) {
      return NextResponse.json(
        { error: `Неможливо видалити: ${usageCount.cnt} бронювань використовують це джерело` },
        { status: 400 }
      );
    }

    db.prepare('DELETE FROM booking_sources WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
