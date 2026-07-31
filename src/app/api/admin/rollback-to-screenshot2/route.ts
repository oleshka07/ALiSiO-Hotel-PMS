/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function GET() {
  try {
    const db = getDb();

    // 1. Знаходимо та видаляємо нові операції, створені сьогодні з виписок 31.07
    const newOpIds = db.prepare(`
      SELECT id FROM fin_operations
      WHERE source = 'bank_import'
        AND (source_ref LIKE '%3107%' OR created_at >= '2026-07-31 18:00:00')
    `).all().map((r: any) => r.id);

    if (newOpIds.length > 0) {
      db.pragma('foreign_keys = OFF');
      const ph = newOpIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM fin_operation_tags WHERE operation_id IN (${ph})`).run(...newOpIds);
      db.prepare(`DELETE FROM fin_operation_audit WHERE operation_id IN (${ph})`).run(...newOpIds);
      db.prepare(`DELETE FROM fin_operations WHERE id IN (${ph})`).run(...newOpIds);
      db.pragma('foreign_keys = ON');
    }

    // 2. Для всіх існуючих операцій відновлюємо знімок ДО початку нашої сесії (performed_at < '2026-07-31 18:00:00')
    const preSessionAudits = db.prepare(`
      SELECT a1.operation_id, a1.after_json
      FROM fin_operation_audit a1
      INNER JOIN (
        SELECT operation_id, MAX(id) as max_id
        FROM fin_operation_audit
        WHERE performed_at < '2026-07-31 18:00:00'
        GROUP BY operation_id
      ) a2 ON a1.operation_id = a2.operation_id AND a1.id = a2.max_id
      WHERE a1.after_json IS NOT NULL
    `).all() as any[];

    let restoredCount = 0;
    const updateStmt = db.prepare(`
      UPDATE fin_operations
      SET account_to_id = ?,
          account_from_id = ?,
          op_type = ?,
          amount = ?,
          currency = ?,
          paid_at = ?
      WHERE id = ?
    `);

    db.transaction(() => {
      for (const audit of preSessionAudits) {
        try {
          const snapshot = JSON.parse(audit.after_json);
          if (snapshot && snapshot.id) {
            updateStmt.run(
              snapshot.account_to_id || null,
              snapshot.account_from_id || null,
              snapshot.op_type || 'expense',
              snapshot.amount || 0,
              snapshot.currency || 'CZK',
              snapshot.paid_at || null,
              snapshot.id
            );
            restoredCount++;
          }
        } catch { /* ignore */ }
      }
    })();

    // 3. Обчислюємо нові точні баланси рахунків
    const accounts = db.prepare(`SELECT * FROM finance_accounts ORDER BY sort_order ASC, name ASC`).all() as any[];
    const balances = accounts.map(acct => {
      const incRow = db.prepare(`
        SELECT COALESCE(SUM(
          CASE
            WHEN o.op_type = 'transfer' AND o.currency_to IS NOT NULL AND o.currency_to = ? THEN COALESCE(o.amount_to, o.amount)
            WHEN o.currency = ? THEN o.amount
            ELSE o.amount_company
          END
        ), 0) as total
        FROM fin_operations o
        WHERE o.account_to_id = ? AND o.status = 'completed'
      `).get(acct.currency, acct.currency, acct.id) as any;

      const expRow = db.prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END
        ), 0) as total
        FROM fin_operations o
        WHERE o.account_from_id = ? AND o.status = 'completed'
      `).get(acct.currency, acct.id) as any;

      const currentBalance = (Number(acct.initial_balance || 0) + Number(incRow.total) - Number(expRow.total)).toFixed(2);

      return {
        name: acct.name,
        currency: acct.currency,
        initial_balance: acct.initial_balance,
        current_balance: `${currentBalance} ${acct.currency}`
      };
    });

    return NextResponse.json({
      ok: true,
      deletedNewOperations: newOpIds.length,
      restoredOperationsCount: restoredCount,
      accountBalances: balances
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
