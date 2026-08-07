#!/usr/bin/env node
/* eslint-disable */
/**
 * unlink-personal-statement-394.cjs — detach what hangs off the eight operations
 * that email 394 (a statement for Oleg's PERSONAL account) put on KB Restaurante,
 * so the operations themselves can be removed.
 *
 * Two dependents:
 *
 *  - bank_transactions: eight raw statement lines. They describe the personal
 *    account, so they do not belong in the company ledger either. Deleted.
 *    The two remaining lines of that statement are the 99 CZK bank bonus and
 *    fee, which are staying by the owner's decision, so the statement row keeps
 *    its remaining children.
 *
 *  - fin_channel_receivables: four Airbnb receivables the auto-matcher marked
 *    'paid' against the 800 CZK personal transfer of 31.07.2026. They are for
 *    stays in August 2025 with a payout date of 08.09.2025, and two of them are
 *    in EUR against a CZK payment, so the match is nonsense. Their link is
 *    cleared and the status returns to 'in_statement', which is what a
 *    receivable carrying a statement_payout_date is.
 *
 * Dry-run unless --apply.
 */
const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const OPS = [
  'inc_1785574811855_ch03', 'exp_1785574811863_qx3g', 'exp_1785574811866_l30w',
  'inc_1785574811875_15jo', 'inc_1785574811878_q7a9', 'exp_1785574811882_niky',
  'inc_1785574811899_tvus', 'inc_1785574811901_bitu',
];
const ph = OPS.map(() => '?').join(',');

const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'));
db.pragma('foreign_keys = ON');

const recv = db.prepare(`
  SELECT id, channel_source, gross_amount, currency, status, check_in, statement_payout_date, paid_operation_id
  FROM fin_channel_receivables WHERE paid_operation_id IN (${ph})
`).all(...OPS);

const btx = db.prepare(`
  SELECT id, transaction_date, amount, counterparty, statement_id, matched_operation_id
  FROM bank_transactions WHERE matched_operation_id IN (${ph}) ORDER BY transaction_date
`).all(...OPS);

console.log(`Зобовʼязання каналів, з яких зняти хибну оплату: ${recv.length}`);
for (const r of recv) {
  console.log(`   ${r.id}  ${r.channel_source}  ${r.gross_amount.toFixed(2)} ${r.currency}  заїзд ${r.check_in}  статус ${r.status} → in_statement`);
}
console.log(`\nСирі рядки особистої виписки до видалення: ${btx.length}`);
for (const b of btx) {
  console.log(`   ${b.transaction_date}  ${b.amount.toFixed(2).padStart(10)}  ${b.counterparty || ''}`);
}

const rest = db.prepare('SELECT COUNT(*) n FROM bank_transactions WHERE statement_id = ? AND matched_operation_id NOT IN (' + ph + ')')
  .get(btx[0]?.statement_id, ...OPS).n;
console.log(`\nу виписці ${btx[0]?.statement_id} лишиться рядків: ${rest}  (99 CZK бонус і комісія)`);

if (!APPLY) { console.log('\nПробний прогін. Нічого не змінено. Для запису — з --apply'); process.exit(0); }

db.transaction(() => {
  const u = db.prepare(`
    UPDATE fin_channel_receivables
    SET paid_operation_id = NULL, status = 'in_statement', updated_at = datetime('now')
    WHERE paid_operation_id IN (${ph})
  `).run(...OPS);
  if (u.changes !== recv.length) throw new Error(`очікував ${recv.length} зобовʼязань, змінено ${u.changes}`);

  const d = db.prepare(`DELETE FROM bank_transactions WHERE matched_operation_id IN (${ph})`).run(...OPS);
  if (d.changes !== btx.length) throw new Error(`очікував ${btx.length} рядків, видалено ${d.changes}`);
})();

console.log(`\n✅ знято оплату з ${recv.length} зобовʼязань, видалено ${btx.length} сирих рядків`);
