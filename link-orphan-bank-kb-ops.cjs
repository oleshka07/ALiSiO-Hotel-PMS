#!/usr/bin/env node
/* eslint-disable */
/**
 * link-orphan-bank-kb-ops.cjs — reattach the bank_kb operations that lost both
 * of their account links to the account their statement proves they belong to.
 *
 * The 31.07 incident re-linked operations with mass UPDATEs. Thirty bank_kb
 * income rows ended up with account_from_id AND account_to_id both NULL, so the
 * money sits in fin_operations but is invisible to every balance: KB Restaurante
 * read -90 148,30 while its MojeBanka statement closed at +18 012,05.
 *
 * Every row is matched to a statement line by date and amount before writing.
 * Unlike the scripts that caused the damage, this one writes an audit row per
 * change, so the edit is reversible from the trail alone.
 *
 * Dry-run by default:
 *   node link-orphan-bank-kb-ops.cjs "KB Restaurante" statement.csv
 *   node link-orphan-bank-kb-ops.cjs "KB Restaurante" statement.csv --apply
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ACCOUNT = process.argv[2];
const CSV = process.argv[3];
const APPLY = process.argv.includes('--apply');

if (!ACCOUNT || !CSV) {
  console.error('Використання: node link-orphan-bank-kb-ops.cjs "<рахунок>" <виписка.csv> [--apply]');
  process.exit(2);
}

// ── statement lines, so nothing is linked on trust ──────────────────────────
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

const stmt = new Map(); // "date|amount" -> count
for (const l of text.split(/\r?\n/).slice(18)) {
  if (!l.trim()) continue;
  const f = splitCsv(l);
  if (f.length < 14) continue;
  const amt = num(f[4]);
  if (!isFinite(amt)) continue;
  const [d, m, y] = String(f[0]).split('.');
  if (!y) continue;
  const key = `${y}-${m}-${d}|${amt.toFixed(2)}`;
  stmt.set(key, (stmt.get(key) || 0) + 1);
}

const DB_PATH = path.join(process.cwd(), 'data', 'alisio.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const norm = (s) => String(s || '').replace(/[💶💰🏦\s]+/g, ' ').trim().toLowerCase();
const acc = db.prepare('SELECT id, name FROM finance_accounts').all()
  .find((a) => norm(a.name) === norm(ACCOUNT));
if (!acc) { console.error(`❌ Рахунку «${ACCOUNT}» немає`); process.exit(1); }

const orphans = db.prepare(`
  SELECT id, paid_at, op_type, amount, source, comment
  FROM fin_operations
  WHERE account_from_id IS NULL AND account_to_id IS NULL AND source = 'bank_kb'
  ORDER BY paid_at
`).all();

const balance = () => db.prepare(`
  SELECT COALESCE((SELECT initial_balance FROM finance_accounts WHERE id = ?), 0)
    + COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_to_id = ? AND status='completed' AND is_planned=0), 0)
    - COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_from_id = ? AND status='completed' AND is_planned=0), 0) AS b
`).get(acc.id, acc.id, acc.id).b;

console.log(`Рахунок:  ${acc.name}`);
console.log(`Осиротілих bank_kb операцій: ${orphans.length}`);
console.log(`Баланс зараз: ${balance().toFixed(2)}\n`);

const matched = [], unmatched = [];
for (const o of orphans) {
  const key = `${String(o.paid_at).substring(0, 10)}|${Number(o.amount).toFixed(2)}`;
  (stmt.has(key) ? matched : unmatched).push(o);
}

console.log(`✅ підтверджено випискою: ${matched.length}`);
for (const o of matched) {
  console.log(`   ${o.paid_at.substring(0, 10)}  ${o.amount.toFixed(2).padStart(10)}  ${o.id}`);
}
if (unmatched.length) {
  console.log(`\n⚠️  НЕ знайдено у виписці — не торкаюсь: ${unmatched.length}`);
  for (const o of unmatched) {
    console.log(`   ${o.paid_at.substring(0, 10)}  ${o.amount.toFixed(2).padStart(10)}  ${o.id}  ${String(o.comment).slice(0, 40)}`);
  }
}

const total = matched.reduce((s, o) => s + o.amount, 0);
console.log(`\nсума до привʼязки: ${total.toFixed(2)}`);
console.log(`баланс стане:      ${(balance() + total).toFixed(2)}`);

if (!APPLY) {
  console.log('\nПробний прогін. Нічого не змінено. Для запису — з --apply');
  process.exit(0);
}
if (!matched.length) { console.log('\nНічого привʼязувати.'); process.exit(0); }

const upd = db.prepare('UPDATE fin_operations SET account_to_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND account_from_id IS NULL AND account_to_id IS NULL');
const aud = db.prepare(`
  INSERT INTO fin_operation_audit (id, operation_id, action, user_id, user_name, before_json, after_json)
  VALUES (?, ?, 'update', NULL, ?, ?, ?)
`);
const get = db.prepare('SELECT * FROM fin_operations WHERE id = ?');

let changed = 0;
db.transaction(() => {
  for (const o of matched) {
    const before = get.get(o.id);
    const r = upd.run(acc.id, o.id);
    if (r.changes !== 1) throw new Error(`очікував 1 зміну для ${o.id}, отримав ${r.changes}`);
    const after = get.get(o.id);
    aud.run(
      `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      o.id,
      `reconcile: link orphan bank_kb op to ${acc.name} (MojeBanka ${path.basename(CSV)})`,
      JSON.stringify(before), JSON.stringify(after),
    );
    changed++;
  }
})();

console.log(`\n✅ привʼязано: ${changed}`);
console.log(`баланс тепер: ${balance().toFixed(2)}`);
