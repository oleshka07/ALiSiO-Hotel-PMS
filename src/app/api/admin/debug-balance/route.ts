/**
 * Temporary debug endpoint: GET /api/admin/debug-balance?account=Олег наличные&from=2026-01-20&to=2026-01-25
 * Shows all operations on an account between dates with running balance
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const orgRow = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
    const orgId = orgRow?.id;
    if (!orgId) return NextResponse.json({ error: 'No org' }, { status: 400 });

    const sp = request.nextUrl.searchParams;
    const accountName = sp.get('account') || 'Олег наличные';
    const from = sp.get('from') || '2026-01-20';
    const to = sp.get('to') || '2026-01-25';

    const acct = db.prepare(
      "SELECT id, name, currency, initial_balance FROM finance_accounts WHERE name = ? AND org_id = ?"
    ).get(accountName, orgId) as any;

    if (!acct) {
      return NextResponse.json({ error: `Account "${accountName}" not found` }, { status: 404 });
    }

    // Opening balance = initial + all ops before 'from'
    const beforeRow = db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN account_to_id = ? THEN (CASE WHEN currency = ? THEN amount ELSE amount_company END)
          WHEN account_from_id = ? THEN -(CASE WHEN currency = ? THEN amount ELSE amount_company END)
        END
      ), 0) as total
      FROM fin_operations
      WHERE (account_to_id = ? OR account_from_id = ?)
        AND status = 'completed'
        AND paid_at < ?
    `).get(acct.id, acct.currency, acct.id, acct.currency, acct.id, acct.id, from) as any;

    const opening = Number(acct.initial_balance || 0) + Number(beforeRow.total);

    // All ops in range
    const ops = db.prepare(`
      SELECT o.id, o.op_type, o.paid_at, o.amount, o.currency, o.amount_company,
        CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END AS effective_amount,
        o.account_from_id, o.account_to_id, o.comment, o.source,
        afr.name AS from_name, ato.name AS to_name
      FROM fin_operations o
      LEFT JOIN finance_accounts afr ON afr.id = o.account_from_id
      LEFT JOIN finance_accounts ato ON ato.id = o.account_to_id
      WHERE (o.account_to_id = ? OR o.account_from_id = ?)
        AND o.status = 'completed'
        AND o.paid_at >= ? AND o.paid_at <= ?
      ORDER BY o.paid_at ASC, o.created_at ASC
    `).all(acct.currency, acct.id, acct.id, from, to) as any[];

    let running = opening;
    const rows = ops.map((op: any) => {
      const amt = Number(op.effective_amount || 0);
      const direction = op.account_to_id === acct.id ? 'IN' : 'OUT';
      if (op.account_to_id === acct.id) running += amt;
      if (op.account_from_id === acct.id) running -= amt;
      return {
        date: op.paid_at?.substring(0, 10),
        direction,
        type: op.op_type,
        amount: amt,
        original_amount: op.amount,
        original_currency: op.currency,
        amount_company: op.amount_company,
        balance_after: +running.toFixed(2),
        source: op.source,
        comment: (op.comment || '').substring(0, 80),
        from_account: op.from_name,
        to_account: op.to_name,
        id: op.id,
      };
    });

    return NextResponse.json({
      account: acct.name,
      currency: acct.currency,
      initial_balance: acct.initial_balance,
      opening_balance: +opening.toFixed(2),
      date_range: { from, to },
      operations_count: rows.length,
      operations: rows,
      final_balance: rows.length > 0 ? rows[rows.length - 1].balance_after : opening,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
