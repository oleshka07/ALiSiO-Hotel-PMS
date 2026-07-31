/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
// TODO: move to @core/translate or emit event for translation
import { extractTexts, translateAndStore } from '@/lib/translate';

export async function getGuestPageConfig(_request: NextRequest, { params }: { params: Promise<{ unitTypeId: string }> }) {
  try {
    const db = getDb();
    const { unitTypeId } = await params;

    const config = db.prepare(`
      SELECT gpc.*, ut.name as unit_type_name, ut.code as unit_type_code,
             c.type as category_type, c.name as category_name
      FROM guest_page_config gpc
      JOIN unit_types ut ON gpc.unit_type_id = ut.id
      JOIN categories c ON ut.category_id = c.id
      WHERE gpc.unit_type_id = ?
    `).get(unitTypeId);

    if (!config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    return NextResponse.json(config);
  } catch (error: any) {
    console.error('GET /api/guest-page-config/[unitTypeId] error:', error?.message);
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

export async function updateGuestPageConfig(request: NextRequest, { params }: { params: Promise<{ unitTypeId: string }> }) {
  try {
    const db = getDb();
    const { unitTypeId } = await params;
    const body = await request.json();

    const ut = db.prepare('SELECT id FROM unit_types WHERE id = ?').get(unitTypeId);
    if (!ut) {
      return NextResponse.json({ error: 'Unit type not found' }, { status: 404 });
    }

    const existing = db.prepare('SELECT id FROM guest_page_config WHERE unit_type_id = ?').get(unitTypeId);

    if (existing) {
      const sets: string[] = [];
      const values: any[] = [];

      const fields = ['amenities', 'check_in_instructions', 'external_amenities', 'faq_items', 'rules',
        'wifi_network', 'wifi_password', 'restaurant_name', 'restaurant_hours', 'restaurant_menu_url', 'useful_info',
        'lock_code', 'maps_url', 'territory_map_url', 'pets_policy', 'entry_photo_url', 'gate_code', 'gate_photo_url'];

      for (const f of fields) {
        if (body[f] !== undefined) {
          sets.push(`${f} = ?`);
          values.push(typeof body[f] === 'object' ? JSON.stringify(body[f]) : body[f]);
        }
      }

      if (sets.length > 0) {
        sets.push("updated_at = datetime('now')");
        values.push(unitTypeId);
        db.prepare(`UPDATE guest_page_config SET ${sets.join(', ')} WHERE unit_type_id = ?`).run(...values);
      }
    } else {
      db.prepare(`
        INSERT INTO guest_page_config (unit_type_id, amenities, check_in_instructions, external_amenities, faq_items, rules,
          wifi_network, wifi_password, restaurant_name, restaurant_hours, restaurant_menu_url, useful_info,
          lock_code, maps_url, territory_map_url, gate_code, gate_photo_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        unitTypeId,
        typeof body.amenities === 'object' ? JSON.stringify(body.amenities) : body.amenities || '[]',
        body.check_in_instructions || '',
        typeof body.external_amenities === 'object' ? JSON.stringify(body.external_amenities) : body.external_amenities || null,
        typeof body.faq_items === 'object' ? JSON.stringify(body.faq_items) : body.faq_items || '[]',
        typeof body.rules === 'object' ? JSON.stringify(body.rules) : body.rules || '[]',
        body.wifi_network || null,
        body.wifi_password || null,
        body.restaurant_name || 'Ресторан ALiSiO',
        body.restaurant_hours || '',
        body.restaurant_menu_url || null,
        typeof body.useful_info === 'object' ? JSON.stringify(body.useful_info) : body.useful_info || '[]',
        body.lock_code || '4971#',
        body.maps_url || 'https://maps.app.goo.gl/WH2CKhTydtDx9EBe7',
        body.territory_map_url || null,
        body.gate_code || '4545',
        body.gate_photo_url || null,
      );
    }

    const updated = db.prepare('SELECT * FROM guest_page_config WHERE unit_type_id = ?').get(unitTypeId);

    const texts = extractTexts(updated);
    translateAndStore(texts).catch(e => console.error('[translate] bg error:', e?.message));

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('PUT /api/guest-page-config/[unitTypeId] error:', error?.message);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
