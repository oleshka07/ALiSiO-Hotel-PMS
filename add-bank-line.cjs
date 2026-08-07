#!/usr/bin/env node
/* eslint-disable */
/**
 * add-bank-line.cjs — record one bank transaction by hand, for when the figure
 * comes from the banking app rather than a statement export.
 *
 * Refuses to insert if the same account already holds that amount on that date,
 * so running it twice cannot create a duplicate. Writes an audit row.
 *
 *   node add-bank-line.cjs "KB KEMP Gold" 2026-08-07 +1931.92 "Teya 5095484TEYA260807" [--apply]
 */
const path = require('path');
const Database = require('better-sqlite3');

const [ACCOUNT, DATE, AMOUNT_RAW, DESC] = process.argv.slice(2);
const APPLY = process.argv.includes('--apply');

if (!ACCOUNT || !DATE || !AMOUNT_RAW || !DESC) {
  console.error('Використання: node add-bank-line.cjs "<рахунок>" <РРРР-ММ-ДД> <+/-сума> "<опис>" [--apply]');
  process.exit(2);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error('❌ дата має бути РРРР-ММ-ДД'); process.exit(1); }
const amt = Number(String(AMOUNT_RAW).replace(',', '.'));
if (!isFinite(amt) || amt === 0) { console.error('❌ сума має бути числом, не нуль'); process.exit(1); }

const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'));
db.pragma('foreign_keys = ON');

const norm = (s) => String(s || '').replace(/[💶💰🏦\s]+/g, ' ').trim().toLowerCase();
const acc = db.prepare('SELECT id, name, currency, organization_id FROM finance_accounts').all()
  .find((a) => norm(a.name) === norm(ACCOUNT));
if (!acc) { console.error(`❌ Рахунку «${ACCOUNT}» немає`); process.exit(1); }

const balance = () => db.prepare(`
  SELECT COALESCE((SELECT initial_balance FROM finance_accounts WHERE id = ?), 0)
    + COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_to_id = ? AND status='completed' AND is_planned=0), 0)
    - COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_from_id = ? AND status='completed' AND is_planned=0), 0) AS b
`).get(acc.id, acc.id, acc.id).b;

const dupe = db.prepare(`
  SELECT id, paid_at, amount, substr(COALESCE(comment,''),1,50) c FROM fin_operations
  WHERE (account_to_id = ? OR account_from_id = ?)
    AND substr(paid_at,1,10) = ? AND ROUND(amount,2) = ROUND(?,2)
`).all(acc.id, acc.id, DATE, Math.abs(amt));

console.log(`Рахунок: ${acc.name} (${acc.currency})`);
console.log(`Додати:  ${DATE}  ${amt > 0 ? '+' : ''}${amt.toFixed(2)}  ${DESC}`);
console.log(`Баланс зараз: ${balance().toFixed(2)}   стане: ${(balance() + amt).toFixed(2)}`);

if (dupe.length) {
  console.error(`\n❌ на цю дату вже є ${dupe.length} операція(й) з такою сумою — не додаю:`);
  for (const d of dupe) console.error(`   ${d.id}  ${d.paid_at.substring(0,10)}  ${d.amount.toFixed(2)}  ${d.c}`);
  process.exit(1);
}

if (!APPLY) { console.log('\nПробний прогін. Для запису — з --apply'); process.exit(0); }

const isIncome = amt > 0;
const amount = Math.abs(amt);
const id = `${isIncome ? 'inc' : 'exp'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

db.transaction(() => {
  db.prepare(`
    INSERT INTO fin_operations
      (id, organization_id, op_type, account_from_id, account_to_id,
       amount, currency, amount_company, paid_at, accrued_at,
       status, source, comment, is_planned, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'bank_import', ?, 0, 1)
  `).run(
    id, acc.organization_id, isIncome ? 'income' : 'expense',
    isIncome ? null : acc.id, isIncome ? acc.id : null,
    amount, acc.currency, amount, DATE, DATE, DESC,
  );
  db.prepare(`
    INSERT INTO fin_operation_audit (id, operation_id, action, user_id, user_name, before_json, after_json)
    VALUES (?, ?, 'create', NULL, 'added by hand from the banking app', NULL, ?)
  `).run(
    `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, id,
    JSON.stringify(db.prepare('SELECT * FROM fin_operations WHERE id = ?').get(id)),
  );
})();

console.log(`\n✅ додано ${id}`);
console.log(`баланс тепер: ${balance().toFixed(2)}`);
