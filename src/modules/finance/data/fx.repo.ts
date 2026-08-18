/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * How many crowns to a euro, as configured — not as hard-coded.
 *
 * The rate had been written into the code three different times: CZK_TO_EUR at
 * 23.5 for reports, a literal 24 in the bot's guest receipt, and nothing at all
 * on the payment path, which simply relabelled a CZK number as EUR. A guest
 * quoted one rate and charged another is a complaint at the counter, so this
 * reads the finance settings — the same finance_exchange_rates rows the
 * Exchange Rates tab edits — and everything downstream uses that one number.
 *
 * Stored either way round: EUR→CZK holds ~24, CZK→EUR holds ~0.041. Both are
 * accepted so whichever direction was entered in the UI works.
 */
import { FALLBACK_CZK_PER_EUR } from './fx.constants';

export function getCzkPerEur(db: any, organizationId: string): number {
  try {
    const direct = db.prepare(`
      SELECT rate FROM finance_exchange_rates
      WHERE organization_id = ? AND from_currency = 'EUR' AND to_currency = 'CZK'
        AND effective_from <= date('now')
      ORDER BY effective_from DESC LIMIT 1
    `).get(organizationId) as { rate: number } | undefined;
    if (direct?.rate && direct.rate > 0) return direct.rate;

    const inverse = db.prepare(`
      SELECT rate FROM finance_exchange_rates
      WHERE organization_id = ? AND from_currency = 'CZK' AND to_currency = 'EUR'
        AND effective_from <= date('now')
      ORDER BY effective_from DESC LIMIT 1
    `).get(organizationId) as { rate: number } | undefined;
    if (inverse?.rate && inverse.rate > 0) return 1 / inverse.rate;
  } catch { /* settings unreadable — fall through to the constant */ }
  return FALLBACK_CZK_PER_EUR;
}

/** CZK → EUR, rounded to the nearest 50 cents: the figure a guest is quoted. */
export function czkToEurCash(czk: number, czkPerEur: number): number {
  return Math.floor((czk / czkPerEur) * 2 + 0.5) / 2;
}
