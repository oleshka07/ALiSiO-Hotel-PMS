import { getDb } from '@core/db';
import type { Task, TaskTag } from '../domain/types';
import path from 'path';
import fs from 'fs';

// ─── Helpers ───────────────────────────────────────────────

function getOrgId(): string {
  const db = getDb();
  const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
  if (!org) throw new Error('No organization found');
  return org.id;
}

function fetchTagsForTask(taskId: string): TaskTag[] {
  const db = getDb();
  return db.prepare(`
    SELECT tt.*
    FROM task_tags tt
    JOIN task_tag_links ttl ON ttl.tag_id = tt.id
    WHERE ttl.task_id = ?
    ORDER BY tt.name
  `).all(taskId) as TaskTag[];
}

// ─── List tasks with filters ──────────────────────────────

export interface ListTasksFilters {
  project_id?: string;
  status?: string;
  assignee_id?: string;
  priority?: string;
  property_id?: string;
  search?: string;
  due_date_from?: string;
  due_date_to?: string;
  parent_id?: string | null;
}

export function listTasks(filters: ListTasksFilters = {}): Task[] {
  const db = getDb();
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (filters.project_id) {
    conditions.push('t.project_id = ?');
    params.push(filters.project_id);
  }
  if (filters.status) {
    conditions.push('t.status = ?');
    params.push(filters.status);
  }
  if (filters.assignee_id) {
    conditions.push('t.assignee_id = ?');
    params.push(filters.assignee_id);
  }
  if (filters.priority) {
    conditions.push('t.priority = ?');
    params.push(filters.priority);
  }
  if (filters.property_id) {
    conditions.push('t.property_id = ?');
    params.push(filters.property_id);
  }
  if (filters.search) {
    conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term);
  }
  if (filters.due_date_from) {
    conditions.push('t.due_date >= ?');
    params.push(filters.due_date_from);
  }
  if (filters.due_date_to) {
    conditions.push('t.due_date <= ?');
    params.push(filters.due_date_to);
  }
  if (filters.parent_id !== undefined) {
    if (filters.parent_id === null || filters.parent_id === '') {
      conditions.push('t.parent_id IS NULL');
    } else {
      conditions.push('t.parent_id = ?');
      params.push(filters.parent_id);
    }
  }

  const rows = db.prepare(`
    SELECT
      t.*,
      a.full_name  AS assignee_name,
      cr.full_name AS creator_name,
      tp.name      AS project_name,
      tp.color     AS project_color,
      p.name       AS property_name,
      (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_id = t.id) AS subtask_count,
      (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_id = t.id AND sub.status = 'done') AS subtask_done_count
    FROM tasks t
    LEFT JOIN app_users a  ON a.id = t.assignee_id
    LEFT JOIN app_users cr ON cr.id = t.created_by
    LEFT JOIN task_projects tp ON tp.id = t.project_id
    LEFT JOIN business_units p ON p.id = t.property_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.sort_order, t.created_at DESC
  `).all(...params) as Task[];

  // Attach tags to each task
  for (const row of rows) {
    row.tags = fetchTagsForTask(row.id);
  }

  return rows;
}

// ─── Get single task ──────────────────────────────────────

export function getTaskById(id: string): (Task & { subtasks?: Task[] }) | null {
  const db = getDb();

  const task = db.prepare(`
    SELECT
      t.*,
      a.full_name  AS assignee_name,
      cr.full_name AS creator_name,
      tp.name      AS project_name,
      tp.color     AS project_color,
      p.name       AS property_name,
      (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_id = t.id) AS subtask_count,
      (SELECT COUNT(*) FROM tasks sub WHERE sub.parent_id = t.id AND sub.status = 'done') AS subtask_done_count
    FROM tasks t
    LEFT JOIN app_users a  ON a.id = t.assignee_id
    LEFT JOIN app_users cr ON cr.id = t.created_by
    LEFT JOIN task_projects tp ON tp.id = t.project_id
    LEFT JOIN business_units p ON p.id = t.property_id
    WHERE t.id = ?
  `).get(id) as Task | undefined;

  if (!task) return null;

  task.tags = fetchTagsForTask(task.id);

  // Fetch subtasks
  const subtasks = db.prepare(`
    SELECT
      t.*,
      a.full_name  AS assignee_name,
      cr.full_name AS creator_name
    FROM tasks t
    LEFT JOIN app_users a  ON a.id = t.assignee_id
    LEFT JOIN app_users cr ON cr.id = t.created_by
    WHERE t.parent_id = ?
    ORDER BY t.sort_order, t.created_at
  `).all(id) as Task[];

  for (const sub of subtasks) {
    sub.tags = fetchTagsForTask(sub.id);
  }

  return { ...task, subtasks };
}

// ─── Create task ──────────────────────────────────────────

export interface CreateTaskInput {
  title: string;
  description?: string;
  project_id?: string;
  parent_id?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  due_time?: string;
  assignee_id?: string;
  created_by?: string;
  property_id?: string;
  sort_order?: number;
}

export function createTask(input: CreateTaskInput): Task {
  const db = getDb();
  const orgId = getOrgId();

  const result = db.prepare(`
    INSERT INTO tasks (
      organization_id, title, description, project_id, parent_id,
      status, priority, due_date, due_time, assignee_id,
      created_by, property_id, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orgId,
    input.title,
    input.description ?? null,
    input.project_id ?? null,
    input.parent_id ?? null,
    input.status ?? 'todo',
    input.priority ?? 'normal',
    input.due_date ?? null,
    input.due_time ?? null,
    input.assignee_id ?? null,
    input.created_by ?? null,
    input.property_id ?? null,
    input.sort_order ?? 0,
  );

  return getTaskById(db.prepare('SELECT id FROM tasks WHERE rowid = ?').get(result.lastInsertRowid)?.id)!;
}

// ─── Update task ──────────────────────────────────────────

export function updateTask(id: string, fields: Record<string, unknown>): Task | null {
  const db = getDb();
  const allowed = [
    'title', 'description', 'project_id', 'parent_id',
    'status', 'priority', 'due_date', 'due_time',
    'assignee_id', 'created_by', 'property_id', 'sort_order',
    'completed_at',
  ];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowed) {
    if (fields[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(fields[field]);
    }
  }

  // Auto-set completed_at when status changes to done
  if (fields.status === 'done' && fields.completed_at === undefined) {
    updates.push("completed_at = datetime('now')");
  }
  // Clear completed_at when moving out of done
  if (fields.status && fields.status !== 'done' && fields.completed_at === undefined) {
    updates.push('completed_at = NULL');
  }

  if (updates.length === 0) return null;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getTaskById(id);
}

// ─── Delete task ──────────────────────────────────────────

export function deleteTask(id: string): { ok: boolean } {
  const db = getDb();

  // Clean up attachment files from disk before cascade delete removes DB rows
  // Include attachments from subtasks (which will be cascade-deleted)
  const attachments = db.prepare(`
    SELECT url FROM task_attachments WHERE task_id = ?
    UNION ALL
    SELECT a.url FROM task_attachments a
    JOIN tasks t ON a.task_id = t.id
    WHERE t.parent_id = ?
  `).all(id, id) as { url: string }[];

  const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'tasks');
  for (const att of attachments) {
    const filename = att.url.split('/').pop();
    if (filename) {
      const filePath = path.join(UPLOAD_DIR, filename);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return { ok: true };
}

// ─── Toggle task status ───────────────────────────────────

export function toggleTaskStatus(id: string): Task | null {
  const db = getDb();
  const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as { status: string } | undefined;
  if (!task) return null;

  let newStatus: string;
  if (task.status === 'done') {
    newStatus = 'todo';
  } else {
    newStatus = 'done';
  }

  const completedAt = newStatus === 'done' ? "datetime('now')" : 'NULL';
  db.prepare(`UPDATE tasks SET status = ?, completed_at = ${completedAt}, updated_at = datetime('now') WHERE id = ?`).run(newStatus, id);

  return getTaskById(id);
}

// ─── Reorder tasks ────────────────────────────────────────

export function reorderTasks(updates: { id: string; sort_order: number }[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE tasks SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?');
  const transaction = db.transaction(() => {
    for (const u of updates) {
      stmt.run(u.sort_order, u.id);
    }
  });
  transaction();
}

// ─── Set task tags ────────────────────────────────────────

export function setTaskTags(taskId: string, tagIds: string[]): TaskTag[] {
  const db = getDb();
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM task_tag_links WHERE task_id = ?').run(taskId);
    const ins = db.prepare('INSERT INTO task_tag_links (task_id, tag_id) VALUES (?, ?)');
    for (const tagId of tagIds) {
      ins.run(taskId, tagId);
    }
  });
  transaction();
  return fetchTagsForTask(taskId);
}
