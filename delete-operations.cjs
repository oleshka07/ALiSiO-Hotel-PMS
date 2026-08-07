#!/usr/bin/env node
/* eslint-disable */
/**
 * delete-operations.cjs — remove named operations, keeping a full before-image
 * in fin_operation_audit so each row can be reconstructed from the trail.
 *
 * Ids are passed explicitly: no pattern, no bulk predicate. The 31.07 incident
 * was caused by mass UPDATE/DELETE over a WHERE clause, so this script cannot
 * express one.
 *
 *   node delete-operations.cjs "reason" id1 id2 ... [--apply]
 */
const path = require('path');
const Database = require('better-sqlite3');

const argv = process.argv.slice(2).filter((a) => a !== '--apply');
const APPLY = process.argv.includes('--apply');
const REASON = argv[0];
const IDS = argv.slice(1);

if (!REASON || !IDS.length) {
  console.error('Використання: node delete-operations.cjs "<причина>" <id> [<id>...] [--apply]');
  process.exit(2);
}

const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'));
db.pragma('foreign_keys = ON');

const REFS = [
  ['capex_items', 'fin_operation_id'], ['accruals', 'fin_operation_id'],
  ['bank_transactions', 'matched_operation_id'], ['fin_auto_rule_matches', 'operation_id'],
  ['fin_operation_tags', 'operation_id'], ['fin_channel_receivables', 'paid_operation_id'],
  ['fin_operation_attachments', 'operation_id'], ['fin_pending_receipts', 'auto_matched_operation_id'],
  ['investor_payouts', 'fin_operation_id'], ['invoices', 'fin_operation_id'],
];

const rows = IDS.map((id) => db.prepare('SELECT * FROM fin_operations WHERE id = ?').get(id));
const missing = IDS.filter((id, i) => !rows[i]);
if (missing.length) { console.error(`❌ не знайдено: ${missing.join(', ')}`); process.exit(1); }

const ph = IDS.map(() => '?').join(',');
let blocked = false;
for (const [t, c] of REFS) {
  try {
    const n = db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${c} IN (${ph})`).get(...IDS).n;
    if (n > 0) { console.error(`❌ ${t}.${c} посилається на ${n} з них`); blocked = true; }
  } catch { /* table or column absent */ }
}
if (blocked) process.exit(1);

const accOf = (r) => r.account_from_id || r.account_to_id;
const balance = (accId) => db.prepare(`
  SELECT COALESCE((SELECT initial_balance FROM finance_accounts WHERE id = ?), 0)
    + COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_to_id = ? AND status='completed' AND is_planned=0), 0)
    - COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_from_id = ? AND status='completed' AND is_planned=0), 0) AS b
`).get(accId, accId, accId).b;

const accounts = [...new Set(rows.map(accOf).filter(Boolean))];
console.log(`Причина: ${REASON}\n`);
console.log('Видалити:');
for (const r of rows) {
  const name = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(accOf(r))?.name || '—';
  console.log(`   ${r.paid_at.substring(0, 10)}  ${r.op_type.padEnd(7)} ${r.amount.toFixed(2).padStart(10)}  ${name}  ${r.id}`);
}
console.log('\nБаланси:');
for (const a of accounts) {
  const name = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(a)?.name;
  const delta = rows.filter((r) => accOf(r) === a)
    .reduce((s, r) => s + (r.account_from_id === a ? +r.amount : -r.amount), 0);
  console.log(`   ${name}: ${balance(a).toFixed(2)} → ${(balance(a) + delta).toFixed(2)}`);
}

if (!APPLY) { console.log('\nПробний прогін. Нічого не видалено. Для запису — з --apply'); process.exit(0); }

db.transaction(() => {
  for (const r of rows) {
    db.prepare(`
      INSERT INTO fin_operation_audit (id, operation_id, action, user_id, user_name, before_json, after_json)
      VALUES (?, ?, 'delete', NULL, ?, ?, NULL)
    `).run(`aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, r.id, REASON, JSON.stringify(r));
    const d = db.prepare('DELETE FROM fin_operations WHERE id = ?').run(r.id);
    if (d.changes !== 1) throw new Error(`очікував видалити 1 рядок для ${r.id}`);
  }
})();

console.log(`\n✅ видалено ${rows.length}`);
for (const a of accounts) {
  const name = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(a)?.name;
  console.log(`   ${name}: ${balance(a).toFixed(2)}`);
}
