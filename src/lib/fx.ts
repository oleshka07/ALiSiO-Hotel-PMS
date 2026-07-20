/**
 * ALiSiO PMS — currency conversion for accounting documents.
 *
 * Converts a foreign amount (e.g. EUR from an OTA payout) into CZK using the
 * finance_exchange_rates entry effective on a given date. Mirrors the
 * inverted-rate sanity check used in investor-portal-engine, because admins
 * inconsistently store the pair direction.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { syncCnbRates } from './cnb-rates';

function orgId(db: any): string | null {
  const r = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
  return r?.id ?? null;
}

/**
 * Rate to turn 1 unit of `from` into CZK, effective on or before `dateIso`.
 * Returns null when no usable rate exists.
 */
export function getCzkRate(db: any, from: string, dateIso: string): number | null {
  const cur = (from || 'CZK').toUpperCase();
  if (cur === 'CZK') return 1;
  const oid = orgId(db);
  if (!oid) return null;
  const date = (dateIso || '').slice(0, 10);

  const dated = (f: string, t: string) =>
    (db.prepare(
      `SELECT rate FROM finance_exchange_rates
       WHERE organization_id = ? AND from_currency = ? AND to_currency = ?
         AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1`
    ).get(oid, f, t, date) as { rate: number } | undefined)?.rate;
  const latest = (f: string, t: string) =>
    (db.prepare(
      `SELECT rate FROM finance_exchange_rates
       WHERE organization_id = ? AND from_currency = ? AND to_currency = ?
       ORDER BY effective_from DESC LIMIT 1`
    ).get(oid, f, t) as { rate: number } | undefined)?.rate;

  // 1 EUR = ~25 CZK → direct (EUR→CZK) should be > 1; inverse (CZK→EUR) < 1.
  for (const [d, i] of [
    [dated(cur, 'CZK'), dated('CZK', cur)],
    [latest(cur, 'CZK'), latest('CZK', cur)],
  ] as Array<[number | undefined, number | undefined]>) {
    if (d != null && d > 1) return d;
    if (i != null && i > 0 && i < 1) return 1 / i;
    if (d != null && d > 0) return d;
    if (i != null && i > 0) return 1 / i;
  }
  return null;
}

export interface CzkConversion {
  amountCzk: number;    // payable amount in CZK
  rate: number;         // CZK per 1 unit of `currency`
  original: number;     // original foreign amount
  currency: string;     // original currency (e.g. 'EUR')
  converted: boolean;   // true only when an actual FX conversion happened
}

/**
 * Convert `amount` in `currency` to CZK using the rate effective on `dateIso`.
 * When already CZK, or no rate is available, returns converted=false and leaves
 * the amount untouched (never fabricates an FX rate).
 */
export function convertToCzk(db: any, amount: number, currency: string, dateIso: string): CzkConversion {
  const cur = (currency || 'CZK').toUpperCase();
  if (cur === 'CZK') {
    return { amountCzk: amount, rate: 1, original: amount, currency: 'CZK', converted: false };
  }
  const rate = getCzkRate(db, cur, dateIso);
  if (rate == null) {
    return { amountCzk: amount, rate: 0, original: amount, currency: cur, converted: false };
  }
  return { amountCzk: Math.round(amount * rate * 100) / 100, rate, original: amount, currency: cur, converted: true };
}

/**
 * Like convertToCzk, but if no rate exists for the date it lazily pulls that
 * exact day's ČNB fixing, stores it, and retries — so invoice conversion "just
 * works" with no cron or manual entry. Falls back to the original currency if
 * ČNB is unreachable (never fabricates a rate).
 */
export async function convertToCzkAuto(db: any, amount: number, currency: string, dateIso: string): Promise<CzkConversion> {
  const cur = (currency || 'CZK').toUpperCase();
  if (cur === 'CZK') return { amountCzk: amount, rate: 1, original: amount, currency: 'CZK', converted: false };

  let rate = getCzkRate(db, cur, dateIso);
  if (rate == null) {
    try {
      await syncCnbRates(db, { date: (dateIso || '').slice(0, 10), currencies: [cur] });
      rate = getCzkRate(db, cur, dateIso);
    } catch { /* offline / feed error — leave rate null, keep original currency */ }
  }
  if (rate == null) return { amountCzk: amount, rate: 0, original: amount, currency: cur, converted: false };
  return { amountCzk: Math.round(amount * rate * 100) / 100, rate, original: amount, currency: cur, converted: true };
}

/** Czech-style secondary line, e.g. "Původní částka: 250,00 EUR · kurz 25,300 CZK/EUR". */
export function foreignNote(c: CzkConversion): string {
  if (!c.converted) return '';
  const amt = c.original.toFixed(2).replace('.', ',');
  const rate = c.rate.toFixed(3).replace('.', ',');
  return `Původní částka: ${amt} ${c.currency} · kurz ${rate} CZK/${c.currency}`;
}
