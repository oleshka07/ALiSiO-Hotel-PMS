#!/usr/bin/env node
/**
 * Крок 2: виправлення хибної категорії «Прибиральниця» (A1–A5), проставлення
 * бізнес-юнітів (B1–B10) і закриття нерозібраних операцій. Підтверджено 08.08.2026.
 * Без --apply — dry-run.
 */
const Database = require('better-sqlite3');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(__dirname, 'data/alisio.db'));
db.pragma('busy_timeout = 15000');
const ACTOR = 'fix-bu-jun-jul.cjs (owner-approved)';

const C = {
  trafik: 'ec_1782294201922_lsbm',
  materialy: 'ec_1782348080636_dmnj',
  websevisy: 'ec_1782348165960_oejw',
  terytoria: 'ec_1782348105650_2u87',
  inshi_vytraty: 'ec_other_exp',
  prozhyvannia: 'ec_accommodation',
};
const B = { shared: 'bu_shared', camping: 'bu_camping', restaurant: 'bu_restaurant', glamping: 'bu_glamping' };

// cat === null → категорію не змінюємо, ставимо тільки юніт.
const JOBS = [
  { n: 'A1', label: 'GOOGLE ADS → Маркетинг Трафік',            ids: ['exp_1785574825061_4ddu'], cat: C.trafik,        bu: B.camping },
  { n: 'A2', label: 'atoselektro → Будівництво-матеріали',       ids: ['exp_1785536858988_sieb'], cat: C.materialy,     bu: B.shared },
  { n: 'A3', label: 'Google CLOUD → Веб сервіси',                ids: ['exp_1785574825052_esna'], cat: C.websevisy,     bu: B.shared },
  { n: 'A4', label: 'AGROMAK → Будівництво-територія/ресторан',  ids: ['exp_1785536858978_vrcx'], cat: C.terytoria,     bu: B.shared },
  { n: 'A5', label: 'ECMC → Інші витрати',                       ids: ['exp_1785574825047_4ufo'], cat: C.inshi_vytraty, bu: B.shared },

  { n: 'B1', label: 'OBI ×5 → Загальне', ids: ['exp_1781684116446_jgao', 'exp_1782288909527_cxyy', 'exp_1782807307884_xu9i', 'exp_1784708112077_8urj', 'exp_1785399311481_gwtp'], cat: null, bu: B.shared },
  { n: 'B2', label: 'Karlovy Vary CZ → Загальне',                ids: ['exp_1782202508576_yhfu'], cat: null, bu: B.shared },
  { n: 'B3', label: 'со2 на бар → Ресторан',                     ids: ['exp_1782132056095_eg56'], cat: null, bu: B.restaurant },
  { n: 'B4', label: 'Тхон 8 годин → Загальне',                   ids: ['exp_1782144796204_41oj'], cat: null, bu: B.shared },
  { n: 'B5', label: 'Сніданки + сумки → Ресторан',               ids: ['exp_1782302220598_3bqx', 'exp_1782302254521_muua'], cat: null, bu: B.restaurant },
  { n: 'B6', label: 'Банківські комісії ×2 → Загальне',          ids: ['exp_1781684113234_si6i', 'exp_1781684113247_1tw1'], cat: null, bu: B.shared },
  { n: 'B7', label: 'Дохід 7295 → Ресторан',                     ids: ['inc_1781595008921_p85a'], cat: null, bu: B.restaurant },
  { n: 'B8', label: 'інкасо 865 → Ресторан',                     ids: ['inc_1784472362530_kmsx'], cat: null, bu: B.restaurant },
  { n: 'B9', label: 'ІНКАСО РЕСТОРАН 400 → Ресторан',            ids: ['inc_1785494176042_dqht'], cat: null, bu: B.restaurant },
  { n: 'B10', label: 'Дохід 21,50 → Кемпинг',                    ids: ['inc_1782231562450_i3z8'], cat: null, bu: B.camping },

  { n: 'C1', label: 'Нерозібрані 1300/1648/1054 → Інші витрати + Загальне', ids: ['exp_1780992925150_zjw6', 'exp_1782059590471_ouk7', 'exp_1784103311891_p61e'], cat: C.inshi_vytraty, bu: B.shared },
  { n: 'C2', label: 'Zainulina 3700 → Проживання + Glamping',    ids: ['inc_1785053707936_t5wl'], cat: C.prozhyvannia, bu: B.glamping },
];

const audit = db.prepare(`INSERT INTO fin_operation_audit (operation_id, action, user_id, user_name, before_json, after_json)
                          VALUES (?, 'update', NULL, ?, ?, ?)`);
const upd = db.prepare(`UPDATE fin_operations SET category_id = COALESCE(?, category_id), project_id = ?, updated_at = datetime('now') WHERE id = ?`);
const get = db.prepare('SELECT * FROM fin_operations WHERE id = ?');
const pick = (o) => ({ op_type: o.op_type, category_id: o.category_id, project_id: o.project_id });

let touched = 0, sum = 0;
const run = db.transaction(() => {
  for (const j of JOBS) {
    const rows = j.ids.map((id) => get.get(id)).filter(Boolean);
    if (rows.length !== j.ids.length) {
      console.log(`  ${j.n.padEnd(4)} ⚠️  знайдено ${rows.length} з ${j.ids.length} — пропускаю`);
      continue;
    }
    const total = rows.reduce((a, o) => a + o.amount, 0);
    console.log(`  ${j.n.padEnd(4)} ${j.label.padEnd(50)} ${String(rows.length).padStart(2)} оп ${total.toFixed(2).padStart(10)}`);
    for (const o of rows) {
      if (APPLY) {
        const before = pick(o);
        upd.run(j.cat, j.bu, o.id);
        audit.run(o.id, ACTOR, JSON.stringify(before), JSON.stringify(pick(get.get(o.id))));
      }
      touched++; sum += o.amount;
    }
  }
  if (!APPLY) throw new Error('DRY_RUN');
});

console.log(`\n${APPLY ? '=== ЗАПИС ===' : '=== DRY RUN (без --apply) ==='}\n`);
try { run(); } catch (e) { if (e.message !== 'DRY_RUN') throw e; }
console.log(`\n  разом: ${touched} операцій, ${sum.toFixed(2)} CZK`);

const left = db.prepare(`SELECT op_type, COUNT(*) c, SUM(amount) s FROM fin_operations
  WHERE paid_at >= '2026-06-01' AND paid_at < '2026-08-01' AND (category_id IS NULL OR project_id IS NULL) GROUP BY op_type`).all();
console.log('\n  залишилось без категорії АБО без юніта:');
for (const l of left) console.log(`    ${l.op_type.padEnd(9)} ${String(l.c).padStart(3)} оп ${l.s.toFixed(2).padStart(10)}`);
db.close();
