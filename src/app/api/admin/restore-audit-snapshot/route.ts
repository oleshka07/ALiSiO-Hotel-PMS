/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function GET() {
  try {
    const db = getDb();

    // 1. Отримуємо НАЙОСТАННІШИЙ користувацький знімок (MAX id) для кожної операції з fin_operation_audit
    const latestAudits = db.prepare(`
      SELECT a1.operation_id, a1.after_json, a1.action, a1.performed_at
      FROM fin_operation_audit a1
      INNER JOIN (
        SELECT operation_id, MAX(id) as max_id
        FROM fin_operation_audit
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
      for (const audit of latestAudits) {
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

    // 2. Закріплюємо виписки 31.07 за KB Restaurante
    const restauranteAccount = db.prepare(`
      SELECT id FROM finance_accounts
      WHERE name LIKE '%Restaurante%' OR id = 'acct_kb_restaurante'
      LIMIT 1
    `).get() as any;

    let res3107Changes = 0;
    if (restauranteAccount) {
      const res3107 = db.prepare(`
        UPDATE fin_operations
        SET account_to_id = CASE WHEN op_type = 'income' THEN ? ELSE account_to_id END,
            account_from_id = CASE WHEN op_type = 'expense' THEN ? ELSE account_from_id END
        WHERE source = 'bank_import'
          AND (source_ref LIKE '%3107%' OR comment LIKE '%131-4361940207%' OR comment LIKE '%4361940207%')
      `).run(restauranteAccount.id, restauranteAccount.id);
      res3107Changes = res3107.changes;
    }

    // 3. Підраховуємо поточні баланси
    const accounts = db.prepare(`SELECT * FROM finance_accounts ORDER BY sort_order ASC, name ASC`).all() as any[];
    const balances = accounts.map(acct => {
      const incRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM fin_operations
        WHERE account_to_id = ? AND status = 'completed'
      `).get(acct.id) as any;

      const expRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM fin_operations
        WHERE account_from_id = ? AND status = 'completed'
      `).get(acct.id) as any;

      const currentBalance = (Number(acct.initial_balance || 0) + Number(incRow.total) - Number(expRow.total)).toFixed(2);

      return {
        name: acct.name,
        currency: acct.currency,
        current_balance: `${currentBalance} ${acct.currency}`
      };
    });

    return NextResponse.json({
      ok: true,
      restoredOperationsCount: restoredCount,
      updated3107Count: res3107Changes,
      accountBalances: balances
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
