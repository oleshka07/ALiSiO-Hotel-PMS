import { getDb } from '@core/db';
import type { TaskTag } from '../domain/types';

// ─── Helpers ───────────────────────────────────────────────

function getOrgId(): string {
  const db = getDb();
  const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
  if (!org) throw new Error('No organization found');
  return org.id;
}

// ─── List tags ────────────────────────────────────────────

export function listTags(): TaskTag[] {
  const db = getDb();
  return db.prepare('SELECT * FROM task_tags ORDER BY name').all() as TaskTag[];
}

// ─── Get single tag ──────────────────────────────────────

export function getTagById(id: string): TaskTag | null {
  const db = getDb();
  const tag = db.prepare('SELECT * FROM task_tags WHERE id = ?').get(id) as TaskTag | undefined;
  return tag ?? null;
}

// ─── Create tag ──────────────────────────────────────────

export interface CreateTagInput {
  name: string;
  color?: string;
}

export function createTag(input: CreateTagInput): TaskTag {
  const db = getDb();
  const orgId = getOrgId();

  const result = db.prepare(`
    INSERT INTO task_tags (organization_id, name, color)
    VALUES (?, ?, ?)
  `).run(orgId, input.name, input.color ?? '#6c7086');

  const row = db.prepare('SELECT id FROM task_tags WHERE rowid = ?').get(result.lastInsertRowid) as { id: string };
  return getTagById(row.id)!;
}

// ─── Update tag ──────────────────────────────────────────

export function updateTag(id: string, fields: Record<string, unknown>): TaskTag | null {
  const db = getDb();
  const allowed = ['name', 'color'];
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

  db.prepare(`UPDATE task_tags SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getTagById(id);
}

// ─── Delete tag ──────────────────────────────────────────
// task_tag_links has ON DELETE CASCADE on tag_id, so links are auto-removed

export function deleteTag(id: string): { ok: boolean } {
  const db = getDb();
  db.prepare('DELETE FROM task_tags WHERE id = ?').run(id);
  return { ok: true };
}
