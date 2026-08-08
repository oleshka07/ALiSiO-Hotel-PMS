#!/usr/bin/env node
/* eslint-disable */
/**
 * apply-glamping-correction.cjs — move the glamping money that was paid on a
 * camping device out of camping revenue.
 *
 * A payment over 3 400 CZK on a camping terminal or the camping website is a
 * glamping house. Over June–July that is four transactions — 3 950 on 12.06,
 * 6 160 on 03.07, 4 800 on 13.07, 3 560 on 21.07 — worth 18 470 gross and
 * 18 137,85 net of Teya's fee.
 *
 * Each of them arrived inside a settlement that also carried camping money, so a
 * strictly correct fix would split four settlements into eight operations. The
 * owner chose the simpler route: retag whole settlements whose amounts add up to
 * the same figure, since a few hundred crowns either way does not move the P&L.
 * The combination below was searched for the smallest residual and for amounts
 * that look like real glamping settlements:
 *
 *   June  2 972,52 + 920,28                       = 3 892,80  vs 3 891,06  (+1,74)
 *   July  1 630,30 + 5 121,27 + 1 703,49 + 5 790,95 = 14 246,01 vs 14 246,79 (−0,78)
 *   total                                           18 138,81 vs 18 137,85 (+0,96)
 *
 * Each is kept inside its own month so the monthly P&L moves by the right amount
 * too. 5 121,27 on 14.07 is not an arbitrary pick: it is the settlement that
 * actually contains the 4 800 glamping payment.
 *
 * A marker goes into the comment and a rule with sort_order 0 keys on it, because
 * the Teya rules match on the reference prefix and would otherwise drag these
 * back to camping on the next rules run.
 *
 * Reverse with snapshot-finance-tagging.cjs restore.
 *
 *   node apply-glamping-correction.cjs            # dry run
 *   node apply-glamping-correction.cjs --apply
 */
const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const MARKER = ' · глемпінг (корекція за звітом Teya, порог 3400)';
const TARGET_NET = 18137.85;

const IDS = [
  'inc_1780992925148_b6hn', // 08.06   2 972,52
  'inc_1781252108644_dfvs', // 11.06     920,28
  'inc_1783066513995_s6x2', // 02.07   1 630,30
  'inc_1784103311886_66by', // 14.07   5 121,27  ← містить транзакцію 4 800
  'inc_1784967309474_cpio', // 24.07   1 703,49
  'inc_1785485708941_0rjs', // 30.07   5 790,95
];

const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'));
db.pragma('busy_timeout = 15000');

const org = db.prepare('SELECT id FROM organizations LIMIT 1').get();
const rows = IDS.map((id) => db.prepare(`
  SELECT o.id, o.paid_at, o.amount, o.comment, o.project_id,
         COALESCE((SELECT name FROM business_units WHERE id = o.project_id), '—') bu
  FROM fin_operations o WHERE o.id = ?
`).get(id));

const missing = IDS.filter((id, i) => !rows[i]);
if (missing.length) { console.error(`❌ не знайдено: ${missing.join(', ')}`); process.exit(1); }

const wrong = rows.filter((r) => r.project_id !== 'bu_camping');
if (wrong.length) {
  console.error('❌ ці операції вже не на кемпінгу — стан змінився, не пишу нічого:');
  for (const r of wrong) console.error(`   ${r.id}  ${r.bu}`);
  process.exit(1);
}
const already = rows.filter((r) => String(r.comment || '').includes(MARKER));
if (already.length) { console.error(`❌ ${already.length} уже позначені — корекція вже застосована`); process.exit(1); }

console.log('ПЕРЕВЕСТИ З КЕМПІНГУ В ГЛЕМПІНГ:\n');
const byMonth = {};
for (const r of rows) {
  const m = String(r.paid_at).slice(0, 7);
  byMonth[m] = (byMonth[m] || 0) + r.amount;
  console.log(`  ${String(r.paid_at).slice(0, 10)}  ${r.amount.toFixed(2).padStart(10)}  ${r.id}`);
}
const total = rows.reduce((s, r) => s + r.amount, 0);
console.log('\nпо місяцях:');
const NEED = { '2026-06': 3891.06, '2026-07': 14246.79 };
for (const [m, v] of Object.entries(byMonth)) {
  console.log(`  ${m}  ${v.toFixed(2).padStart(10)}   потрібно ${NEED[m].toFixed(2).padStart(10)}   розбіжність ${(v - NEED[m]).toFixed(2).padStart(7)}`);
}
console.log(`\nразом ${total.toFixed(2)}   цільове ${TARGET_NET.toFixed(2)}   розбіжність ${(total - TARGET_NET).toFixed(2)}`);

const before = db.prepare(`
  SELECT COALESCE((SELECT name FROM business_units WHERE id = project_id), '—') bu,
         printf('%.2f', SUM(amount)) sum
  FROM fin_operations
  WHERE (comment LIKE '%Banking Circle%' OR comment LIKE '%TEYA%') AND op_type = 'income'
    AND paid_at >= '2026-06-01' AND paid_at < '2026-08-01'
  GROUP BY bu ORDER BY SUM(amount) DESC
`).all();
console.log('\nP&L зараз:');
for (const b of before) console.log(`  ${b.bu.padEnd(12)} ${b.sum.padStart(12)}`);

if (!APPLY) { console.log('\nПробний прогін. Нічого не змінено. Для запису — з --apply'); process.exit(0); }

db.transaction(() => {
  const upd = db.prepare(`
    UPDATE fin_operations
    SET project_id = 'bu_glamping', category_id = 'ec_accommodation',
        comment = comment || ?, updated_at = datetime('now')
    WHERE id = ? AND project_id = 'bu_camping'
  `);
  for (const r of rows) {
    const res = upd.run(MARKER, r.id);
    if (res.changes !== 1) throw new Error(`очікував 1 зміну для ${r.id}`);
  }
  // runs before the prefix rules and stops them, so the correction survives a re-run
  db.prepare(`
    INSERT OR REPLACE INTO fin_auto_rules
      (id, organization_id, name, op_type, conditions_json, actions_json, is_active, stop_on_match, sort_order)
    VALUES ('ar_teya_glamping_fix', ?, 'Глемпінг-корекція — тримати попри префікс Teya', 'income', ?, ?, 1, 1, 0)
  `).run(
    org.id,
    JSON.stringify([{ field: 'comment', op: 'contains', value: 'глемпінг (корекція за звітом Teya' }]),
    JSON.stringify({ set_project_id: 'bu_glamping', set_category_id: 'ec_accommodation' }),
  );
})();

const after = db.prepare(`
  SELECT COALESCE((SELECT name FROM business_units WHERE id = project_id), '—') bu,
         printf('%.2f', SUM(amount)) sum
  FROM fin_operations
  WHERE (comment LIKE '%Banking Circle%' OR comment LIKE '%TEYA%') AND op_type = 'income'
    AND paid_at >= '2026-06-01' AND paid_at < '2026-08-01'
  GROUP BY bu ORDER BY SUM(amount) DESC
`).all();
console.log('\n✅ P&L стало:');
for (const b of after) console.log(`  ${b.bu.padEnd(12)} ${b.sum.padStart(12)}`);
console.log('\n✅ додано правило ar_teya_glamping_fix (sort_order 0) — корекція переживе повторний прогін правил');
