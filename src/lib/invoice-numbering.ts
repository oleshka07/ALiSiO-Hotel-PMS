/**
 * ALiSiO PMS — per-channel invoice numbering + monthly period locking.
 *
 * Series (each its own sequence):
 *   booking → BKG-YYYY-NNN
 *   airbnb  → AIR-YYYY-NNN
 *   teya    → TEYA-YYYY-NNN
 *   cash / house (direct) → YYYY-NNN  (HOUSE series, no prefix)
 *
 * A (series, month) period is "open" until the operator locks it at the monthly
 * export. While open, invoices in it can be freely deleted/renumbered. Once
 * locked, numbers are frozen — corrections must go through a storno (credit note).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

interface SeriesDef { series: string; prefix: string; }

const SERIES: Record<string, SeriesDef> = {
  booking: { series: 'BKG',   prefix: 'BKG-' },
  airbnb:  { series: 'AIR',   prefix: 'AIR-' },
  teya:    { series: 'TEYA',  prefix: 'TEYA-' },
  cash:    { series: 'HOUSE', prefix: '' },
  house:   { series: 'HOUSE', prefix: '' },
};

export function seriesForChannel(channel?: string | null): SeriesDef {
  return SERIES[(channel || 'house').toLowerCase()] || SERIES.house;
}

export interface AllocatedNumber { invoiceNumber: string; series: string; seqNo: number; }

/**
 * Allocate the next invoice number for a channel + year, atomically. Wrapped in
 * a better-sqlite3 transaction (synchronous, single-writer) so concurrent
 * requests can never get the same number.
 */
export function allocateInvoiceNumber(db: any, channel: string, year: number): AllocatedNumber {
  const { series, prefix } = seriesForChannel(channel);
  const run = db.transaction(() => {
    db.prepare(
      'INSERT INTO invoice_counters (series, year, last_no) VALUES (?, ?, 1) ' +
      'ON CONFLICT(series, year) DO UPDATE SET last_no = last_no + 1'
    ).run(series, year);
    const row = db.prepare('SELECT last_no FROM invoice_counters WHERE series = ? AND year = ?')
      .get(series, year) as { last_no: number };
    return row.last_no;
  });
  const seqNo = run();
  return { invoiceNumber: `${prefix}${year}-${String(seqNo).padStart(3, '0')}`, series, seqNo };
}

export function periodStatus(db: any, series: string, month: string): 'open' | 'locked' {
  const row = db.prepare('SELECT status FROM invoice_periods WHERE series = ? AND month = ?')
    .get(series, month) as { status: string } | undefined;
  return (row?.status === 'locked') ? 'locked' : 'open';
}

export function isPeriodLocked(db: any, series: string, month: string): boolean {
  return periodStatus(db, series, month) === 'locked';
}

/** Lock a (series, month): freeze numbers and mark member invoices immutable. */
export function lockPeriod(db: any, series: string, month: string): void {
  db.transaction(() => {
    db.prepare(
      "INSERT INTO invoice_periods (series, month, status, locked_at) VALUES (?, ?, 'locked', datetime('now')) " +
      "ON CONFLICT(series, month) DO UPDATE SET status = 'locked', locked_at = datetime('now')"
    ).run(series, month);
    db.prepare(
      "UPDATE invoices SET locked = 1 WHERE series = ? AND substr(COALESCE(period, issued_at), 1, 7) = ?"
    ).run(series, month);
  })();
}

/** Re-open a locked period (admin correction before it's been filed). */
export function unlockPeriod(db: any, series: string, month: string): void {
  db.transaction(() => {
    db.prepare(
      "INSERT INTO invoice_periods (series, month, status) VALUES (?, ?, 'open') " +
      "ON CONFLICT(series, month) DO UPDATE SET status = 'open', locked_at = NULL"
    ).run(series, month);
    db.prepare(
      "UPDATE invoices SET locked = 0 WHERE series = ? AND substr(COALESCE(period, issued_at), 1, 7) = ?"
    ).run(series, month);
  })();
}

/** True when this invoice may no longer be edited/deleted (period locked). */
export function isInvoiceLocked(db: any, invoiceId: string): boolean {
  const row = db.prepare(
    'SELECT series, COALESCE(period, substr(issued_at,1,7)) AS month, locked FROM invoices WHERE id = ?'
  ).get(invoiceId) as { series: string; month: string; locked: number } | undefined;
  if (!row) return false;
  if (row.locked) return true;
  return isPeriodLocked(db, row.series || 'HOUSE', row.month);
}
