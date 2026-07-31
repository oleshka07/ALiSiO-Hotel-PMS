/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function GET() {
  try {
    const db = getDb();

    // 1. Отримуємо аудит створюваних операцій
    const auditEntries = db.prepare(`
      SELECT operation_id, after_json FROM fin_operation_audit
      WHERE action = 'create' AND after_json IS NOT NULL
    `).all() as any[];

    let restored = 0;
    const updateStmt = db.prepare(`
      UPDATE fin_operations
      SET account_to_id = ?, account_from_id = ?
      WHERE id = ?
    `);

    for (const entry of auditEntries) {
      try {
        const orig = JSON.parse(entry.after_json);
        if (orig && orig.id) {
          updateStmt.run(
            orig.account_to_id || null,
            orig.account_from_id || null,
            orig.id
          );
          restored++;
        }
      } catch { /* ignore */ }
    }

    // 2. Знаходимо рахунок KB Restaurante
    const restauranteAccount = db.prepare(`
      SELECT id FROM finance_accounts
      WHERE name LIKE '%Restaurante%' OR id = 'acct_kb_restaurante'
      LIMIT 1
    `).get() as any;

    let updated3107Count = 0;
    if (restauranteAccount) {
      // Прив'язуємо ТІЛЬКИ операції з виписок 31.07 (source_ref містить 3107 або IBAN 1314361940207)
      const res = db.prepare(`
        UPDATE fin_operations
        SET account_to_id = CASE WHEN op_type = 'income' THEN ? ELSE account_to_id END,
            account_from_id = CASE WHEN op_type = 'expense' THEN ? ELSE account_from_id END
        WHERE source = 'bank_import'
          AND (source_ref LIKE '%3107%' OR comment LIKE '%131-4361940207%' OR comment LIKE '%4361940207%')
      `).run(restauranteAccount.id, restauranteAccount.id);
      updated3107Count = res.changes;
    }

    // 3. Підраховуємо та повертаємо нові баланси
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
      restoredOperations: restored,
      updated3107Operations: updated3107Count,
      accountBalances: balances,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
