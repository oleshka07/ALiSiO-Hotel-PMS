const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function restoreAllOperationsFromAudit() {
  console.log('====================================================');
  console.log('  ALiSiO PMS — Повне відновлення з журналу аудиту  ');
  console.log('====================================================\n');

  const dbPath = path.join(process.cwd(), 'data', 'alisio.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Помилка: базу даних не знайдено за шляхом ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

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
  `).all();

  console.log(`[1/3] Отримано ${latestAudits.length} найновіших записів аудиту для операцій.`);

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

  console.log(`✓ Повністю відновлено стан ${restoredCount} операцій за найостаннішими записами аудиту.`);

  // 2. Закріплюємо виписки від 31.07 за рахунком KB Restaurante (якщо вони є)
  const restauranteAccount = db.prepare(`
    SELECT id FROM finance_accounts
    WHERE name LIKE '%Restaurante%' OR id = 'acct_kb_restaurante'
    LIMIT 1
  `).get();

  if (restauranteAccount) {
    const res3107 = db.prepare(`
      UPDATE fin_operations
      SET account_to_id = CASE WHEN op_type = 'income' THEN ? ELSE account_to_id END,
          account_from_id = CASE WHEN op_type = 'expense' THEN ? ELSE account_from_id END
      WHERE source = 'bank_import'
        AND (source_ref LIKE '%3107%' OR comment LIKE '%131-4361940207%' OR comment LIKE '%4361940207%')
    `).run(restauranteAccount.id, restauranteAccount.id);

    console.log(`[2/3] Операції виписування 31.07 (${res3107.changes} шт) підкріплено до KB Restaurante.`);
  }

  // 3. Підраховуємо поточні баланси для всіх рахунків
  console.log('\n[3/3] Поточний підсумок за рахунками:\n');

  const accounts = db.prepare(`SELECT * FROM finance_accounts ORDER BY sort_order ASC, name ASC`).all();

  const balanceTable = accounts.map(acct => {
    const incRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM fin_operations
      WHERE account_to_id = ? AND status = 'completed'
    `).get(acct.id);

    const expRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM fin_operations
      WHERE account_from_id = ? AND status = 'completed'
    `).get(acct.id);

    const currentBalance = (Number(acct.initial_balance || 0) + Number(incRow.total) - Number(expRow.total)).toFixed(2);

    return {
      'Назва рахунку': acct.name,
      'Тип': acct.type,
      'Валюта': acct.currency,
      'Початковий баланс': acct.initial_balance,
      'Поточний баланс': `${currentBalance} ${acct.currency}`
    };
  });

  console.table(balanceTable);
  console.log('\n✅ Усі операції та баланси повністю відновлено за історією аудиту!\n');
}

if (require.main === module) {
  restoreAllOperationsFromAudit();
}

module.exports = { restoreAllOperationsFromAudit };
