#!/usr/bin/env node
/* eslint-disable */
/**
 * fix-invoice-encoding.cjs — repair double-encoded UTF-8 (mojibake) in invoices.
 *
 * Some Booking/Excel CSV exports store Cyrillic as "ÐÐ½Ð°ÑÑ..." instead of
 * "Анаст...". This one-off fixes custom_buyer_name + custom_description on
 * existing invoice rows. Only touches strings that look mis-encoded AND
 * re-decode to valid UTF-8, so correct Latin accents (José, Müller) are safe.
 *
 *   node fix-invoice-encoding.cjs            # dry run (shows what would change)
 *   node fix-invoice-encoding.cjs --apply    # write the fixes
 */
const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const DB_PATH = path.join(process.cwd(), 'data', 'alisio.db');

function fixMojibake(s) {
  if (!s) return s;
  if (!/[Â-ß][-¿]|[ÐÑÃ]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    if (fixed && !fixed.includes('�') && fixed !== s) return fixed;
  } catch {}
  return s;
}

const db = new Database(DB_PATH);
const rows = db.prepare(
  "SELECT id, invoice_number, custom_buyer_name, custom_description FROM invoices"
).all();

const upd = db.prepare(
  "UPDATE invoices SET custom_buyer_name = ?, custom_description = ? WHERE id = ?"
);

let changed = 0;
const tx = db.transaction(() => {
  for (const r of rows) {
    const name = fixMojibake(r.custom_buyer_name);
    const desc = fixMojibake(r.custom_description);
    if (name !== r.custom_buyer_name || desc !== r.custom_description) {
      changed++;
      console.log(`• ${r.invoice_number}`);
      if (name !== r.custom_buyer_name) console.log(`    name: ${r.custom_buyer_name}  →  ${name}`);
      if (desc !== r.custom_description) console.log(`    desc: ${(r.custom_description||'').slice(0,60)}  →  ${(desc||'').slice(0,60)}`);
      if (APPLY) upd.run(name, desc, r.id);
    }
  }
});
tx();

console.log(`\n${changed} фактур(и) з поламаним кодуванням${APPLY ? ' — виправлено ✅' : ' (dry-run; додай --apply щоб записати)'}.`);
db.close();
