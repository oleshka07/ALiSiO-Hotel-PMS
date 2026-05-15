import { getDb } from '@core/db';

export function listUnits(filters: { category?: string; unitType?: string; includePool?: boolean } = {}) {
  let query = `
    SELECT
      u.id, u.name, u.code, u.beds, u.zone, u.room_status, u.cleaning_status, u.sort_order, u.is_active, u.is_pool, u.lock_code, u.entry_photo_url,
      c.id as category_id, c.name as category_name, c.type as category_type, c.icon as category_icon, c.color as category_color,
      ut.id as unit_type_id, ut.name as unit_type_name, ut.code as unit_type_code, ut.max_adults, ut.base_occupancy,
      b.id as building_id, b.name as building_name, b.code as building_code
    FROM units u
    JOIN categories c ON u.category_id = c.id
    JOIN unit_types ut ON u.unit_type_id = ut.id
    LEFT JOIN buildings b ON u.building_id = b.id
    WHERE u.is_active = 1
  `;

  const params: string[] = [];

  // Pool/staging units never show up as bookable rooms. The room-allocation
  // modal opts in via includePool=true.
  if (!filters.includePool) {
    query += ' AND (u.is_pool IS NULL OR u.is_pool = 0)';
  }

  if (filters.category) {
    query += ' AND c.type = ?';
    params.push(filters.category);
  }

  if (filters.unitType) {
    query += ' AND ut.id = ?';
    params.push(filters.unitType);
  }

  query += ' ORDER BY c.sort_order, b.sort_order, ut.sort_order, u.sort_order';

  return getDb().prepare(query).all(...params);
}

export interface CreateUnitInput {
  unit_type_id: string;
  property_id: string;
  category_id: string;
  building_id?: string;
  name: string;
  code: string;
  floor?: number;
  zone?: string;
  beds?: number;
  notes?: string;
  sort_order?: number;
}

export function createUnit(input: CreateUnitInput) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO units (unit_type_id, property_id, category_id, building_id, name, code, floor, zone, beds, notes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.unit_type_id, input.property_id, input.category_id, input.building_id ?? null,
    input.name, input.code, input.floor ?? null, input.zone ?? null,
    input.beds ?? 0, input.notes ?? null, input.sort_order ?? 0
  );
  return db.prepare('SELECT * FROM units WHERE rowid = ?').get(result.lastInsertRowid);
}

export interface BulkCreateUnitsInput {
  property_id: string;
  category_id: string;
  building_id?: string;
  unit_type_id: string;
  prefix: string;
  from: number;
  to: number;
  beds?: number;
  zone?: string;
}

export function bulkCreateUnits(input: BulkCreateUnitsInput) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO units (unit_type_id, property_id, category_id, building_id, name, code, beds, zone, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const created: { name: string; code: string }[] = [];

  db.transaction(() => {
    for (let i = input.from; i <= input.to; i++) {
      const name = `${input.prefix}${i}`;
      const code = `${input.prefix}${i}`;
      try {
        insert.run(input.unit_type_id, input.property_id, input.category_id, input.building_id ?? null, name, code, input.beds ?? 0, input.zone ?? null, i);
        created.push({ name, code });
      } catch (e: unknown) {
        if (e instanceof Error && !e.message.includes('UNIQUE')) throw e;
      }
    }
  })();

  return created;
}

export function updateUnit(id: string, fields: Record<string, unknown>) {
  const db = getDb();

  const nullableFields = ['building_id', 'floor', 'zone', 'notes', 'lock_code', 'entry_photo_url'];
  for (const f of nullableFields) {
    if (fields[f] === '') fields[f] = null;
  }

  const allowed = ['name', 'code', 'unit_type_id', 'category_id', 'building_id', 'floor', 'zone', 'beds', 'room_status', 'cleaning_status', 'notes', 'sort_order', 'is_active', 'lock_code', 'entry_photo_url'];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowed) {
    if (fields[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(fields[field]);
    }
  }

  if (updates.length === 0) return null;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE units SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM units WHERE id = ?').get(id);
}

export function deleteUnit(id: string): { ok: boolean; error?: string } {
  const db = getDb();
  const resCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM reservations WHERE unit_id = ? AND status NOT IN ('cancelled', 'checked_out')"
  ).get(id) as { cnt: number };

  if (resCount.cnt > 0) {
    return { ok: false, error: `Cannot delete: ${resCount.cnt} active reservations exist for this unit.` };
  }

  db.prepare('DELETE FROM units WHERE id = ?').run(id);
  return { ok: true };
}
