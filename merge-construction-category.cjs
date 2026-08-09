#!/usr/bin/env node
/**
 * Пункт 1: дві категорії з однаковою назвою «Будівництво» зводяться в одну.
 *
 * У списку вибору вони виглядали однаково, а в звітах падали в різні секції —
 * ec_capex у капітальні, ec_1777246383724_9oes в операційні. 164 операції були
 * розкидані між ними випадково. Залишається капітальна, бо решта родини
 * («Будівництво – матеріали / Інструмент / Комплектація / Територія») теж
 * капітальна, і всередині обох лежить одне й те саме — будівництво будинків.
 *
 * Без --apply — dry-run.
 */
const Database = require('better-sqlite3');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(__dirname, 'data/alisio.db'));
db.pragma('busy_timeout = 15000');

const KEEP = 'ec_capex';
const DROP = 'ec_1777246383724_9oes';

const keep = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(KEEP);
const drop = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(DROP);
if (!keep || !drop) { console.error('одна з категорій не знайдена'); process.exit(1); }
if (keep.name !== drop.name) { console.error(`назви різні: "${keep.name}" vs "${drop.name}" — зупиняюсь`); process.exit(1); }

const stat = (id) => db.prepare(`SELECT count(*) n, COALESCE(SUM(amount_company),0) s FROM fin_operations WHERE category_id = ?`).get(id);
console.log(`залишаємо: ${KEEP}  classifier=${keep.classifier} is_capex=${keep.is_capex}  ${stat(KEEP).n} оп ${stat(KEEP).s.toFixed(2)}`);
console.log(`зводимо:   ${DROP}  classifier=${drop.classifier} is_capex=${drop.is_capex}  ${stat(DROP).n} оп ${stat(DROP).s.toFixed(2)}`);

const REFS = [
  ['fin_operations', 'category_id'],
  ['accruals', 'category_id'],
  ['bank_transactions', 'matched_category_id'],
  ['fin_budgets', 'category_id'],
  ['fin_recurring_templates', 'category_id'],
  ['expense_categories', 'parent_id'],
];

console.log('\nпосилання:');
for (const [t, c] of REFS) {
  const n = db.prepare(`SELECT count(*) n FROM ${t} WHERE ${c} = ?`).get(DROP).n;
  if (n) console.log(`  ${t}.${c}  ${n}`);
}
const rules = db.prepare(`SELECT id, name FROM fin_auto_rules WHERE actions_json LIKE ?`).all(`%${DROP}%`);
for (const r of rules) console.log(`  fin_auto_rules  ${r.id}  ${r.name}`);

if (!APPLY) { console.log('\nПробний прогін. Для запису — з --apply'); process.exit(0); }

const audit = db.prepare(`INSERT INTO fin_operation_audit (operation_id, action, user_id, user_name, before_json, after_json)
                          VALUES (?, 'update', NULL, 'merge-construction-category.cjs (owner-approved)', ?, ?)`);
const get = db.prepare('SELECT * FROM fin_operations WHERE id = ?');

db.transaction(() => {
  for (const o of db.prepare('SELECT * FROM fin_operations WHERE category_id = ?').all(DROP)) {
    db.prepare(`UPDATE fin_operations SET category_id = ?, updated_at = datetime('now') WHERE id = ?`).run(KEEP, o.id);
    audit.run(o.id, JSON.stringify({ category_id: DROP }), JSON.stringify({ category_id: get.get(o.id).category_id }));
  }
  for (const [t, c] of REFS) {
    if (t === 'fin_operations') continue;
    db.prepare(`UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`).run(KEEP, DROP);
  }
  for (const r of rules) {
    const row = db.prepare('SELECT actions_json FROM fin_auto_rules WHERE id = ?').get(r.id);
    db.prepare('UPDATE fin_auto_rules SET actions_json = ? WHERE id = ?')
      .run(row.actions_json.split(DROP).join(KEEP), r.id);
  }
  // Не видаляємо: у fin_operation_audit лежать before_json зі старим id, і хай
  // вони залишаються розв'язними. Прибираємо зі списків вибору й перейменовуємо,
  // щоб дубль не можна було випадково відновити.
  db.prepare(`UPDATE expense_categories SET is_active = 0, name = 'Будівництво (злито в капітальну)' WHERE id = ?`).run(DROP);
})();

console.log(`\n✅ зведено`);
console.log(`   ${KEEP}: ${stat(KEEP).n} оп ${stat(KEEP).s.toFixed(2)}`);
console.log(`   ${DROP}: ${stat(DROP).n} оп ${stat(DROP).s.toFixed(2)}`);
console.log(db.prepare("SELECT id,name,is_active FROM expense_categories WHERE name LIKE 'Будівництво%' AND parent_id IS NULL").all());
db.close();
