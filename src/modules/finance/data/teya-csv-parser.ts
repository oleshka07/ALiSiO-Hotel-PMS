/**
 * ALiSiO PMS — parser for the Teya "Transactions" CSV/Excel export.
 *
 * Expected header (columns may be reordered; we match by name):
 *   Date, Store name, Payment context, Device ID, Status, Payment type, Sales,
 *   Teya fee, …, Total fees, Pay by Link Email, Pay by Link Phone,
 *   Settlement status
 *
 * The export carries NO transaction id, so each row gets a synthetic stable
 * hash (Date|Device|Sales|email|phone|type) used for dedup on re-import.
 */
import crypto from 'crypto';
import type { TeyaCsvTxn } from './teya-reconcile-engine';

const SUCCESS = new Set(['approved', 'settled', 'paid', 'succeeded', 'successful', 'success', 'completed', 'captured']);

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if ((c === ',' || c === ';' || c === '\t') && !q) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseAmount(s: string): number {
  if (!s) return 0;
  // Keep sign, drop currency symbols/spaces; normalise decimal comma.
  let v = s.replace(/[^\d.,-]/g, '').trim();
  if (v.includes(',') && v.includes('.')) v = v.replace(/,/g, '');        // 1,234.56
  else if (v.includes(',')) v = v.replace(',', '.');                      // 1234,56
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

/** Normalise a Teya date cell to ISO ("2026-05-31" or "2026-05-31T12:34:56"). */
function parseDate(s: string): string {
  if (!s) return '';
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2}:\d{2}(:\d{2})?)?/);
  if (m) return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}` : `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})[ T]?(\d{2}:\d{2}(:\d{2})?)?/); // DD/MM/YYYY
  if (m) {
    const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return m[4] ? `${d}T${m[4]}` : d;
  }
  return t;
}

export interface TeyaCsvParseResult {
  rows: TeyaCsvTxn[];
  total: number;
  skipped: number;   // non-success rows ignored
}

/**
 * Parse the Teya CSV export into reconcilable rows.
 * @param text CSV body
 * @param currency the export is per-store and has no currency column, so the
 *   caller supplies it (default CZK).
 */
export function parseTeyaCsv(text: string, currency = 'CZK'): TeyaCsvParseResult {
  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim().length);
  if (lines.length < 2) return { rows: [], total: 0, skipped: 0 };

  const headers = splitCsvLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const col = (name: string) => headers.findIndex(h => h === name.toLowerCase());
  const iDate    = col('Date');
  const iDevice  = col('Device ID');
  const iStatus  = col('Status');
  const iType    = col('Payment type');
  const iSales   = col('Sales');
  const iEmail   = col('Pay by Link Email');
  const iPhone   = col('Pay by Link Phone');
  const iSettle  = col('Settlement status');

  if (iDate === -1 || iSales === -1 || iStatus === -1) {
    throw new Error('Не схоже на експорт транзакцій Teya (немає колонок Date/Sales/Status).');
  }

  const rows: TeyaCsvTxn[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const statusRaw = (c[iStatus] || '').trim();
    const status = statusRaw.toLowerCase();
    const sales = parseAmount(c[iSales] || '0');
    if (!sales) { skipped++; continue; }

    const isRefund = status.includes('refund') || status.includes('chargeback') || sales < 0;
    if (!SUCCESS.has(status) && !isRefund) { skipped++; continue; }

    const date = parseDate(c[iDate] || '');
    const device = (iDevice >= 0 ? c[iDevice] : '') || '';
    const email = (iEmail >= 0 ? c[iEmail] : '') || '';
    const phone = (iPhone >= 0 ? c[iPhone] : '') || '';
    const ptype = (iType >= 0 ? c[iType] : '') || '';
    const settle = (iSettle >= 0 ? c[iSettle] : '') || '';

    const hash = crypto.createHash('sha256')
      .update([date, device, sales.toFixed(2), email, phone, ptype].join('|'))
      .digest('hex').slice(0, 24);

    const refBits = [email, phone].filter(Boolean).join(' / ');
    rows.push({
      id: `csv_${hash}`,
      status: isRefund ? 'REFUNDED' : 'SUCCEEDED',
      amount: Math.abs(sales),
      currency,
      created_at: date || new Date().toISOString().slice(0, 10),
      type: isRefund ? 'REFUND' : 'SALE',
      description: `Teya ${ptype || 'platba'}${refBits ? ` — ${refBits}` : ''}${settle ? ` [${settle}]` : ''}`.trim(),
      reference: refBits || undefined,
    });
  }
  return { rows, total: rows.length, skipped };
}
