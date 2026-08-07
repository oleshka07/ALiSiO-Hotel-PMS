#!/usr/bin/env node
/* eslint-disable */
/**
 * import-missing-statement-lines.cjs — put the statement lines that are not in
 * the PMS into the PMS, on the statement's own dates and amounts.
 *
 * No opening balances, no adjustments, no plugs: one row per bank line that has
 * no counterpart yet. Existing operations are never touched. Matching is by
 * (date, amount) with a few days of tolerance, because the bank posts a card
 * transaction days after it happens.
 *
 *   node import-missing-statement-lines.cjs "KB KEMP Gold" statement.csv
 *   node import-missing-statement-lines.cjs "KB KEMP Gold" statement.csv --apply
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ACCOUNT = process.argv[2];
const CSV = process.argv[3];
const APPLY = process.argv.includes('--apply');
const dIdx = process.argv.indexOf('--days');
const TOL = dIdx !== -1 ? Number(process.argv[dIdx + 1]) : 7;

if (!ACCOUNT || !CSV) {
  console.error('Використання: node import-missing-statement-lines.cjs "<рахунок>" <виписка.csv> [--apply] [--days N]');
  process.exit(2);
}

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ';' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}
const raw = fs.readFileSync(CSV);
let text;
try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
catch { text = new TextDecoder('windows-1250').decode(raw); }
const num = (s) => parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.'));
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const bank = [];
for (const l of text.split(/\r?\n/).slice(18)) {
  if (!l.trim()) continue;
  const f = splitCsv(l);
  if (f.length < 14) continue;
  const amt = num(f[4]);
  if (!isFinite(amt)) continue;
  const [d, m, y] = String(f[0]).split('.');
  if (!y) continue;
  const parts = [clean(f[3]), clean(f[12]), clean(f[13]), clean(f[15])].filter(Boolean);
  bank.push({ date: `${y}-${m}-${d}`, amt, txid: clean(f[11]), desc: parts.join(' · ').slice(0, 200) });
}

const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'));
db.pragma('foreign_keys = ON');

const norm = (s) => String(s || '').replace(/[💶💰🏦\s]+/g, ' ').trim().toLowerCase();
const acc = db.prepare('SELECT id, name, currency, organization_id FROM finance_accounts').all()
  .find((a) => norm(a.name) === norm(ACCOUNT));
if (!acc) { console.error(`❌ Рахунку «${ACCOUNT}» немає`); process.exit(1); }

const from = bank.reduce((a, b) => (a < b.date ? a : b.date), bank[0].date);
const to = bank.reduce((a, b) => (a > b.date ? a : b.date), bank[0].date);

// PMS side of the same window, signed from this account's point of view
const ops = db.prepare(`
  SELECT id, substr(paid_at,1,10) d, amount,
         CASE WHEN account_to_id = ? THEN 1 ELSE -1 END sign
  FROM fin_operations
  WHERE (account_to_id = ? OR account_from_id = ?)
    AND substr(paid_at,1,10) BETWEEN ? AND ?
    AND status = 'completed' AND is_planned = 0
`).all(acc.id, acc.id, acc.id, from, to)
  .map((o) => ({ ...o, signed: o.sign * o.amount, used: false }));

const balance = () => db.prepare(`
  SELECT COALESCE((SELECT initial_balance FROM finance_accounts WHERE id = ?), 0)
    + COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_to_id = ? AND status='completed' AND is_planned=0), 0)
    - COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_from_id = ? AND status='completed' AND is_planned=0), 0) AS b
`).get(acc.id, acc.id, acc.id).b;

// Pair up in widening passes: exact dates first, then one day out, and so on.
// A single greedy pass at the full tolerance mispairs repeated charges — this
// account is billed 1 633,00 by Facebook eight times, and a loose pass let an
// earlier line consume the operation belonging to a later one, which then looked
// missing and would have been imported a second time.
let pending = bank.slice();
for (let tol = 0; tol <= TOL; tol++) {
  const still = [];
  for (const b of pending) {
    const hit = ops.find((o) => !o.used
      && Math.abs(o.signed - b.amt) < 0.005
      && Math.abs(new Date(o.d) - new Date(b.date)) <= tol * 86400000);
    if (hit) hit.used = true; else still.push(b);
  }
  pending = still;
  if (!pending.length) break;
}
const missing = pending;

console.log(`Рахунок: ${acc.name} (${acc.currency})`);
console.log(`Виписка: ${path.basename(CSV)}   ${from} → ${to}   рядків: ${bank.length}`);
console.log(`Баланс зараз: ${balance().toFixed(2)}\n`);
console.log(`Немає в PMS: ${missing.length}`);
let delta = 0;
for (const b of missing) {
  delta += b.amt;
  console.log(`   ${b.date}  ${b.amt.toFixed(2).padStart(11)}  ${b.desc.slice(0, 52)}`);
}
console.log(`\nсума: ${delta.toFixed(2)}`);
console.log(`баланс стане: ${(balance() + delta).toFixed(2)}`);

if (!APPLY) { console.log('\nПробний прогін. Нічого не додано. Для запису — з --apply'); process.exit(0); }
if (!missing.length) { console.log('\nДодавати нічого.'); process.exit(0); }

const ins = db.prepare(`
  INSERT INTO fin_operations
    (id, organization_id, op_type, account_from_id, account_to_id,
     amount, currency, amount_company, paid_at, accrued_at,
     status, source, source_ref, comment, is_planned, needs_review)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'bank_import', ?, ?, 0, 1)
`);
const aud = db.prepare(`
  INSERT INTO fin_operation_audit (id, operation_id, action, user_id, user_name, before_json, after_json)
  VALUES (?, ?, 'create', NULL, ?, NULL, ?)
`);

let n = 0;
db.transaction(() => {
  for (const b of missing) {
    const isIncome = b.amt > 0;
    const amount = Math.abs(b.amt);
    const id = `${isIncome ? 'inc' : 'exp'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    ins.run(
      id, acc.organization_id, isIncome ? 'income' : 'expense',
      isIncome ? null : acc.id, isIncome ? acc.id : null,
      amount, acc.currency, acc.currency === 'CZK' ? amount : amount,
      b.date, b.date, b.txid || null, b.desc,
    );
    aud.run(
      `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, id,
      `import missing line from MojeBanka ${path.basename(CSV)}`,
      JSON.stringify(db.prepare('SELECT * FROM fin_operations WHERE id = ?').get(id)),
    );
    n++;
  }
})();

console.log(`\n✅ додано ${n} операцій`);
console.log(`баланс тепер: ${balance().toFixed(2)}`);
