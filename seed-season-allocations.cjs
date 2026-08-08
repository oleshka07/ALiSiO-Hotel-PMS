#!/usr/bin/env node
/**
 * Правило розподілу спільних витрат («Загальне / Kemp Carlsbad») по напрямках.
 * Сезон — 25.05…30.09, решта року — міжсезоння. Задано власником 08.08.2026.
 * «Купель + сауна» у правилі одна цифра, тому ділиться між двома юнітами навпіл.
 */
const Database = require('better-sqlite3');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(__dirname, 'data/alisio.db'));
db.pragma('busy_timeout = 15000');

const EFFECTIVE_FROM = '2026-01';
const RULES = {
  SEASON: {
    bu_budova_fd: 25,
    bu_camping: 35,
    bu_glamping: 25,
    bu_restaurant: 10,
    bu_pool: 2.5,
    bu_sauna: 2.5,
  },
  OFFSEASON: {
    bu_budova_fd: 20,
    bu_camping: 5,
    bu_glamping: 55,
    bu_restaurant: 5,
    bu_pool: 7.5,
    bu_sauna: 7.5,
  },
};

const org = db.prepare('SELECT id FROM organizations LIMIT 1').get().id;
const nameOf = db.prepare('SELECT name FROM business_units WHERE id = ?');

for (const [method, shares] of Object.entries(RULES)) {
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  console.log(`\n${method}  (сума ${sum}%)`);
  for (const [buId, pct] of Object.entries(shares)) {
    const bu = nameOf.get(buId);
    if (!bu) { console.log(`  ⚠️  юніт ${buId} не існує — зупиняюсь`); process.exit(1); }
    console.log(`  ${bu.name.padEnd(26)} ${String(pct).padStart(5)}%`);
  }
  if (Math.abs(sum - 100) > 0.001) { console.log('  ⚠️  сума не 100% — зупиняюсь'); process.exit(1); }
}

if (!APPLY) {
  console.log('\nПробний прогін. Для запису — з --apply');
  process.exit(0);
}

const del = db.prepare(`DELETE FROM cost_allocations WHERE organization_id = ? AND alloc_method IN ('SEASON','OFFSEASON')`);
const ins = db.prepare(`INSERT INTO cost_allocations (organization_id, month, alloc_method, business_unit_id, percentage)
                        VALUES (?, ?, ?, ?, ?)`);

db.transaction(() => {
  del.run(org);
  for (const [method, shares] of Object.entries(RULES)) {
    for (const [buId, pct] of Object.entries(shares)) ins.run(org, EFFECTIVE_FROM, method, buId, pct);
  }
})();

console.log(`\n✅ записано, діє з ${EFFECTIVE_FROM}`);
console.log(db.prepare(`SELECT alloc_method, count(*) n, sum(percentage) s FROM cost_allocations
                        WHERE alloc_method IN ('SEASON','OFFSEASON') GROUP BY 1`).all());
db.close();
