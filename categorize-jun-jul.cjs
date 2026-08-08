#!/usr/bin/env node
/**
 * Категоризація операцій червня–липня 2026, підтверджена власником 08.08.2026.
 * Кожна зміна пише рядок у fin_operation_audit. Без --apply — тільки dry-run.
 */
const Database = require('better-sqlite3');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(__dirname, 'data/alisio.db'));
db.pragma('busy_timeout = 15000');

const FROM = '2026-06-01';
const TO = '2026-08-01';
const ACTOR = { id: null, name: 'categorize-jun-jul.cjs (owner-approved)' };

const CAT = {
  vodakva: 'ec_1782293612702_t7xh',
  elektryka: 'ec_1782293623107_03qc',
  komisia: 'ec_1782294307002_5iff',
  podatky: 'ec_taxes',
  profposlugy: 'ec_professional',
  instrument: 'ec_1782348118722_w4ru',
  strahuvannia: 'ec_1782293529396_wbmi',
  materialy: 'ec_1782348080636_dmnj',
  budivnytstvo: 'ec_1777246383724_9oes',
  trafik: 'ec_1782294201922_lsbm',
  websevisy: 'ec_1782348165960_oejw',
  produkty: 'ec_products',
  inshi_vytraty: 'ec_other_exp',
  prozhyvannia: 'ec_accommodation',
  inshi_dohody: 'ec_other_rev',
};
const BU = {
  shared: 'bu_shared',
  camping: 'bu_camping',
  glamping: 'bu_glamping',
  restaurant: 'bu_restaurant',
  fd: 'bu_budova_fd',
};

// Кожне правило торкається лише операцій, у яких category_id ще NULL.
const TAX_REFS = ['OB000490FFI', 'OB00048HBT6', 'OB000490HL7', 'OB00048HBNZ',
                  'OB000490FI7', 'OB00048HBKT', 'OB000490FGZ', 'OB00048HBJK', 'OB000490FE4'];

const RULES = [
  { n: 1,  label: 'Водаква',                        type: 'expense', like: ['VODÁRNY%'],                        cat: CAT.vodakva,       bu: BU.shared },
  { n: 2,  label: 'Електрика (innogy.cz)',          type: 'expense', like: ['%innogy%'],                        cat: CAT.elektryka,     bu: BU.shared },
  { n: 4,  label: 'Booking комісія → Glamping',     type: 'expense', ids: ['exp_1784016923547_ezoi'],           cat: CAT.komisia,       bu: BU.glamping },
  { n: 4,  label: 'Booking комісія → Будова F/D',   type: 'expense', ids: ['exp_1784967315333_ouy9'],           cat: CAT.komisia,       bu: BU.fd },
  { n: 5,  label: 'Податки з ЗП (щомісячний набір)', type: 'expense', like: TAX_REFS.map((r) => `%${r}%`),      cat: CAT.podatky,       bu: BU.shared },
  { n: 6,  label: 'Бухгалтерія (UCETNI PRACE)',     type: 'expense', like: ['%UCETNI PRACE%'],                  cat: CAT.profposlugy,   bu: BU.shared },
  { n: 7,  label: 'HECHT MOTORS',                   type: 'expense', like: ['%HECHT MOTORS%'],                  cat: CAT.instrument,    bu: BU.shared },
  { n: 8,  label: 'Kooperativa (страхування)',      type: 'expense', like: ['Kooperativa%'],                    cat: CAT.strahuvannia,  bu: BU.shared },
  { n: 9,  label: 'OBEC BŘEZOVÁ (poplatek)',        type: 'expense', like: ['OBEC BŘEZOVÁ%'],                   cat: CAT.podatky,       bu: BU.camping },
  { n: 10, label: 'B094',                           type: 'expense', like: ['B094%'],                           cat: CAT.materialy,     bu: BU.shared },
  { n: 11, label: 'H&B Group',                      type: 'expense', like: ['H&B Group%'],                      cat: CAT.materialy,     bu: BU.shared },
  { n: 12, label: 'EMOS',                           type: 'expense', like: ['EMOS%'],                           cat: CAT.materialy,     bu: BU.shared },
  { n: 13, label: 'Loziska Peterka',                type: 'expense', like: ['Loziska Peterka%'],                cat: CAT.budivnytstvo,  bu: BU.shared },
  { n: 14, label: 'Google Ads / Seznam',            type: 'expense', like: ['GOOGLE *ADS%', 'SEZNAM.CZ%'],      cat: CAT.trafik,        bu: BU.camping },
  { n: 15, label: 'Google Workspace / OpenAI',      type: 'expense', like: ['Google Workspace%', 'OPENAI%'],    cat: CAT.websevisy,     bu: BU.shared },
  { n: 16, label: 'Makro',                          type: 'expense', like: ['Makro%'],                          cat: CAT.produkty,      bu: BU.restaurant },
  { n: 17, label: 'MOL 642 (паливо)',               type: 'expense', like: ['MOL 642%'],                        cat: CAT.inshi_vytraty, bu: BU.shared },
  { n: 18, label: 'GUNZA TECH',                     type: 'expense', like: ['GUNZA TECH%'],                     cat: CAT.profposlugy,   bu: BU.shared },
  { n: 19, label: 'Налог 83/17%',                   type: 'expense', like: ['Налог в соотношении%'],            cat: CAT.podatky,       bu: BU.shared },

  { n: 24, label: 'Готівка через віджет',           type: 'income',  source: 'booking_widget',                  cat: CAT.prozhyvannia,  bu: BU.camping },
  { n: 27, label: 'Manual RES → Будова F/D',        type: 'income',  ids: ['inc_1785232432929_yh5u', 'inc_1784999089380_fr0k', 'inc_1784999116361_t3oj'], cat: CAT.prozhyvannia, bu: BU.fd },
  { n: 27, label: 'Manual RES BB22 → Кемпінг',      type: 'income',  ids: ['inc_1784911174444_f72k'],           cat: CAT.prozhyvannia,  bu: BU.camping },
  { n: 28, label: 'KB виписка 99,00',               type: 'income',  ids: ['inc_1783978292653_5292e8'],         cat: CAT.inshi_dohody,  bu: BU.shared },
];

// №3 і №20 — не витрати по суті, стають op_type='transfer' (P&L фільтрує саме по op_type).
const TO_TRANSFER = [
  { n: 3,  label: 'Знято з банкомата → Андріїв cash', ids: ['exp_1784708112082_ecsi', 'exp_1785399311485_bzy0'], to: 'acct_1778843245916_cj7m' },
  { n: 20, label: 'Оплата картою на власному терміналі', like: ['KEMP CARLSBAD%'], to: null },
];

const BU_MERGE = { from: ['bu_1777246456393_07l9', 'bu_1782310076290_qusw'], to: 'bu_budova_fd' };

const selectByRule = (r) => {
  if (r.ids) {
    const plh = r.ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM fin_operations WHERE id IN (${plh}) AND category_id IS NULL`).all(...r.ids);
  }
  const where = ['category_id IS NULL', 'op_type = ?', 'paid_at >= ?', 'paid_at < ?'];
  const args = [r.type, FROM, TO];
  if (r.source) { where.push('source = ?'); args.push(r.source); }
  if (r.like) { where.push('(' + r.like.map(() => 'comment LIKE ?').join(' OR ') + ')'); args.push(...r.like); }
  return db.prepare(`SELECT * FROM fin_operations WHERE ${where.join(' AND ')}`).all(...args);
};

const audit = db.prepare(`INSERT INTO fin_operation_audit (operation_id, action, user_id, user_name, before_json, after_json)
                          VALUES (?, 'update', ?, ?, ?, ?)`);
const setTags = db.prepare(`UPDATE fin_operations SET category_id = ?, project_id = COALESCE(project_id, ?), updated_at = datetime('now') WHERE id = ?`);
const setTransfer = db.prepare(`UPDATE fin_operations SET op_type = 'transfer', account_to_id = ?, updated_at = datetime('now') WHERE id = ?`);
const setBu = db.prepare(`UPDATE fin_operations SET project_id = ?, updated_at = datetime('now') WHERE id = ?`);

const pick = (o) => ({ op_type: o.op_type, category_id: o.category_id, project_id: o.project_id, account_to_id: o.account_to_id });
const fmt = (n) => n.toFixed(2).padStart(10);

let touched = 0, sum = 0;
const run = db.transaction(() => {
  for (const r of RULES) {
    const rows = selectByRule(r);
    if (!rows.length) { console.log(`  №${String(r.n).padEnd(3)} ${r.label.padEnd(38)} — 0 операцій ⚠️`); continue; }
    const total = rows.reduce((a, o) => a + o.amount, 0);
    console.log(`  №${String(r.n).padEnd(3)} ${r.label.padEnd(38)} ${String(rows.length).padStart(3)} оп ${fmt(total)}`);
    for (const o of rows) {
      if (APPLY) {
        const before = pick(o);
        setTags.run(r.cat, r.bu, o.id);
        const after = pick(db.prepare('SELECT * FROM fin_operations WHERE id = ?').get(o.id));
        audit.run(o.id, ACTOR.id, ACTOR.name, JSON.stringify(before), JSON.stringify(after));
      }
      touched++; sum += o.amount;
    }
  }

  console.log('\n  → у переміщення (op_type=transfer):');
  for (const t of TO_TRANSFER) {
    const rows = t.ids
      ? db.prepare(`SELECT * FROM fin_operations WHERE id IN (${t.ids.map(() => '?').join(',')}) AND op_type = 'expense'`).all(...t.ids)
      : db.prepare(`SELECT * FROM fin_operations WHERE category_id IS NULL AND op_type = 'expense' AND paid_at >= ? AND paid_at < ?
                    AND (${t.like.map(() => 'comment LIKE ?').join(' OR ')})`).all(FROM, TO, ...t.like);
    const total = rows.reduce((a, o) => a + o.amount, 0);
    console.log(`  №${String(t.n).padEnd(3)} ${t.label.padEnd(38)} ${String(rows.length).padStart(3)} оп ${fmt(total)}`);
    for (const o of rows) {
      if (APPLY) {
        const before = pick(o);
        setTransfer.run(t.to, o.id);
        const after = pick(db.prepare('SELECT * FROM fin_operations WHERE id = ?').get(o.id));
        audit.run(o.id, ACTOR.id, ACTOR.name, JSON.stringify(before), JSON.stringify(after));
      }
      touched++; sum += o.amount;
    }
  }

  const merge = db.prepare(`SELECT * FROM fin_operations WHERE project_id IN (${BU_MERGE.from.map(() => '?').join(',')})`).all(...BU_MERGE.from);
  console.log(`\n  → зведення юнітів «Будова Ф» + «Будова Д» → «Будова F/D»: ${merge.length} оп`);
  for (const o of merge) {
    if (APPLY) {
      const before = pick(o);
      setBu.run(BU_MERGE.to, o.id);
      const after = pick(db.prepare('SELECT * FROM fin_operations WHERE id = ?').get(o.id));
      audit.run(o.id, ACTOR.id, ACTOR.name, JSON.stringify(before), JSON.stringify(after));
    }
  }
  if (APPLY) {
    for (const id of BU_MERGE.from) db.prepare('UPDATE business_units SET is_active = 0 WHERE id = ?').run(id);
  }
  if (!APPLY) throw new Error('DRY_RUN');
});

console.log(`\n${APPLY ? '=== ЗАПИС ===' : '=== DRY RUN (без --apply) ==='}\n`);
try { run(); } catch (e) { if (e.message !== 'DRY_RUN') throw e; }
console.log(`\n  разом: ${touched} операцій, ${sum.toFixed(2)} CZK`);

const left = db.prepare(`SELECT op_type, COUNT(*) c, SUM(amount) s FROM fin_operations
                         WHERE category_id IS NULL AND paid_at >= ? AND paid_at < ? GROUP BY op_type`).all(FROM, TO);
console.log('\n  залишилось без категорії:');
for (const l of left) console.log(`    ${l.op_type.padEnd(9)} ${String(l.c).padStart(3)} оп ${fmt(l.s)}`);
db.close();
