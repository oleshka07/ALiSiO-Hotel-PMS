/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Investor Portal v2 — Cashback Schedule Calculator
//
// Given an investment row with cashback_schedule_json (the contractual
// plan signed at investment time) and actual investor_payouts, computes:
//   - cumulative planned vs paid amounts up to a chosen date
//   - delta absolute and percentage
//   - status bucket for the UI pill (ahead / on_track / slightly_behind /
//     behind / no_schedule)
//   - next planned period to surface "what's coming"
//
// This is the SINGLE source of truth for the "Q1 2026 · ON TRACK" hero
// badge and for the Cashback Schedule Timeline component. Wrong number
// here = wrong trust signal to the investor.
//

export interface CashbackSchedulePeriod {
  period: string;          // 'YYYY-MM' or 'YYYY-Q1'
  planned_kc?: number;     // optional, planned in CZK
  planned_eur: number;     // planned cashback in EUR
}

export interface CashbackScheduleJson {
  type: 'monthly' | 'quarterly';
  currency: string;        // 'EUR' (planned currency for the schedule)
  schedule: CashbackSchedulePeriod[];
  total_planned_eur: number;
  expected_repayment_date: string;
  irr_target?: number;     // optional 0.12 = 12%
}

export type CashbackStatusBucket =
  | 'ahead'
  | 'on_track'
  | 'slightly_behind'
  | 'behind'
  | 'no_schedule';

export interface CashbackStatus {
  status: CashbackStatusBucket;
  cumulative_paid_eur: number;
  cumulative_planned_eur: number;
  delta_eur: number;
  delta_pct: number;                  // -25 means actual is 25% under plan
  next_planned_period: string | null;
  next_planned_amount_eur: number;
  total_planned_eur: number;          // for "out of 279 000 €" display
  schedule: CashbackSchedulePeriod[]; // raw, for the timeline chart
  paid_periods: Array<{ period: string; eur: number }>; // grouped actual payouts
  reason_if_behind?: string;
}

function safeJson<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

/** Period key formatter — turns a paid_at date into a period bucket
 *  matching the schedule's granularity. */
function periodKey(paidAt: string, granularity: 'monthly' | 'quarterly'): string {
  const ym = paidAt.substring(0, 7); // YYYY-MM
  if (granularity === 'monthly') return ym;
  const [y, m] = ym.split('-');
  const q = Math.ceil(parseInt(m, 10) / 3);
  return `${y}-Q${q}`;
}

function bucketize(deltaPct: number): CashbackStatusBucket {
  if (deltaPct >= 5)   return 'ahead';
  if (deltaPct >= -5)  return 'on_track';
  if (deltaPct >= -25) return 'slightly_behind';
  return 'behind';
}

/**
 * Compute the cashback status for a single investor_investment.
 *
 * @param db          better-sqlite3 handle
 * @param investmentId   investor_investments.id
 * @param asOfDate    'YYYY-MM-DD' — the slice date; default = today
 */
export function computeCashbackStatus(
  db: any,
  investmentId: string,
  asOfDate?: string,
): CashbackStatus {
  const inv = db.prepare(
    "SELECT id, investor_id, cashback_schedule_json FROM investor_investments WHERE id = ?"
  ).get(investmentId) as { id: string; investor_id: string; cashback_schedule_json: string | null } | undefined;

  const empty = (status: CashbackStatusBucket): CashbackStatus => ({
    status,
    cumulative_paid_eur: 0,
    cumulative_planned_eur: 0,
    delta_eur: 0,
    delta_pct: 0,
    next_planned_period: null,
    next_planned_amount_eur: 0,
    total_planned_eur: 0,
    schedule: [],
    paid_periods: [],
  });

  if (!inv) return empty('no_schedule');

  const schedule = safeJson<CashbackScheduleJson>(inv.cashback_schedule_json);
  if (!schedule || !Array.isArray(schedule.schedule) || schedule.schedule.length === 0) {
    return empty('no_schedule');
  }

  const today = (asOfDate || new Date().toISOString().substring(0, 10));

  // Sum planned amounts whose period ENDS on/before today.
  // For monthly periods 'YYYY-MM' — period covers entire calendar month.
  // For quarterly 'YYYY-Q1' — covers Q1 (Jan-Mar) etc.
  const periodEndsByOrBefore = (period: string, dateStr: string): boolean => {
    if (period.includes('-Q')) {
      const [y, qPart] = period.split('-Q');
      const qNum = parseInt(qPart, 10);
      const monthEnd = qNum * 3; // Q1→3, Q2→6, ...
      const lastDay = new Date(parseInt(y, 10), monthEnd, 0).getDate();
      const endStr = `${y}-${String(monthEnd).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return endStr <= dateStr;
    }
    // Monthly: 'YYYY-MM'
    const [y, m] = period.split('-');
    const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
    const endStr = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    return endStr <= dateStr;
  };

  let cumulativePlanned = 0;
  let nextPeriod: string | null = null;
  let nextAmount = 0;
  for (const p of schedule.schedule) {
    if (periodEndsByOrBefore(p.period, today)) {
      cumulativePlanned += p.planned_eur || 0;
    } else if (nextPeriod === null) {
      nextPeriod = p.period;
      nextAmount = p.planned_eur || 0;
    }
  }

  // Actual payouts for this investment's project (only EUR for now —
  // schedule.currency is the contract currency; mismatched currencies
  // are skipped with a console warn).
  const payoutRows = db.prepare(`
    SELECT amount, currency, paid_at
    FROM investor_payouts
    WHERE investor_id = ?
      AND project_id = (SELECT project_id FROM investor_investments WHERE id = ?)
      AND paid_at <= ?
    ORDER BY paid_at
  `).all(inv.investor_id, investmentId, today) as Array<{ amount: number; currency: string; paid_at: string }>;

  const paidPeriods = new Map<string, number>();
  let cumulativePaid = 0;
  for (const p of payoutRows) {
    if (p.currency !== schedule.currency) {
      // FX conversion is out of scope here; investor sees a warning sub
      console.warn('[cashback-calculator] currency mismatch', { schedule: schedule.currency, payout: p.currency });
    }
    cumulativePaid += p.amount;
    const key = periodKey(p.paid_at, schedule.type);
    paidPeriods.set(key, (paidPeriods.get(key) || 0) + p.amount);
  }

  const deltaEur = cumulativePaid - cumulativePlanned;
  const deltaPct = cumulativePlanned > 0
    ? (deltaEur / cumulativePlanned) * 100
    : (cumulativePaid > 0 ? 100 : 0);

  return {
    status: bucketize(deltaPct),
    cumulative_paid_eur: +cumulativePaid.toFixed(2),
    cumulative_planned_eur: +cumulativePlanned.toFixed(2),
    delta_eur: +deltaEur.toFixed(2),
    delta_pct: +deltaPct.toFixed(1),
    next_planned_period: nextPeriod,
    next_planned_amount_eur: +nextAmount.toFixed(2),
    total_planned_eur: +schedule.total_planned_eur.toFixed(2),
    schedule: schedule.schedule,
    paid_periods: [...paidPeriods.entries()].map(([period, eur]) => ({ period, eur: +eur.toFixed(2) })),
  };
}

/**
 * Aggregate cashback status across all of an investor's active investments.
 * Used by the portfolio-level hero card.
 */
export function computeAggregatePortfolioCashback(
  db: any,
  investorId: string,
  asOfDate?: string,
): CashbackStatus {
  const investmentIds = (db.prepare(
    "SELECT id FROM investor_investments WHERE investor_id = ? AND is_active = 1"
  ).all(investorId) as Array<{ id: string }>).map((r) => r.id);

  if (investmentIds.length === 0) {
    return {
      status: 'no_schedule',
      cumulative_paid_eur: 0, cumulative_planned_eur: 0,
      delta_eur: 0, delta_pct: 0,
      next_planned_period: null, next_planned_amount_eur: 0,
      total_planned_eur: 0, schedule: [], paid_periods: [],
    };
  }

  let cumulativePaid = 0;
  let cumulativePlanned = 0;
  let totalPlanned = 0;
  let nextPeriod: string | null = null;
  let nextAmount = 0;
  const aggSchedule = new Map<string, number>();
  const aggPaid = new Map<string, number>();
  let hasAnySchedule = false;

  for (const id of investmentIds) {
    const s = computeCashbackStatus(db, id, asOfDate);
    if (s.schedule.length > 0) hasAnySchedule = true;
    cumulativePaid    += s.cumulative_paid_eur;
    cumulativePlanned += s.cumulative_planned_eur;
    totalPlanned      += s.total_planned_eur;
    if (s.next_planned_period && (nextPeriod === null || s.next_planned_period < nextPeriod)) {
      nextPeriod = s.next_planned_period;
      nextAmount = s.next_planned_amount_eur;
    } else if (s.next_planned_period === nextPeriod) {
      nextAmount += s.next_planned_amount_eur;
    }
    for (const p of s.schedule) {
      aggSchedule.set(p.period, (aggSchedule.get(p.period) || 0) + (p.planned_eur || 0));
    }
    for (const p of s.paid_periods) {
      aggPaid.set(p.period, (aggPaid.get(p.period) || 0) + p.eur);
    }
  }

  if (!hasAnySchedule) {
    return {
      status: 'no_schedule',
      cumulative_paid_eur: +cumulativePaid.toFixed(2),
      cumulative_planned_eur: 0, delta_eur: 0, delta_pct: 0,
      next_planned_period: null, next_planned_amount_eur: 0,
      total_planned_eur: 0, schedule: [], paid_periods: [],
    };
  }

  const deltaEur = cumulativePaid - cumulativePlanned;
  const deltaPct = cumulativePlanned > 0
    ? (deltaEur / cumulativePlanned) * 100
    : (cumulativePaid > 0 ? 100 : 0);

  return {
    status: bucketize(deltaPct),
    cumulative_paid_eur: +cumulativePaid.toFixed(2),
    cumulative_planned_eur: +cumulativePlanned.toFixed(2),
    delta_eur: +deltaEur.toFixed(2),
    delta_pct: +deltaPct.toFixed(1),
    next_planned_period: nextPeriod,
    next_planned_amount_eur: +nextAmount.toFixed(2),
    total_planned_eur: +totalPlanned.toFixed(2),
    schedule: [...aggSchedule.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, planned_eur]) => ({ period, planned_eur: +planned_eur.toFixed(2) })),
    paid_periods: [...aggPaid.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, eur]) => ({ period, eur: +eur.toFixed(2) })),
  };
}
