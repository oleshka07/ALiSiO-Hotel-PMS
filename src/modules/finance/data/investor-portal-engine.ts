/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Investor portal calculation engine.
//
// Reads investor + investments + property metrics + payouts + work_stages
// + monthly_reports for one investor (resolved by portal_token) and
// computes the dashboard view:
//   - Per-property: invested, equity %, monthly profit (revenue × equity%),
//     accumulated profit, total paid out, pending balance, ROI %, status
//   - Portfolio totals: invested, paid out, pending, weighted avg
//     occupancy, weighted ROI, payback years
//   - Time series: capital growth (cumulative profit), occupancy by month
//
// Adapted from investflow-dashboard's calculateInvestorFinancials but
// driven by our SQLite schema (PR #31).
//

import { getInvestorIncomeBySource, type InvestorSourceBreakdown } from './auto-revenue-engine';
import { computeAggregatePortfolioCashback, computeCashbackStatus, type CashbackStatus } from './cashback-calculator';
import { getPerformanceScoresForInvestor, type PerformanceScoreResult } from './performance-score';

export interface InvestorPortalData {
  investor: {
    id: string;
    name: string;
    email: string | null;
    status: string;
  };
  totals: {
    invested: number;
    paid_out: number;
    pending: number;
    accumulated_profit: number;
    monthly_profit: number;
    annualised_yield_pct: number | null;
    payback_years: number | null;
    avg_occupancy_pct: number | null;
    active_lots: number;
    currency: string;
  };
  properties: Array<{
    project_id: string;
    project_name: string;
    invested: number;
    equity_pct: number | null;
    currency: string;
    invested_at: string;
    status: string;                 // active | in_progress | paused | (derived)
    monthly_profit: number;
    accumulated_profit: number;
    paid_out: number;
    pending: number;
    roi_pct: number | null;
    payback_years: number | null;
    last_metric_month: string | null;
    last_metric_occupancy: number | null;
    last_metric_revenue: number | null;
    work_stages: Array<{ name: string; pct: number }>;
    airbnb_url?: string | null;
  }>;
  capital_growth: Array<{ month: string; invested: number; profit_cumulative: number }>;
  occupancy_dynamics: Array<{ month: string; occupancy_pct: number }>;
  income_by_source: InvestorSourceBreakdown[];
  monthly_reports: Array<{
    project_id: string;
    project_name: string;
    year_month: string;
    adr: number | null;
    general_comment: string | null;
    market_insight: string | null;
    photo_url: string | null;
  }>;
  payouts: Array<{
    id: string;
    paid_at: string;
    amount: number;
    currency: string;
    project_id: string | null;
    project_name: string | null;
    period_year_month: string | null;
    comment: string | null;
  }>;
  // ─── Investor Portal v2 ──────────────────────────────────
  cashback_status: CashbackStatus;
  per_investment_cashback: Array<{ investment_id: string; project_id: string; status: CashbackStatus }>;
  performance_scores: Record<string, PerformanceScoreResult>; // keyed by project_id (= business_unit_id)
  ceo_note: {
    scope: 'portfolio' | 'asset';
    scope_id: string;
    month: string;
    ceo_name: string | null;
    body_md: string | null;
    updated_at: string;
  } | null;
  asset_notes: Record<string, { month: string; ceo_name: string | null; body_md: string | null }>;
  documents: Array<{
    id: string;
    type: 'agreement' | 'monthly_report' | 'tax_statement' | 'bank_statement' | 'other';
    name: string;
    file_size: number;
    mime_type: string | null;
    period_start: string | null;
    period_end: string | null;
    uploaded_at: string;
    business_unit_id: string | null;
    download_url: string;
  }>;
  scenarios: Record<string, Array<{
    scenario: 'pessimistic' | 'base' | 'optimistic';
    assumptions_json: string | null;
    monthly_cashback_projection_json: string | null;
    full_repayment_eta: string | null;
  }>>;
  pulse: {
    locked_in_nights_this_month: number;
    nights_in_month: number;
    total_available_nights_this_month: number; // nights × number of investor's units
    pipeline_inquiries_count: number;     // status='tentative' next 14 days
    expected_inflow_next_30_days_eur: number;   // INVESTOR'S share, converted to EUR
    expected_inflow_by_currency: Array<{ currency: string; amount: number }>; // investor's share per currency
    fx_rate_warning: string | null;       // populated if any rate is missing
  };
  ops_metrics: Record<string, {           // keyed by project_id (BU id)
    occupancy_now_pct: number | null;     // current month
    occupancy_prev_pct: number | null;    // previous month
    adr_now: number | null;
    adr_prev: number | null;
    revpar_now: number | null;
    revpar_prev: number | null;
    currency: string;
  }>;
  // Last 12 months of computed occupancy (from reservations), portfolio-aggregate
  occupancy_by_month: Array<{ month: string; occupancy_pct: number }>;
  // Last 12 months of computed occupancy per BU (asset detail page)
  occupancy_by_month_per_asset: Record<string, Array<{ month: string; occupancy_pct: number }>>;
}

function deriveStatus(stages: Array<{ pct: number }>): string {
  if (stages.length === 0) return 'active';
  const totalPct = stages.reduce((s, x) => s + (x.pct || 0), 0) / stages.length;
  if (totalPct >= 99) return 'active';
  if (totalPct > 0) return 'in_progress';
  return 'project';
}

export function buildPortalData(db: any, token: string): InvestorPortalData | null {
  const investor = db.prepare(
    "SELECT id, name, email, status FROM investors WHERE portal_token = ? AND status = 'active' LIMIT 1"
  ).get(token) as any;
  if (!investor) return null;

  // All active investments
  const investments = db.prepare(`
    SELECT ii.*, bu.name AS project_name
    FROM investor_investments ii
    JOIN business_units bu ON bu.id = ii.project_id
    WHERE ii.investor_id = ? AND ii.is_active = 1
    ORDER BY ii.invested_at
  `).all(investor.id) as any[];

  // All payouts (across all properties), with project_name for UI
  const payouts = db.prepare(`
    SELECT p.*, bu.name AS project_name
    FROM investor_payouts p
    LEFT JOIN business_units bu ON bu.id = p.project_id
    WHERE p.investor_id = ?
    ORDER BY p.paid_at DESC
  `).all(investor.id) as any[];

  // Pre-load monthly metrics for all relevant projects.
  // ONLY manual `property_monthly_metrics` — no auto-revenue fallback. If
  // admin has not entered a metric for a month, that month does not count.
  const projectIds = [...new Set(investments.map((i) => i.project_id))];
  let metricsRows: any[] = [];
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => '?').join(',');
    metricsRows = db.prepare(`
      SELECT project_id, year_month, occupancy_pct, revenue
      FROM property_monthly_metrics
      WHERE project_id IN (${placeholders})
      ORDER BY year_month
    `).all(...projectIds) as any[];
  }
  const metricsByProject = new Map<string, any[]>();
  for (const m of metricsRows) {
    if (!metricsByProject.has(m.project_id)) metricsByProject.set(m.project_id, []);
    metricsByProject.get(m.project_id)!.push(m);
  }

  // Pre-load work_stages
  let stagesRows: any[] = [];
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => '?').join(',');
    stagesRows = db.prepare(
      `SELECT project_id, stages_json FROM property_work_stages WHERE project_id IN (${placeholders})`
    ).all(...projectIds) as any[];
  }
  const stagesByProject = new Map<string, any[]>();
  for (const s of stagesRows) {
    try {
      const parsed = JSON.parse(s.stages_json);
      stagesByProject.set(s.project_id, Array.isArray(parsed) ? parsed : []);
    } catch { /* ignore */ }
  }

  // Pre-load monthly reports
  let reportsRows: any[] = [];
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => '?').join(',');
    reportsRows = db.prepare(`
      SELECT pr.*, bu.name AS project_name
      FROM property_monthly_reports pr
      JOIN business_units bu ON bu.id = pr.project_id
      WHERE pr.project_id IN (${placeholders})
      ORDER BY pr.year_month DESC
      LIMIT 30
    `).all(...projectIds) as any[];
  }

  // Pre-load investor-facing property details (airbnb_url + status overrides
  // the work-stage-derived status when admin set it explicitly)
  const detailsByProject = new Map<string, { airbnb_url: string | null; status: string | null; image_url: string | null; location: string | null }>();
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => '?').join(',');
    const detRows = db.prepare(`
      SELECT project_id, airbnb_url, status, image_url, location
      FROM investor_property_details WHERE project_id IN (${placeholders})
    `).all(...projectIds) as any[];
    for (const d of detRows) detailsByProject.set(d.project_id, d);
  }

  // Per-property calculations
  const propertyOut: InvestorPortalData['properties'] = [];
  const allMonthsSet = new Set<string>();
  let totalInvested = 0;
  let totalAccumulatedProfit = 0;
  let totalMonthlyProfit = 0;
  let totalPaidOut = 0;
  let weightedOccupancyNum = 0;
  let weightedOccupancyDen = 0;
  const portfolioCurrency = investments[0]?.currency || 'EUR';

  for (const inv of investments) {
    const eq = (inv.equity_pct || 0) / 100;
    const metrics = (metricsByProject.get(inv.project_id) || []).filter((m) => m.year_month >= inv.invested_at.substring(0, 7));
    const stages = (stagesByProject.get(inv.project_id) || []).map((s: any) => ({ name: s.name || '?', pct: Number(s.percentage ?? s.pct) || 0 }));

    let accProfit = 0;
    let lastRev = 0;
    let lastOccupancy = 0;
    let lastMonth = '';
    let occSum = 0, occCount = 0;
    let metricMonthsCount = 0;        // months with a manual metric (any revenue, including 0)
    for (const m of metrics) {
      allMonthsSet.add(m.year_month);
      accProfit += (m.revenue || 0) * eq;
      lastRev = m.revenue || 0;
      lastOccupancy = m.occupancy_pct || 0;
      lastMonth = m.year_month;
      metricMonthsCount += 1;
      if (m.occupancy_pct != null) { occSum += m.occupancy_pct; occCount++; }
    }

    // Average monthly profit across the metric period — used for ROI,
    // annualised yield and payback (per user spec: "середній річний відсоток"
    // and "термін окупності" derived from average, not last-month spike).
    const avgMonthlyProfit = metricMonthsCount > 0 ? accProfit / metricMonthsCount : 0;

    // Payouts to this property
    const propertyPayouts = payouts.filter((p) => p.project_id === inv.project_id);
    const paidOutForProperty = propertyPayouts.reduce((s, p) => s + (p.amount || 0), 0);

    const pending = +(accProfit - paidOutForProperty).toFixed(2);
    const annualProfit = avgMonthlyProfit * 12;
    const roiPct = inv.amount > 0 && annualProfit > 0
      ? +(annualProfit / inv.amount * 100).toFixed(2) : null;
    const paybackYears = avgMonthlyProfit > 0
      ? +(inv.amount / annualProfit).toFixed(1) : null;

    totalInvested += inv.amount;
    totalAccumulatedProfit += accProfit;
    totalMonthlyProfit += avgMonthlyProfit;
    if (occCount > 0) {
      weightedOccupancyNum += (occSum / occCount) * inv.amount;
      weightedOccupancyDen += inv.amount;
    }

    const det = detailsByProject.get(inv.project_id);
    propertyOut.push({
      project_id: inv.project_id,
      project_name: inv.project_name,
      invested: inv.amount,
      equity_pct: inv.equity_pct,
      currency: inv.currency,
      invested_at: inv.invested_at,
      status: det?.status || deriveStatus(stages),
      monthly_profit: +avgMonthlyProfit.toFixed(2),
      accumulated_profit: +accProfit.toFixed(2),
      paid_out: +paidOutForProperty.toFixed(2),
      pending,
      roi_pct: roiPct,
      payback_years: paybackYears,
      last_metric_month: lastMonth || null,
      last_metric_occupancy: occCount > 0 ? +lastOccupancy.toFixed(1) : null,
      last_metric_revenue: metricMonthsCount > 0 ? +lastRev.toFixed(2) : null,
      work_stages: stages,
      airbnb_url: det?.airbnb_url || null,
    });
  }

  totalPaidOut = payouts.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingTotal = +(totalAccumulatedProfit - totalPaidOut).toFixed(2);
  // totalMonthlyProfit is now the SUM of per-property avg-monthly-profits.
  // Annualised yield + payback derive from this average, not last-month spike.
  const totalAnnualProfit = totalMonthlyProfit * 12;
  const annualisedYield = totalInvested > 0 && totalAnnualProfit > 0
    ? +(totalAnnualProfit / totalInvested * 100).toFixed(2) : null;
  const paybackYears = totalMonthlyProfit > 0
    ? +(totalInvested / totalAnnualProfit).toFixed(1) : null;
  const avgOccupancy = weightedOccupancyDen > 0
    ? +(weightedOccupancyNum / weightedOccupancyDen).toFixed(1) : null;

  // Capital growth time series — cumulative profit by month
  const allMonths = [...allMonthsSet].sort();
  let cumulative = 0;
  const monthlyTotals = new Map<string, number>();
  for (const inv of investments) {
    const eq = (inv.equity_pct || 0) / 100;
    const metrics = (metricsByProject.get(inv.project_id) || []).filter((m) => m.year_month >= inv.invested_at.substring(0, 7));
    for (const m of metrics) {
      const prev = monthlyTotals.get(m.year_month) || 0;
      monthlyTotals.set(m.year_month, prev + (m.revenue || 0) * eq);
    }
  }
  const capitalGrowth = allMonths.map((month) => {
    cumulative += monthlyTotals.get(month) || 0;
    return { month, invested: totalInvested, profit_cumulative: +cumulative.toFixed(2) };
  });

  // Occupancy dynamics — weighted by amount per month
  const occByMonth = new Map<string, { num: number; den: number }>();
  for (const inv of investments) {
    const metrics = (metricsByProject.get(inv.project_id) || []);
    for (const m of metrics) {
      if (m.occupancy_pct == null) continue;
      const cell = occByMonth.get(m.year_month) || { num: 0, den: 0 };
      cell.num += m.occupancy_pct * inv.amount;
      cell.den += inv.amount;
      occByMonth.set(m.year_month, cell);
    }
  }
  const occupancyDynamics = [...occByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, c]) => ({ month, occupancy_pct: +(c.num / c.den).toFixed(1) }));

  // ─── Investor Portal v2 — additional data ─────────────────────
  // Cashback status (aggregate across all investments)
  const cashbackStatus = computeAggregatePortfolioCashback(db, investor.id);

  // Per-investment cashback (for per-property pages)
  const perInvestmentCashback = investments.map((inv) => ({
    investment_id: inv.id,
    project_id: inv.project_id,
    status: computeCashbackStatus(db, inv.id),
  }));

  // Performance scores per project_id (= business_unit_id)
  const perfScoresMap = getPerformanceScoresForInvestor(db, investor.id);
  const performanceScores: Record<string, PerformanceScoreResult> = {};
  for (const [pid, score] of perfScoresMap.entries()) performanceScores[pid] = score;

  // Latest CEO note for the investor's portfolio (most recent month).
  // Schema: investor_monthly_notes(scope, scope_id, month, ceo_name, body_md).
  const ceoNoteRow = db.prepare(`
    SELECT scope, scope_id, month, ceo_name, body_md, updated_at
    FROM investor_monthly_notes
    WHERE scope = 'portfolio' AND scope_id = ?
    ORDER BY month DESC LIMIT 1
  `).get(investor.id) as any;
  const ceoNote = ceoNoteRow || null;

  // Asset-level notes: keep ONLY the latest month per asset, keyed by project_id.
  const assetNotes: InvestorPortalData['asset_notes'] = {};
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => '?').join(',');
    const assetNoteRows = db.prepare(`
      SELECT n1.scope_id, n1.month, n1.ceo_name, n1.body_md
      FROM investor_monthly_notes n1
      WHERE n1.scope = 'asset'
        AND n1.scope_id IN (${placeholders})
        AND n1.month = (
          SELECT MAX(month) FROM investor_monthly_notes n2
          WHERE n2.scope = 'asset' AND n2.scope_id = n1.scope_id
        )
    `).all(...projectIds) as any[];
    for (const n of assetNoteRows) {
      assetNotes[n.scope_id] = { month: n.month, ceo_name: n.ceo_name, body_md: n.body_md };
    }
  }

  // Documents — investor-level OR attached to any of the investor's projects.
  const docPlaceholders = projectIds.length > 0 ? projectIds.map(() => '?').join(',') : "''";
  const docsRows = projectIds.length > 0
    ? db.prepare(`
        SELECT id, type, name, file_size, mime_type, period_start, period_end,
               uploaded_at, business_unit_id
        FROM investor_documents
        WHERE is_archived = 0
          AND (investor_id = ? OR business_unit_id IN (${docPlaceholders}))
        ORDER BY uploaded_at DESC
      `).all(investor.id, ...projectIds) as any[]
    : db.prepare(`
        SELECT id, type, name, file_size, mime_type, period_start, period_end,
               uploaded_at, business_unit_id
        FROM investor_documents
        WHERE is_archived = 0 AND investor_id = ?
        ORDER BY uploaded_at DESC
      `).all(investor.id) as any[];
  const documents = docsRows.map((d) => ({
    id: d.id,
    type: d.type,
    name: d.name,
    file_size: d.file_size,
    mime_type: d.mime_type,
    period_start: d.period_start,
    period_end: d.period_end,
    uploaded_at: d.uploaded_at,
    business_unit_id: d.business_unit_id,
    download_url: `/api/finance/investor-documents/${d.id}/download`,
  }));

  // Forecast scenarios keyed by business_unit_id.
  //
  // When the admin saves a scenario via ScenariosTab they typically fill
  // simple assumptions (occupancy / ADR / IRR target / ETA) and leave the
  // raw `monthly_cashback_projection_json` empty — that field is hidden
  // in a «Розширено» details block and few operators fill it manually.
  // If we just return whatever is in the DB the forward projection chart
  // renders blank with a «без monthly projection JSON» placeholder.
  //
  // To make the chart useful out-of-the-box we auto-derive the monthly
  // series from `irr_target` × investor's invested amount when the JSON
  // is empty: constant monthly cashback over the period from today to
  // ETA (or until cumulative reaches 120% of invested if ETA isn't set).
  // The admin can still override with an explicit JSON for non-flat
  // curves — if present, it wins.
  const scenarios: InvestorPortalData['scenarios'] = {};
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => '?').join(',');
    const scenarioRows = db.prepare(`
      SELECT business_unit_id, scenario, assumptions_json,
             monthly_cashback_projection_json, full_repayment_eta
      FROM forecast_scenarios
      WHERE business_unit_id IN (${placeholders})
      ORDER BY business_unit_id, scenario
    `).all(...projectIds) as any[];

    const investedByProject = new Map<string, number>();
    for (const inv of investments) {
      investedByProject.set(inv.project_id, (investedByProject.get(inv.project_id) || 0) + (inv.amount || 0));
    }

    const autoProjection = (assumptionsRaw: string | null, eta: string | null, investedEur: number): string | null => {
      if (investedEur <= 0) return null;
      let assumptions: any = null;
      if (assumptionsRaw) { try { assumptions = JSON.parse(assumptionsRaw); } catch { /* ignore */ } }
      const irr = assumptions?.irr_target;
      if (typeof irr !== 'number' || irr <= 0) return null;
      const monthlyEur = +(investedEur * irr / 12).toFixed(2);
      if (monthlyEur <= 0) return null;

      const start = new Date();
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      let end: Date;
      if (eta && /^\d{4}-\d{2}/.test(eta)) {
        end = new Date(`${eta.substring(0, 7)}-01T00:00:00Z`);
      } else {
        const monthsNeeded = Math.ceil((investedEur * 1.2) / monthlyEur);
        end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + monthsNeeded);
      }
      if (end <= start) return null;

      const points: Array<{ period: string; eur: number }> = [];
      const cur = new Date(start);
      let safety = 0;
      while (cur <= end && safety < 360) {
        points.push({ period: cur.toISOString().substring(0, 7), eur: monthlyEur });
        cur.setUTCMonth(cur.getUTCMonth() + 1);
        safety++;
      }
      return points.length > 0 ? JSON.stringify(points) : null;
    };

    for (const s of scenarioRows) {
      if (!scenarios[s.business_unit_id]) scenarios[s.business_unit_id] = [];
      let projection: string | null = s.monthly_cashback_projection_json;
      if (!projection || !projection.trim()) {
        projection = autoProjection(s.assumptions_json, s.full_repayment_eta, investedByProject.get(s.business_unit_id) || 0);
      }
      scenarios[s.business_unit_id].push({
        scenario: s.scenario,
        assumptions_json: s.assumptions_json,
        monthly_cashback_projection_json: projection,
        full_repayment_eta: s.full_repayment_eta,
      });
    }
  }

  // ─── Live Pulse + Ops Metrics (Phase 5) ───────────────────────
  // Reservations live on `reservations`, linked to physical `units`.
  // The investor's BUs are mapped to units via investor_investments.unit_id.
  const investorUnitIds = [...new Set(investments.map((i) => i.unit_id).filter(Boolean))] as string[];

  // Helper: get reservations for an array of unit_ids in a date range
  const reservationsFor = (unitIds: string[], whereExtra: string, params: any[]): any[] => {
    if (unitIds.length === 0) return [];
    const placeholders = unitIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT id, unit_id, check_in, check_out, nights, status, total_price, currency
      FROM reservations
      WHERE unit_id IN (${placeholders})
        AND status NOT IN ('cancelled', 'no_show', 'draft')
        ${whereExtra}
    `).all(...unitIds, ...params);
  };

  // Pulse — current month (YYYY-MM)
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const next30End  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30));
  const next14End  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));
  const fmtIso = (d: Date) => d.toISOString().substring(0, 10);
  const todayIso = fmtIso(now);
  const monthStartIso = fmtIso(monthStart);
  const monthEndIso   = fmtIso(monthEnd);
  const nightsInMonth = monthEnd.getUTCDate();

  // Locked-in nights this month: confirmed reservations that overlap [monthStart, monthEnd]
  const lockedNights = investorUnitIds.length > 0
    ? (reservationsFor(
        investorUnitIds,
        "AND check_in <= ? AND check_out >= ?",
        [monthEndIso, monthStartIso],
      ) as any[]).reduce((sum, r) => {
        // overlap length
        const ci = r.check_in > monthStartIso ? r.check_in : monthStartIso;
        const co = r.check_out < monthEndIso ? r.check_out : monthEndIso;
        const days = (new Date(co).getTime() - new Date(ci).getTime()) / (1000 * 60 * 60 * 24);
        return sum + Math.max(0, days);
      }, 0)
    : 0;

  // Pipeline: tentative reservations in next 14 days
  const pipelineCount = investorUnitIds.length > 0
    ? (db.prepare(`
        SELECT COUNT(*) AS n FROM reservations
        WHERE unit_id IN (${investorUnitIds.map(() => '?').join(',')})
          AND status = 'tentative'
          AND check_in BETWEEN ? AND ?
      `).get(...investorUnitIds, todayIso, fmtIso(next14End)) as { n: number }).n
    : 0;

  // Expected inflow next 30 days (confirmed only) — broken down by currency.
  // The number is the INVESTOR'S SHARE, not the gross property revenue:
  // each reservation total is multiplied by the investor's equity_pct on
  // that specific unit. Showing gross misled the investor into thinking
  // they receive the full revenue stream.
  const inflowRows = investorUnitIds.length > 0
    ? reservationsFor(
        investorUnitIds,
        "AND status IN ('confirmed', 'checked_in') AND check_in BETWEEN ? AND ?",
        [todayIso, fmtIso(next30End)],
      ) as any[]
    : [];
  // unit_id → total equity_pct (sum across lots if investor has multiple
  // investments on the same unit).
  const unitEquityFraction = new Map<string, number>();
  for (const inv of investments) {
    if (!inv.unit_id) continue;
    const prev = unitEquityFraction.get(inv.unit_id) || 0;
    unitEquityFraction.set(inv.unit_id, prev + ((inv.equity_pct || 0) / 100));
  }
  const inflowByCurrency = new Map<string, number>();
  for (const r of inflowRows) {
    const cur = r.currency || 'CZK';
    const eq = unitEquityFraction.get(r.unit_id) || 0;
    const share = (r.total_price || 0) * eq;
    inflowByCurrency.set(cur, (inflowByCurrency.get(cur) || 0) + share);
  }

  // FX → EUR. finance_exchange_rates schema: from_currency, to_currency, rate, effective_from.
  //
  // Bidirectional lookup with sanity check, because admins inconsistently
  // store rates: some store «1 EUR = 25.2 CZK» as from=EUR/to=CZK/rate=25.2
  // (standard ECB convention), others mistakenly store the same magnitude
  // as from=CZK/to=EUR/rate=25.2 (which would mean 1 CZK = 25 EUR — wrong!).
  //
  // Strategy:
  //   1. Try direct rate (from=fromCur → to=EUR). Sanity: rate should be
  //      close to or below 1 for typical conversions to EUR.
  //   2. If not found OR rate looks inverted, try reverse (from=EUR →
  //      to=fromCur), use 1/rate.
  //   3. Pick the one that produces a plausible amount (rate < 5 for direct,
  //      rate > 0.2 for inverse means a sensible exchange).
  const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  const orgId = orgRow?.id;
  const getRateToEur = (fromCur: string): number | null => {
    if (fromCur === 'EUR') return 1;
    if (!orgId) return null;
    const direct = db.prepare(`
      SELECT rate FROM finance_exchange_rates
      WHERE organization_id = ? AND from_currency = ? AND to_currency = 'EUR'
        AND effective_from <= ?
      ORDER BY effective_from DESC LIMIT 1
    `).get(orgId, fromCur, todayIso) as { rate: number } | undefined;
    const inverse = db.prepare(`
      SELECT rate FROM finance_exchange_rates
      WHERE organization_id = ? AND from_currency = 'EUR' AND to_currency = ?
        AND effective_from <= ?
      ORDER BY effective_from DESC LIMIT 1
    `).get(orgId, fromCur, todayIso) as { rate: number } | undefined;

    // Standard convention: 1 EUR = N FOREIGN where N > 1. Reverse rate
    // (FOREIGN → EUR) should therefore be < 1. If `direct.rate > 5` it's
    // almost certainly the inverse stored in the wrong direction.
    const directRate = direct?.rate;
    const inverseRate = inverse?.rate;
    if (directRate != null && directRate < 5) return directRate;
    if (inverseRate != null && inverseRate > 0.2) return 1 / inverseRate;
    if (directRate != null) return 1 / directRate; // last-ditch: treat as inverse
    return null;
  };

  let inflowEur = 0;
  let fxWarning: string | null = null;
  const inflowByCurrencyArr: Array<{ currency: string; amount: number }> = [];
  for (const [cur, amount] of inflowByCurrency.entries()) {
    inflowByCurrencyArr.push({ currency: cur, amount: +amount.toFixed(2) });
    const rate = getRateToEur(cur);
    if (rate == null) {
      fxWarning = `Курс ${cur}→EUR не задано — суми у ${cur} виключено`;
      continue;
    }
    inflowEur += amount * rate;
  }

  const pulse: InvestorPortalData['pulse'] = {
    locked_in_nights_this_month: Math.round(lockedNights),
    nights_in_month: nightsInMonth,
    total_available_nights_this_month: nightsInMonth * Math.max(1, investorUnitIds.length),
    pipeline_inquiries_count: pipelineCount,
    expected_inflow_next_30_days_eur: +inflowEur.toFixed(2),
    expected_inflow_by_currency: inflowByCurrencyArr,
    fx_rate_warning: fxWarning,
  };

  // Ops Metrics per BU — current month + previous month for trend.
  // Occupancy = nights_sold / (days_in_month × units_count)
  // ADR = revenue / nights_sold
  // RevPAR = revenue / total_available_nights
  const opsMetrics: InvestorPortalData['ops_metrics'] = {};
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const prevNightsInMonth = prevMonthEnd.getUTCDate();

  for (const inv of investments) {
    if (!inv.unit_id || opsMetrics[inv.project_id]) continue;
    const buUnitIds = investments.filter((i) => i.project_id === inv.project_id).map((i) => i.unit_id).filter(Boolean) as string[];
    const buRow = db.prepare("SELECT units_count, name FROM business_units WHERE id = ?").get(inv.project_id) as { units_count?: number; name: string } | undefined;
    const unitsCount = Math.max(1, buRow?.units_count || buUnitIds.length || 1);

    const computeWindow = (winStart: Date, winEnd: Date, daysInWindow: number) => {
      const winStartIso = fmtIso(winStart);
      const winEndIso = fmtIso(winEnd);
      const rows = reservationsFor(
        buUnitIds,
        "AND check_in <= ? AND check_out >= ?",
        [winEndIso, winStartIso],
      ) as any[];
      let nightsSold = 0;
      let revenue = 0;
      let cur = inv.currency || 'CZK';
      for (const r of rows) {
        const ci = r.check_in > winStartIso ? r.check_in : winStartIso;
        const co = r.check_out < winEndIso ? r.check_out : winEndIso;
        const n = Math.max(0, (new Date(co).getTime() - new Date(ci).getTime()) / (1000 * 60 * 60 * 24));
        nightsSold += n;
        // Scale revenue by overlap fraction (avoid over-counting if reservation crosses window)
        const totalNights = r.nights || Math.max(1, (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / (1000 * 60 * 60 * 24));
        revenue += (r.total_price || 0) * (n / totalNights);
        cur = r.currency || cur;
      }
      const available = daysInWindow * unitsCount;
      const occupancy = available > 0 ? (nightsSold / available) * 100 : null;
      const adr = nightsSold > 0 ? revenue / nightsSold : null;
      const revpar = available > 0 ? revenue / available : null;
      return { occupancy, adr, revpar, currency: cur };
    };

    const cur  = computeWindow(monthStart, monthEnd, nightsInMonth);
    const prev = computeWindow(prevMonthStart, prevMonthEnd, prevNightsInMonth);

    opsMetrics[inv.project_id] = {
      occupancy_now_pct: cur.occupancy != null ? +cur.occupancy.toFixed(1) : null,
      occupancy_prev_pct: prev.occupancy != null ? +prev.occupancy.toFixed(1) : null,
      adr_now: cur.adr != null ? +cur.adr.toFixed(0) : null,
      adr_prev: prev.adr != null ? +prev.adr.toFixed(0) : null,
      revpar_now: cur.revpar != null ? +cur.revpar.toFixed(0) : null,
      revpar_prev: prev.revpar != null ? +prev.revpar.toFixed(0) : null,
      currency: cur.currency,
    };
  }

  // ─── Occupancy time series (last 12 months) ─────────────────
  // Reads from property_monthly_metrics — the single source of truth for
  // investor-facing data. Months without a manual metric render as 0%
  // bars (gray, thin) which preserves the existing "12 bars always
  // shown" UI behaviour. Previous version computed from reservations
  // directly which masked operator-corrected occupancy and missed
  // months where bookings live outside our reservations table
  // (pre-Hostex-sync history backfilled via Supabase importer).
  const monthsLookback = 12;
  const startOf12mAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsLookback - 1), 1));
  const monthKeys: string[] = [];
  for (let mi = 0; mi < monthsLookback; mi++) {
    const winStart = new Date(Date.UTC(startOf12mAgo.getUTCFullYear(), startOf12mAgo.getUTCMonth() + mi, 1));
    monthKeys.push(fmtIso(winStart).substring(0, 7));
  }

  const occupancyByMonthPerAsset: InvestorPortalData['occupancy_by_month_per_asset'] = {};
  const aggregateOcc = new Map<string, { sum: number; count: number }>();

  for (const projectId of projectIds) {
    if (occupancyByMonthPerAsset[projectId]) continue;
    const metrics = metricsByProject.get(projectId) || [];
    const occByMonthForProject = new Map<string, number>();
    for (const m of metrics) {
      if (m.occupancy_pct != null) occByMonthForProject.set(m.year_month, m.occupancy_pct);
    }
    const series = monthKeys.map((mk) => ({
      month: mk,
      occupancy_pct: +(occByMonthForProject.get(mk) ?? 0).toFixed(1),
    }));
    occupancyByMonthPerAsset[projectId] = series;

    for (const mk of monthKeys) {
      const v = occByMonthForProject.get(mk);
      if (v != null && v > 0) {
        const cell = aggregateOcc.get(mk) || { sum: 0, count: 0 };
        cell.sum += v;
        cell.count += 1;
        aggregateOcc.set(mk, cell);
      }
    }
  }

  const occupancyByMonth = monthKeys.map((mk) => {
    const cell = aggregateOcc.get(mk);
    return {
      month: mk,
      occupancy_pct: cell && cell.count > 0 ? +(cell.sum / cell.count).toFixed(1) : 0,
    };
  });

  return {
    investor: {
      id: investor.id, name: investor.name, email: investor.email, status: investor.status,
    },
    totals: {
      invested: +totalInvested.toFixed(2),
      paid_out: +totalPaidOut.toFixed(2),
      pending: pendingTotal,
      accumulated_profit: +totalAccumulatedProfit.toFixed(2),
      monthly_profit: +totalMonthlyProfit.toFixed(2),
      annualised_yield_pct: annualisedYield,
      payback_years: paybackYears,
      avg_occupancy_pct: avgOccupancy,
      active_lots: investments.length,
      currency: portfolioCurrency,
    },
    properties: propertyOut,
    capital_growth: capitalGrowth,
    occupancy_dynamics: occupancyDynamics,
    income_by_source: getInvestorIncomeBySource(db, investor.id),
    monthly_reports: reportsRows.map((r) => ({
      project_id: r.project_id, project_name: r.project_name,
      year_month: r.year_month, adr: r.adr,
      general_comment: r.general_comment, market_insight: r.market_insight, photo_url: r.photo_url,
    })),
    payouts: payouts.map((p) => ({
      id: p.id,
      paid_at: p.paid_at,
      amount: p.amount,
      currency: p.currency,
      project_id: p.project_id,
      project_name: p.project_name,
      period_year_month: p.period_year_month,
      comment: p.comment,
    })),
    cashback_status: cashbackStatus,
    per_investment_cashback: perInvestmentCashback,
    performance_scores: performanceScores,
    ceo_note: ceoNote,
    asset_notes: assetNotes,
    documents,
    scenarios,
    pulse,
    ops_metrics: opsMetrics,
    occupancy_by_month: occupancyByMonth,
    occupancy_by_month_per_asset: occupancyByMonthPerAsset,
  };
}
