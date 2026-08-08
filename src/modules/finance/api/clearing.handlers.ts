/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { getClearingBalance, backfillReceivables } from '../data/clearing-engine';
import { publicMessage } from '@core/security/public-error';

function orgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

/**
 * Look up the most recent FX rate for currency → CZK from
 * finance_exchange_rates. Falls back to null if no rate is recorded
 * (caller should display source currency only in that case).
 */
function getRateToCzk(db: any, orgId: string, fromCurrency: string): number | null {
  if (fromCurrency === 'CZK') return 1;
  const row = db.prepare(`
    SELECT rate FROM finance_exchange_rates
    WHERE organization_id = ? AND from_currency = ? AND to_currency = 'CZK'
    ORDER BY effective_from DESC LIMIT 1
  `).get(orgId, fromCurrency) as { rate: number } | undefined;
  return row?.rate ?? null;
}

/**
 * GET /api/finance/clearing
 * Returns all clearing accounts with computed balances + receivable counts.
 * Also returns CZK equivalents per account using the latest FX rate.
 */
export async function listClearingAccounts(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const accounts = db.prepare(`
      SELECT id, name, currency, color, sort_order
      FROM finance_accounts
      WHERE organization_id = ? AND type = 'clearing' AND is_active = 1
      ORDER BY sort_order, name
    `).all(org) as any[];

    const enriched = accounts.map((a) => {
      const bal = getClearingBalance(db, a.id);
      const rate = getRateToCzk(db, org, a.currency);
      const outstanding_czk = rate != null ? +(bal.outstanding * rate).toFixed(2) : null;
      const paid_total_czk = rate != null ? +(bal.paid_total * rate).toFixed(2) : null;
      return { ...a, ...bal, fx_rate_to_czk: rate, outstanding_czk, paid_total_czk };
    });

    const totals = enriched.reduce(
      (acc, a) => {
        acc.outstanding[a.currency] = (acc.outstanding[a.currency] || 0) + a.outstanding;
        acc.paid_total[a.currency] = (acc.paid_total[a.currency] || 0) + a.paid_total;
        if (a.outstanding_czk != null) acc.outstanding_czk_sum += a.outstanding_czk;
        if (a.paid_total_czk != null) acc.paid_total_czk_sum += a.paid_total_czk;
        acc.receivable_count += a.receivable_count;
        return acc;
      },
      {
        outstanding: {} as Record<string, number>,
        paid_total: {} as Record<string, number>,
        outstanding_czk_sum: 0,
        paid_total_czk_sum: 0,
        receivable_count: 0,
      },
    );

    return NextResponse.json({ accounts: enriched, totals });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/finance/clearing/receivables
 *   ?clearing_account_id, ?status (expected|in_statement|paid|cancelled),
 *   ?from, ?to (filter by check_in date), ?search (guest name / external id)
 */
export async function listReceivables(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const sp = request.nextUrl.searchParams;
    const accountId = sp.get('clearing_account_id');
    const status = sp.get('status');
    const from = sp.get('from');
    const to = sp.get('to');
    const search = sp.get('search');
    const limit = Math.min(500, parseInt(sp.get('limit') || '100', 10));

    const where: string[] = ['rcv.organization_id = ?'];
    const params: any[] = [org];
    if (accountId) { where.push('rcv.clearing_account_id = ?'); params.push(accountId); }
    if (status) { where.push('rcv.status = ?'); params.push(status); }
    // PR #21: 'orphan' is a synthetic filter — receivable exists but no PMS reservation
    const orphanFilter = sp.get('orphan');
    if (orphanFilter === '1') where.push('rcv.reservation_id IS NULL');
    if (orphanFilter === '0') where.push('rcv.reservation_id IS NOT NULL');
    if (from) { where.push('rcv.check_in >= ?'); params.push(from); }
    if (to) { where.push('rcv.check_in <= ?'); params.push(to); }
    if (search) {
      where.push('(g.first_name LIKE ? OR g.last_name LIKE ? OR rcv.external_reservation_id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // LEFT JOIN reservations so orphan receivables (reservation_id NULL) appear too
    const rows = db.prepare(`
      SELECT
        rcv.*,
        fa.name AS clearing_account_name, fa.color AS clearing_account_color,
        r.guest_id, r.total_price AS reservation_total_czk,
        r.total_rate_eur AS reservation_total_eur,
        r.commission_eur AS reservation_commission_eur,
        r.net_rate_eur AS reservation_net_eur,
        r.payment_status,
        g.first_name, g.last_name,
        u.name AS unit_name,
        CASE WHEN rcv.reservation_id IS NULL THEN 1 ELSE 0 END AS is_orphan
      FROM fin_channel_receivables rcv
      JOIN finance_accounts fa     ON fa.id = rcv.clearing_account_id
      LEFT JOIN reservations r     ON r.id = rcv.reservation_id
      LEFT JOIN guests g           ON g.id = r.guest_id
      LEFT JOIN units u            ON u.id = r.unit_id
      WHERE ${where.join(' AND ')}
      ORDER BY rcv.check_in DESC
      LIMIT ${limit}
    `).all(...params) as any[];

    // Pre-compute FX rates per currency present in result set
    const currencies = new Set<string>(rows.map((r) => r.currency));
    const rates: Record<string, number | null> = {};
    for (const cur of currencies) rates[cur] = getRateToCzk(db, org, cur);

    const items = rows.map((r) => {
      const rate = rates[r.currency];
      const expected_net_czk = rate != null ? +(r.expected_net * rate).toFixed(2) : null;

      // Δ EUR — the real reconciliation diff: Hostex's stored gross vs the
      // statement's reported gross. Both in source currency (EUR for most),
      // so no FX involved. Non-null only when statement was uploaded.
      const gross_diff_source_currency = r.actual_gross != null
        ? +(r.actual_gross - r.gross_amount).toFixed(2)
        : null;

      // Δ CZK — informational only. Reservation total stored at sync time
      // converted at THAT day's rate; statement gross converted at TODAY's
      // rate. Differences here are FX volatility, not data errors.
      const reservation_vs_receivable_diff_czk = (rate != null && r.reservation_total_czk)
        ? +(r.reservation_total_czk - (r.gross_amount * rate)).toFixed(2)
        : null;

      return {
        ...r,
        guest_name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || '—',
        fx_rate_to_czk: rate,
        expected_net_czk,
        gross_diff_source_currency,
        reservation_vs_receivable_diff_czk,
      };
    });

    return NextResponse.json({ items, count: items.length });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/finance/clearing/backfill
 * Manual trigger of backfill. Useful when reservations were imported before
 * PR #15 went live, or after editing channel mappings.
 */
export async function backfillReceivablesHandler(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const count = backfillReceivables(db, org);
    return NextResponse.json({ ok: true, count });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
