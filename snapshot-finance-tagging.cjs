#!/usr/bin/env node
/* eslint-disable */
/**
 * snapshot-finance-tagging.cjs — capture, and put back, everything an auto-rules
 * re-run can change.
 *
 * The rules engine writes `UPDATE fin_operations SET category_id = ?, project_id = ?...`
 * directly and records nothing in fin_operation_audit, so unlike the reconciliation
 * scripts a rules run leaves no trail of its own. This is that trail.
 *
 * Captures the rule definitions and the four fields a rule can touch on every
 * operation. Restoring writes back only the rows whose values actually differ,
 * and prints each one.
 *
 *   node snapshot-finance-tagging.cjs save <файл.json>
 *   node snapshot-finance-tagging.cjs diff <файл.json>
 *   node snapshot-finance-tagging.cjs restore <файл.json> [--apply]
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const [CMD, FILE] = process.argv.slice(2);
const APPLY = process.argv.includes('--apply');

if (!['save', 'diff', 'restore'].includes(CMD) || !FILE) {
  console.error('Використання: node snapshot-finance-tagging.cjs save|diff|restore <файл.json> [--apply]');
  process.exit(2);
}

const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'));
db.pragma('busy_timeout = 15000');

const FIELDS = ['category_id', 'project_id', 'counterparty_id', 'comment'];

function readOps() {
  return db.prepare(`SELECT id, ${FIELDS.join(', ')} FROM fin_operations`).all();
}

if (CMD === 'save') {
  const snap = {
    taken_at: new Date().toISOString(),
    rules: db.prepare('SELECT * FROM fin_auto_rules').all(),
    tags: db.prepare('SELECT operation_id, tag_id FROM fin_operation_tags').all(),
    operations: readOps(),
  };
  fs.writeFileSync(FILE, JSON.stringify(snap, null, 1));
  console.log(`✅ знімок → ${FILE}`);
  console.log(`   правил: ${snap.rules.length}   операцій: ${snap.operations.length}   тегів: ${snap.tags.length}`);
  process.exit(0);
}

const snap = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const before = new Map(snap.operations.map((o) => [o.id, o]));
const now = readOps();

const changed = [];
for (const o of now) {
  const b = before.get(o.id);
  if (!b) continue; // created after the snapshot — not ours to undo
  if (FIELDS.some((f) => (b[f] ?? null) !== (o[f] ?? null))) changed.push({ before: b, after: o });
}
const vanished = snap.operations.filter((o) => !now.some((n) => n.id === o.id));

const nameOf = (t, id) => {
  if (!id) return '—';
  try { return db.prepare(`SELECT name FROM ${t} WHERE id = ?`).get(id)?.name || id; } catch { return id; }
};

console.log(`знімок від ${snap.taken_at}`);
console.log(`операцій зі зміненими полями: ${changed.length}`);
if (vanished.length) console.log(`⚠️  операцій зі знімка більше не існує: ${vanished.length}`);
console.log(`правил тоді: ${snap.rules.length}   зараз: ${db.prepare('SELECT COUNT(*) n FROM fin_auto_rules').get().n}`);

for (const c of changed.slice(0, 40)) {
  const diffs = FIELDS.filter((f) => (c.before[f] ?? null) !== (c.after[f] ?? null))
    .map((f) => {
      if (f === 'category_id') return `категорія: ${nameOf('expense_categories', c.before[f])} → ${nameOf('expense_categories', c.after[f])}`;
      if (f === 'project_id') return `юніт: ${nameOf('business_units', c.before[f])} → ${nameOf('business_units', c.after[f])}`;
      if (f === 'counterparty_id') return `контрагент: ${nameOf('finance_counterparties', c.before[f])} → ${nameOf('finance_counterparties', c.after[f])}`;
      return `коментар змінено`;
    });
  console.log(`  ${c.after.id}  ${diffs.join('  |  ')}`);
}
if (changed.length > 40) console.log(`  ... ще ${changed.length - 40}`);

if (CMD === 'diff') process.exit(0);

if (!changed.length && snap.rules.length === db.prepare('SELECT COUNT(*) n FROM fin_auto_rules').get().n) {
  console.log('\nВідкочувати нічого.');
  process.exit(0);
}
if (!APPLY) { console.log('\nПробний прогін. Для відкату — з --apply'); process.exit(0); }

db.transaction(() => {
  const upd = db.prepare(`UPDATE fin_operations SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`);
  for (const c of changed) upd.run(...FIELDS.map((f) => c.before[f] ?? null), c.before.id);

  // rules: back to exactly the set that was captured
  db.prepare('DELETE FROM fin_auto_rules').run();
  const cols = Object.keys(snap.rules[0] || {});
  if (cols.length) {
    const ins = db.prepare(`INSERT INTO fin_auto_rules (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    for (const r of snap.rules) ins.run(...cols.map((c) => r[c]));
  }

  // tags added by a rules run
  db.prepare('DELETE FROM fin_operation_tags').run();
  const insT = db.prepare('INSERT OR IGNORE INTO fin_operation_tags (operation_id, tag_id) VALUES (?, ?)');
  for (const t of snap.tags) insT.run(t.operation_id, t.tag_id);
})();

console.log(`\n✅ відкочено: ${changed.length} операцій, ${snap.rules.length} правил, ${snap.tags.length} тегів`);
