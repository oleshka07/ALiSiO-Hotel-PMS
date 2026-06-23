import { getDb } from '@core/db';

const VALID_TYPES = ['glamping', 'resort', 'camping', 'facility', 'area', 'zone'] as const;
export type CategoryTypeValue = typeof VALID_TYPES[number];

export function listCategories() {
  return getDb().prepare(`
    SELECT
      c.id, c.name, c.type, c.icon, c.color, c.sort_order, c.description,
      c.show_in_tasks, c.show_in_finance, c.show_in_booking, c.show_in_investor,
      COUNT(u.id) as unit_count
    FROM categories c
    LEFT JOIN units u ON u.category_id = c.id AND u.is_active = 1
    GROUP BY c.id
    ORDER BY c.sort_order
  `).all();
}

export interface CreateCategoryInput {
  property_id: string;
  name: string;
  type: CategoryTypeValue;
  description?: string;
  sort_order?: number;
  icon?: string;
  color?: string;
  show_in_tasks?: number;
  show_in_finance?: number;
  show_in_booking?: number;
  show_in_investor?: number;
}

export function validateCategoryType(type: string): type is CategoryTypeValue {
  return VALID_TYPES.includes(type as CategoryTypeValue);
}

export function createCategory(input: CreateCategoryInput) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO categories (property_id, name, type, description, sort_order, icon, color, show_in_tasks, show_in_finance, show_in_booking, show_in_investor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.property_id, input.name, input.type, input.description ?? null,
    input.sort_order ?? 0, input.icon ?? null, input.color ?? null,
    input.show_in_tasks ?? 1, input.show_in_finance ?? 0,
    input.show_in_booking ?? 1, input.show_in_investor ?? 0,
  );
  return db.prepare('SELECT * FROM categories WHERE rowid = ?').get(result.lastInsertRowid);
}

export function updateCategory(id: string, fields: Record<string, unknown>) {
  const db = getDb();
  const allowed = ['name', 'type', 'description', 'sort_order', 'icon', 'color',
    'show_in_tasks', 'show_in_finance', 'show_in_booking', 'show_in_investor'];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowed) {
    if (fields[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(fields[field]);
    }
  }

  if (updates.length === 0) return null;

  values.push(id);
  db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function deleteCategory(id: string): { ok: boolean; error?: string } {
  const db = getDb();
  const unitCount = db.prepare('SELECT COUNT(*) as cnt FROM units WHERE category_id = ?').get(id) as { cnt: number };
  if (unitCount.cnt > 0) {
    return { ok: false, error: `Cannot delete: ${unitCount.cnt} units belong to this category. Delete units first.` };
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { ok: true };
}
