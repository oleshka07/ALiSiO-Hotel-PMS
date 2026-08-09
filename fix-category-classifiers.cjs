#!/usr/bin/env node
/**
 * Пункти 2 і 3 ревізії P&L — виправлення classifier у плані рахунків.
 *
 * «Звірка залишків» — технічна заглушка вирівнювання залишків. Дві її прибуткові
 * операції на 9 566,80 падали у Виручку, а витратна на 5 747,84 — в «Інше», яке
 * відмінусовується від чистого результату. Тобто заглушка і надувала виручку, і
 * псувала результат.
 *
 * «Дивіденди» (132 352) стояли як 'other' і теж відмінусовувались від чистого
 * результату. Дивіденди — це розподіл прибутку, а не витрата; їм місце нижче
 * лінії, у фінансових.
 *
 * «Банківські комісії KB» (5 341,35) стояли як 'financing' і випадали з EBITDA.
 * Це звичайна операційна витрата.
 *
 * Без --apply — dry-run.
 */
const Database = require('better-sqlite3');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(__dirname, 'data/alisio.db'));
db.pragma('busy_timeout = 15000');

const CHANGES = [
  { id: 'ec_reconcile_mrjr2s70',          classifier: 'technical',   include_in_pnl: 0, why: 'технічна заглушка, у P&L не місце' },
  { id: 'ec_transfer',                    classifier: 'technical',   include_in_pnl: 0, why: 'переказ, не дохід і не витрата' },
  { id: 'ec_dividend_1778435293254_0306', classifier: 'financing',   include_in_pnl: 0, why: 'розподіл прибутку, нижче лінії' },
  { id: 'ec_1782308061640_cr4r',          classifier: 'operational', include_in_pnl: 1, why: 'операційна витрата, має бути в EBITDA' },
];

const sel = db.prepare(`SELECT ec.id, ec.name, ec.classifier, ec.include_in_pnl,
  (SELECT COUNT(*) FROM fin_operations o WHERE o.category_id = ec.id) n,
  (SELECT COALESCE(SUM(o.amount_company),0) FROM fin_operations o WHERE o.category_id = ec.id) s
  FROM expense_categories ec WHERE ec.id = ?`);

for (const c of CHANGES) {
  const r = sel.get(c.id);
  if (!r) { console.error(`категорія ${c.id} не знайдена — зупиняюсь`); process.exit(1); }
  console.log(`${r.name.padEnd(24)} ${String(r.classifier).padEnd(11)} → ${c.classifier.padEnd(11)} ` +
              `pnl ${r.include_in_pnl}→${c.include_in_pnl}   ${String(r.n).padStart(3)} оп ${r.s.toFixed(2).padStart(11)}   ${c.why}`);
}

if (!APPLY) { console.log('\nПробний прогін. Для запису — з --apply'); process.exit(0); }

const upd = db.prepare('UPDATE expense_categories SET classifier = ?, include_in_pnl = ? WHERE id = ?');
db.transaction(() => { for (const c of CHANGES) upd.run(c.classifier, c.include_in_pnl, c.id); })();

console.log('\n✅ записано');
console.log(db.prepare(`SELECT name, classifier, include_in_pnl FROM expense_categories
                        WHERE id IN (${CHANGES.map(() => '?').join(',')})`).all(...CHANGES.map((c) => c.id)));
db.close();
