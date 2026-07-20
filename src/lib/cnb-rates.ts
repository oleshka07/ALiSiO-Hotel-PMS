/**
 * ALiSiO PMS — ČNB (Czech National Bank) daily FX rates.
 *
 * Pulls the official ČNB daily fixing feed and upserts <CUR>→CZK rates into
 * finance_exchange_rates, so invoices can convert EUR/USD/… to CZK without
 * manual entry.
 *
 * Feed (plain text, one fixing per business day):
 *   https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt
 *   07 May 2026 #89
 *   Country|Currency|Amount|Code|Rate
 *   EMU|euro|1|EUR|25.290
 *   ...
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const CNB_DAILY_URL =
  'https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt';

/** Currencies we keep quoted against CZK. EUR is the one invoices actually need. */
export const DEFAULT_CNB_CURRENCIES = ['EUR', 'USD', 'GBP', 'PLN'];

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export interface CnbFixing {
  date: string;                     // YYYY-MM-DD (fixing date)
  rates: Record<string, number>;    // { EUR: 25.29, USD: 23.10, ... } — CZK per 1 unit
}

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'ALiSiO-PMS' } });
    if (!res.ok) throw new Error(`ČNB feed HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Parse the ČNB daily.txt body into a fixing (date + CUR→CZK rates). */
export function parseCnbDaily(body: string): CnbFixing {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Empty ČNB feed');

  // Header: "07 May 2026 #89"
  const m = lines[0].match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) throw new Error(`Unexpected ČNB header: ${lines[0].slice(0, 40)}`);
  const day = m[1].padStart(2, '0');
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!mon) throw new Error(`Unknown month in ČNB header: ${m[2]}`);
  const date = `${m[3]}-${mon}-${day}`;

  const rates: Record<string, number> = {};
  for (const line of lines.slice(1)) {
    // Country|Currency|Amount|Code|Rate
    const parts = line.split('|');
    if (parts.length < 5) continue;
    const amount = Number(parts[2]);
    const code = parts[3].trim().toUpperCase();
    const rate = Number(parts[4].replace(',', '.'));
    if (!/^[A-Z]{3}$/.test(code) || !isFinite(amount) || amount <= 0 || !isFinite(rate) || rate <= 0) continue;
    rates[code] = rate / amount;   // normalise to CZK per 1 unit
  }
  if (!Object.keys(rates).length) throw new Error('No rate rows parsed from ČNB feed');
  return { date, rates };
}

/**
 * Fetch the latest ČNB daily fixing (or a specific date via ?date=DD.MM.YYYY).
 * @param dateIso optional YYYY-MM-DD to backfill a past day
 */
export async function fetchCnbFixing(dateIso?: string): Promise<CnbFixing> {
  let url = CNB_DAILY_URL;
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    const [y, mo, d] = dateIso.split('-');
    url += `?date=${d}.${mo}.${y}`;
  }
  return parseCnbDaily(await fetchText(url));
}

function orgId(db: any): string | null {
  const r = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
  return r?.id ?? null;
}

export interface CnbSyncResult {
  date: string;
  upserted: string[];
  skipped: string[];
}

/**
 * Fetch a fixing and upsert the requested currencies as <CUR>→CZK into
 * finance_exchange_rates (effective_from = fixing date). Idempotent.
 */
export async function syncCnbRates(
  db: any,
  opts: { date?: string; currencies?: string[] } = {},
): Promise<CnbSyncResult> {
  const oid = orgId(db);
  if (!oid) throw new Error('No organization found');
  const want = (opts.currencies || DEFAULT_CNB_CURRENCIES).map(c => c.toUpperCase());

  const fixing = await fetchCnbFixing(opts.date);
  const upsert = db.prepare(`
    INSERT INTO finance_exchange_rates (organization_id, from_currency, to_currency, rate, effective_from)
    VALUES (?, ?, 'CZK', ?, ?)
    ON CONFLICT(organization_id, from_currency, to_currency, effective_from)
    DO UPDATE SET rate = excluded.rate
  `);

  const upserted: string[] = [];
  const skipped: string[] = [];
  const tx = db.transaction(() => {
    for (const cur of want) {
      const rate = fixing.rates[cur];
      if (rate == null) { skipped.push(cur); continue; }
      upsert.run(oid, cur, rate, fixing.date);
      upserted.push(cur);
    }
  });
  tx();

  return { date: fixing.date, upserted, skipped };
}
