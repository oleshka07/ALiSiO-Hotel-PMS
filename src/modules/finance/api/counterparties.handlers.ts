/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

const KINDS = ['client', 'supplier', 'employee', 'other'] as const;
type Kind = typeof KINDS[number];

const MAX_ALIASES = 50;
const MAX_ALIAS_LEN = 100;

interface CounterpartyRow {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  kind: Kind | null;
  note: string | null;
  aliases_json: string;
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

function parseAliases(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === 'string');
  } catch { return []; }
}

function normalizeAliases(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new Error('aliases must be an array of strings');
  }
  if (input.length > MAX_ALIASES) {
    throw new Error(`Максимум ${MAX_ALIASES} синонімів`);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_ALIAS_LEN) {
      throw new Error(`Синонім «${trimmed.slice(0, 30)}…» довший за ${MAX_ALIAS_LEN} символів`);
    }
    const upper = trimmed.toUpperCase();
    if (!seen.has(upper)) {
      seen.add(upper);
      result.push(upper);
    }
  }
  return result;
}

function enrich(row: CounterpartyRow) {
  return { ...row, aliases: parseAliases(row.aliases_json) };
}

function countChildren(db: any, id: string): number {
  const r = db.prepare("SELECT COUNT(*) AS n FROM finance_counterparties WHERE parent_id = ?").get(id) as { n: number };
  return r.n;
}

export async function listCounterparties(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const kind = request.nextUrl.searchParams.get('kind');
    const includeArchived = request.nextUrl.searchParams.get('archived') === '1';
    const search = request.nextUrl.searchParams.get('search');

    const where: string[] = ['organization_id = ?'];
    const params: any[] = [orgId];
    if (!includeArchived) where.push('is_active = 1');
    if (kind && KINDS.includes(kind as Kind)) { where.push('kind = ?'); params.push(kind); }
    if (search) { where.push('name LIKE ?'); params.push(`%${search}%`); }

    const rows = db.prepare(`
      SELECT * FROM finance_counterparties
      WHERE ${where.join(' AND ')}
      ORDER BY sort_order ASC, name ASC
    `).all(...params) as CounterpartyRow[];
    return NextResponse.json(rows.map(enrich));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getCounterpartyTree(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const includeArchived = request.nextUrl.searchParams.get('archived') === '1';
    const where = includeArchived ? 'organization_id = ?' : 'organization_id = ? AND is_active = 1';

    const rows = db.prepare(`
      SELECT * FROM finance_counterparties
      WHERE ${where}
      ORDER BY sort_order ASC, name ASC
    `).all(orgId) as CounterpartyRow[];

    const enriched = rows.map(enrich);
    const roots = enriched.filter((r) => r.parent_id === null);
    const childrenByParent = new Map<string, typeof enriched>();
    for (const r of enriched) {
      if (r.parent_id) {
        if (!childrenByParent.has(r.parent_id)) childrenByParent.set(r.parent_id, []);
        childrenByParent.get(r.parent_id)!.push(r);
      }
    }
    const tree = roots.map((root) => ({ ...root, children: childrenByParent.get(root.id) || [] }));

    const byKind: Record<string, typeof tree> = { client: [], supplier: [], employee: [], other: [], unspecified: [] };
    for (const node of tree) {
      const key = (node.kind || 'unspecified') as string;
      if (!byKind[key]) byKind[key] = [];
      byKind[key].push(node);
    }

    return NextResponse.json({ tree, byKind });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createCounterparty(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, parent_id = null, kind, aliases, icon, color, note, sort_order } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    let finalKind: Kind | null = null;
    if (parent_id) {
      const parent = db.prepare("SELECT * FROM finance_counterparties WHERE id = ?").get(parent_id) as CounterpartyRow | undefined;
      if (!parent) return NextResponse.json({ error: 'Parent counterparty not found' }, { status: 404 });
      if (parent.parent_id !== null) {
        return NextResponse.json({ error: 'Підконтрагента не можна створити всередині іншого підконтрагента. Дозволено максимум 2 рівні.' }, { status: 400 });
      }
      finalKind = parent.kind;
    } else if (kind !== undefined && kind !== null && kind !== '') {
      if (!KINDS.includes(kind)) {
        return NextResponse.json({ error: `kind must be one of ${KINDS.join(', ')}` }, { status: 400 });
      }
      finalKind = kind;
    }

    let aliasArr: string[] = [];
    if (aliases !== undefined) {
      try { aliasArr = normalizeAliases(aliases); }
      catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
    }

    const orgId = getOrgId(db);
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS mx FROM finance_counterparties WHERE organization_id = ? AND (parent_id IS ? OR parent_id = ?)"
    ).get(orgId, parent_id, parent_id) as { mx: number };

    db.prepare(`
      INSERT INTO finance_counterparties
        (id, organization_id, name, parent_id, kind, note, aliases_json, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, orgId, name.trim(), parent_id, finalKind,
      note || null,
      JSON.stringify(aliasArr),
      icon || null,
      color || '#6b7280',
      Number(sort_order) || (maxOrder.mx + 1),
    );

    const created = db.prepare("SELECT * FROM finance_counterparties WHERE id = ?").get(id) as CounterpartyRow;
    return NextResponse.json(enrich(created), { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateCounterparty(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const { name, kind, aliases, icon, color, note, sort_order } = body;

    const existing = db.prepare("SELECT * FROM finance_counterparties WHERE id = ?").get(id) as CounterpartyRow | undefined;
    if (!existing) return NextResponse.json({ error: 'Counterparty not found' }, { status: 404 });

    const isRoot = existing.parent_id === null;
    const fields: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      fields.push('name = ?'); params.push(name.trim());
    }
    if (kind !== undefined) {
      if (!isRoot) {
        return NextResponse.json({ error: 'kind неможна змінити у підконтрагента (успадковується від батька)' }, { status: 400 });
      }
      if (kind !== null && kind !== '' && !KINDS.includes(kind)) {
        return NextResponse.json({ error: `kind must be one of ${KINDS.join(', ')}` }, { status: 400 });
      }
      fields.push('kind = ?'); params.push(kind || null);
      db.prepare("UPDATE finance_counterparties SET kind = ? WHERE parent_id = ?").run(kind || null, id);
    }
    if (aliases !== undefined) {
      try {
        const arr = normalizeAliases(aliases);
        fields.push('aliases_json = ?'); params.push(JSON.stringify(arr));
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }
    if (icon !== undefined) { fields.push('icon = ?'); params.push(icon); }
    if (color !== undefined) { fields.push('color = ?'); params.push(color); }
    if (note !== undefined) { fields.push('note = ?'); params.push(note || null); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(sort_order) || 0); }

    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    params.push(id);
    db.prepare(`UPDATE finance_counterparties SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare("SELECT * FROM finance_counterparties WHERE id = ?").get(id) as CounterpartyRow;
    return NextResponse.json(enrich(updated));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function archiveCounterparty(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const archived = body.archived !== false;

    const existing = db.prepare("SELECT id FROM finance_counterparties WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Counterparty not found' }, { status: 404 });

    db.prepare("UPDATE finance_counterparties SET is_active = ? WHERE id = ?").run(archived ? 0 : 1, id);
    if (archived) {
      db.prepare("UPDATE finance_counterparties SET is_active = 0 WHERE parent_id = ?").run(id);
    }

    const updated = db.prepare("SELECT * FROM finance_counterparties WHERE id = ?").get(id) as CounterpartyRow;
    return NextResponse.json(enrich(updated));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteCounterparty(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;

    const existing = db.prepare("SELECT * FROM finance_counterparties WHERE id = ?").get(id) as CounterpartyRow | undefined;
    if (!existing) return NextResponse.json({ error: 'Counterparty not found' }, { status: 404 });

    const childCount = countChildren(db, id);
    if (childCount > 0) {
      return NextResponse.json(
        { error: `Маєте ${childCount} підконтрагент${childCount === 1 ? 'а' : 'и'}. Спершу видаліть або архівуйте їх.`, children: childCount },
        { status: 409 }
      );
    }

    db.prepare("DELETE FROM finance_counterparties WHERE id = ?").run(id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function moveCounterparty(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const { parent_id, sort_order } = body;

    const existing = db.prepare("SELECT * FROM finance_counterparties WHERE id = ?").get(id) as CounterpartyRow | undefined;
    if (!existing) return NextResponse.json({ error: 'Counterparty not found' }, { status: 404 });

    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id === id) {
        return NextResponse.json({ error: 'Контрагент не може бути батьком сам собі' }, { status: 400 });
      }
      const newParent = db.prepare("SELECT * FROM finance_counterparties WHERE id = ?").get(parent_id) as CounterpartyRow | undefined;
      if (!newParent) return NextResponse.json({ error: 'Parent counterparty not found' }, { status: 404 });
      if (newParent.parent_id !== null) {
        return NextResponse.json({ error: 'Обраний батько сам є підконтрагентом. Дозволено максимум 2 рівні.' }, { status: 400 });
      }
      if (newParent.kind !== existing.kind) {
        return NextResponse.json({ error: `Батько має тип «${newParent.kind || 'не вказано'}», а контрагент — «${existing.kind || 'не вказано'}». Переміщення заборонено.` }, { status: 400 });
      }
      const childCount = countChildren(db, id);
      if (childCount > 0) {
        return NextResponse.json({ error: 'Контрагент має підконтрагентів — спершу переоформіть або видаліть їх, щоб уникнути 3-го рівня.' }, { status: 400 });
      }
    }

    const fields: string[] = [];
    const params: any[] = [];
    if (parent_id !== undefined) { fields.push('parent_id = ?'); params.push(parent_id); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(sort_order) || 0); }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to move' }, { status: 400 });
    params.push(id);

    db.prepare(`UPDATE finance_counterparties SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare("SELECT * FROM finance_counterparties WHERE id = ?").get(id) as CounterpartyRow;
    return NextResponse.json(enrich(updated));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function matchCounterpartyByText(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) {
      return NextResponse.json({ counterparty_id: null, matched_alias: null });
    }
    const haystack = text.toUpperCase();
    const orgId = getOrgId(db);

    const rows = db.prepare(`
      SELECT id, name, aliases_json, sort_order FROM finance_counterparties
      WHERE organization_id = ? AND is_active = 1
    `).all(orgId) as { id: string; name: string; aliases_json: string; sort_order: number }[];

    let best: { id: string; name: string; alias: string; sort_order: number } | null = null;
    for (const r of rows) {
      const aliases = parseAliases(r.aliases_json);
      for (const a of aliases) {
        if (!a) continue;
        if (haystack.includes(a)) {
          if (!best || a.length > best.alias.length ||
              (a.length === best.alias.length && r.sort_order < best.sort_order)) {
            best = { id: r.id, name: r.name, alias: a, sort_order: r.sort_order };
          }
        }
      }
    }

    if (!best) return NextResponse.json({ counterparty_id: null, matched_alias: null });
    return NextResponse.json({
      counterparty_id: best.id,
      counterparty_name: best.name,
      matched_alias: best.alias,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getAliasSuggestions(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const rows = db.prepare(`
      SELECT comment AS txt, COUNT(*) AS n FROM fin_operations
        WHERE organization_id = ? AND counterparty_id IS NULL
          AND comment IS NOT NULL AND TRIM(comment) != ''
        GROUP BY comment
      UNION ALL
      SELECT counterparty AS txt, COUNT(*) AS n FROM bank_transactions
        WHERE organization_id = ? AND counterparty IS NOT NULL AND TRIM(counterparty) != ''
        GROUP BY counterparty
    `).all(orgId, orgId) as { txt: string; n: number }[];

    const agg = new Map<string, number>();
    for (const r of rows) {
      const key = r.txt.trim().toUpperCase();
      if (!key) continue;
      agg.set(key, (agg.get(key) || 0) + r.n);
    }

    const usedAliases = new Set<string>();
    const cpRows = db.prepare(
      "SELECT aliases_json FROM finance_counterparties WHERE organization_id = ? AND is_active = 1"
    ).all(orgId) as { aliases_json: string }[];
    for (const cp of cpRows) {
      for (const a of parseAliases(cp.aliases_json)) usedAliases.add(a);
    }

    const suggestions = [...agg.entries()]
      .filter(([k]) => !usedAliases.has(k))
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
