import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Params) {
  const { id } = await context.params;
  const body = await request.json();
  const db = getDb();
  const allowed = ['name','type','parent_id','code','icon','color','sort_order','is_active','show_in_tasks','show_in_finance','show_in_booking','show_in_investor','notes'];
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No fields' }, { status: 400 });
  updates.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE locations SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, context: Params) {
  const { id } = await context.params;
  const db = getDb();
  db.prepare('DELETE FROM locations WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
