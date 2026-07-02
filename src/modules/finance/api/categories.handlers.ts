/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

const OP_TYPES = ['income', 'expense', 'transfer', 'other'] as const;
type OpType = typeof OP_TYPES[number];

const CLASSIFIERS = [
  'cogs', 'variable', 'operational', 'capex', 'tax', 'financing', 
  'accommodation_revenue', 'service_revenue', 'other_operating_revenue', 'financial_revenue', 'non_operating_revenue',
  'other'
] as const;
type Classifier = typeof CLASSIFIERS[number];

interface CategoryRow {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  op_type: OpType | null;
  classifier: Classifier | null;
  std_group: string;
  pnl_line: string;
  alloc_method: string;
  include_in_pnl: number;
  include_in_cash: number;
  is_capex: number;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_active: number;
  created_at: string;
}

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function countLinkedExpenseOps(db: any, categoryId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM fin_operations WHERE category_id = ?").get(categoryId) as { n: number };
  return row.n;
}

function countChildren(db: any, categoryId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM expense_categories WHERE parent_id = ?").get(categoryId) as { n: number };
  return row.n;
}

export async function listCategories(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const opType = request.nextUrl.searchParams.get('op_type');
    const includeArchived = request.nextUrl.searchParams.get('archived') === '1';

    const where: string[] = ['organization_id = ?'];
    const params: any[] = [orgId];
    if (!includeArchived) where.push('is_active = 1');
    if (opType) { where.push('op_type = ?'); params.push(opType); }

    const rows = db.prepare(`
      SELECT * FROM expense_categories
      WHERE ${where.join(' AND ')}
      ORDER BY sort_order ASC, name ASC
    `).all(...params);
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getCategoryTree(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const includeArchived = request.nextUrl.searchParams.get('archived') === '1';

    const where = includeArchived ? 'organization_id = ?' : 'organization_id = ? AND is_active = 1';
    const rows = db.prepare(`
      SELECT * FROM expense_categories
      WHERE ${where}
      ORDER BY sort_order ASC, name ASC
    `).all(orgId) as CategoryRow[];

    const roots = rows.filter((r) => r.parent_id === null);
    const childrenByParent = new Map<string, CategoryRow[]>();
    for (const r of rows) {
      if (r.parent_id) {
        if (!childrenByParent.has(r.parent_id)) childrenByParent.set(r.parent_id, []);
        childrenByParent.get(r.parent_id)!.push(r);
      }
    }

    const tree = roots.map((root) => ({
      ...root,
      children: childrenByParent.get(root.id) || [],
    }));

    // Group by op_type for convenience in UI
    const byOpType: Record<string, typeof tree> = { income: [], expense: [], transfer: [], other: [] };
    for (const node of tree) {
      const key = (node.op_type || 'other') as string;
      if (!byOpType[key]) byOpType[key] = [];
      byOpType[key].push(node);
    }

    return NextResponse.json({ tree, byOpType });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createCategory(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, parent_id = null, op_type, classifier, icon, color, sort_order } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    let finalOpType: OpType;
    let finalClassifier: Classifier;

    if (parent_id) {
      const parent = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(parent_id) as CategoryRow | undefined;
      if (!parent) return NextResponse.json({ error: 'Parent category not found' }, { status: 404 });
      if (parent.parent_id !== null) {
        return NextResponse.json({ error: 'Підкатегорію не можна створити всередині іншої підкатегорії. Дозволено максимум 2 рівні.' }, { status: 400 });
      }
      finalOpType = (parent.op_type as OpType) || 'other';
      finalClassifier = (parent.classifier as Classifier) || 'other';
    } else {
      if (!OP_TYPES.includes(op_type)) {
        return NextResponse.json({ error: `op_type must be one of ${OP_TYPES.join(', ')}` }, { status: 400 });
      }
      if (!CLASSIFIERS.includes(classifier)) {
        return NextResponse.json({ error: `classifier must be one of ${CLASSIFIERS.join(', ')}` }, { status: 400 });
      }
      finalOpType = op_type;
      finalClassifier = classifier;
    }

    const orgId = getOrgId(db);
    const id = `ec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS mx FROM expense_categories WHERE organization_id = ? AND (parent_id IS ? OR parent_id = ?)"
    ).get(orgId, parent_id, parent_id) as { mx: number };

    const stdGroup =
      finalOpType === 'income' ? 'Revenue' :
      finalClassifier === 'cogs' ? 'COGS' :
      finalClassifier === 'tax' ? 'Taxes' :
      finalClassifier === 'capex' ? 'CAPEX' :
      finalClassifier === 'financing' ? 'Financing' :
      finalOpType === 'transfer' ? 'Transfer' :
      'OPEX';

    db.prepare(`
      INSERT INTO expense_categories
        (id, organization_id, name, parent_id, op_type, classifier, std_group, pnl_line, alloc_method, include_in_pnl, include_in_cash, is_capex, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DIRECT', ?, 1, ?, ?, ?, ?)
    `).run(
      id, orgId, name.trim(), parent_id, finalOpType, finalClassifier, stdGroup, name.trim(),
      finalClassifier === 'capex' || finalClassifier === 'financing' ? 0 : 1,
      finalClassifier === 'capex' ? 1 : 0,
      icon || '📋',
      color || '#6b7280',
      Number(sort_order) || (maxOrder.mx + 1),
    );

    const created = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id);
    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateCategory(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const { name, op_type, classifier, icon, color, sort_order } = body;

    const existing = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id) as CategoryRow | undefined;
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    const isRoot = existing.parent_id === null;
    const fields: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      fields.push('name = ?'); params.push(name.trim());
      fields.push('pnl_line = ?'); params.push(name.trim());
    }
    if (op_type !== undefined) {
      if (!isRoot) {
        return NextResponse.json({ error: 'op_type неможна змінити у підкатегорії (успадковується від батька)' }, { status: 400 });
      }
      if (!OP_TYPES.includes(op_type)) {
        return NextResponse.json({ error: `op_type must be one of ${OP_TYPES.join(', ')}` }, { status: 400 });
      }
      fields.push('op_type = ?'); params.push(op_type);
      // Propagate to children
      db.prepare("UPDATE expense_categories SET op_type = ? WHERE parent_id = ?").run(op_type, id);
    }
    if (classifier !== undefined) {
      if (!isRoot) {
        return NextResponse.json({ error: 'classifier неможна змінити у підкатегорії (успадковується від батька)' }, { status: 400 });
      }
      if (!CLASSIFIERS.includes(classifier)) {
        return NextResponse.json({ error: `classifier must be one of ${CLASSIFIERS.join(', ')}` }, { status: 400 });
      }
      fields.push('classifier = ?'); params.push(classifier);
      db.prepare("UPDATE expense_categories SET classifier = ? WHERE parent_id = ?").run(classifier, id);
    }
    if (icon !== undefined) { fields.push('icon = ?'); params.push(icon); }
    if (color !== undefined) { fields.push('color = ?'); params.push(color); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(sort_order) || 0); }

    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    params.push(id);
    db.prepare(`UPDATE expense_categories SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function archiveCategory(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const archived = body.archived !== false; // default true

    const existing = db.prepare("SELECT id FROM expense_categories WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    db.prepare("UPDATE expense_categories SET is_active = ? WHERE id = ?").run(archived ? 0 : 1, id);
    if (archived) {
      // Cascade archive children when archiving a root
      db.prepare("UPDATE expense_categories SET is_active = 0 WHERE parent_id = ?").run(id);
    }

    const updated = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteCategory(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;

    const existing = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id) as CategoryRow | undefined;
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    const childCount = countChildren(db, id);
    if (childCount > 0) {
      return NextResponse.json(
        { error: `Маєте ${childCount} підкатегорі${childCount === 1 ? 'ю' : 'ї'}. Спершу видаліть або архівуйте їх.`, children: childCount },
        { status: 409 }
      );
    }

    const expenseCount = countLinkedExpenseOps(db, id);
    if (expenseCount > 0) {
      return NextResponse.json(
        { error: `Категорія використовується у ${expenseCount} операці${expenseCount === 1 ? 'ї' : 'ях'}. Архівуйте замість видалення.`, linked_operations: expenseCount },
        { status: 409 }
      );
    }

    db.prepare("DELETE FROM expense_categories WHERE id = ?").run(id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function moveCategory(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const { parent_id, sort_order } = body;

    const existing = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id) as CategoryRow | undefined;
    if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

    // Validate new parent
    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id === id) {
        return NextResponse.json({ error: 'Категорія не може бути батьком сама собі' }, { status: 400 });
      }
      const newParent = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(parent_id) as CategoryRow | undefined;
      if (!newParent) return NextResponse.json({ error: 'Parent category not found' }, { status: 404 });
      if (newParent.parent_id !== null) {
        return NextResponse.json({ error: 'Обраний батько сам є підкатегорією. Дозволено максимум 2 рівні.' }, { status: 400 });
      }
      if (newParent.op_type !== existing.op_type) {
        return NextResponse.json({ error: `Батько має тип «${newParent.op_type}», а категорія — «${existing.op_type}». Переміщення заборонено.` }, { status: 400 });
      }
      // If moving a root with children under a new parent, refuse — would create 3-level
      const childCount = countChildren(db, id);
      if (childCount > 0) {
        return NextResponse.json({ error: 'Категорія має підкатегорії — спершу переоформіть або видаліть їх, щоб уникнути 3-го рівня вкладеності.' }, { status: 400 });
      }
    }

    const fields: string[] = [];
    const params: any[] = [];
    if (parent_id !== undefined) { fields.push('parent_id = ?'); params.push(parent_id); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(sort_order) || 0); }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to move' }, { status: 400 });
    params.push(id);

    db.prepare(`UPDATE expense_categories SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
