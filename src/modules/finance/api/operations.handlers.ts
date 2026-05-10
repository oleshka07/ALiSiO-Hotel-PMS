/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

const OP_TYPES = ['income', 'expense', 'transfer'] as const;
type OpType = typeof OP_TYPES[number];

const STATUSES = ['completed', 'pending', 'failed', 'refunded'] as const;
type Status = typeof STATUSES[number];

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

function enrichOperation(db: any, row: any): any {
  if (!row) return row;
  return { ...row, tags: getTagsFor(db, row.id) };
}

export async function listOperations(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const opType = sp.get('op_type');
    const from = sp.get('from');
    const to = sp.get('to');
    const accountId = sp.get('account_id');
    const categoryId = sp.get('category_id');
    const projectId = sp.get('project_id');
    const counterpartyId = sp.get('counterparty_id');
    const tagId = sp.get('tag_id');
    const status = sp.get('status');
    const search = sp.get('search');
    const reservationId = sp.get('reservation_id');
    const source = sp.get('source');
    // method filter — supports CSV: ?method=card,bank_transfer for hunting
    // legacy «PMS marker» operations that were created before
    // POST /api/payments started skipping fin_op for non-cash methods.
    const methodCsv = sp.get('method');
    // needs_review=1 → only ops the resolver flagged for admin triage.
    const needsReviewOnly = sp.get('needs_review') === '1';
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(sp.get('pageSize') || '50', 10)));

    const where: string[] = ['o.organization_id = ?'];
    const params: any[] = [orgId];
    if (needsReviewOnly) where.push('o.needs_review = 1');
    if (opType && (OP_TYPES as readonly string[]).includes(opType)) { where.push('o.op_type = ?'); params.push(opType); }
    if (from) { where.push('o.paid_at >= ?'); params.push(from); }
    if (to) { where.push('o.paid_at <= ?'); params.push(to); }
    if (accountId) { where.push('(o.account_from_id = ? OR o.account_to_id = ?)'); params.push(accountId, accountId); }
    if (categoryId) { where.push('o.category_id = ?'); params.push(categoryId); }
    if (projectId) { where.push('o.project_id = ?'); params.push(projectId); }
    if (counterpartyId) { where.push('o.counterparty_id = ?'); params.push(counterpartyId); }
    if (status && (STATUSES as readonly string[]).includes(status)) { where.push('o.status = ?'); params.push(status); }
    if (reservationId) { where.push('o.reservation_id = ?'); params.push(reservationId); }
    if (source) { where.push('o.source = ?'); params.push(source); }
    if (methodCsv) {
      const methods = methodCsv.split(',').map((s) => s.trim()).filter(Boolean);
      if (methods.length > 0) {
        where.push(`o.method IN (${methods.map(() => '?').join(',')})`);
        params.push(...methods);
      }
    }
    if (tagId) {
      where.push('o.id IN (SELECT operation_id FROM fin_operation_tags WHERE tag_id = ?)');
      params.push(tagId);
    }
    if (search) {
      where.push('(o.comment LIKE ? OR o.source_ref LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSql = where.join(' AND ');
    const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM fin_operations o WHERE ${whereSql}`).get(...params) as { n: number };

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
      ORDER BY o.paid_at DESC, o.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize) as any[];

    const items = rows.map((r) => enrichOperation(db, r));
    return NextResponse.json({ items, total: totalRow.n, page, pageSize });
  } catch (error: any) {
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
}

export function createOperationInTx(db: any, orgId: string, input: CreateOperationInput, createdBy?: string | null): string {
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
  const amountCompany = computeAmountCompany(db, amount, currency, paid_at);
  const status: Status = input.status && (STATUSES as readonly string[]).includes(input.status) ? input.status : 'completed';
  const source = input.source || 'manual';
  const idPrefix = op_type === 'income' ? 'inc' : op_type === 'expense' ? 'exp' : 'txfr';
  const id = `${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

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
    input.amount_to && amount ? (input.amount_to / amount) : null, amountCompany,
    paid_at, accruedAt, input.period_from || null, input.period_to || null,
    op_type === 'transfer' ? null : (input.category_id || null),
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

  return id;
}

export async function createOperation(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = (await request.json()) as CreateOperationInput;
    const id = createOperationInTx(db, orgId, body);
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
      'account_from_id', 'account_to_id', 'amount', 'currency', 'amount_to', 'currency_to',
      'paid_at', 'accrued_at', 'period_from', 'period_to',
      'category_id', 'project_id', 'counterparty_id',
      'reservation_id', 'status', 'method', 'payment_subtype',
      'comment', 'is_planned', 'source', 'source_ref',
    ];

    const fields: string[] = [];
    const params: any[] = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        fields.push(`${k} = ?`);
        const v = body[k];
        params.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v === '' ? null : v));
      }
    }
    if (body.amount !== undefined || body.currency !== undefined || body.paid_at !== undefined) {
      const newAmount = body.amount ?? existing.amount;
      const newCurrency = body.currency ?? existing.currency;
      const newPaid = body.paid_at ?? existing.paid_at;
      fields.push('amount_company = ?');
      params.push(computeAmountCompany(db, newAmount, newCurrency, newPaid));
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

    db.prepare('UPDATE bank_transactions SET matched_operation_id = NULL WHERE matched_operation_id = ?').run(id);
    db.prepare('DELETE FROM fin_operations WHERE id = ?').run(id);

    if (existing.reservation_id) recalcReservationPaymentStatus(db, existing.reservation_id);
    return NextResponse.json({ ok: true, deleted_id: id });
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
    });
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
  db.prepare('UPDATE reservations SET payment_status = ? WHERE id = ?').run(paymentStatus, reservationId);
}
