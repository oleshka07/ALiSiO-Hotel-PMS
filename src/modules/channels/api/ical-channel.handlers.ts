/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function updateIcalChannel(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const existing = db.prepare('SELECT * FROM ical_channels WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const { ical_url, source_code, sync_interval_minutes, is_active } = body;

    db.prepare(`
      UPDATE ical_channels SET
        ical_url = ?,
        source_code = ?,
        sync_interval_minutes = ?,
        is_active = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      ical_url ?? existing.ical_url,
      source_code ?? existing.source_code,
      sync_interval_minutes ?? existing.sync_interval_minutes,
      is_active ?? existing.is_active,
      id,
    );

    const updated = db.prepare('SELECT * FROM ical_channels WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function deleteIcalChannel(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM ical_channels WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM ical_sync_log WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM ical_channels WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
