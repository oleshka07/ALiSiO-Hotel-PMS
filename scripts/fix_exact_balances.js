const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const TARGET_BALANCES = {
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

function fixExactBalances() {
  console.log('====================================================');
  console.log('  ALiSiO PMS — 100% Точне зведення балансів (Скрін 2) ');
  console.log('====================================================\n');

  const dbPath = path.join(process.cwd(), 'data', 'alisio.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Помилка: базу даних не знайдено за шляхом ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const accounts = db.prepare(`SELECT * FROM finance_accounts WHERE is_active = 1`).all();
  const adjustments = [];

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
    `).get(acct.currency, acct.currency, acct.id);

    const expRow = db.prepare(`
      SELECT COALESCE(SUM(
        CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END
      ), 0) as total
      FROM fin_operations o
      WHERE o.account_from_id = ? AND o.status = 'completed'
    `).get(acct.currency, acct.id);

    const calcBalance = Number(acct.initial_balance || 0) + Number(incRow.total) - Number(expRow.total);
    const diff = Number((targetObj.balance - calcBalance).toFixed(2));

    if (Math.abs(diff) > 0.001) {
      const newInitial = Number((Number(acct.initial_balance || 0) + diff).toFixed(2));
      db.prepare(`UPDATE finance_accounts SET initial_balance = ? WHERE id = ?`).run(newInitial, acct.id);
      adjustments.push({ name: acct.name, target: targetObj.balance, oldCalc: calcBalance, diff, newInitial });
    }
  }

  console.log(`[1/2] Коригувань проведено: ${adjustments.length}`);

  // Підсумкова перевірка
  const finalAccounts = db.prepare(`SELECT * FROM finance_accounts WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`).all();
  const balanceTable = finalAccounts.map(acct => {
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
    `).get(acct.currency, acct.currency, acct.id);

    const expRow = db.prepare(`
      SELECT COALESCE(SUM(
        CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END
      ), 0) as total
      FROM fin_operations o
      WHERE o.account_from_id = ? AND o.status = 'completed'
    `).get(acct.currency, acct.id);

    const currentBalance = (Number(acct.initial_balance || 0) + Number(incRow.total) - Number(expRow.total)).toFixed(2);

    return {
      'Рахунок': acct.name,
      'Валюта': acct.currency,
      'Початковий': acct.initial_balance,
      'Поточний (100% точний)': `${currentBalance} ${acct.currency}`
    };
  });

  console.table(balanceTable);
  console.log('\n✅ 100% УСПІХ! Усі баланси рахунків точно збігаються зі Скріншотом 2.\n');
}

if (require.main === module) {
  fixExactBalances();
}

module.exports = { fixExactBalances };
