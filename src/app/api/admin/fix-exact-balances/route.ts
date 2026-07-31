/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

const TARGET_BALANCES: Record<string, { balance: number; currency: string }> = {
  'Андріїв cash': { balance: 1398.00, currency: 'CZK' },
  'Готівка EUR': { balance: 252.00, currency: 'EUR' },
  'Олег наличные': { balance: 76620.46, currency: 'CZK' },
  'Антон Готівка': { balance: -902.84, currency: 'CZK' },
  'Каса Ресторану': { balance: 8102.00, currency: 'CZK' },
  'Олег Євро': { balance: 4000.00, currency: 'EUR' },
  'KB Restaurante': { balance: 37261.22, currency: 'CZK' },
  'KB - Glamping CZ': { balance: 9772.09, currency: 'CZK' },
  'KB EUR': { balance: 159.43, currency: 'EUR' },
  'KB KEMP Gold': { balance: 400660.68, currency: 'CZK' },
  'Інвест. СвайпСкейп': { balance: -82661.00, currency: 'CZK' },
};

export async function GET() {
  try {
    const db = getDb();

    // 1. Отримуємо всі активні рахунки
    const accounts = db.prepare(`SELECT * FROM finance_accounts WHERE is_active = 1`).all() as any[];
    const adjustments: any[] = [];

    for (const acct of accounts) {
      const cleanName = acct.name.replace(/^[^\wА-Яа-яЄєІіЇїҐґ]+/, '').trim();
      let targetObj = TARGET_BALANCES[acct.name] || TARGET_BALANCES[cleanName];

      if (!targetObj) {
        for (const [k, v] of Object.entries(TARGET_BALANCES)) {
          if (cleanName.includes(k) || k.includes(cleanName)) {
            targetObj = v;
            break;
          }
        }
      }

      if (!targetObj) continue;

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

      const calcBalance = Number(acct.initial_balance || 0) + Number(incRow.total) - Number(expRow.total);
      const diff = Number((targetObj.balance - calcBalance).toFixed(2));

      if (Math.abs(diff) > 0.001) {
        const newInitial = Number((Number(acct.initial_balance || 0) + diff).toFixed(2));
        db.prepare(`UPDATE finance_accounts SET initial_balance = ? WHERE id = ?`).run(newInitial, acct.id);
        adjustments.push({ account: acct.name, target: targetObj.balance, oldCalc: calcBalance, diff, newInitial });
      }
    }

    // 2. Підсумкова перевірка точних балансів
    const finalAccounts = db.prepare(`SELECT * FROM finance_accounts WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`).all() as any[];
    const balances = finalAccounts.map(acct => {
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
      message: 'Баланси рахунків 100% точно зведено до вихідних значень зі Скріншоту 2',
      adjustmentsMade: adjustments,
      finalVerifiedBalances: balances
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
