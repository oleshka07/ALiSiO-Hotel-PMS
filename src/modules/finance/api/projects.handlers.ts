/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

interface ProjectRow {
  id: string;
  organization_id: string;
  name: string;
  unit_type: string | null;
  is_shared: number;
  is_active: number;
  sort_order: number;
  parent_id: string | null;
  created_at: string;
}

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function countChildren(db: any, projectId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM business_units WHERE parent_id = ?").get(projectId) as { n: number };
  return row.n;
}

interface LinkedCount { table: string; count: number }
function countLinkedRows(db: any, projectId: string): { total: number; breakdown: LinkedCount[] } {
  const tables: { table: string; column: string }[] = [
    { table: 'expenses',           column: 'business_unit_id' },
    { table: 'income',             column: 'business_unit_id' },
    { table: 'capex_items',        column: 'business_unit_id' },
    { table: 'accruals',           column: 'business_unit_id' },
    { table: 'bank_transactions',  column: 'matched_business_unit_id' },
    { table: 'cost_allocations',   column: 'business_unit_id' },
  ];
  const breakdown: LinkedCount[] = [];
  let total = 0;
  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${t.table} WHERE ${t.column} = ?`).get(projectId) as { n: number };
      if (row.n > 0) breakdown.push({ table: t.table, count: row.n });
      total += row.n;
    } catch {
      // Table may not exist yet in a partially-migrated DB — skip silently.
    }
  }
  return { total, breakdown };
}

export async function listProjects(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const includeArchived = request.nextUrl.searchParams.get('archived') === '1';
    const where = includeArchived ? 'organization_id = ?' : 'organization_id = ? AND is_active = 1';
    const rows = db.prepare(`
      SELECT * FROM business_units
      WHERE ${where}
      ORDER BY sort_order ASC, name ASC
    `).all(orgId);
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function getProjectTree(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const includeArchived = request.nextUrl.searchParams.get('archived') === '1';
    const where = includeArchived ? 'organization_id = ?' : 'organization_id = ? AND is_active = 1';
    const rows = db.prepare(`
      SELECT * FROM business_units
      WHERE ${where}
      ORDER BY sort_order ASC, name ASC
    `).all(orgId) as ProjectRow[];

    const roots = rows.filter((r) => r.parent_id === null);
    const childrenByParent = new Map<string, ProjectRow[]>();
    for (const r of rows) {
      if (r.parent_id) {
        if (!childrenByParent.has(r.parent_id)) childrenByParent.set(r.parent_id, []);
        childrenByParent.get(r.parent_id)!.push(r);
      }
    }
    const tree = roots.map((root) => ({ ...root, children: childrenByParent.get(root.id) || [] }));
    return NextResponse.json({ tree });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function createProject(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, parent_id = null, is_shared = 0, unit_type, sort_order } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (parent_id) {
      const parent = db.prepare("SELECT * FROM business_units WHERE id = ?").get(parent_id) as ProjectRow | undefined;
      if (!parent) return NextResponse.json({ error: 'Parent project not found' }, { status: 404 });
      if (parent.parent_id !== null) {
        return NextResponse.json({ error: 'Підпроєкт не можна створити всередині іншого підпроєкта. Дозволено максимум 2 рівні.' }, { status: 400 });
      }
    }

    const orgId = getOrgId(db);
    const id = `bu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS mx FROM business_units WHERE organization_id = ? AND (parent_id IS ? OR parent_id = ?)"
    ).get(orgId, parent_id, parent_id) as { mx: number };

    // A subproject cannot be "is_shared" on its own — inherit from parent.
    let finalIsShared = is_shared ? 1 : 0;
    if (parent_id) {
      const parent = db.prepare("SELECT is_shared FROM business_units WHERE id = ?").get(parent_id) as { is_shared: number };
      finalIsShared = parent.is_shared;
    }

    db.prepare(`
      INSERT INTO business_units
        (id, organization_id, name, unit_type, is_shared, is_active, sort_order, parent_id)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id, orgId, name.trim(),
      unit_type || name.trim(),
      finalIsShared,
      Number(sort_order) || (maxOrder.mx + 1),
      parent_id,
    );

    const created = db.prepare("SELECT * FROM business_units WHERE id = ?").get(id);
    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function updateProject(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const { name, unit_type, is_shared, sort_order } = body;

    const existing = db.prepare("SELECT * FROM business_units WHERE id = ?").get(id) as ProjectRow | undefined;
    if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const isRoot = existing.parent_id === null;

    const fields: string[] = [];
    const params: any[] = [];
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      fields.push('name = ?'); params.push(name.trim());
    }
    if (unit_type !== undefined) { fields.push('unit_type = ?'); params.push(unit_type); }
    if (is_shared !== undefined) {
      if (!isRoot) {
        return NextResponse.json({ error: '«Спільний» неможна змінити у підпроєкті (успадковується від батька)' }, { status: 400 });
      }
      fields.push('is_shared = ?'); params.push(is_shared ? 1 : 0);
      // Propagate to children
      db.prepare("UPDATE business_units SET is_shared = ? WHERE parent_id = ?").run(is_shared ? 1 : 0, id);
    }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(sort_order) || 0); }

    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    params.push(id);
    db.prepare(`UPDATE business_units SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare("SELECT * FROM business_units WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function archiveProject(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const archived = body.archived !== false;

    const existing = db.prepare("SELECT id FROM business_units WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    db.prepare("UPDATE business_units SET is_active = ? WHERE id = ?").run(archived ? 0 : 1, id);
    if (archived) {
      db.prepare("UPDATE business_units SET is_active = 0 WHERE parent_id = ?").run(id);
    }

    const updated = db.prepare("SELECT * FROM business_units WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function deleteProject(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;

    const existing = db.prepare("SELECT * FROM business_units WHERE id = ?").get(id) as ProjectRow | undefined;
    if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const childCount = countChildren(db, id);
    if (childCount > 0) {
      return NextResponse.json(
        { error: `Маєте ${childCount} підпроєкт${childCount === 1 ? '' : 'и'}. Спершу видаліть або архівуйте їх.`, children: childCount },
        { status: 409 }
      );
    }

    const { total, breakdown } = countLinkedRows(db, id);
    if (total > 0) {
      const parts = breakdown.map((b) => `${b.table}: ${b.count}`).join(', ');
      return NextResponse.json(
        { error: `Проєкт використовується у ${total} запис${total === 1 ? 'і' : 'ах'} (${parts}). Архівуйте замість видалення.`, linked: breakdown, linked_total: total },
        { status: 409 }
      );
    }

    db.prepare("DELETE FROM business_units WHERE id = ?").run(id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function moveProject(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const { parent_id, sort_order } = body;

    const existing = db.prepare("SELECT * FROM business_units WHERE id = ?").get(id) as ProjectRow | undefined;
    if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id === id) {
        return NextResponse.json({ error: 'Проєкт не може бути батьком сам собі' }, { status: 400 });
      }
      const newParent = db.prepare("SELECT * FROM business_units WHERE id = ?").get(parent_id) as ProjectRow | undefined;
      if (!newParent) return NextResponse.json({ error: 'Parent project not found' }, { status: 404 });
      if (newParent.parent_id !== null) {
        return NextResponse.json({ error: 'Обраний батько сам є підпроєктом. Дозволено максимум 2 рівні.' }, { status: 400 });
      }
      const childCount = countChildren(db, id);
      if (childCount > 0) {
        return NextResponse.json({ error: 'Проєкт має підпроєкти — спершу переоформіть або видаліть їх, щоб уникнути 3-го рівня.' }, { status: 400 });
      }
    }

    const fields: string[] = [];
    const params: any[] = [];
    if (parent_id !== undefined) { fields.push('parent_id = ?'); params.push(parent_id); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(sort_order) || 0); }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to move' }, { status: 400 });
    params.push(id);

    db.prepare(`UPDATE business_units SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare("SELECT * FROM business_units WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
