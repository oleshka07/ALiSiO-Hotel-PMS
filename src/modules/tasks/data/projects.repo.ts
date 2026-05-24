import { getDb } from '@core/db';
import type { TaskProject } from '../domain/types';

// ─── Helpers ───────────────────────────────────────────────

function getOrgId(): string {
  const db = getDb();
  const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
  if (!org) throw new Error('No organization found');
  return org.id;
}

// ─── List projects ────────────────────────────────────────

export function listProjects(): TaskProject[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      tp.*,
      p.name AS property_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = tp.id) AS task_count
    FROM task_projects tp
    LEFT JOIN properties p ON p.id = tp.property_id
    ORDER BY tp.sort_order, tp.created_at
  `).all() as TaskProject[];
}

// ─── Get single project ──────────────────────────────────

export function getProjectById(id: string): TaskProject | null {
  const db = getDb();
  const project = db.prepare(`
    SELECT
      tp.*,
      p.name AS property_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = tp.id) AS task_count
    FROM task_projects tp
    LEFT JOIN properties p ON p.id = tp.property_id
    WHERE tp.id = ?
  `).get(id) as TaskProject | undefined;
  return project ?? null;
}

// ─── Create project ──────────────────────────────────────

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parent_id?: string;
  property_id?: string;
  sort_order?: number;
}

export function createProject(input: CreateProjectInput): TaskProject {
  const db = getDb();
  const orgId = getOrgId();

  const result = db.prepare(`
    INSERT INTO task_projects (organization_id, name, description, color, icon, parent_id, property_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orgId,
    input.name,
    input.description ?? null,
    input.color ?? '#4f6ef7',
    input.icon ?? '📁',
    input.parent_id ?? null,
    input.property_id ?? null,
    input.sort_order ?? 0,
  );

  const row = db.prepare('SELECT id FROM task_projects WHERE rowid = ?').get(result.lastInsertRowid) as { id: string };
  return getProjectById(row.id)!;
}

// ─── Update project ──────────────────────────────────────

export function updateProject(id: string, fields: Record<string, unknown>): TaskProject | null {
  const db = getDb();
  const allowed = ['name', 'description', 'color', 'icon', 'parent_id', 'property_id', 'sort_order', 'is_archived'];
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

  db.prepare(`UPDATE task_projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getProjectById(id);
}

// ─── Delete project ──────────────────────────────────────

export function deleteProject(id: string): { ok: boolean } {
  const db = getDb();
  db.prepare('DELETE FROM task_projects WHERE id = ?').run(id);
  return { ok: true };
}
