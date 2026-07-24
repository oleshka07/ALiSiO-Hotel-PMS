/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Teya transaction reconciliation engine — REPORT ONLY.
//
// IMPORTANT: this engine NEVER writes to fin_operations. In this business the
// only sources of truth for cash movement are (a) the bank statement import and
// (b) manually-entered cash. Teya settles every payment to the bank as a daily
// batch, so recording individual Teya payments as operations would DOUBLE-COUNT
// the same money (400 Teya rows + 1 bank deposit for the same day).
//
// Teya data is used purely to reconcile / cross-check against the bank:
//   - matched: this Teya payment is already present in PMS (webhook 'teia', or a
//     prior import) → nothing to do
//   - new:     present in the Teya export but not yet in PMS — informational only
//     (it will arrive via the bank statement); NOT written anywhere
//   - skipped: transaction status is not SUCCEEDED/REFUNDED → ignore
//

import { listTeyaTransactions, type TeyaTransaction } from '@/modules/payments/domain/teya-client';

export interface ReconcileResult {
  fetched: number;
  matched: number;
  created: number;
  skipped: number;
  errors: number;
  outcomes: Array<{
    txn_id: string;
    status: string;
    amount: number;
    currency: string;
    created_at: string;
    outcome: 'matched' | 'created' | 'skipped' | 'error';
    operation_id?: string;
    message?: string;
  }>;
}

const SUCCESS_STATUSES = new Set(['SUCCEEDED', 'PAID', 'COMPLETED', 'SUCCESS', 'paid']);
const REFUND_STATUSES  = new Set(['REFUNDED', 'PARTIALLY_REFUNDED', 'refunded']);

function findExistingOp(db: any, orgId: string, txnId: string): { id: string } | null {
  // Check webhook ('teia'), API sync ('teya_sync') and CSV import ('teya_csv')
  // sources together — the same payment may arrive via more than one channel and
  // we must never double-count it.
  const row = db.prepare(`
    SELECT id FROM fin_operations
    WHERE organization_id = ?
      AND source IN ('teia', 'teya_sync', 'teya_csv')
      AND source_ref = ?
    LIMIT 1
  `).get(orgId, txnId) as { id: string } | undefined;
  return row || null;
}

/**
 * Rate-limited tick: runs Teya reconciliation if 4 hours have elapsed
 * since last automatic run. Default window = last 48 hours (overlap is
 * fine — matched transactions are skipped).
 *
 * Skipped silently when Teya creds are missing (TEYA_CLIENT_ID empty).
 * Errors logged but never thrown — never blocks getDb() bootstrap.
 */
const TEYA_TICK_INTERVAL_MS = 4 * 3600 * 1000; // 4 hours
const TEYA_TICK_LOOKBACK_DAYS = 2;

export async function runTeyaSyncTickIfDue(db: any): Promise<boolean> {
  if (!process.env.TEYA_CLIENT_ID || !process.env.TEYA_CLIENT_SECRET) {
    return false;
  }

  const lastRow = db.prepare("SELECT value FROM fin_system_state WHERE key = 'last_teya_sync_tick'").get() as { value: string } | undefined;
  const now = Date.now();
  if (lastRow?.value) {
    const last = Number(lastRow.value);
    if (!isNaN(last) && now - last < TEYA_TICK_INTERVAL_MS) return false;
  }

  // Mark immediately so concurrent calls don't double-trigger
  db.prepare("INSERT OR REPLACE INTO fin_system_state (key, value, updated_at) VALUES ('last_teya_sync_tick', ?, datetime('now'))")
    .run(String(now));

  const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!orgRow) return false;

  const today = new Date();
  const fromDate = new Date(today.getTime() - TEYA_TICK_LOOKBACK_DAYS * 24 * 3600 * 1000);
  const from = fromDate.toISOString().substring(0, 10);
  const to = today.toISOString().substring(0, 10);

  // Run async — don't block. Log result via fin_system_state for UI visibility.
  reconcileTeyaTransactions(db, orgRow.id, from, to)
    .then((result) => {
      db.prepare(`
        INSERT OR REPLACE INTO fin_system_state (key, value, updated_at)
        VALUES ('teya_sync_last_run', ?, datetime('now'))
      `).run(JSON.stringify({
        from, to,
        fetched: result.fetched, matched: result.matched,
        created: result.created, skipped: result.skipped, errors: result.errors,
        ran_at: new Date().toISOString(),
        triggered_by: 'auto-tick',
      }));
      if (result.created > 0 || result.errors > 0) {
        console.log(`[Teya tick] window ${from}..${to}: fetched=${result.fetched} matched=${result.matched} created=${result.created} errors=${result.errors}`);
      }
    })
    .catch((e: any) => {
      // Suppress repeated log noise for scope errors that require Teya portal fix
      if (e.message?.includes('invalid_scope') || e.message?.includes('No valid scope')) {
        if (!runTeyaSyncTickIfDue._scopeWarned) {
          console.warn('[Teya tick] OAuth scope error (will not repeat):', e.message,
            '\n  → Add "transactions/list" scope in Teya developer portal to enable auto-reconciliation.');
          runTeyaSyncTickIfDue._scopeWarned = true;
        }
      } else {
        console.log('[Teya tick] error:', e.message);
      }
    });

  return true;
}
runTeyaSyncTickIfDue._scopeWarned = false as boolean;

/**
 * Pulls transactions from Teya and reconciles against fin_operations.
 * Loops through pagination cursors until exhausted (capped at 50 pages /
 * 25k records as a safety net).
 */
export async function reconcileTeyaTransactions(
  db: any,
  orgId: string,
  fromDate: string,
  toDate: string,
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    fetched: 0, matched: 0, created: 0, skipped: 0, errors: 0, outcomes: [],
  };

  let cursor: string | null = null;
  let pageCount = 0;
  const MAX_PAGES = 50;

  do {
    let page;
    try {
      page = await listTeyaTransactions({
        from: fromDate,
        to: toDate,
        cursor: cursor || undefined,
        limit: 200,
      });
    } catch (e: any) {
      result.errors++;
      result.outcomes.push({
        txn_id: '', status: 'ERROR', amount: 0, currency: '', created_at: '',
        outcome: 'error', message: e.message,
      });
      throw e; // propagate so handler returns 500 with error
    }

    for (const txn of page.transactions) {
      result.fetched++;
      reconcileSingleTransaction(db, orgId, txn, result);
    }

    cursor = page.next_cursor;
    pageCount++;
  } while (cursor && pageCount < MAX_PAGES);

  return result;
}

function reconcileSingleTransaction(
  db: any,
  orgId: string,
  txn: TeyaTransaction,
  result: ReconcileResult,
): void {
  // Skip non-success transactions (PENDING, FAILED, CANCELLED). Only
  // SUCCEEDED/REFUNDED rows are counted in the reconcile summary.
  const isSuccess = SUCCESS_STATUSES.has(txn.status);
  const isRefund = REFUND_STATUSES.has(txn.status) || txn.type === 'REFUND';

  if (!isSuccess && !isRefund) {
    result.skipped++;
    result.outcomes.push({
      txn_id: txn.id, status: txn.status, amount: txn.amount, currency: txn.currency,
      created_at: txn.created_at, outcome: 'skipped',
      message: `Status ${txn.status} — only SUCCEEDED/REFUNDED imported`,
    });
    return;
  }

  if (!txn.id) {
    result.errors++;
    result.outcomes.push({
      txn_id: '', status: txn.status, amount: txn.amount, currency: txn.currency,
      created_at: txn.created_at, outcome: 'error',
      message: 'No transaction ID in Teya response',
    });
    return;
  }

  const existing = findExistingOp(db, orgId, txn.id);
  if (existing) {
    result.matched++;
    result.outcomes.push({
      txn_id: txn.id, status: txn.status, amount: txn.amount, currency: txn.currency,
      created_at: txn.created_at, outcome: 'matched', operation_id: existing.id,
    });
    return;
  }

  // Not yet in PMS. REPORT ONLY — never write to fin_operations. This money
  // will land via the bank statement; recording it here would double-count it.
  // `created` counts these "new / not-yet-in-bank" rows for the reconcile summary.
  result.created++;
  result.outcomes.push({
    txn_id: txn.id, status: txn.status, amount: txn.amount, currency: txn.currency,
    created_at: txn.created_at, outcome: 'created',
    message: 'Є в Teya, ще немає в банк-виписці (звірка, не записано)',
  });
}

// ─── CSV import path (Teya Transactions export) ──────────────────────────────
//
// The Teya CSV export carries no transaction id, so each row is keyed by a
// synthetic stable hash (see teya-csv-parser). REPORT ONLY, same as the API
// path: classify each row as matched (already in PMS) or new (not yet in the
// bank statement) — nothing is written to fin_operations.

export interface TeyaCsvTxn {
  id: string;            // synthetic stable hash — dedup key
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  type?: string;         // SALE | REFUND
  description?: string;
  reference?: string;    // email/phone from the Pay-by-Link columns, for later matching
}

export function reconcileTeyaCsvRows(db: any, orgId: string, rows: TeyaCsvTxn[]): ReconcileResult {
  const result: ReconcileResult = { fetched: 0, matched: 0, created: 0, skipped: 0, errors: 0, outcomes: [] };
  for (const r of rows) {
    result.fetched++;
    reconcileSingleTransaction(db, orgId, r as unknown as TeyaTransaction, result);
  }
  return result;
}
