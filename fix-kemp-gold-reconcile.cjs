#!/usr/bin/env node
/* eslint-disable */
/**
 * fix-kemp-gold-reconcile.cjs — anchor KEMP Gold to its MojeBanka statement.
 *
 * Two independent problems, both evidenced by the 01.04-05.08 statement
 * (opening -73 706,67 / closing 317 949,20):
 *
 * 1. initial_balance said 104 823,96. PMS also holds 196 operations dated
 *    before 01.04 totalling -77 608,64, so PMS believed the account stood at
 *    27 215,32 on 01.04 while the bank says -73 706,67. Setting the opening to
 *    3 901,97 makes the 01.04 balance match the bank exactly. Naively writing
 *    the bank's own -73 706,67 would have double-counted that pre-period
 *    history. No operation is touched.
 *
 * 2. Three operations the statement does not contain:
 *      exp_1782341316732_fpec  -11 523,00  manual, "Тест на фіналку після виписки"
 *      inc_1782380418147_z2sp      +299,55  manual, hand-plug to match the bank
 *      exp_1779385616655_5rrs      -238,00  telegram twin of a bank_import row
 *    The first is a test left in production, the second a balance plug, the
 *    third the same purchase counted twice. Verified: nothing references them
 *    across all ten tables holding a fin_operations foreign key.
 *
 * Every delete keeps a full before-image in fin_operation_audit, so the rows
 * can be reconstructed from the trail. Dry-run unless --apply.
 */
const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const NEW_OPENING = 3901.97;
const BANK_CLOSING = 317949.20;
const DELETE_IDS = [
  'exp_1782341316732_fpec',
  'inc_1782380418147_z2sp',
  'exp_1779385616655_5rrs',
];

const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'));
db.pragma('foreign_keys = ON');

const acc = db.prepare("SELECT id, name, COALESCE(initial_balance,0) ib FROM finance_accounts WHERE name LIKE '%KEMP Gold%'").get();
if (!acc) { console.error('❌ рахунку KEMP Gold немає'); process.exit(1); }

const balance = () => db.prepare(`
  SELECT COALESCE((SELECT initial_balance FROM finance_accounts WHERE id = ?), 0)
    + COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_to_id = ? AND status='completed' AND is_planned=0), 0)
    - COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_from_id = ? AND status='completed' AND is_planned=0), 0) AS b
`).get(acc.id, acc.id, acc.id).b;

console.log(`Рахунок: ${acc.name}`);
console.log(`Баланс зараз: ${balance().toFixed(2)}   банк: ${BANK_CLOSING.toFixed(2)}   розрив: ${(balance() - BANK_CLOSING).toFixed(2)}\n`);

console.log(`1) initial_balance: ${acc.ib.toFixed(2)} → ${NEW_OPENING.toFixed(2)}   (зміна ${(NEW_OPENING - acc.ib).toFixed(2)})`);

const rows = DELETE_IDS.map((id) => db.prepare('SELECT * FROM fin_operations WHERE id = ?').get(id)).filter(Boolean);
if (rows.length !== DELETE_IDS.length) {
  console.error(`❌ знайдено ${rows.length} з ${DELETE_IDS.length} операцій — далі не йду`);
  process.exit(1);
}
console.log('\n2) видалити:');
let delta = 0;
for (const r of rows) {
  const signed = r.account_from_id === acc.id ? +r.amount : -r.amount; // removing an expense raises the balance
  delta += signed;
  console.log(`   ${r.paid_at.substring(0, 10)}  ${r.op_type.padEnd(7)} ${r.amount.toFixed(2).padStart(10)}  ${r.id}  ${String(r.comment || '').slice(0, 40)}`);
  if (r.account_from_id !== acc.id && r.account_to_id !== acc.id) {
    console.error(`   ❌ ${r.id} не належить цьому рахунку — далі не йду`);
    process.exit(1);
  }
}

const projected = balance() + (NEW_OPENING - acc.ib) + delta;
console.log(`\nбаланс стане: ${projected.toFixed(2)}`);
console.log(`банк:         ${BANK_CLOSING.toFixed(2)}`);
console.log(`лишиться:     ${(BANK_CLOSING - projected).toFixed(2)}  ← неімпортовані рядки виписки`);

if (!APPLY) {
  console.log('\nПробний прогін. Нічого не змінено. Для запису — з --apply');
  process.exit(0);
}

const aud = db.prepare(`
  INSERT INTO fin_operation_audit (id, operation_id, action, user_id, user_name, before_json, after_json)
  VALUES (?, ?, 'delete', NULL, ?, ?, NULL)
`);

db.transaction(() => {
  const u = db.prepare('UPDATE finance_accounts SET initial_balance = ? WHERE id = ?').run(NEW_OPENING, acc.id);
  if (u.changes !== 1) throw new Error('не вдалося оновити initial_balance');

  for (const r of rows) {
    aud.run(
      `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      r.id,
      `reconcile KEMP Gold: not in MojeBanka statement 01.04-05.08`,
      JSON.stringify(r),
    );
    const d = db.prepare('DELETE FROM fin_operations WHERE id = ?').run(r.id);
    if (d.changes !== 1) throw new Error(`очікував видалити 1 рядок для ${r.id}`);
  }
})();

console.log(`\n✅ initial_balance = ${NEW_OPENING.toFixed(2)}, видалено ${rows.length} операцій`);
console.log(`баланс тепер: ${balance().toFixed(2)}   банк: ${BANK_CLOSING.toFixed(2)}   розрив: ${(balance() - BANK_CLOSING).toFixed(2)}`);
