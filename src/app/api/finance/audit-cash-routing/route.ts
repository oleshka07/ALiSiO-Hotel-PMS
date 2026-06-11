/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

/**
 * GET /api/finance/audit-cash-routing
 * Returns all cash/manual operations from the last N days with audit info,
 * highlighting misrouted ones.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Allow access via cron secret (same as other internal endpoints)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get('x-cron-secret')
      || new URL(request.url).searchParams.get('secret');
    if (provided !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized — session required' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(Number(searchParams.get('days') || '14'), 60);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

  const db = getDb();

  // Cash accounts
  const cashAccounts = db.prepare(`
    SELECT a.id, a.name, a.type, a.currency, a.sort_order
    FROM finance_accounts a
    WHERE a.is_active = 1 AND a.type = 'cash'
    ORDER BY a.sort_order
  `).all() as any[];

  // Users + default_cash_account_id
  let users: any[] = [];
  try {
    users = db.prepare(`
      SELECT u.id, u.full_name, u.role, u.default_cash_account_id,
             a.name AS default_account_name
      FROM app_users u
      LEFT JOIN finance_accounts a ON a.id = u.default_cash_account_id
    `).all();
  } catch {
    users = db.prepare('SELECT id, full_name, role FROM app_users').all();
  }

  // Build user→account map from default_cash_account_id + name heuristics
  const userAccountMap: Record<string, { acctId: string; acctName: string }> = {};
  for (const u of users as any[]) {
    if (u.default_cash_account_id) {
      userAccountMap[u.id] = { acctId: u.default_cash_account_id, acctName: u.default_account_name || '?' };
    }
  }

  // All cash/manual operations since N days
  const ops = db.prepare(`
    SELECT o.id, o.op_type, o.amount, o.currency, o.paid_at, o.comment, o.source,
           o.reservation_id, o.method, o.payment_subtype, o.created_by,
           COALESCE(o.account_to_id, o.account_from_id) AS acct_id,
           a.name AS account_name,
           aud.user_name AS audit_user, aud.user_id AS audit_user_id, aud.performed_at AS audit_at
    FROM fin_operations o
    LEFT JOIN finance_accounts a ON a.id = COALESCE(o.account_to_id, o.account_from_id)
    LEFT JOIN fin_operation_audit aud ON aud.operation_id = o.id AND aud.action = 'create'
    WHERE o.source IN ('manual', 'booking_widget')
      AND date(o.paid_at) >= ?
    ORDER BY o.paid_at DESC
  `).all(since) as any[];

  const results: any[] = [];
  let misroutedCount = 0;

  for (const op of ops) {
    const expected = op.audit_user_id ? userAccountMap[op.audit_user_id] : null;
    const isMisrouted = expected && op.acct_id !== expected.acctId;
    if (isMisrouted) misroutedCount++;

    results.push({
      id: op.id,
      amount: op.amount,
      currency: op.currency,
      paid_at: op.paid_at,
      method: op.method,
      source: op.source,
      subtype: op.payment_subtype,
      comment: op.comment,
      reservation_id: op.reservation_id,
      account: op.account_name,
      account_id: op.acct_id,
      created_by: op.audit_user || op.created_by || 'UNKNOWN',
      created_by_id: op.audit_user_id || op.created_by || null,
      audit_at: op.audit_at,
      misrouted: !!isMisrouted,
      expected_account: isMisrouted ? expected.acctName : null,
      expected_account_id: isMisrouted ? expected.acctId : null,
    });
  }

  return NextResponse.json({
    since,
    total: results.length,
    misrouted_count: misroutedCount,
    cash_accounts: cashAccounts.map((a: any) => ({ id: a.id, name: a.name, currency: a.currency })),
    users: (users as any[]).map((u: any) => ({
      id: u.id, name: u.full_name, role: u.role,
      default_account: u.default_account_name || null,
    })),
    operations: results,
  });
}
