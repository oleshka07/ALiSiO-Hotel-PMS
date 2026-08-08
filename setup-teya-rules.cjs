#!/usr/bin/env node
/* eslint-disable */
/**
 * setup-teya-rules.cjs — split Teya card income by business unit at import time.
 *
 * One rule used to catch every Teya settlement:
 *
 *   comment contains "Banking Circle Denma"  →  project_id = bu_shared
 *
 * so 72% of card revenue (212 549 CZK over June–July) landed in «Загальне» with
 * no category and the P&L could not tell camping from restaurant from glamping.
 *
 * Each Teya store settles under its own reference prefix. Verified against the
 * Teya transaction report for 01.06–31.07 on a clean settlement window, to the
 * haléř:
 *
 *   5155056  Restaurace          26 887,11 → 26 887,28   (0,17)
 *   5155073  kemp-carlsbad.cz    18 678,22 → 18 678,27   (0,05)
 *   5155087  qa-glamping.eu      46 782,39 → 46 782,40   (0,01)
 *   5095484  Camping — settles in multi-day batches rather than daily; every
 *            batch matches once grouped (03–06.07 = 42 469,97 → 42 470,02).
 *
 * The bank account is not the signal on its own: both online stores settle into
 * the Restaurante account, so 66 000 CZK of glamping and camping-online money
 * sits there.
 *
 * But some settlements arrive with a Banking Circle system reference (SY000…)
 * instead of the merchant prefix, and for those the account IS the only signal
 * left. Verified: every SY000 line on KEMP Gold that appears in the report is
 * Camping — 27–30.07 match to the haléř, and 2 678,05 on 22.06 is the
 * 19+20+21.06 batch. SY000 lines on Restaurante could be any of the three
 * stores that settle there, so they go to review rather than a guess.
 *
 * Excluded from the camping rule: 'Bezkempu-platba-<month>2026' — monthly
 * payments through the same counterparty that are not card acquiring at all.
 *
 * What these rules cannot do: a payment over 3 400 on a camping device is a
 * glamping house, but a settlement is a multi-day batch of transactions, so the
 * threshold has nothing to apply to here. That is per-transaction work against
 * the Teya report and the TEYA invoice series.
 *
 *   node setup-teya-rules.cjs            # dry run
 *   node setup-teya-rules.cjs --apply
 */
const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'));
db.pragma('busy_timeout = 15000');

const org = db.prepare('SELECT id FROM organizations LIMIT 1').get();
if (!org) { console.error('❌ немає організації'); process.exit(1); }

const ACC = 'ec_accommodation';
const RES = 'ec_restaurant';
const KEMP_GOLD = db.prepare("SELECT id FROM finance_accounts WHERE name LIKE '%KEMP Gold%'").get()?.id;
if (!KEMP_GOLD) { console.error('❌ не знайдено рахунок KEMP Gold'); process.exit(1); }

const RULES = [
  { id: 'ar_teya_5155056', name: 'Тея — Ресторан (термінал)',
    conds: [{ field: 'comment', op: 'contains', value: '5155056TEYA' }],
    bu: 'bu_restaurant', cat: RES },
  { id: 'ar_teya_5155087', name: 'Тея — Glamping (qa-glamping.eu)',
    conds: [{ field: 'comment', op: 'contains', value: '5155087TEYA' }],
    bu: 'bu_glamping', cat: ACC },
  { id: 'ar_teya_5155073', name: 'Тея — Кемпінг (kemp-carlsbad.cz)',
    conds: [{ field: 'comment', op: 'contains', value: '5155073TEYA' }],
    bu: 'bu_camping', cat: ACC },
  { id: 'ar_teya_5095484', name: 'Тея — Кемпінг (термінал)',
    conds: [{ field: 'comment', op: 'contains', value: '5095484TEYA' }],
    bu: 'bu_camping', cat: ACC },
  // not acquiring — must not be swept into camping revenue
  { id: 'ar_teya_bezkempu', name: 'Bezkempu-platba — на перегляд (не еквайринг)',
    conds: [{ field: 'comment', op: 'contains', value: 'Bezkemp' }],
    bu: 'bu_review', cat: null },
  { id: 'ar_teya_gold_acc', name: 'Тея без префікса на KEMP Gold → Кемпінг',
    conds: [
      { field: 'comment', op: 'contains', value: 'Banking Circle Denma' },
      { field: 'account_to_id', op: 'equals', value: KEMP_GOLD },
    ],
    bu: 'bu_camping', cat: ACC },
  { id: 'ar_teya_fallback', name: 'Тея — магазин невідомий → на перегляд',
    conds: [{ field: 'comment', op: 'contains', value: 'Banking Circle Denma' }],
    bu: 'bu_review', cat: null },
];

for (const r of RULES) {
  const bu = db.prepare('SELECT name FROM business_units WHERE id = ?').get(r.bu);
  if (!bu) { console.error(`❌ немає бізнес-юніта ${r.bu}`); process.exit(1); }
  r._bu = bu.name;
  if (r.cat) {
    const c = db.prepare('SELECT name FROM expense_categories WHERE id = ?').get(r.cat);
    if (!c) { console.error(`❌ немає категорії ${r.cat}`); process.exit(1); }
    r._cat = c.name;
  } else r._cat = '—';
}

const old = db.prepare("SELECT id, name, sort_order FROM fin_auto_rules WHERE name LIKE '%Тея%' OR name LIKE '%Teya%' OR id LIKE 'ar_teya_%'").all();
console.log('ПРИБРАТИ:');
for (const o of old) console.log(`   ${o.name}`);

console.log('\nСТВОРИТИ (по порядку, кожне зупиняє подальші):');
RULES.forEach((r, i) => {
  const c = r.conds.map((x) => `${x.field} ${x.op} ${x.field === 'account_to_id' ? 'KEMP Gold' : '"' + x.value + '"'}`).join(' AND ');
  console.log(`   ${i + 1}. ${r._bu.padEnd(12)} + ${r._cat.padEnd(12)}  ←  ${c}`);
});

// Simulate against every Teya-looking operation, in rule order. Only the two
// operators these rules use are reimplemented here, matching evaluateCondition
// in auto-rules-engine.ts: 'contains' is case-insensitive substring, 'equals' is
// string comparison, and null/undefined reads as ''.
function matchesAllConditions(op, conds) {
  if (!conds.length) return false;
  return conds.every((c) => {
    const raw = op[c.field];
    const actual = raw === null || raw === undefined ? '' : raw;
    if (c.op === 'contains') return String(actual).toLowerCase().includes(String(c.value || '').toLowerCase());
    if (c.op === 'equals') return String(actual) === String(c.value);
    throw new Error(`симуляція не знає оператора ${c.op}`);
  });
}
const ops = db.prepare(`
  SELECT * FROM fin_operations
  WHERE comment LIKE '%Banking Circle Denma%' OR comment LIKE '%TEYA%'
`).all();
const out = new Map();
for (const op of ops) {
  for (const r of RULES) {
    if (op.op_type !== 'income') continue;
    if (matchesAllConditions(op, r.conds)) { out.set(op.id, r); break; }
  }
}
console.log('\nЯК РОЗПАДУТЬСЯ НАЯВНІ ОПЕРАЦІЇ:');
const per = new Map();
for (const [id, r] of out) {
  const op = ops.find((o) => o.id === id);
  const k = `${r._bu} + ${r._cat}`;
  const v = per.get(k) || { n: 0, sum: 0 };
  v.n++; v.sum += op.amount; per.set(k, v);
}
for (const [k, v] of [...per].sort((a, b) => b[1].sum - a[1].sum)) {
  console.log(`   ${k.padEnd(28)} ${String(v.n).padStart(4)} оп.  ${v.sum.toFixed(2).padStart(12)}`);
}
const unmatched = ops.filter((o) => !out.has(o.id));
console.log(`   ${'без правила'.padEnd(28)} ${String(unmatched.length).padStart(4)} оп.  ${unmatched.reduce((s, o) => s + o.amount, 0).toFixed(2).padStart(12)}`);
for (const o of unmatched.slice(0, 6)) console.log(`        ${o.paid_at.slice(0,10)} ${o.op_type} ${o.amount.toFixed(2)}  ${String(o.comment).slice(0,46)}`);

if (!APPLY) { console.log('\nПробний прогін. Нічого не змінено. Для запису — з --apply'); process.exit(0); }

const base = (db.prepare('SELECT COALESCE(MAX(sort_order),0) n FROM fin_auto_rules').get().n) + 1;
db.transaction(() => {
  for (const o of old) db.prepare('DELETE FROM fin_auto_rules WHERE id = ?').run(o.id);
  const ins = db.prepare(`
    INSERT INTO fin_auto_rules (id, organization_id, name, op_type, conditions_json, actions_json, is_active, stop_on_match, sort_order)
    VALUES (?, ?, ?, 'income', ?, ?, 1, 1, ?)
  `);
  RULES.forEach((r, i) => {
    const actions = { set_project_id: r.bu };
    if (r.cat) actions.set_category_id = r.cat;
    ins.run(r.id, org.id, r.name, JSON.stringify(r.conds), JSON.stringify(actions), base + i);
  });
})();

console.log('\n✅ правила створено:');
for (const r of db.prepare("SELECT sort_order, name FROM fin_auto_rules WHERE id LIKE 'ar_teya_%' ORDER BY sort_order").all()) {
  console.log(`   ${String(r.sort_order).padStart(3)}  ${r.name}`);
}
console.log('\nДо наявних операцій НЕ застосовано — це окремий крок.');
