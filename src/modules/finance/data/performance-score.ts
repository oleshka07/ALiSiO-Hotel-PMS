/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Investor Portal v2 — Asset Performance Score
//
// Powers the left-edge 4px coloured bar on each asset in the Assets list:
//   green  — above plan
//   amber  — on track (±15% of target)
//   red    — below plan
//
// Score = trailing 12-month actual APY for the asset, divided by the
// `target_apy` set on the investor_investment at contract time.
//

export type PerformanceScore = 'above' | 'on_track' | 'below' | 'unknown';

export interface PerformanceScoreResult {
  score: PerformanceScore;
  actual_apy: number | null;   // 0.10 = 10% annualised
  target_apy: number | null;   // 0.12 = 12% target
  ratio: number | null;        // actual / target
  reason?: string;             // when 'unknown'
}

const WINDOW_MONTHS = 12;

/**
 * Get asset performance score for one business_unit (= one asset).
 * Considers the trailing-12m actual run-rate vs the contractual target.
 */
export function getAssetPerformanceScore(
  db: any,
  businessUnitId: string,
  asOfDate?: string,
): PerformanceScoreResult {
  const today = asOfDate || new Date().toISOString().substring(0, 10);
  const windowStart = (() => {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() - WINDOW_MONTHS);
    return d.toISOString().substring(0, 10);
  })();

  // Sum of investor_payouts on this BU in the window
  const paidRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s
    FROM investor_payouts
    WHERE project_id = ? AND paid_at >= ? AND paid_at <= ?
  `).get(businessUnitId, windowStart, today) as { s: number };
  const paidTrailing12m = paidRow.s;

  // Total invested capital + target_apy (weighted by amount if multiple lots)
  const invRows = db.prepare(`
    SELECT amount, target_apy, equity_pct
    FROM investor_investments
    WHERE project_id = ? AND is_active = 1
  `).all(businessUnitId) as Array<{ amount: number; target_apy: number | null; equity_pct: number | null }>;

  if (invRows.length === 0) {
    return { score: 'unknown', actual_apy: null, target_apy: null, ratio: null, reason: 'no active investments' };
  }

  const totalInvested = invRows.reduce((s, r) => s + r.amount, 0);
  if (totalInvested <= 0) {
    return { score: 'unknown', actual_apy: null, target_apy: null, ratio: null, reason: 'zero invested capital' };
  }

  // Actual APY = (paidTrailing12m / totalInvested) — already an annualised
  // figure since we summed the past 12 calendar months.
  const actualApy = paidTrailing12m / totalInvested;

  // Target APY weighted by investment amount across the lots in this BU.
  // If any lot lacks target_apy, fall back to 0.12 (12%) for that lot so a
  // missing target doesn't silently degrade the score.
  const FALLBACK_TARGET = 0.12;
  let targetNum = 0;
  let targetDen = 0;
  let usedFallback = false;
  for (const r of invRows) {
    const t = r.target_apy != null ? r.target_apy : (usedFallback = true, FALLBACK_TARGET);
    targetNum += t * r.amount;
    targetDen += r.amount;
  }
  const targetApy = targetDen > 0 ? targetNum / targetDen : null;

  if (targetApy == null || targetApy <= 0) {
    return {
      score: 'unknown',
      actual_apy: +actualApy.toFixed(4),
      target_apy: null, ratio: null,
      reason: 'no target_apy set on investments',
    };
  }

  const ratio = actualApy / targetApy;
  let score: PerformanceScore;
  if (ratio >= 1.1)  score = 'above';
  else if (ratio >= 0.85) score = 'on_track';
  else score = 'below';

  return {
    score,
    actual_apy: +actualApy.toFixed(4),
    target_apy: +targetApy.toFixed(4),
    ratio: +ratio.toFixed(3),
    reason: usedFallback ? `fallback target ${FALLBACK_TARGET * 100}% used for one or more lots` : undefined,
  };
}

/**
 * Bulk: scores for every BU an investor is invested in.
 * Used to render coloured bars across the assets list in one pass.
 */
export function getPerformanceScoresForInvestor(
  db: any,
  investorId: string,
  asOfDate?: string,
): Map<string, PerformanceScoreResult> {
  const buIds = (db.prepare(`
    SELECT DISTINCT project_id FROM investor_investments
    WHERE investor_id = ? AND is_active = 1 AND project_id IS NOT NULL
  `).all(investorId) as Array<{ project_id: string }>).map((r) => r.project_id);

  const out = new Map<string, PerformanceScoreResult>();
  for (const buId of buIds) {
    out.set(buId, getAssetPerformanceScore(db, buId, asOfDate));
  }
  return out;
}
