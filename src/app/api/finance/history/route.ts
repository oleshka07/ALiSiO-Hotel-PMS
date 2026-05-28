/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

/**
 * GET /api/finance/history
 *
 * Returns ALL audit entries across all operations from `fin_operation_audit`.
 * Enriches each row with live operation data (LEFT JOIN) or, when the
 * operation has been deleted, extracts amount/currency/comment from the
 * stored before_json / after_json snapshot.
 *
 * Query params:
 *   page   – pagination page (default 1)
 *   limit  – rows per page (default 50, max 500)
 *   from   – performed_at >= date  (e.g. 2026-05-01)
 *   to     – performed_at <= date  (e.g. 2026-05-31)
 *   action – create | update | delete | convert
 *   user   – partial match on user_name
 *   search – searches in before_json, after_json, user_name
 */
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const sp = request.nextUrl.searchParams;

    const page  = Math.max(1, parseInt(sp.get('page')  || '1',  10));
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') || '50', 10)));
    const from   = sp.get('from');
    const to     = sp.get('to');
    const action = sp.get('action');
    const user   = sp.get('user');
    const search = sp.get('search');

    const VALID_ACTIONS = ['create', 'update', 'delete', 'convert'];

    const where: string[] = [];
    const params: any[] = [];

    if (from) {
      where.push('a.performed_at >= ?');
      params.push(from);
    }
    if (to) {
      // Include the entire "to" day — compare with next-day boundary
      where.push('a.performed_at < datetime(?, \'+1 day\')');
      params.push(to);
    }
    if (action && VALID_ACTIONS.includes(action)) {
      where.push('a.action = ?');
      params.push(action);
    }
    if (user) {
      where.push('a.user_name LIKE ?');
      params.push(`%${user}%`);
    }
    if (search) {
      where.push('(a.before_json LIKE ? OR a.after_json LIKE ? OR a.user_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Count
    const totalRow = db.prepare(
      `SELECT COUNT(*) AS n FROM fin_operation_audit a ${whereSql}`
    ).get(...params) as { n: number };

    // Fetch audit rows with LEFT JOIN to live operation + account
    const rows = db.prepare(`
      SELECT
        a.id,
        a.operation_id,
        a.action,
        a.user_id,
        a.user_name,
        a.before_json,
        a.after_json,
        a.performed_at,
        o.amount       AS live_amount,
        o.currency     AS live_currency,
        o.op_type      AS live_op_type,
        o.comment      AS live_comment,
        o.account_to_id   AS live_account_to_id,
        o.account_from_id AS live_account_from_id,
        acc_to.name    AS live_account_to_name,
        acc_from.name  AS live_account_from_name
      FROM fin_operation_audit a
      LEFT JOIN fin_operations    o        ON o.id      = a.operation_id
      LEFT JOIN finance_accounts  acc_to   ON acc_to.id = o.account_to_id
      LEFT JOIN finance_accounts  acc_from ON acc_from.id = o.account_from_id
      ${whereSql}
      ORDER BY a.performed_at DESC, a.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit) as any[];

    // Enrich: prefer live data, fall back to JSON snapshots for deleted ops
    const items = rows.map((r: any) => {
      let opAmount:  number | null = r.live_amount  ?? null;
      let opCurrency: string | null = r.live_currency ?? null;
      let opType:    string | null = r.live_op_type  ?? null;
      let opComment: string | null = r.live_comment  ?? null;
      let accountName: string | null = null;

      // Determine account name from live data
      if (r.live_account_to_name || r.live_account_from_name) {
        accountName = r.live_account_to_name || r.live_account_from_name;
      }

      // Fall back to JSON snapshots when the live operation is gone
      if (opAmount === null) {
        const snapshot = tryParseJson(r.after_json) || tryParseJson(r.before_json);
        if (snapshot) {
          opAmount   = snapshot.amount   ?? null;
          opCurrency = snapshot.currency ?? null;
          opType     = snapshot.op_type  ?? null;
          opComment  = snapshot.comment  ?? null;

          // Try to resolve account name from snapshot's account IDs
          if (!accountName) {
            const accId = snapshot.account_to_id || snapshot.account_from_id;
            if (accId) {
              const accRow = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(accId) as { name: string } | undefined;
              if (accRow) accountName = accRow.name;
            }
          }
        }
      }

      return {
        id:           r.id,
        operation_id: r.operation_id,
        action:       r.action,
        user_id:      r.user_id,
        user_name:    r.user_name,
        before_json:  r.before_json,
        after_json:   r.after_json,
        performed_at: r.performed_at,
        op_amount:    opAmount,
        op_currency:  opCurrency,
        op_type:      opType,
        op_comment:   opComment,
        account_name: accountName,
      };
    });

    return NextResponse.json({ items, total: totalRow.n, page, limit });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function tryParseJson(str: string | null): any | null {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}
