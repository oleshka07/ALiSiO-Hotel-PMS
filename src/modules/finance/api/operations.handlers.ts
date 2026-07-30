/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@core/db';
import { getSessionUser } from '@/lib/auth';

import { loadActiveRules, isRuleApplicable } from '../data/auto-rules-engine';

const OP_TYPES = ['income', 'expense', 'transfer'] as const;
type OpType = typeof OP_TYPES[number];

const STATUSES = ['completed', 'pending', 'failed', 'refunded'] as const;
type Status = typeof STATUSES[number];

// Actor of an operation mutation, attached to the audit row. Null on
// system flows (Hostex sync, Teia webhook, bank inbox parser).
export interface OperationActor { id: string; name: string }

export async function getOptionalActor(): Promise<OperationActor | null> {
  try {
    const store = await cookies();
    const sessionId = store.get('session_id')?.value;
    const user = await getSessionUser(sessionId);
    if (!user) return null;
    return { id: user.id, name: user.full_name };
  } catch { return null; }
}

export function writeOperationAudit(
  db: any,
  operationId: string,
  action: 'create' | 'update' | 'delete' | 'convert',
  actor: OperationActor | null,
  beforeRow: any,
  afterRow: any,
): void {
  const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    db.prepare(`
      INSERT INTO fin_operation_audit
        (id, operation_id, action, user_id, user_name, before_json, after_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, operationId, action,
      actor?.id || null, actor?.name || null,
      beforeRow ? JSON.stringify(beforeRow) : null,
      afterRow ? JSON.stringify(afterRow) : null,
    );
  } catch (e: any) {
    // Audit must never break the main mutation. Log and continue.
    console.error('[fin_operation_audit] write failed (non-fatal):', e?.message);
  }
}

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function computeAmountCompany(db: any, amount: number, currency: string, paidAt: string): number {
  if (currency === 'CZK') return amount;

  // Prefer the latest rate effective ON or BEFORE the operation date.
  let rate = db.prepare(`
    SELECT rate FROM finance_exchange_rates
    WHERE from_currency = ? AND to_currency = 'CZK' AND effective_from <= ?
    ORDER BY effective_from DESC LIMIT 1
  `).get(currency, paidAt) as { rate: number } | undefined;

  // No historical rate yet — fall back to the latest known rate of any
  // date so we never silently treat a foreign-currency op as 1:1 (EUR
  // 100 → 100 CZK was a real bug that under-reported income by ~25×).
  if (!rate) {
    rate = db.prepare(`
      SELECT rate FROM finance_exchange_rates
      WHERE from_currency = ? AND to_currency = 'CZK'
      ORDER BY effective_from DESC LIMIT 1
    `).get(currency) as { rate: number } | undefined;
    if (rate) {
      console.warn(`[finance] computeAmountCompany: no rate for ${currency}→CZK on ${paidAt}, using latest available rate ${rate.rate}`);
    }
  }

  if (!rate) {
    // Still nothing — refuse to silently zero-out or 1:1-pretend the op.
    // The handler-level catch turns this into a 400 so the operator sees
    // it and adds a rate in /finance/settings → Курси валют.
    throw new Error(`No ${currency}→CZK exchange rate configured. Add one at /finance/settings → Курси валют before saving this operation.`);
  }

  return amount * rate.rate;
}

function getTagsFor(db: any, operationId: string): string[] {
  const rows = db.prepare(`
    SELECT t.name FROM fin_operation_tags ot
    JOIN finance_tags t ON t.id = ot.tag_id
    WHERE ot.operation_id = ?
    ORDER BY t.sort_order, t.name
  `).all(operationId) as { name: string }[];
  return rows.map((r) => r.name);
}

/** Batch-fetch tags for multiple operations in one query. */
function getBatchTags(db: any, operationIds: string[]): Record<string, string[]> {
  if (operationIds.length === 0) return {};
  const map: Record<string, string[]> = {};
  for (let i = 0; i < operationIds.length; i += 500) {
    const chunk = operationIds.slice(i, i + 500);
    const ph = chunk.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT ot.operation_id, t.name FROM fin_operation_tags ot
      JOIN finance_tags t ON t.id = ot.tag_id
      WHERE ot.operation_id IN (${ph})
      ORDER BY t.sort_order, t.name
    `).all(...chunk) as { operation_id: string; name: string }[];
    for (const r of rows) {
      if (!map[r.operation_id]) map[r.operation_id] = [];
      map[r.operation_id].push(r.name);
    }
  }
  return map;
}

function enrichOperation(db: any, row: any): any {
  if (!row) return row;
  return { ...row, tags: getTagsFor(db, row.id) };
}

export async function listOperations(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const opTypeRaw = sp.get('op_type');
    const opTypes = opTypeRaw ? opTypeRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const from = sp.get('from');
    const to = sp.get('to');
    // account_id supports both single value and comma-separated list of
     // ids — the operator can multi-select accounts in the sidebar.
    const accountIdRaw = sp.get('account_id');
    const accountIds = accountIdRaw
      ? accountIdRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const categoryIdRaw = sp.get('category_id');
    const categoryIds = categoryIdRaw ? categoryIdRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const projectIdRaw = sp.get('project_id');
    const projectIds = projectIdRaw ? projectIdRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const counterpartyIdRaw = sp.get('counterparty_id');
    const counterpartyIds = counterpartyIdRaw ? counterpartyIdRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const tagIdRaw = sp.get('tag_id');
    const tagIds = tagIdRaw ? tagIdRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const status = sp.get('status');
    const search = sp.get('search');
    const reservationId = sp.get('reservation_id');
    const source = sp.get('source');
    // needs_review=1 → only ops the resolver flagged for admin triage.
    const needsReviewOnly = sp.get('needs_review') === '1';
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const pageSize = Math.min(10000, Math.max(1, parseInt(sp.get('pageSize') || '50', 10)));

    // If they touch an account belonging to this org, they belong to this org.
    // This fixes finmap import anomalies where organization_id might be NULL.
    const where = [`(o.organization_id = ? OR afr.organization_id = ? OR ato.organization_id = ?)`];
    const params: any[] = [orgId, orgId, orgId];

    if (needsReviewOnly) where.push('o.needs_review = 1');
    if (opTypes.length > 0) {
      const validOps = opTypes.filter(o => (OP_TYPES as readonly string[]).includes(o));
      if (validOps.length > 0) {
        const ph = validOps.map(() => '?').join(',');
        where.push(`o.op_type IN (${ph})`);
        params.push(...validOps);
      }
    }
    if (from) { where.push('o.paid_at >= ?'); params.push(from); }
    if (to) { where.push('o.paid_at <= ?'); params.push(to); }
    if (accountIds.length > 0) {
      const ph = accountIds.map(() => '?').join(',');
      where.push(`(o.account_from_id IN (${ph}) OR o.account_to_id IN (${ph}))`);
      params.push(...accountIds, ...accountIds);
    }
    if (categoryIds.length > 0) {
      const ph = categoryIds.map(() => '?').join(',');
      where.push(`o.category_id IN (${ph})`);
      params.push(...categoryIds);
    }
    if (projectIds.length > 0) {
      const ph = projectIds.map(() => '?').join(',');
      where.push(`o.project_id IN (${ph})`);
      params.push(...projectIds);
    }
    if (counterpartyIds.length > 0) {
      const ph = counterpartyIds.map(() => '?').join(',');
      where.push(`o.counterparty_id IN (${ph})`);
      params.push(...counterpartyIds);
    }
    if (status && (STATUSES as readonly string[]).includes(status)) { where.push('o.status = ?'); params.push(status); }
    if (reservationId) { where.push('o.reservation_id = ?'); params.push(reservationId); }
    if (source) { where.push('o.source = ?'); params.push(source); }
    if (tagIds.length > 0) {
      const ph = tagIds.map(() => '?').join(',');
      where.push(`o.id IN (SELECT operation_id FROM fin_operation_tags WHERE tag_id IN (${ph}))`);
      params.push(...tagIds);
    }
    if (search) {
      const searchNum = parseFloat(search.replace(/\s/g, '').replace(',', '.'));
      const isNum = !isNaN(searchNum) && searchNum > 0;
      
      const parts = [
        'o.comment LIKE ?',
        'o.source_ref LIKE ?'
      ];
      const p: any[] = [`%${search}%`, `%${search}%`];
      
      if (isNum) {
        parts.push('ABS(o.amount) = ?');
        p.push(searchNum);
      } else {
        parts.push(`EXISTS (SELECT 1 FROM expense_categories WHERE id = o.category_id AND name LIKE ?)`);
        p.push(`%${search}%`);
        parts.push(`EXISTS (SELECT 1 FROM business_units WHERE id = o.project_id AND name LIKE ?)`);
        p.push(`%${search}%`);
        parts.push(`EXISTS (SELECT 1 FROM finance_counterparties WHERE id = o.counterparty_id AND name LIKE ?)`);
        p.push(`%${search}%`);
        parts.push(`EXISTS (SELECT 1 FROM finance_accounts WHERE id = o.account_from_id AND name LIKE ?)`);
        p.push(`%${search}%`);
        parts.push(`EXISTS (SELECT 1 FROM finance_accounts WHERE id = o.account_to_id AND name LIKE ?)`);
        p.push(`%${search}%`);
      }
      
      where.push(`(${parts.join(' OR ')})`);
      params.push(...p);
    }

    const whereSql = where.join(' AND ');
    const totalRow = db.prepare(`
      SELECT COUNT(*) AS n 
      FROM fin_operations o 
      LEFT JOIN finance_accounts afr ON afr.id = o.account_from_id
      LEFT JOIN finance_accounts ato ON ato.id = o.account_to_id
      WHERE ${whereSql}
    `).get(...params) as { n: number };

    const rows = db.prepare(`
      SELECT
        o.*,
        ec.name  AS category_name,  ec.icon  AS category_icon,  ec.color AS category_color,
        bu.name  AS project_name,
        cp.name  AS counterparty_name,
        afr.name AS account_from_name, afr.color AS account_from_color, afr.currency AS account_from_currency,
        ato.name AS account_to_name,   ato.color AS account_to_color,   ato.currency AS account_to_currency,
        rt.name  AS suggested_recurring_name
      FROM fin_operations o
      LEFT JOIN expense_categories     ec  ON ec.id  = o.category_id
      LEFT JOIN business_units         bu  ON bu.id  = o.project_id
      LEFT JOIN finance_counterparties cp  ON cp.id  = o.counterparty_id
      LEFT JOIN finance_accounts       afr ON afr.id = o.account_from_id
      LEFT JOIN finance_accounts       ato ON ato.id = o.account_to_id
      LEFT JOIN fin_recurring_templates rt ON rt.id  = o.suggested_recurring_id
      WHERE ${whereSql}
      ORDER BY o.paid_at DESC, o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize) as any[];

    const tagMap = getBatchTags(db, rows.map((r: any) => r.id));
    const items = rows.map((r: any) => ({ ...r, tags: tagMap[r.id] || [] }));

    // Running balance per account: for every visible operation, show the
    // account balance AFTER that transaction — like Finmap's "Рахунок/залишок".
    // We query ALL operations per account (not just visible ones) to ensure
    // correctness regardless of pagination, date filters, or op_type filters.
    // Running balance per account — only when result set is manageable
    // (for very large result sets, skip to avoid slow queries)
    if (items.length > 0 && items.length <= 2000) {
    const allAccountIds = new Set<string>();
    for (const item of items) {
      if (item.account_to_id) allAccountIds.add(item.account_to_id);
      if (item.account_from_id) allAccountIds.add(item.account_from_id);
    }

    // Build a set of visible operation IDs for fast lookup
    const visibleIds = new Set(items.map((i: any) => i.id));

    for (const acctId of allAccountIds) {
      const acct = db.prepare(
        'SELECT initial_balance, currency FROM finance_accounts WHERE id = ?'
      ).get(acctId) as any;
      if (!acct) continue;

      // Get ALL operations touching this account, in chronological order.
      // Use the SAME currency-aware amount as the sidebar balance:
      //   CASE WHEN o.currency = fa.currency THEN o.amount ELSE o.amount_company END
      const allOps = db.prepare(`
        SELECT id, account_to_id, account_from_id,
          CASE WHEN currency = ? THEN amount ELSE amount_company END AS effective_amount
        FROM fin_operations
        WHERE (account_to_id = ? OR account_from_id = ?)
          AND status = 'completed'
        ORDER BY paid_at ASC, created_at ASC, id ASC
      `).all(acct.currency, acctId, acctId) as any[];

      // Walk through ALL ops computing cumulative balance
      let running = Number(acct.initial_balance || 0);
      const balanceMap: Record<string, number> = {};
      for (const op of allOps) {
        const amt = Number(op.effective_amount || 0);
        if (op.account_to_id === acctId) running += amt;
        if (op.account_from_id === acctId) running -= amt;
        // Only store for operations that are in the visible result set
        if (visibleIds.has(op.id)) {
          balanceMap[op.id] = +running.toFixed(2);
        }
      }

      // Attach to visible items
      for (const item of items) {
        if (item.account_to_id === acctId && balanceMap[item.id] != null) {
          item.balance_after_to = balanceMap[item.id];
        }
        if (item.account_from_id === acctId && balanceMap[item.id] != null) {
          item.balance_after_from = balanceMap[item.id];
        }
      }
    }
    } // end running balance guard

    return NextResponse.json({ items, total: totalRow.n, page, pageSize });
  } catch (error: any) {
    try { require('fs').appendFileSync('pms-error.log', new Date().toISOString() + ' GET /operations ERROR: ' + error.message + '\n' + error.stack + '\n'); } catch (e) {}
    console.error('GET /api/finance/operations error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function getOperation(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const row = db.prepare(`
      SELECT o.*, rt.name AS suggested_recurring_name
      FROM fin_operations o
      LEFT JOIN fin_recurring_templates rt ON rt.id = o.suggested_recurring_id
      WHERE o.id = ?
    `).get(id);
    if (!row) return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    return NextResponse.json(enrichOperation(db, row));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

interface CreateOperationInput {
  op_type: OpType;
  account_from_id?: string | null;
  account_to_id?: string | null;
  amount: number;
  currency?: string;
  amount_to?: number | null;
  currency_to?: string | null;
  paid_at: string;
  accrued_at?: string;
  period_from?: string | null;
  period_to?: string | null;
  category_id?: string | null;
  project_id?: string | null;
  counterparty_id?: string | null;
  reservation_id?: string | null;
  status?: Status;
  method?: string | null;
  payment_subtype?: string | null;
  comment?: string | null;
  is_planned?: number;
  source?: string;
  source_ref?: string | null;
  tag_ids?: string[];
  /** 1 → admin needs to triage (account resolver fell back). See PR #C. */
  needs_review?: number;
  /** If set, use this rate instead of auto-computing from finance_exchange_rates */
  fx_rate_override?: number;
}

export function autoResolveCategory(
  db: any,
  orgId: string,
  opType: string,
  comment?: string | null,
  source?: string | null,
): string | null {
  if (opType === 'transfer') return null;

  const text = `${comment || ''} ${source || ''}`.toLowerCase();

  // 1. Try active auto-rules
  try {
    const rules = loadActiveRules(db, orgId);
    for (const rule of rules) {
      if (rule.actions.set_category_id && rule.conditions) {
        if (isRuleApplicable(rule, { comment, source, op_type: opType } as any)) {
          return rule.actions.set_category_id;
        }
      }
    }
  } catch {}

  // 2. Keyword matching
  if (text.includes('сауна') || text.includes('sauna')) return 'ec_sauna';
  if (text.includes('ресторан') || text.includes('кухня') || text.includes('їжа')) return 'ec_restaurant';
  if (text.includes('сніданок') || text.includes('сніданки') || text.includes('breakfast')) return 'ec_breakfast';
  if (text.includes('зарплат') || text.includes('аванс') || text.includes('премія') || text.includes('payroll')) return 'ec_payroll';
  if (text.includes('продукт') || text.includes('закупка')) return 'ec_products';
  if (text.includes('розхідник') || text.includes('химия') || text.includes('товары')) return 'ec_consumables';
  if (text.includes('оренда') || text.includes('rent')) return 'ec_rent';
  if (text.includes('стройка') || text.includes('ремонт') || text.includes('строительство')) return 'ec_capex';
  if (text.includes('податк') || text.includes('tax')) return 'ec_taxes';
  if (text.includes('маркетинг') || text.includes('реклама')) return 'ec_marketing';

  if (text.includes('проживання') || text.includes('res ') || text.includes('booking') || text.includes('widget') || text.includes('готівка') || source === 'booking_widget' || source === 'manual') {
    if (opType === 'income') return 'ec_accommodation';
  }

  // 3. Fallbacks by op_type
  if (opType === 'income') {
    const defaultInc = db.prepare("SELECT id FROM expense_categories WHERE organization_id = ? AND op_type = 'income' ORDER BY sort_order ASC LIMIT 1").get(orgId) as { id: string } | undefined;
    return defaultInc?.id || 'ec_accommodation';
  }
  if (opType === 'expense') {
    const defaultExp = db.prepare("SELECT id FROM expense_categories WHERE organization_id = ? AND op_type = 'expense' ORDER BY sort_order ASC LIMIT 1").get(orgId) as { id: string } | undefined;
    return defaultExp?.id || 'ec_other_exp';
  }

  return null;
}

export function createOperationInTx(
  db: any,
  orgId: string,
  input: CreateOperationInput,
  actor?: OperationActor | null,
): string {
  const createdBy = actor?.id || null;
  const { op_type, amount, paid_at } = input;
  if (!(OP_TYPES as readonly string[]).includes(op_type)) {
    throw new Error(`op_type must be one of ${OP_TYPES.join(', ')}`);
  }
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number');
  }
  if (!paid_at || typeof paid_at !== 'string') {
    throw new Error('paid_at is required');
  }

  if (op_type === 'income' && !input.account_to_id) throw new Error('income requires account_to_id');
  if (op_type === 'expense' && !input.account_from_id) throw new Error('expense requires account_from_id');
  if (op_type === 'transfer' && (!input.account_from_id || !input.account_to_id)) {
    throw new Error('transfer requires both account_from_id and account_to_id');
  }
  if (op_type === 'transfer' && input.account_from_id === input.account_to_id) {
    throw new Error('account_from_id and account_to_id must differ');
  }

  const currency = input.currency || 'CZK';
  const accruedAt = input.accrued_at || paid_at;
  const amountCompany = (input.fx_rate_override && input.fx_rate_override > 0)
    ? amount * input.fx_rate_override
    : computeAmountCompany(db, amount, currency, paid_at);
  const fxRate = (input.fx_rate_override && input.fx_rate_override > 0)
    ? input.fx_rate_override
    : (currency === 'CZK' ? null : (amountCompany / amount) || null);

  const status: Status = input.status && (STATUSES as readonly string[]).includes(input.status) ? input.status : 'completed';
  const source = input.source || 'manual';
  const idPrefix = op_type === 'income' ? 'inc' : op_type === 'expense' ? 'exp' : 'txfr';
  const id = `${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const categoryId = op_type === 'transfer' ? null : (input.category_id || autoResolveCategory(db, orgId, op_type, input.comment, source));

  db.prepare(`
    INSERT INTO fin_operations
      (id, organization_id, op_type,
       account_from_id, account_to_id,
       amount, currency, amount_to, currency_to, fx_rate, amount_company,
       paid_at, accrued_at, period_from, period_to,
       category_id, project_id, counterparty_id,
       reservation_id, status, method, payment_subtype,
       comment, is_planned, source, source_ref, created_by,
       needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, orgId, op_type,
    input.account_from_id || null, input.account_to_id || null,
    amount, currency, input.amount_to || null, input.currency_to || null,
    fxRate, amountCompany,
    paid_at, accruedAt, input.period_from || null, input.period_to || null,
    categoryId,
    input.project_id || null,
    input.counterparty_id || null,
    input.reservation_id || null, status, input.method || null, input.payment_subtype || null,
    input.comment || null, input.is_planned ? 1 : 0, source, input.source_ref || null,
    createdBy || null,
    input.needs_review ? 1 : 0,
  );

  if (input.tag_ids && input.tag_ids.length > 0) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO fin_operation_tags (operation_id, tag_id) VALUES (?, ?)');
    for (const tagId of input.tag_ids) insertTag.run(id, tagId);
  }

  if (createdBy) {
    db.prepare('UPDATE fin_operations SET updated_by_user_id = ? WHERE id = ?').run(createdBy, id);
  }
  const afterRow = db.prepare('SELECT * FROM fin_operations WHERE id = ?').get(id);
  writeOperationAudit(db, id, 'create', actor || null, null, afterRow);

  return id;
}

export async function createOperation(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = (await request.json()) as CreateOperationInput;
    const actor = await getOptionalActor();
    const id = createOperationInTx(db, orgId, body, actor);
    const created = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(id);

    if (body.reservation_id) recalcReservationPaymentStatus(db, body.reservation_id);

    return NextResponse.json(enrichOperation(db, created), { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function updateOperation(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const existing = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(id) as any;
    if (!existing) return NextResponse.json({ error: 'Operation not found' }, { status: 404 });

    const body = await request.json();
    const allowed: (keyof CreateOperationInput)[] = [
      'op_type',
      'account_from_id', 'account_to_id', 'amount', 'currency', 'amount_to', 'currency_to',
      'paid_at', 'accrued_at', 'period_from', 'period_to',
      'category_id', 'project_id', 'counterparty_id',
      'reservation_id', 'status', 'method', 'payment_subtype',
      'comment', 'is_planned', 'source', 'source_ref',
    ];

    // op_type changes are allowed (e.g. «Перетворити в переказ» UI flow).
    // Validate so the column doesn't get a bogus value.
    if (body.op_type !== undefined && !(OP_TYPES as readonly string[]).includes(body.op_type)) {
      return NextResponse.json({ error: `op_type must be one of ${OP_TYPES.join(', ')}` }, { status: 400 });
    }

    const fields: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        fields.push(`${k} = ?`);
        const v = body[k];
        params.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v === '' ? null : v));
      }
    }
    if (body.amount !== undefined || body.currency !== undefined || body.paid_at !== undefined || body.fx_rate_override !== undefined) {
      const newAmount = body.amount ?? existing.amount;
      const newCurrency = body.currency ?? existing.currency;
      const newPaid = body.paid_at ?? existing.paid_at;
      const amountCompany = (body.fx_rate_override && body.fx_rate_override > 0)
        ? newAmount * body.fx_rate_override
        : computeAmountCompany(db, newAmount, newCurrency, newPaid);
      fields.push('amount_company = ?');
      params.push(amountCompany);
      if (body.fx_rate_override && body.fx_rate_override > 0) {
        fields.push('fx_rate = ?');
        params.push(body.fx_rate_override);
      } else if (newCurrency !== 'CZK') {
        fields.push('fx_rate = ?');
        params.push(amountCompany / newAmount);
      }
    }
    const actor = await getOptionalActor();
    if (actor) {
      fields.push('updated_by_user_id = ?');
      params.push(actor.id);
    }
    fields.push("updated_at = datetime('now')");

    if (fields.length === 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    params.push(id);
    db.prepare(`UPDATE fin_operations SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    if (Array.isArray(body.tag_ids)) {
      db.prepare('DELETE FROM fin_operation_tags WHERE operation_id = ?').run(id);
      const ins = db.prepare('INSERT OR IGNORE INTO fin_operation_tags (operation_id, tag_id) VALUES (?, ?)');
      for (const tagId of body.tag_ids) ins.run(id, tagId);
    }

    const updated = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(id);
    const resId = (updated as any)?.reservation_id ?? existing.reservation_id;
    if (resId) recalcReservationPaymentStatus(db, resId);

    // Mark 'convert' when op_type changed (e.g. expense → transfer), else
    // a routine 'update' — lets the audit UI render them differently.
    const action: 'update' | 'convert' = body.op_type !== undefined && body.op_type !== existing.op_type ? 'convert' : 'update';
    writeOperationAudit(db, id, action, actor, existing, updated);

    return NextResponse.json(enrichOperation(db, updated));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteOperation(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const existing = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(id) as any;
    if (!existing) return NextResponse.json({ error: 'Operation not found' }, { status: 404 });

    // Capture actor + snapshot the row BEFORE delete so the audit row
    // survives the row being gone (FK-free by design — see W4a).
    const actor = await getOptionalActor();
    writeOperationAudit(db, id, 'delete', actor, existing, null);

    db.prepare('UPDATE bank_transactions SET matched_operation_id = NULL WHERE matched_operation_id = ?').run(id);
    db.prepare('DELETE FROM fin_operations WHERE id = ?').run(id);

    if (existing.reservation_id) recalcReservationPaymentStatus(db, existing.reservation_id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function mergeOperations(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    if (!Array.isArray(body.ids) || body.ids.length !== 2) {
      return NextResponse.json({ error: 'Очікується рівно 2 ідентифікатори' }, { status: 400 });
    }

    const [id1, id2] = body.ids;
    const op1 = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(id1) as any;
    const op2 = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(id2) as any;

    if (!op1 || !op2) {
      return NextResponse.json({ error: 'Операції не знайдено' }, { status: 404 });
    }

    if (op1.op_type === 'transfer' || op2.op_type === 'transfer') {
      return NextResponse.json({ error: "Неможливо об'єднати вже існуюче переміщення" }, { status: 400 });
    }

    // Determine which is expense and which is income
    let expOp, incOp;
    if (op1.op_type === 'expense' && op2.op_type === 'income') {
      expOp = op1; incOp = op2;
    } else if (op1.op_type === 'income' && op2.op_type === 'expense') {
      expOp = op2; incOp = op1;
    } else {
      return NextResponse.json({ error: "Для об'єднання виберіть одну витрату та один дохід" }, { status: 400 });
    }

    const actor = await getOptionalActor();
    
    // We keep the expense operation, turn it into a transfer, and delete the income operation.
    // The amount will be exactly the amount of the expense.
    const updatedExp = {
      ...expOp,
      op_type: 'transfer',
      account_to_id: incOp.account_to_id,
      category_id: null
    };

    db.prepare(`
      UPDATE fin_operations 
      SET op_type = 'transfer', account_to_id = ?, category_id = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(incOp.account_to_id, expOp.id);

    // Audit the conversion
    writeOperationAudit(db, expOp.id, 'convert', actor, expOp, updatedExp);

    // Re-link bank transactions from the deleted income operation to the new transfer operation
    db.prepare('UPDATE bank_transactions SET matched_operation_id = ? WHERE matched_operation_id = ?').run(expOp.id, incOp.id);
    
    // Audit and delete the income operation
    writeOperationAudit(db, incOp.id, 'delete', actor, incOp, null);
    db.prepare('DELETE FROM fin_operations WHERE id = ?').run(incOp.id);

    if (incOp.reservation_id) recalcReservationPaymentStatus(db, incOp.reservation_id);
    if (expOp.reservation_id) recalcReservationPaymentStatus(db, expOp.reservation_id);

    return NextResponse.json({ ok: true, merged_into: expOp.id });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/operations/[id]/audit
 * Returns the full change history for one operation, newest first.
 * Powers the «👤 Хто створив / редагував» hover modal.
 */
export async function getOperationAudit(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const rows = db.prepare(`
      SELECT id, operation_id, action, user_id, user_name,
             before_json, after_json, performed_at
      FROM fin_operation_audit
      WHERE operation_id = ?
      ORDER BY performed_at DESC, id DESC
    `).all(id);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function duplicateOperation(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { id } = await context.params;
    const src = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(id) as any;
    if (!src) return NextResponse.json({ error: 'Operation not found' }, { status: 404 });

    const actor = await getOptionalActor();
    const today = new Date().toISOString().substring(0, 10);
    const newId = createOperationInTx(db, orgId, {
      op_type: src.op_type,
      account_from_id: src.account_from_id,
      account_to_id: src.account_to_id,
      amount: src.amount,
      currency: src.currency,
      paid_at: today,
      accrued_at: today,
      category_id: src.category_id,
      project_id: src.project_id,
      counterparty_id: src.counterparty_id,
      comment: src.comment,
      source: 'manual',
      status: 'completed',
      tag_ids: getTagIds(db, id),
    }, actor);
    const created = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(newId);
    return NextResponse.json(enrichOperation(db, created), { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

/**
 * POST /api/finance/operations/[id]/apply-recurring
 * Body: { confirm: true } applies the suggestion (copies category/project/
 *        counterparty/comment from the linked recurring template, clears
 *        suggested_recurring_id), { confirm: false } just dismisses it.
 */
export async function applyRecurringSuggestion(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const confirm = body.confirm !== false;

    const op = db.prepare(
      "SELECT id, suggested_recurring_id FROM fin_operations WHERE id = ? AND organization_id = ?"
    ).get(id, orgId) as { id: string; suggested_recurring_id: string | null } | undefined;
    if (!op) return NextResponse.json({ error: 'Operation not found' }, { status: 404 });

    if (!op.suggested_recurring_id) {
      return NextResponse.json({ error: 'No recurring suggestion to apply' }, { status: 400 });
    }

    if (!confirm) {
      // Just dismiss
      db.prepare("UPDATE fin_operations SET suggested_recurring_id = NULL WHERE id = ?").run(id);
      return NextResponse.json({ ok: true, action: 'dismissed' });
    }

    const tpl = db.prepare(
      "SELECT category_id, project_id, counterparty_id, comment FROM fin_recurring_templates WHERE id = ?"
    ).get(op.suggested_recurring_id) as any;
    if (!tpl) {
      // Template was deleted — just dismiss
      db.prepare("UPDATE fin_operations SET suggested_recurring_id = NULL WHERE id = ?").run(id);
      return NextResponse.json({ ok: true, action: 'dismissed_orphan' });
    }

    db.prepare(`
      UPDATE fin_operations
      SET category_id     = COALESCE(?, category_id),
          project_id      = COALESCE(?, project_id),
          counterparty_id = COALESCE(?, counterparty_id),
          comment = CASE WHEN comment IS NULL OR comment = '' THEN ? ELSE comment END,
          suggested_recurring_id = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(tpl.category_id, tpl.project_id, tpl.counterparty_id, tpl.comment, id);

    const updated = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(id);
    return NextResponse.json({ ok: true, action: 'applied', operation: enrichOperation(db, updated) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getTagIds(db: any, operationId: string): string[] {
  const rows = db.prepare('SELECT tag_id FROM fin_operation_tags WHERE operation_id = ?').all(operationId) as { tag_id: string }[];
  return rows.map((r) => r.tag_id);
}

// Public helpers reused across modules ───────────────────────────────

export function getReservationPaymentTotals(db: any, reservationId: string): { paid: number; refunded: number } {
  // Sum every real income / refund op for the reservation. The signal-vs-
  // real dedup is no longer needed: signals stopped being created in
  // PR clean-1, legacy ones were deleted in PR clean-2, the column itself
  // is dropped in this PR. PMS check-in for channel-prepaid bookings now
  // relies on reservation.is_prepaid (set by hostex-sync), not on any
  // fin_operation existing here — and recalcReservationPaymentStatus
  // already early-returns for is_prepaid=1.
  const paidRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s FROM fin_operations
    WHERE reservation_id = ? AND op_type = 'income' AND status = 'completed'
  `).get(reservationId) as { s: number };
  const refundRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s FROM fin_operations
    WHERE reservation_id = ? AND op_type = 'expense' AND payment_subtype = 'refund' AND status = 'completed'
  `).get(reservationId) as { s: number };
  return { paid: paidRow.s, refunded: refundRow.s };
}

export function recalcReservationPaymentStatus(db: any, reservationId: string): void {
  const res = db.prepare(
    'SELECT id, total_price, is_prepaid FROM reservations WHERE id = ?',
  ).get(reservationId) as { id: string; total_price: number; is_prepaid: number } | undefined;
  if (!res) return;

  // Channel-prepaid reservations (Booking / Airbnb / VRBO with is_prepaid=1
  // from Hostex) are paid by definition — the platform already collected
  // the money on the guest's behalf. Real cash arrives later as a bank
  // payout but we don't want a partial bank op (e.g. tourist tax cleared
  // separately, or a service add-on) to flip the booking back to
  // 'partial' or 'unpaid'. PMS check-in trusts the platform flag.
  if (res.is_prepaid === 1) return;

  const { paid, refunded } = getReservationPaymentTotals(db, reservationId);
  const net = paid - refunded;
  const total = Number(res.total_price) || 0;
  let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
  if (total > 0 && net >= total - 0.005) paymentStatus = 'paid';
  else if (net > 0) paymentStatus = 'partial';

  // Read old status before update for TG notification editing
  const oldRow = db.prepare('SELECT payment_status FROM reservations WHERE id = ?').get(reservationId) as any;
  const oldPaymentStatus = oldRow?.payment_status || 'unpaid';

  db.prepare('UPDATE reservations SET payment_status = ? WHERE id = ?').run(paymentStatus, reservationId);

  // Emit event if status changed
  if (oldPaymentStatus !== paymentStatus) {
    import('@core/event-bus').then(({ eventBus }) => {
      eventBus.emit('booking.payment_status_changed', {
        bookingId: reservationId,
        oldStatus: oldPaymentStatus,
        newStatus: paymentStatus,
      });
    }).catch(() => {});
  }
}
