const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function fixAccountBalances() {
  console.log('====================================================');
  console.log('  ALiSiO PMS — Відновлення оригінальних рахунків  ');
  console.log('====================================================\n');

  const dbPath = path.join(process.cwd(), 'data', 'alisio.db');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Помилка: базу даних не знайдено за шляхом ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 1. Отримуємо аудит створюваних операцій
  const auditEntries = db.prepare(`
    SELECT operation_id, after_json FROM fin_operation_audit
    WHERE action = 'create' AND after_json IS NOT NULL
  `).all();

  console.log(`[1/3] Знайдено ${auditEntries.length} записів у журналі аудиту.`);

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

  console.log(`✓ Успішно відновлено початкові рахунки для ${restored} операцій.`);

  // 2. Знаходимо рахунок KB Restaurante
  const restauranteAccount = db.prepare(`
    SELECT id FROM finance_accounts
    WHERE name LIKE '%Restaurante%' OR id = 'acct_kb_restaurante'
    LIMIT 1
  `).get();

  if (restauranteAccount) {
    // Прив'язуємо ТІЛЬКИ операції з виписок 31.07 (source_ref містить 3107 або IBAN 1314361940207) до KB Restaurante
    const updated3107 = db.prepare(`
      UPDATE fin_operations
      SET account_to_id = CASE WHEN op_type = 'income' THEN ? ELSE account_to_id END,
          account_from_id = CASE WHEN op_type = 'expense' THEN ? ELSE account_from_id END
      WHERE source = 'bank_import'
        AND (source_ref LIKE '%3107%' OR comment LIKE '%131-4361940207%' OR comment LIKE '%4361940207%')
    `).run(restauranteAccount.id, restauranteAccount.id);

    console.log(`[2/3] Закріплено ${updated3107.changes} операцій з виписок 31.07 безпосередньо за KB Restaurante.`);
  }

  // 3. Підраховуємо та виводимо поточні баланси всіх рахунків
  console.log('\n[3/3] Перерахунок поточних балансів рахунків:\n');

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
      'Початковий': acct.initial_balance,
      'Поточний баланс': `${currentBalance} ${acct.currency}`
    };
  });

  console.table(balanceTable);
  console.log('\n✅ Відновлення завершено! Поточні баланси повернуто до коректних значень.\n');
}

if (require.main === module) {
  fixAccountBalances();
}

module.exports = { fixAccountBalances };
