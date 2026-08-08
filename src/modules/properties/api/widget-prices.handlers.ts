/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

// GET — list all price items (optionally filtered by category)
export async function getWidgetPriceList(req: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    let rows;
    if (category) {
      rows = db.prepare('SELECT * FROM widget_price_list WHERE category = ? ORDER BY sort_order').all(category);
    } else {
      rows = db.prepare('SELECT * FROM widget_price_list ORDER BY category, sort_order').all();
    }
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: publicMessage(err) }, { status: 500 });
  }
}

// PUT — update a price item
export async function updateWidgetPriceItem(req: Request) {
  try {
    const db = getDb();
    const body = await req.json();
    const { id, rate_standard, rate_holiday, rate_side_season, item_name, unit_label, notes, is_active } = body;

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    db.prepare(`
      UPDATE widget_price_list
      SET rate_standard = COALESCE(?, rate_standard),
          rate_holiday = ?,
          rate_side_season = ?,
          item_name = COALESCE(?, item_name),
          unit_label = COALESCE(?, unit_label),
          notes = ?,
          is_active = COALESCE(?, is_active),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      rate_standard ?? null,
      rate_holiday ?? null,
      rate_side_season ?? null,
      item_name ?? null,
      unit_label ?? null,
      notes ?? null,
      is_active ?? null,
      id
    );

    console.log(`[Widget Prices] Updated ${id}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: publicMessage(err) }, { status: 500 });
  }
}
