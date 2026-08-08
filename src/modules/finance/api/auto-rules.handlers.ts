/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import {
  applyRulesToOperation, loadActiveRules, parseRule,
  type AutoRuleRow, type Condition, type Actions, type Operation,
} from '../data/auto-rules-engine';
import { publicMessage } from '@core/security/public-error';

const OP_TYPES = ['income', 'expense', 'any'] as const;

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function enrichRule(db: any, row: AutoRuleRow) {
  const parsed = parseRule(row);
  const matchCount = db.prepare("SELECT COUNT(*) AS n FROM fin_auto_rule_matches WHERE rule_id = ?").get(row.id) as { n: number };
  return { ...parsed, match_count: matchCount.n };
}

function validateConditions(conditions: unknown): Condition[] {
  if (!Array.isArray(conditions)) throw new Error('conditions must be an array');
  return conditions.map((c: any) => {
    if (!c || typeof c.field !== 'string' || typeof c.op !== 'string') {
      throw new Error('Each condition must have field, op, value');
    }
    return { field: c.field, op: c.op, value: c.value };
  });
}

function validateActions(actions: unknown): Actions {
  if (!actions || typeof actions !== 'object') return {};
  const a = actions as any;
  const out: Actions = {};
  if ('set_category_id' in a) out.set_category_id = a.set_category_id || null;
  if ('set_project_id' in a) out.set_project_id = a.set_project_id || null;
  if ('set_counterparty_id' in a) out.set_counterparty_id = a.set_counterparty_id || null;
  if ('auto_match_counterparty' in a) out.auto_match_counterparty = !!a.auto_match_counterparty;
  if ('set_comment' in a && typeof a.set_comment === 'string') out.set_comment = a.set_comment;
  if (Array.isArray(a.add_tag_ids)) out.add_tag_ids = a.add_tag_ids.filter((x: any) => typeof x === 'string');
  return out;
}

export async function listAutoRules(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const rows = db.prepare(`
      SELECT * FROM fin_auto_rules
      WHERE organization_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(orgId) as AutoRuleRow[];
    return NextResponse.json(rows.map((r) => enrichRule(db, r)));
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function createAutoRule(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, op_type = 'any', conditions = [], actions = {}, is_active = true, stop_on_match = false, sort_order } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!(OP_TYPES as readonly string[]).includes(op_type)) {
      return NextResponse.json({ error: `op_type must be one of ${OP_TYPES.join(', ')}` }, { status: 400 });
    }

    let parsedConditions: Condition[];
    let parsedActions: Actions;
    try {
      parsedConditions = validateConditions(conditions);
      parsedActions = validateActions(actions);
    } catch (e: any) {
      return NextResponse.json({ error: publicMessage(e) }, { status: 400 });
    }

    const orgId = getOrgId(db);
    const id = `ar_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS mx FROM fin_auto_rules WHERE organization_id = ?").get(orgId) as { mx: number };

    db.prepare(`
      INSERT INTO fin_auto_rules
        (id, organization_id, name, op_type, conditions_json, actions_json, is_active, stop_on_match, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, orgId, name.trim(), op_type,
      JSON.stringify(parsedConditions), JSON.stringify(parsedActions),
      is_active ? 1 : 0, stop_on_match ? 1 : 0,
      Number(sort_order) || (maxOrder.mx + 1),
    );

    const row = db.prepare("SELECT * FROM fin_auto_rules WHERE id = ?").get(id) as AutoRuleRow;
    return NextResponse.json(enrichRule(db, row), { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function updateAutoRule(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const existing = db.prepare("SELECT * FROM fin_auto_rules WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

    const fields: string[] = [];
    const params: any[] = [];
    if (typeof body.name === 'string' && body.name.trim()) { fields.push('name = ?'); params.push(body.name.trim()); }
    if (typeof body.op_type === 'string' && (OP_TYPES as readonly string[]).includes(body.op_type)) {
      fields.push('op_type = ?'); params.push(body.op_type);
    }
    if (body.conditions !== undefined) {
      try {
        fields.push('conditions_json = ?');
        params.push(JSON.stringify(validateConditions(body.conditions)));
      } catch (e: any) { return NextResponse.json({ error: publicMessage(e) }, { status: 400 }); }
    }
    if (body.actions !== undefined) {
      fields.push('actions_json = ?');
      params.push(JSON.stringify(validateActions(body.actions)));
    }
    if (body.is_active !== undefined) { fields.push('is_active = ?'); params.push(body.is_active ? 1 : 0); }
    if (body.stop_on_match !== undefined) { fields.push('stop_on_match = ?'); params.push(body.stop_on_match ? 1 : 0); }
    if (body.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(body.sort_order) || 0); }
    fields.push("updated_at = datetime('now')");
    if (fields.length === 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    params.push(id);
    db.prepare(`UPDATE fin_auto_rules SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare("SELECT * FROM fin_auto_rules WHERE id = ?").get(id) as AutoRuleRow;
    return NextResponse.json(enrichRule(db, row));
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function deleteAutoRule(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const existing = db.prepare("SELECT id FROM fin_auto_rules WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    db.prepare('DELETE FROM fin_auto_rules WHERE id = ?').run(id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function toggleAutoRule(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const row = db.prepare("SELECT is_active FROM fin_auto_rules WHERE id = ?").get(id) as { is_active: number } | undefined;
    if (!row) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    const next = typeof body.is_active === 'boolean' ? (body.is_active ? 1 : 0) : (row.is_active ? 0 : 1);
    db.prepare("UPDATE fin_auto_rules SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(next, id);
    const updated = db.prepare("SELECT * FROM fin_auto_rules WHERE id = ?").get(id) as AutoRuleRow;
    return NextResponse.json(enrichRule(db, updated));
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function moveAutoRule(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const existing = db.prepare("SELECT id FROM fin_auto_rules WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    if (body.sort_order === undefined) return NextResponse.json({ error: 'sort_order is required' }, { status: 400 });
    db.prepare("UPDATE fin_auto_rules SET sort_order = ?, updated_at = datetime('now') WHERE id = ?").run(Number(body.sort_order) || 0, id);
    const updated = db.prepare("SELECT * FROM fin_auto_rules WHERE id = ?").get(id) as AutoRuleRow;
    return NextResponse.json(enrichRule(db, updated));
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function applyAutoRulesToOperations(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json().catch(() => ({}));
    const { operation_ids, from, to, op_type } = body;

    let ops: Operation[];
    if (Array.isArray(operation_ids) && operation_ids.length > 0) {
      const placeholders = operation_ids.map(() => '?').join(',');
      ops = db.prepare(`SELECT * FROM fin_operations WHERE id IN (${placeholders})`).all(...operation_ids) as Operation[];
    } else {
      const where: string[] = ['organization_id = ?'];
      const params: any[] = [orgId];
      if (from) { where.push('paid_at >= ?'); params.push(from); }
      if (to) { where.push('paid_at <= ?'); params.push(to); }
      if (op_type) { where.push('op_type = ?'); params.push(op_type); }
      ops = db.prepare(`SELECT * FROM fin_operations WHERE ${where.join(' AND ')}`).all(...params) as Operation[];
    }

    const rules = loadActiveRules(db, orgId);
    if (rules.length === 0) {
      return NextResponse.json({ processed: ops.length, changed: 0, rulesCount: 0, results: [] });
    }

    const results = [];
    let changedCount = 0;
    for (const op of ops) {
      const result = applyRulesToOperation(db, op, rules, orgId);
      if (Object.keys(result.changes).length > 0 || result.tagsAdded.length > 0) {
        changedCount++;
        results.push(result);
      }
    }
    return NextResponse.json({ processed: ops.length, changed: changedCount, rulesCount: rules.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function autoMatchCounterpartiesAllOps(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json().catch(() => ({}));
    const onlyUnmatched = body.only_unmatched !== false;

    const where = onlyUnmatched
      ? 'organization_id = ? AND counterparty_id IS NULL AND comment IS NOT NULL'
      : 'organization_id = ? AND comment IS NOT NULL';
    const ops = db.prepare(`SELECT * FROM fin_operations WHERE ${where}`).all(orgId) as Operation[];

    // Synthetic rule that only auto-matches counterparty
    const syntheticRule = {
      id: 'synthetic_auto_match',
      organization_id: orgId,
      name: 'Auto-match counterparty',
      op_type: 'any' as const,
      conditions: [{ field: 'comment' as const, op: 'contains' as const, value: '' }], // matches anything with a comment
      actions: { auto_match_counterparty: true },
      is_active: 1,
      stop_on_match: 0,
      sort_order: 0,
    };

    let matched = 0;
    for (const op of ops) {
      const result = applyRulesToOperation(db, op, [syntheticRule], orgId);
      if (result.changes.counterparty_id) matched++;
    }
    return NextResponse.json({ processed: ops.length, matched });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
