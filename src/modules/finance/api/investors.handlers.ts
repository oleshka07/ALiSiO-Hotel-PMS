/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Investor module API handlers (PR #31).
//
// Manages 4 entities: investors, investor_investments,
// property_monthly_metrics, investor_payouts.
//
// Investor portal token: 32-byte hex generated on creation, used for
// public read-only access at /invest/[token]. Token can be regenerated
// (revokes old link).
//
// Payout creation also creates a corresponding fin_operation
// (op_type='expense', source='dividend') so the dividend appears in
// finance reports as a real cash outflow.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import * as crypto from 'crypto';
import { createOperationInTx, getOptionalActor } from './operations.handlers';
import { buildMonthlyDigest, renderDigestText } from '../data/monthly-digest-engine';
import { getTelegramBotInfo, sendTelegramMessage } from '../data/telegram-bot';
import { getAutoRevenueAllProjects, getAutoRevenue, autoFillMonthlyMetrics } from '../data/auto-revenue-engine';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function newToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Returns the id of the "Дивіденди" expense category, creating it on
 * first call. Memoised in DB by lookup, so one row per org.
 */
function getOrCreateDividendCategory(db: any, orgId: string): string {
  const existing = db.prepare(`
    SELECT id FROM expense_categories
    WHERE organization_id = ? AND op_type = 'expense' AND LOWER(name) = LOWER(?)
    LIMIT 1
  `).get(orgId, 'Дивіденди') as { id: string } | undefined;
  if (existing) return existing.id;

  const id = `ec_dividend_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  db.prepare(`
    INSERT INTO expense_categories
      (id, organization_id, name, op_type, classifier, std_group, pnl_line, include_in_pnl, include_in_cash, alloc_method, is_capex, icon, color, sort_order, is_active)
    VALUES (?, ?, ?, 'expense', 'financial', 'FINOP', ?, 1, 1, 'NONE', 0, '💰', '#16a34a', 700, 1)
  `).run(id, orgId, 'Дивіденди', 'Дивіденди');
  return id;
}

// ─── Investors CRUD ──────────────────────────────────────

export async function listInvestors(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const rows = db.prepare(`
      SELECT i.*,
        (SELECT COALESCE(SUM(amount), 0) FROM investor_investments
          WHERE investor_id = i.id AND is_active = 1) AS total_invested,
        (SELECT COALESCE(SUM(amount), 0) FROM investor_payouts
          WHERE investor_id = i.id) AS total_paid_out,
        (SELECT COUNT(*) FROM investor_investments
          WHERE investor_id = i.id AND is_active = 1) AS active_lots
      FROM investors i
      WHERE i.organization_id = ?
      ORDER BY i.created_at DESC
    `).all(orgId);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createInvestor(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const id = `inv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO investors (id, organization_id, name, email, phone, telegram_chat_id, portal_token, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, orgId, body.name, body.email || null, body.phone || null,
      body.telegram_chat_id || null, newToken(), body.status || 'active', body.notes || null,
    );
    const row = db.prepare("SELECT * FROM investors WHERE id = ?").get(id);
    return NextResponse.json(row, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateInvestor(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const fields: string[] = [];
    const params: any[] = [];
    for (const k of ['name', 'email', 'phone', 'telegram_chat_id', 'status', 'notes']) {
      if (body[k] !== undefined) { fields.push(`${k} = ?`); params.push(body[k]); }
    }
    if (body.regenerate_token === true) {
      fields.push('portal_token = ?'); params.push(newToken());
    }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE investors SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare("SELECT * FROM investors WHERE id = ?").get(id);
    return NextResponse.json(row);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteInvestor(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM investors WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Investments CRUD ────────────────────────────────────

export async function listInvestments(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const investorId = sp.get('investor_id');
    const projectId = sp.get('project_id');

    const where: string[] = ['ii.organization_id = ?'];
    const params: any[] = [orgId];
    if (investorId) { where.push('ii.investor_id = ?'); params.push(investorId); }
    if (projectId)  { where.push('ii.project_id = ?');  params.push(projectId);  }

    const rows = db.prepare(`
      SELECT ii.*, i.name AS investor_name, bu.name AS project_name
      FROM investor_investments ii
      JOIN investors i      ON i.id = ii.investor_id
      JOIN business_units bu ON bu.id = ii.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY ii.invested_at DESC
    `).all(...params);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createInvestment(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.investor_id || !body.project_id || !body.amount || !body.invested_at) {
      return NextResponse.json({ error: 'investor_id, project_id, amount, invested_at required' }, { status: 400 });
    }
    const id = `ivst_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO investor_investments
        (id, organization_id, investor_id, project_id, amount, currency, equity_pct,
         invested_at, model_description, is_active, target_apy, target_occupancy, cashback_schedule_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, orgId, body.investor_id, body.project_id,
      body.amount, body.currency || 'EUR', body.equity_pct ?? null,
      body.invested_at, body.model_description || null, body.is_active === false ? 0 : 1,
      body.target_apy ?? null, body.target_occupancy ?? null, body.cashback_schedule_json ?? null,
    );
    return NextResponse.json({ id, ok: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateInvestment(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const fields: string[] = [];
    const params: any[] = [];
    for (const k of ['investor_id', 'project_id', 'amount', 'currency', 'equity_pct', 'invested_at', 'model_description', 'is_active', 'cashback_schedule_json', 'target_apy', 'target_occupancy']) {
      if (body[k] !== undefined) { fields.push(`${k} = ?`); params.push(body[k]); }
    }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    params.push(id);
    db.prepare(`UPDATE investor_investments SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteInvestment(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM investor_investments WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Property monthly metrics CRUD ──────────────────────

export async function listMonthlyMetrics(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const projectId = sp.get('project_id');

    const where: string[] = ['m.organization_id = ?'];
    const params: any[] = [orgId];
    if (projectId) { where.push('m.project_id = ?'); params.push(projectId); }

    const rows = db.prepare(`
      SELECT m.*, bu.name AS project_name
      FROM property_monthly_metrics m
      JOIN business_units bu ON bu.id = m.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.year_month DESC, bu.sort_order
    `).all(...params);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function upsertMonthlyMetric(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.project_id || !body.year_month) {
      return NextResponse.json({ error: 'project_id and year_month required' }, { status: 400 });
    }
    const id = `pmm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO property_monthly_metrics
        (id, organization_id, project_id, year_month, occupancy_pct, revenue, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, year_month) DO UPDATE SET
        occupancy_pct = excluded.occupancy_pct,
        revenue = excluded.revenue,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).run(id, orgId, body.project_id, body.year_month,
           body.occupancy_pct ?? null, body.revenue ?? null, body.notes || null);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteMonthlyMetric(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM property_monthly_metrics WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Investor payouts (dividends) ───────────────────────

export async function listPayouts(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const investorId = sp.get('investor_id');

    const where: string[] = ['p.organization_id = ?'];
    const params: any[] = [orgId];
    if (investorId) { where.push('p.investor_id = ?'); params.push(investorId); }

    const rows = db.prepare(`
      SELECT p.*, i.name AS investor_name, bu.name AS project_name
      FROM investor_payouts p
      JOIN investors i        ON i.id = p.investor_id
      LEFT JOIN business_units bu ON bu.id = p.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.paid_at DESC
    `).all(...params);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/investor-payouts
 * Body: { investor_id, project_id?, amount, currency?, paid_at,
 *         period_year_month?, comment?, account_from_id? }
 *
 * Creates the payout row + a matching fin_operation (op_type='expense',
 * source='dividend') so the cash outflow appears in finance reports.
 */
export async function createPayout(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.investor_id || !body.amount || !body.paid_at) {
      return NextResponse.json({ error: 'investor_id, amount, paid_at required' }, { status: 400 });
    }
    const investor = db.prepare("SELECT name FROM investors WHERE id = ?").get(body.investor_id) as { name: string } | undefined;
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 });

    // Resolve account: explicit if supplied, else the first active CASH
    // account in the matching currency, falling back to bank. Operator
    // wants dividends to flow out of «Готівка EUR» by default — bank
    // accounts (glamping_eur, etc.) hold operating money that shouldn't
    // get drained for distributions. The cash account is allowed to go
    // negative and is reconciled separately.
    const currency = body.currency || 'EUR';
    let accountFromId: string | null = body.account_from_id || null;
    if (!accountFromId) {
      const a = db.prepare(`
        SELECT id FROM finance_accounts
        WHERE organization_id = ? AND currency = ? AND is_active = 1
          AND type IN ('bank', 'cash')
        ORDER BY (type = 'cash') DESC, sort_order ASC
        LIMIT 1
      `).get(orgId, currency) as { id: string } | undefined;
      accountFromId = a?.id || null;
    }
    if (!accountFromId) {
      return NextResponse.json({ error: `No active bank/cash account in ${currency}` }, { status: 400 });
    }

    const payoutId = `payout_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    // Look up (or auto-create) the «Дивіденди» expense category so finance
    // P&L groups all investor payouts under one line.
    const dividendCategoryId = getOrCreateDividendCategory(db, orgId);

    // Create the matching fin_operation
    const actor = await getOptionalActor();
    const operationId = createOperationInTx(db, orgId, {
      op_type: 'expense',
      account_from_id: accountFromId,
      account_to_id: null,
      amount: Math.abs(body.amount),
      currency,
      paid_at: body.paid_at,
      project_id: body.project_id || null,
      category_id: dividendCategoryId,
      comment: body.comment || `Dividend → ${investor.name}` + (body.period_year_month ? ` for ${body.period_year_month}` : ''),
      method: 'bank_transfer',
      source: 'dividend',
      source_ref: payoutId,
      status: 'completed',
    }, actor);

    db.prepare(`
      INSERT INTO investor_payouts
        (id, organization_id, investor_id, project_id, amount, currency,
         paid_at, period_year_month, comment, fin_operation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payoutId, orgId, body.investor_id, body.project_id || null,
           body.amount, currency, body.paid_at, body.period_year_month || null,
           body.comment || null, operationId);

    return NextResponse.json({ id: payoutId, fin_operation_id: operationId, ok: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deletePayout(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    // Also remove the linked fin_operation
    const row = db.prepare("SELECT fin_operation_id FROM investor_payouts WHERE id = ?").get(id) as { fin_operation_id: string | null } | undefined;
    if (row?.fin_operation_id) {
      db.prepare("DELETE FROM fin_operations WHERE id = ?").run(row.fin_operation_id);
    }
    db.prepare("DELETE FROM investor_payouts WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/investor-payouts/preview?investor_id=X&year_month=YYYY-MM
 *
 * Per-property breakdown for the «Виплатити за місяць» modal: revenue
 * from property_monthly_metrics × equity_pct gives the accrued amount,
 * minus any payouts already recorded for the same (investor, project,
 * period) tuple — so the operator sees the remainder and can't
 * accidentally pay twice for the same month.
 */
export async function previewMonthlyPayout(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const investorId = sp.get('investor_id');
    const yearMonth = sp.get('year_month');
    if (!investorId || !yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'investor_id and year_month=YYYY-MM required' }, { status: 400 });
    }

    const investments = db.prepare(`
      SELECT ii.project_id, ii.equity_pct, ii.currency,
             bu.name AS project_name, bu.sort_order
      FROM investor_investments ii
      JOIN business_units bu ON bu.id = ii.project_id
      WHERE ii.organization_id = ?
        AND ii.investor_id = ?
        AND ii.is_active = 1
        AND ii.project_id IS NOT NULL
      ORDER BY bu.sort_order, bu.name
    `).all(orgId, investorId) as Array<{
      project_id: string; equity_pct: number | null; currency: string | null;
      project_name: string; sort_order: number;
    }>;

    const items = investments.map((inv) => {
      const metric = db.prepare(`
        SELECT revenue FROM property_monthly_metrics
        WHERE organization_id = ? AND project_id = ? AND year_month = ?
      `).get(orgId, inv.project_id, yearMonth) as { revenue: number | null } | undefined;
      const revenue = metric?.revenue ?? null;
      const eq = (inv.equity_pct || 0) / 100;
      const accrued = revenue != null ? +(revenue * eq).toFixed(2) : null;

      const paidRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM investor_payouts
        WHERE organization_id = ?
          AND investor_id = ?
          AND project_id = ?
          AND period_year_month = ?
      `).get(orgId, investorId, inv.project_id, yearMonth) as { total: number };
      const alreadyPaid = +paidRow.total.toFixed(2);
      const remainder = accrued != null ? +(accrued - alreadyPaid).toFixed(2) : null;

      return {
        project_id: inv.project_id,
        project_name: inv.project_name,
        equity_pct: inv.equity_pct,
        currency: inv.currency || 'EUR',
        revenue,
        accrued,
        already_paid: alreadyPaid,
        remainder,
      };
    });

    return NextResponse.json({ year_month: yearMonth, items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/investor-payouts/bulk-monthly
 * Body: {
 *   investor_id, year_month, paid_at, currency?, account_from_id?,
 *   items: [{ project_id, amount, comment? }]
 * }
 *
 * Creates one investor_payouts row + one fin_operation per item in a
 * single db.transaction(). All-or-nothing — if any row fails the whole
 * batch rolls back, so the operator never ends up with a partially
 * applied monthly distribution where some properties got paid and
 * others silently didn't.
 */
export async function bulkMonthlyPayout(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    const { investor_id, year_month, paid_at, account_from_id, items } = body;
    const currency = body.currency || 'EUR';

    if (!investor_id || !year_month || !paid_at || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'investor_id, year_month, paid_at, items[] required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(year_month)) {
      return NextResponse.json({ error: 'year_month must be YYYY-MM' }, { status: 400 });
    }
    const investor = db.prepare("SELECT name FROM investors WHERE id = ?").get(investor_id) as { name: string } | undefined;
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 });

    let accountFromId: string | null = account_from_id || null;
    if (!accountFromId) {
      const a = db.prepare(`
        SELECT id FROM finance_accounts
        WHERE organization_id = ? AND currency = ? AND is_active = 1
          AND type IN ('bank', 'cash')
        ORDER BY (type = 'cash') DESC, sort_order ASC
        LIMIT 1
      `).get(orgId, currency) as { id: string } | undefined;
      accountFromId = a?.id || null;
    }
    if (!accountFromId) {
      return NextResponse.json({ error: `No active bank/cash account in ${currency}` }, { status: 400 });
    }
    const dividendCategoryId = getOrCreateDividendCategory(db, orgId);

    type Item = { project_id: string; amount: number; comment?: string | null };
    const validItems = (items as Item[]).filter((i) => i.project_id && +i.amount > 0);
    if (validItems.length === 0) {
      return NextResponse.json({ error: 'No items with positive amount' }, { status: 400 });
    }

    const created: Array<{ id: string; fin_operation_id: string; project_id: string; amount: number }> = [];
    let totalAmount = 0;
    const actor = await getOptionalActor();

    const tx = db.transaction(() => {
      for (const item of validItems) {
        const payoutId = `payout_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const amount = +Math.abs(Number(item.amount)).toFixed(2);
        const operationId = createOperationInTx(db, orgId, {
          op_type: 'expense',
          account_from_id: accountFromId!,
          account_to_id: null,
          amount,
          currency,
          paid_at,
          project_id: item.project_id,
          category_id: dividendCategoryId,
          comment: item.comment || `Dividend → ${investor.name} for ${year_month}`,
          method: 'bank_transfer',
          source: 'dividend',
          source_ref: payoutId,
          status: 'completed',
        }, actor);
        db.prepare(`
          INSERT INTO investor_payouts
            (id, organization_id, investor_id, project_id, amount, currency,
             paid_at, period_year_month, comment, fin_operation_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(payoutId, orgId, investor_id, item.project_id, amount, currency,
               paid_at, year_month, item.comment || null, operationId);
        created.push({ id: payoutId, fin_operation_id: operationId, project_id: item.project_id, amount });
        totalAmount += amount;
      }
    });
    tx();

    return NextResponse.json({
      ok: true,
      created_count: created.length,
      total_amount: +totalAmount.toFixed(2),
      currency,
      payouts: created,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Monthly digest aggregator ──────────────────────────
//
// GET /api/finance/investor-monthly-digest?year_month=YYYY-MM&investor_id=...
// Returns the per-investor month snapshot used by the admin "Monthly digest"
// tab. Optionally renders a plain-text body for one investor when ?text=1
// and ?investor_id= are provided.

export async function getMonthlyDigest(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const yearMonth = sp.get('year_month');
    const investorId = sp.get('investor_id') || undefined;
    const wantText = sp.get('text') === '1';
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'year_month=YYYY-MM required' }, { status: 400 });
    }

    const digest = buildMonthlyDigest(db, orgId, yearMonth, investorId);

    if (wantText && investorId) {
      const target = digest.investors.find((d) => d.investor_id === investorId);
      if (!target) return NextResponse.json({ error: 'Investor has no investments' }, { status: 404 });
      const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
      return NextResponse.json({ text: renderDigestText(target, yearMonth, origin), digest: target });
    }

    return NextResponse.json(digest);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Telegram bot status + send digest ──────────────────

export async function getTelegramStatus(_request: NextRequest): Promise<NextResponse> {
  const info = await getTelegramBotInfo();
  return NextResponse.json(info);
}

/**
 * POST /api/finance/investor-monthly-digest/send-telegram
 * Body: { investor_id, year_month }
 * Sends the rendered digest text via Telegram Bot API to the investor's
 * stored telegram_chat_id. Requires TELEGRAM_BOT_TOKEN env var on server.
 */
export async function sendDigestTelegram(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.investor_id || !body.year_month) {
      return NextResponse.json({ error: 'investor_id and year_month required' }, { status: 400 });
    }
    const investor = db.prepare("SELECT name, telegram_chat_id FROM investors WHERE id = ? AND organization_id = ?")
      .get(body.investor_id, orgId) as { name: string; telegram_chat_id: string | null } | undefined;
    if (!investor) return NextResponse.json({ error: 'Investor not found' }, { status: 404 });
    if (!investor.telegram_chat_id) return NextResponse.json({ error: 'У інвестора не вказано telegram_chat_id' }, { status: 400 });

    const digest = buildMonthlyDigest(db, orgId, body.year_month, body.investor_id);
    const target = digest.investors.find((d) => d.investor_id === body.investor_id);
    if (!target) return NextResponse.json({ error: 'У інвестора немає інвестицій' }, { status: 404 });

    const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const text = renderDigestText(target, body.year_month, origin);
    const result = await sendTelegramMessage(investor.telegram_chat_id, text);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Auto revenue from real reservations ─────
//
// Computes per-project monthly revenue from PMS reservations whose
// guests have already checked out. Used to skip manual metric entry.

export async function getAutoRevenueForMonth(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const yearMonth = sp.get('year_month');
    const projectId = sp.get('project_id');
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'year_month=YYYY-MM required' }, { status: 400 });
    }
    if (projectId) {
      return NextResponse.json({ items: [getAutoRevenue(db, orgId, projectId, yearMonth)] });
    }
    return NextResponse.json({ items: getAutoRevenueAllProjects(db, orgId, yearMonth) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/finance/investor-monthly-metrics/autofill  { year_month, overwrite? }
// Fills property_monthly_metrics from the fin_operations ledger + occupancy
// engine. Manual rows are never overwritten unless overwrite=true.
export async function autoFillMetricsHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json().catch(() => ({}));
    const yearMonth = body?.year_month;
    const overwrite = body?.overwrite === true;
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ error: 'year_month=YYYY-MM required' }, { status: 400 });
    }
    const result = autoFillMonthlyMetrics(db, orgId, yearMonth, overwrite);
    return NextResponse.json({ year_month: yearMonth, overwrite, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Helper: get available projects for investor pickers ─────
// Returns ONLY business_units that are investor properties — either
// registered in investor_property_details (the canonical investor
// property registry) or referenced by an active investor_investment.
// This excludes operational finance categories (Ресторан, Палатки,
// Кемпінг, Сауна …) which live in business_units but are not investor
// objects, so they don't pollute the investor module's project dropdown.

export async function listInvestorProjects(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const rows = db.prepare(`
      SELECT bu.id, bu.name, bu.sort_order, bu.is_active
      FROM business_units bu
      WHERE bu.organization_id = ?
        AND (
          bu.id IN (SELECT project_id FROM investor_property_details)
          OR bu.id IN (SELECT DISTINCT project_id FROM investor_investments
                       WHERE organization_id = ? AND is_active = 1 AND project_id IS NOT NULL)
        )
      ORDER BY bu.is_active DESC, bu.sort_order, bu.name
    `).all(orgId, orgId);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Properties (= business_units + investor_property_details + work_stages) ─────
//
// The admin "Properties" tab needs the joined view of every project that
// either has investor data OR is flagged via investor_property_details.
// Returns work_stages parsed from JSON.

export async function listInvestorProperties(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    // Default: show business_units that have ANY investor footprint —
    // either an active investment OR an explicitly attached
    // investor_property_details row. The latter is what
    // createInvestorProperty inserts, so a freshly-created object appears
    // here immediately even before any investment is attached.
    // Set ?all=1 to see every business_unit (e.g. picking a new one).
    const showAll = request.nextUrl.searchParams.get('all') === '1';
    const where: string[] = ['bu.organization_id = ?'];
    if (!showAll) {
      where.push(`(
        EXISTS (SELECT 1 FROM investor_investments WHERE project_id = bu.id AND is_active = 1)
        OR EXISTS (SELECT 1 FROM investor_property_details WHERE project_id = bu.id)
      )`);
    }
    const rows = db.prepare(`
      SELECT
        bu.id              AS project_id,
        bu.name,
        bu.sort_order,
        bu.is_active,
        d.location,
        d.image_url,
        d.airbnb_url,
        d.ical_url,
        COALESCE(d.status, 'active') AS status,
        ws.stages_json,
        (SELECT COUNT(*) FROM investor_investments WHERE project_id = bu.id AND is_active = 1) AS active_lots,
        (SELECT COALESCE(SUM(amount), 0) FROM investor_investments WHERE project_id = bu.id AND is_active = 1) AS total_invested
      FROM business_units bu
      LEFT JOIN investor_property_details d ON d.project_id = bu.id
      LEFT JOIN property_work_stages ws ON ws.project_id = bu.id
      WHERE ${where.join(' AND ')}
      ORDER BY bu.sort_order, bu.name
    `).all(orgId) as any[];
    const items = rows.map((r) => ({
      ...r,
      work_stages: r.stages_json ? safeJson(r.stages_json) : [],
      stages_json: undefined,
    }));
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return []; }
}

/**
 * POST /api/finance/investor-properties
 * Body: { name, location?, image_url?, airbnb_url?, ical_url?, status? }
 * Creates a new business_unit + investor_property_details row.
 */
export async function createInvestorProperty(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const buId = `bu_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO business_units (id, organization_id, name, sort_order, is_active, is_shared)
        VALUES (?, ?, ?, 500, 1, 0)
      `).run(buId, orgId, body.name);
      db.prepare(`
        INSERT INTO investor_property_details (id, project_id, location, image_url, airbnb_url, ical_url, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(`pd_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`, buId,
             body.location || null, body.image_url || null, body.airbnb_url || null,
             body.ical_url || null, body.status || 'active');
    });
    tx();
    return NextResponse.json({ project_id: buId, ok: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/finance/investor-properties/[id]
 * Body: any subset of { name, location, image_url, airbnb_url, ical_url, status, work_stages }
 * Updates business_unit name + upserts details + optionally upserts work_stages.
 */
export async function updateInvestorProperty(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();

    const tx = db.transaction(() => {
      if (body.name !== undefined) {
        db.prepare("UPDATE business_units SET name = ? WHERE id = ?").run(body.name, id);
      }
      const detailFields = ['location', 'image_url', 'airbnb_url', 'ical_url', 'status'];
      const haveDetailUpdate = detailFields.some((k) => body[k] !== undefined);
      if (haveDetailUpdate) {
        const existing = db.prepare("SELECT id FROM investor_property_details WHERE project_id = ?").get(id) as { id: string } | undefined;
        if (existing) {
          const setParts: string[] = [];
          const params: any[] = [];
          for (const k of detailFields) {
            if (body[k] !== undefined) { setParts.push(`${k} = ?`); params.push(body[k]); }
          }
          setParts.push("updated_at = datetime('now')");
          params.push(id);
          db.prepare(`UPDATE investor_property_details SET ${setParts.join(', ')} WHERE project_id = ?`).run(...params);
        } else {
          db.prepare(`
            INSERT INTO investor_property_details (id, project_id, location, image_url, airbnb_url, ical_url, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(`pd_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`, id,
                 body.location || null, body.image_url || null, body.airbnb_url || null,
                 body.ical_url || null, body.status || 'active');
        }
      }
      if (Array.isArray(body.work_stages)) {
        db.prepare(`
          INSERT INTO property_work_stages (id, project_id, stages_json)
          VALUES (?, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET
            stages_json = excluded.stages_json,
            updated_at = datetime('now')
        `).run(`pws_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`, id, JSON.stringify(body.work_stages));
      }
    });
    tx();
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/finance/investor-properties/[id]
 *
 * Detaches a business_unit from the investor module: removes
 * investor_property_details, property_work_stages, property_monthly_metrics,
 * property_monthly_reports rows that reference it. Leaves the business_unit
 * itself (and its fin_operations / fin_budgets) alone — finance side stays.
 *
 * Refuses (409) if any active investor_investments still reference the BU
 * — admin must remove those first via the audit-page cascade delete.
 */
export async function unlinkInvestorProperty(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;

    const bu = db.prepare("SELECT id, name FROM business_units WHERE id = ?").get(id) as { id: string; name: string } | undefined;
    if (!bu) return NextResponse.json({ error: 'Business unit not found' }, { status: 404 });

    const activeInvCount = (db.prepare(
      "SELECT COUNT(*) AS n FROM investor_investments WHERE project_id = ? AND is_active = 1"
    ).get(id) as { n: number }).n;
    if (activeInvCount > 0) {
      return NextResponse.json(
        { error: `Лишилися активні інвестиції (${activeInvCount}). Спочатку зробіть cascade delete на /finance/investors/audit.` },
        { status: 409 },
      );
    }

    const deleted = { details: 0, work_stages: 0, monthly_metrics: 0, monthly_reports: 0 };
    const tx = db.transaction(() => {
      deleted.details        = db.prepare("DELETE FROM investor_property_details WHERE project_id = ?").run(id).changes;
      deleted.work_stages    = db.prepare("DELETE FROM property_work_stages WHERE project_id = ?").run(id).changes;
      deleted.monthly_metrics = db.prepare("DELETE FROM property_monthly_metrics WHERE project_id = ?").run(id).changes;
      deleted.monthly_reports = db.prepare("DELETE FROM property_monthly_reports WHERE project_id = ?").run(id).changes;
    });
    tx();

    return NextResponse.json({ ok: true, deleted, bu: { id: bu.id, name: bu.name } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Property monthly reports CRUD ──────────────────────

export async function listMonthlyReports(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const projectId = sp.get('project_id');
    const yearMonth = sp.get('year_month');

    const where: string[] = ['r.organization_id = ?'];
    const params: any[] = [orgId];
    if (projectId) { where.push('r.project_id = ?'); params.push(projectId); }
    if (yearMonth) { where.push('r.year_month = ?'); params.push(yearMonth); }

    const rows = db.prepare(`
      SELECT r.*, bu.name AS project_name
      FROM property_monthly_reports r
      JOIN business_units bu ON bu.id = r.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.year_month DESC, bu.sort_order
    `).all(...params);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function upsertMonthlyReport(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.project_id || !body.year_month) {
      return NextResponse.json({ error: 'project_id and year_month required' }, { status: 400 });
    }
    const id = `pmr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const ops = Array.isArray(body.operational_updates) ? body.operational_updates : [];
    db.prepare(`
      INSERT INTO property_monthly_reports
        (id, organization_id, project_id, year_month, adr, general_comment,
         market_insight, operational_updates_json, photo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, year_month) DO UPDATE SET
        adr = excluded.adr,
        general_comment = excluded.general_comment,
        market_insight = excluded.market_insight,
        operational_updates_json = excluded.operational_updates_json,
        photo_url = excluded.photo_url,
        updated_at = datetime('now')
    `).run(id, orgId, body.project_id, body.year_month,
           body.adr ?? null, body.general_comment || null,
           body.market_insight || null, JSON.stringify(ops),
           body.photo_url || null);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteMonthlyReport(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM property_monthly_reports WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
