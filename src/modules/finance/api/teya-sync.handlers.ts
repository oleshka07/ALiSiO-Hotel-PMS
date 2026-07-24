/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { reconcileTeyaTransactions, reconcileTeyaCsvRows } from '../data/teya-reconcile-engine';
import { parseTeyaCsv } from '../data/teya-csv-parser';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

/**
 * POST /api/finance/teya/sync
 * Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 * Defaults: last 7 days.
 *
 * Pulls transactions from Teya for the given window and reconciles against
 * existing fin_operations. Returns summary counts + per-row outcomes.
 */
export async function syncTeyaTransactions(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json().catch(() => ({}));

    const today = new Date().toISOString().substring(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().substring(0, 10);
    const from = (body.from as string) || sevenDaysAgo;
    const to = (body.to as string) || today;

    const result = await reconcileTeyaTransactions(db, orgId, from, to);

    // Persist a sync log entry (last_at, last_result) in fin_system_state
    db.prepare(`
      INSERT OR REPLACE INTO fin_system_state (key, value, updated_at)
      VALUES ('teya_sync_last_run', ?, datetime('now'))
    `).run(JSON.stringify({
      from, to,
      fetched: result.fetched, matched: result.matched,
      created: result.created, skipped: result.skipped, errors: result.errors,
      ran_at: new Date().toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      from, to,
      fetched: result.fetched,
      matched: result.matched,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
      outcomes: result.outcomes.slice(0, 200), // cap response payload
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      hint: error.message?.includes('transactions/list')
        ? 'Add OAuth scope `transactions/list` to your Teya app and retry.'
        : undefined,
    }, { status: 500 });
  }
}

/**
 * GET /api/finance/teya/sync — returns last sync metadata (date range,
 * counts, when it ran). For UI status display.
 */
/**
 * POST /api/finance/teya/import-csv  (multipart: file, currency?)
 *
 * Reconciles a Teya "Transactions" CSV/Excel export against fin_operations —
 * the fallback path when the API can't list terminal transactions. Terminal /
 * link payments that never reached PMS are created as needs_review operations
 * (source='teya_csv'); re-imports are idempotent (synthetic per-row hash).
 */
export async function importTeyaCsv(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const form = await request.formData();
    const file = form.get('file');
    const currency = ((form.get('currency') as string) || 'CZK').toUpperCase();
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'CSV файл не надано (поле "file").' }, { status: 400 });
    }
    const text = await (file as File).text();
    const parsed = parseTeyaCsv(text, currency);
    if (!parsed.total) {
      return NextResponse.json({ error: 'У файлі не знайдено підтверджених транзакцій.' }, { status: 400 });
    }
    const result = reconcileTeyaCsvRows(db, orgId, parsed.rows);
    const gross = parsed.rows.reduce((s, r) => s + Math.abs(r.amount || 0), 0);

    db.prepare(`
      INSERT OR REPLACE INTO fin_system_state (key, value, updated_at)
      VALUES ('teya_csv_last_import', ?, datetime('now'))
    `).run(JSON.stringify({
      currency, parsedRows: parsed.total, skippedRows: parsed.skipped, gross,
      fetched: result.fetched, matched: result.matched, newRows: result.created,
      errors: result.errors, ran_at: new Date().toISOString(),
    }));

    // REPORT ONLY — nothing was written to operations. Cash comes from the bank
    // statement; Teya settles to the bank so recording it here would double-count.
    return NextResponse.json({
      ok: true, currency,
      reconcileOnly: true,
      note: 'Звірка: нічого не записано в операції. Гроші приходять з банк-виписки.',
      parsedRows: parsed.total, skippedRows: parsed.skipped,
      grossTotal: gross,
      matched: result.matched, newRows: result.created, errors: result.errors,
      outcomes: result.outcomes.slice(0, 500),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Teya CSV import]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function getTeyaSyncStatus(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value, updated_at FROM fin_system_state WHERE key = 'teya_sync_last_run'").get() as any;
    if (!row) return NextResponse.json({ never_run: true });
    let parsed: any = {};
    try { parsed = JSON.parse(row.value); } catch { /* ignore */ }
    return NextResponse.json({ ...parsed, updated_at: row.updated_at });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/teya/coverage?from=...&to=...
 * Quick coverage check — counts fin_operations from Teya sources for the
 * given window. Used by the UI to show "we have X Teya operations" vs
 * what the Teya dashboard reports.
 */
export async function getTeyaCoverage(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const today = new Date().toISOString().substring(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().substring(0, 10);
    const from = sp.get('from') || sevenDaysAgo;
    const to = sp.get('to') || today;

    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN source = 'teia' THEN 1 ELSE 0 END) AS webhook_count,
        SUM(CASE WHEN source = 'teya_sync' THEN 1 ELSE 0 END) AS sync_count,
        COALESCE(SUM(CASE WHEN op_type = 'income'  THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN op_type = 'expense' THEN amount ELSE 0 END), 0) AS total_refunds,
        currency
      FROM fin_operations
      WHERE organization_id = ?
        AND source IN ('teia', 'teya_sync')
        AND paid_at >= ? AND paid_at <= ? || ' 23:59:59'
      GROUP BY currency
    `).all(orgId, from, to) as any[];

    return NextResponse.json({ from, to, by_currency: row });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
