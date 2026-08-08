/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateGuestToken } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function listIcalChannels() {
  try {
    const db = getDb();
    const channels = db.prepare(`
      SELECT
        ic.*,
        CASE ic.channel_type
          WHEN 'building' THEN b.name
          WHEN 'unit' THEN u.name
        END as target_name,
        CASE ic.channel_type
          WHEN 'building' THEN b.code
          WHEN 'unit' THEN u.code
        END as target_code,
        bs.name as source_name,
        bs.color as source_color,
        bs.icon_letter as source_icon
      FROM ical_channels ic
      LEFT JOIN buildings b ON ic.building_id = b.id
      LEFT JOIN units u ON ic.unit_id = u.id
      LEFT JOIN booking_sources bs ON bs.code = ic.source_code
      ORDER BY ic.created_at
    `).all();

    const logStmt = db.prepare(`
      SELECT * FROM ical_sync_log WHERE channel_id = ? ORDER BY synced_at DESC LIMIT 1
    `);
    for (const ch of channels as any[]) {
      ch.last_log = logStmt.get(ch.id) || null;
    }

    return NextResponse.json(channels);
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function createIcalChannel(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { channel_type, building_id, unit_id, source_code, ical_url, sync_interval_minutes } = body;

    if (!channel_type || !source_code) {
      return NextResponse.json({ error: 'channel_type and source_code are required' }, { status: 400 });
    }

    if (channel_type === 'building' && !building_id) {
      return NextResponse.json({ error: 'building_id is required for building channels' }, { status: 400 });
    }

    if (channel_type === 'unit' && !unit_id) {
      return NextResponse.json({ error: 'unit_id is required for unit channels' }, { status: 400 });
    }

    if (channel_type === 'building') {
      const dup = db.prepare('SELECT id FROM ical_channels WHERE building_id = ? AND source_code = ?').get(building_id, source_code);
      if (dup) return NextResponse.json({ error: 'Channel already exists for this building + source' }, { status: 400 });
    } else {
      const dup = db.prepare('SELECT id FROM ical_channels WHERE unit_id = ? AND source_code = ?').get(unit_id, source_code);
      if (dup) return NextResponse.json({ error: 'Channel already exists for this unit + source' }, { status: 400 });
    }

    const prop = db.prepare('SELECT id FROM properties LIMIT 1').get() as any;
    if (!prop) return NextResponse.json({ error: 'No property found' }, { status: 400 });

    const id = `ich_${Date.now()}`;
    const exportToken = generateGuestToken() + generateGuestToken();

    db.prepare(`
      INSERT INTO ical_channels (id, property_id, channel_type, building_id, unit_id, source_code, ical_url, export_token, sync_interval_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, prop.id, channel_type,
      channel_type === 'building' ? building_id : null,
      channel_type === 'unit' ? unit_id : null,
      source_code, ical_url || null, exportToken,
      sync_interval_minutes || 15,
    );

    const created = db.prepare('SELECT * FROM ical_channels WHERE id = ?').get(id);
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
