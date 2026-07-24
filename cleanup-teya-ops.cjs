#!/usr/bin/env node
/* eslint-disable */
/**
 * cleanup-teya-ops.cjs — remove finance operations that were wrongly created
 * from Teya reconciliation (CSV import / API sync).
 *
 * Operations must contain ONLY bank-statement rows and manually-entered cash.
 * Teya settles to the bank as a daily batch, so any operation tagged
 * source='teya_csv' or 'teya_sync' double-counts money the bank import already
 * records. This one-off deletes exactly those rows — nothing else is touched.
 *
 *   node cleanup-teya-ops.cjs           # dry run (shows what would be deleted)
 *   node cleanup-teya-ops.cjs --apply   # actually delete
 */
const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const DB_PATH = path.join(process.cwd(), 'data', 'alisio.db');

const db = new Database(DB_PATH);

const summary = db.prepare(`
  SELECT source, currency, COUNT(*) AS n, printf('%.2f', SUM(amount)) AS total
  FROM fin_operations
  WHERE source IN ('teya_csv', 'teya_sync')
  GROUP BY source, currency
  ORDER BY source, currency
`).all();

if (!summary.length) {
  console.log('Операцій з source teya_csv / teya_sync не знайдено — нічого прибирати ✅');
  db.close();
  process.exit(0);
}

console.log('Знайдено операції, створені зі звірки Teya (будуть видалені):\n');
let grand = 0;
for (const r of summary) {
  console.log(`  • ${r.source.padEnd(10)} ${String(r.n).padStart(5)} шт   ${String(r.total).padStart(12)} ${r.currency}`);
  grand += r.n;
}
console.log(`\n  Разом: ${grand} операцій`);

if (APPLY) {
  const info = db.prepare("DELETE FROM fin_operations WHERE source IN ('teya_csv', 'teya_sync')").run();
  console.log(`\n✅ Видалено ${info.changes} операцій. В операціях лишились тільки банк + ручна готівка.`);
} else {
  console.log('\n(dry-run — нічого не видалено; додай --apply щоб виконати)');
}

db.close();
