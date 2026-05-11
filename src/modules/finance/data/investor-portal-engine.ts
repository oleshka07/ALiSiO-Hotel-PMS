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

  // Forecast scenarios keyed by business_unit_id
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
    for (const s of scenarioRows) {
      if (!scenarios[s.business_unit_id]) scenarios[s.business_unit_id] = [];
      scenarios[s.business_unit_id].push({
        scenario: s.scenario,
        assumptions_json: s.assumptions_json,
        monthly_cashback_projection_json: s.monthly_cashback_projection_json,
        full_repayment_eta: s.full_repayment_eta,
      });
    }
  }

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
  };
}
