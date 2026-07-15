/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Auto-revenue engine — derives investor monthly revenue per project.
//
// Single source of truth: reservations.unit_id, mapped via the explicit
// investor_investments.unit_id link (set manually in the Audit page).
//
// No name matching, no fin_channel_receivables join, no reconciled/raw
// distinction. The amount used is the gross reservation price stored in
// the PMS reservation row:
//
//   - When total_rate_eur > 0  → bucket as EUR (Hostex sync stores the
//     original platform amount here for Airbnb/Booking).
//   - Otherwise                → bucket as `currency` (typically CZK for
//     direct PMS bookings).
//
// Zero-amount reservations are skipped entirely (do not count toward the
// reservation count or the totals).
//

export interface AutoRevenuePerSource {
  source: string;       // normalised: 'airbnb' | 'booking_com' | 'vrbo' | 'direct'
  currency: string;     // 'CZK' | 'EUR'
  total: number;
  reservations: number;
}

export interface AutoRevenueResult {
  project_id: string;
  unit_id: string | null;
  unit_name: string | null;
  year_month: string;
  totals_by_currency: Record<string, number>;  // { CZK: 12000, EUR: 1237.77 }
  reservations: number;                        // count of non-zero rows
  by_source: AutoRevenuePerSource[];
  /** ACTUAL money from fin_operations (CZK, accrual/stay-month basis):
   *  completed income minus refunds attributed to this project. This is the
   *  ledger truth; totals_by_currency above is the booking-value hint. */
  actual_money_czk: number;
  // Paid-only occupancy for the month — barter / friends (total = 0) are
  // excluded so they don't inflate the rate the operator pastes into
  // property_monthly_metrics. Null when the project has no linked unit.
  occupancy_pct: number | null;
  sold_nights: number;       // nights slept inside the month, paid bookings only
  available_nights: number;  // days in month × units (1 unit per project)
}

/**
 * ACTUAL revenue for a project-month from the fin_operations ledger (CZK):
 * completed income minus refunds, financing excluded, attributed by
 * accrued_at (stay month for reservation income since the step-4 backfill).
 */
export function getActualRevenueForProject(db: any, projectId: string, yearMonth: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(
      CASE WHEN o.op_type = 'income' AND COALESCE(ec.classifier, '') != 'financing' THEN o.amount_company
           WHEN o.op_type = 'expense' AND COALESCE(o.payment_subtype, '') = 'refund' THEN -o.amount_company
           ELSE 0 END
    ), 0) AS total
    FROM fin_operations o
    LEFT JOIN expense_categories ec ON ec.id = o.category_id
    WHERE o.status = 'completed' AND o.op_type != 'transfer'
      AND o.project_id = ?
      AND strftime('%Y-%m', o.accrued_at) = ?
  `).get(projectId, yearMonth) as { total: number };
  return +(row.total || 0).toFixed(2);
}

/**
 * Auto-fill property_monthly_metrics for a month from the ledger + occupancy
 * engine. Fill-only-empty: rows already entered by the operator are NEVER
 * overwritten (manual override wins); pass overwrite=true to refresh
 * auto-filled values explicitly.
 */
export function autoFillMonthlyMetrics(
  db: any,
  orgId: string,
  yearMonth: string,
  overwrite = false,
): { filled: number; skipped: number; items: Array<{ project_id: string; revenue: number; occupancy_pct: number | null; action: string }> } {
  const results = getAutoRevenueAllProjects(db, orgId, yearMonth);
  let filled = 0, skipped = 0;
  const items: Array<{ project_id: string; revenue: number; occupancy_pct: number | null; action: string }> = [];

  for (const r of results) {
    const existing = db.prepare(
      'SELECT id, revenue FROM property_monthly_metrics WHERE project_id = ? AND year_month = ?'
    ).get(r.project_id, yearMonth) as { id: string; revenue: number | null } | undefined;

    if (existing && !overwrite) {
      skipped++;
      items.push({ project_id: r.project_id, revenue: r.actual_money_czk, occupancy_pct: r.occupancy_pct, action: 'skipped_manual' });
      continue;
    }

    if (existing) {
      db.prepare(`
        UPDATE property_monthly_metrics
        SET revenue = ?, occupancy_pct = COALESCE(?, occupancy_pct),
            notes = COALESCE(notes, 'auto: з операцій'), updated_at = datetime('now')
        WHERE id = ?
      `).run(r.actual_money_czk, r.occupancy_pct, existing.id);
    } else {
      db.prepare(`
        INSERT INTO property_monthly_metrics (organization_id, project_id, year_month, occupancy_pct, revenue, notes)
        VALUES (?, ?, ?, ?, ?, 'auto: з операцій')
      `).run(orgId, r.project_id, yearMonth, r.occupancy_pct, r.actual_money_czk);
    }
    filled++;
    items.push({ project_id: r.project_id, revenue: r.actual_money_czk, occupancy_pct: r.occupancy_pct, action: existing ? 'updated' : 'created' });
  }

  return { filled, skipped, items };
}

/** Normalise reservation source into one of 4 buckets shown in the UI. */
function normaliseSource(source: string | null | undefined): string {
  const s = (source || '').toLowerCase();
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking') || s.includes('bcom')) return 'booking_com';
  if (s.includes('vrbo')) return 'vrbo';
  return 'direct';
}

/**
 * Build project_id → unit map from the explicit investor_investments.unit_id
 * link. No fallback, no name matching: if the admin hasn't linked the project
 * via the Audit page, it doesn't appear on the metrics card.
 */
export function buildProjectToUnitMap(db: any, orgId: string): Map<string, { id: string; name: string }> {
  const rows = db.prepare(`
    SELECT DISTINCT ii.project_id, u.id AS unit_id, u.name AS unit_name
    FROM investor_investments ii
    JOIN units u ON u.id = ii.unit_id
    WHERE ii.organization_id = ?
      AND ii.is_active = 1
      AND ii.project_id IS NOT NULL
      AND ii.unit_id IS NOT NULL
  `).all(orgId) as Array<{ project_id: string; unit_id: string; unit_name: string }>;

  const map = new Map<string, { id: string; name: string }>();
  for (const r of rows) {
    map.set(r.project_id, { id: r.unit_id, name: r.unit_name });
  }
  return map;
}

/**
 * Compute auto revenue for one project_id and month.
 *
 * Reads reservations directly. For each row that's non-cancelled, departed
 * within the target month, and has a non-zero amount:
 *   - If total_rate_eur > 0: count as EUR (Hostex sync original amount).
 *   - Else:                  count as `currency` (CZK by default).
 */
export function getAutoRevenue(
  db: any,
  orgId: string,
  projectId: string,
  yearMonth: string,
): AutoRevenueResult {
  const map = buildProjectToUnitMap(db, orgId);
  const unit = map.get(projectId);
  const result: AutoRevenueResult = {
    project_id: projectId,
    unit_id: unit?.id || null,
    unit_name: unit?.name || null,
    year_month: yearMonth,
    totals_by_currency: {},
    reservations: 0,
    by_source: [],
    actual_money_czk: getActualRevenueForProject(db, projectId, yearMonth),
    occupancy_pct: null,
    sold_nights: 0,
    available_nights: 0,
  };
  if (!unit) return result;

  const today = new Date().toISOString().substring(0, 10);

  const rows = db.prepare(`
    SELECT id, source, total_price, currency, total_rate_eur
    FROM reservations
    WHERE unit_id = ?
      AND check_out <= ?
      AND substr(check_out, 1, 7) = ?
      AND status NOT IN ('cancelled', 'no_show', 'draft')
  `).all(unit.id, today, yearMonth) as Array<{
    id: string;
    source: string | null;
    total_price: number | null;
    currency: string | null;
    total_rate_eur: number | null;
  }>;

  const bySource = new Map<string, { source: string; currency: string; total: number; n: number }>();

  for (const r of rows) {
    const useEur = r.total_rate_eur != null && r.total_rate_eur > 0;
    const amount = useEur ? (r.total_rate_eur as number) : (r.total_price || 0);

    // Skip zero-amount reservations entirely (do not count, do not sum).
    if (amount <= 0) continue;

    const currency = useEur ? 'EUR' : (r.currency || 'CZK');
    const source = normaliseSource(r.source);

    result.totals_by_currency[currency] = (result.totals_by_currency[currency] || 0) + amount;
    result.reservations += 1;

    const key = `${source}|${currency}`;
    const cell = bySource.get(key) || { source, currency, total: 0, n: 0 };
    cell.total += amount;
    cell.n += 1;
    bySource.set(key, cell);
  }

  result.by_source = [...bySource.values()]
    .map((c) => ({ source: c.source, currency: c.currency, total: +c.total.toFixed(2), reservations: c.n }))
    .sort((a, b) => b.total - a.total);

  for (const k of Object.keys(result.totals_by_currency)) {
    result.totals_by_currency[k] = +result.totals_by_currency[k].toFixed(2);
  }

  // ─── Occupancy ─────────────────────────────────────────────
  // Count nights actually slept inside the target month, but only
  // for paid bookings. Barter / friend stays (amount = 0) are
  // intentionally excluded — they're real nights but would skew
  // the occupancy rate the operator copies into property_monthly_metrics
  // as if rooms were sold at market rate.
  const [yStr, mStr] = yearMonth.split('-');
  const yearNum = parseInt(yStr, 10);
  const monthNum = parseInt(mStr, 10);
  const lastDay = new Date(Date.UTC(yearNum, monthNum, 0)).getUTCDate();
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  const occRows = db.prepare(`
    SELECT check_in, check_out, total_price, total_rate_eur
    FROM reservations
    WHERE unit_id = ?
      AND status NOT IN ('cancelled', 'no_show', 'draft')
      AND check_in <= ?
      AND check_out > ?
  `).all(unit.id, monthEnd, monthStart) as Array<{
    check_in: string;
    check_out: string;
    total_price: number | null;
    total_rate_eur: number | null;
  }>;

  let soldNights = 0;
  for (const r of occRows) {
    const useEur = r.total_rate_eur != null && r.total_rate_eur > 0;
    const amount = useEur ? (r.total_rate_eur as number) : (r.total_price || 0);
    if (amount <= 0) continue;
    const ci = r.check_in > monthStart ? r.check_in : monthStart;
    const co = r.check_out < monthEnd ? r.check_out : monthEnd;
    const nights = Math.max(0, (new Date(co).getTime() - new Date(ci).getTime()) / (1000 * 60 * 60 * 24));
    soldNights += nights;
  }
  result.sold_nights = +soldNights.toFixed(1);
  result.available_nights = lastDay;
  result.occupancy_pct = lastDay > 0 ? +((soldNights / lastDay) * 100).toFixed(1) : null;

  return result;
}

/** Bulk version — auto-revenue for every linked project, for the chosen month. */
export function getAutoRevenueAllProjects(
  db: any,
  orgId: string,
  yearMonth: string,
): AutoRevenueResult[] {
  const projectIds = db.prepare(`
    SELECT DISTINCT project_id
    FROM investor_investments
    WHERE organization_id = ?
      AND is_active = 1
      AND project_id IS NOT NULL
      AND unit_id IS NOT NULL
  `).all(orgId) as Array<{ project_id: string }>;

  return projectIds.map((p) => getAutoRevenue(db, orgId, p.project_id, yearMonth));
}

// ─── Source breakdown for public investor portal ─────────────────

export interface InvestorSourceBreakdown {
  source: string;       // normalised: airbnb / booking_com / vrbo / direct
  currency: string;     // CZK / EUR
  total_share: number;  // investor's share = equity_pct × gross
  reservations: number;
}

/**
 * Per-investor income breakdown by channel source, applying the investor's
 * equity_pct to each reservation amount. Same simple logic as getAutoRevenue.
 */
export function getInvestorIncomeBySource(
  db: any,
  investorId: string,
  fromMonth?: string,
  toMonth?: string,
): InvestorSourceBreakdown[] {
  const investments = db.prepare(`
    SELECT ii.project_id, ii.equity_pct, ii.invested_at
    FROM investor_investments ii
    WHERE ii.investor_id = ?
      AND ii.is_active = 1
      AND ii.project_id IS NOT NULL
      AND ii.unit_id IS NOT NULL
  `).all(investorId) as Array<{ project_id: string; equity_pct: number | null; invested_at: string }>;
  if (investments.length === 0) return [];

  const investorRow = db.prepare(
    'SELECT organization_id FROM investors WHERE id = ?',
  ).get(investorId) as { organization_id: string } | undefined;
  if (!investorRow) return [];

  const map = buildProjectToUnitMap(db, investorRow.organization_id);
  const today = new Date().toISOString().substring(0, 10);

  const bySource = new Map<string, { source: string; currency: string; total: number; n: number }>();

  for (const inv of investments) {
    const unit = map.get(inv.project_id);
    if (!unit) continue;
    const eq = (inv.equity_pct || 0) / 100;

    const where: string[] = [
      'unit_id = ?',
      'check_out <= ?',
      'check_out >= ?',
      "status NOT IN ('cancelled', 'no_show', 'draft')",
    ];
    const params: any[] = [unit.id, today, inv.invested_at];
    if (fromMonth) { where.push("substr(check_out, 1, 7) >= ?"); params.push(fromMonth); }
    if (toMonth)   { where.push("substr(check_out, 1, 7) <= ?"); params.push(toMonth); }

    const rows = db.prepare(`
      SELECT source, total_price, currency, total_rate_eur
      FROM reservations
      WHERE ${where.join(' AND ')}
    `).all(...params) as Array<{
      source: string | null;
      total_price: number | null;
      currency: string | null;
      total_rate_eur: number | null;
    }>;

    for (const r of rows) {
      const useEur = r.total_rate_eur != null && r.total_rate_eur > 0;
      const amount = useEur ? (r.total_rate_eur as number) : (r.total_price || 0);
      if (amount <= 0) continue;

      const currency = useEur ? 'EUR' : (r.currency || 'CZK');
      const source = normaliseSource(r.source);
      const share = amount * eq;

      const key = `${source}|${currency}`;
      const cell = bySource.get(key) || { source, currency, total: 0, n: 0 };
      cell.total += share;
      cell.n += 1;
      bySource.set(key, cell);
    }
  }

  return [...bySource.values()]
    .map((c) => ({ source: c.source, currency: c.currency, total_share: +c.total.toFixed(2), reservations: c.n }))
    .sort((a, b) => b.total_share - a.total_share);
}
