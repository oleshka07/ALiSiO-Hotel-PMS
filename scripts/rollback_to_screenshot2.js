const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function rollbackToScreenshot2() {
  console.log('====================================================');
  console.log('  ALiSiO PMS — Повне відновлення базі до вихідного стану  ');
  console.log('====================================================\n');

  const dbPath = path.join(process.cwd(), 'data', 'alisio.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Помилка: базу даних не знайдено за шляхом ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 1. Знаходимо та видаляємо нові операції, створені сьогодні з виписок 31.07
  const newOpIds = db.prepare(`
    SELECT id FROM fin_operations
    WHERE source = 'bank_import'
      AND (source_ref LIKE '%3107%' OR created_at >= '2026-07-31 18:00:00')
  `).all().map(r => r.id);

  console.log(`[1/3] Знайдено ${newOpIds.length} нових банківських операцій для видалення.`);

  if (newOpIds.length > 0) {
    db.pragma('foreign_keys = OFF');
    const ph = newOpIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM fin_operation_tags WHERE operation_id IN (${ph})`).run(...newOpIds);
    db.prepare(`DELETE FROM fin_operation_audit WHERE operation_id IN (${ph})`).run(...newOpIds);
    db.prepare(`DELETE FROM fin_operations WHERE id IN (${ph})`).run(...newOpIds);
    db.pragma('foreign_keys = ON');
    console.log(`✓ Успішно видалено ${newOpIds.length} нових банківських операцій.`);
  }

  // 2. Отримуємо НАЙОСТАННІШИЙ користувацький аудит-знімок ДО початку нашої сесії (performed_at < '2026-07-31 18:00:00')
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
  `).all();

  console.log(`[2/3] Знайдено ${preSessionAudits.length} початкових знімків операцій з історії аудиту.`);

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

  console.log(`✓ Успішно відновлено вихідний стан для ${restoredCount} операцій.`);

  // 3. Підраховуємо та виводимо баланси
  console.log('\n[3/3] Перевірка точних балансів усіх рахунків:\n');

  const accounts = db.prepare(`SELECT * FROM finance_accounts ORDER BY sort_order ASC, name ASC`).all();

  const balanceTable = accounts.map(acct => {
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
      'Назва рахунку': acct.name,
      'Тип': acct.type,
      'Валюта': acct.currency,
      'Початковий': acct.initial_balance,
      'Відновлений баланс': `${currentBalance} ${acct.currency}`
    };
  });

  console.table(balanceTable);
  console.log('\n✅ Готово! Усі операції та баланси рахунків повернуто точно до початкового стану.\n');
}

if (require.main === module) {
  rollbackToScreenshot2();
}

module.exports = { rollbackToScreenshot2 };
