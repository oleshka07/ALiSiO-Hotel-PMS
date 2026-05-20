#!/usr/bin/env node
/**
 * fix-eur-operations.js
 * 
 * Diagnoses and fixes EUR operations that were saved with currency='CZK' 
 * (amount_company = amount instead of amount * fx_rate).
 * 
 * Usage:
 *   node fix-eur-operations.js              # DRY RUN — only prints what would change
 *   node fix-eur-operations.js --apply      # APPLY changes
 */

const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = !process.argv.includes('--apply');
const DB_PATH = path.join(__dirname, 'data', 'alisio.db');

console.log(`\n=== EUR Operations Fix Script ===`);
console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '⚡ APPLY MODE'}`);
console.log(`DB: ${DB_PATH}\n`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 1. Diagnostic: show all exchange rates
console.log('--- Exchange Rates ---');
const rates = db.prepare(`
  SELECT from_currency, to_currency, rate, effective_from 
  FROM finance_exchange_rates 
  ORDER BY from_currency, effective_from DESC
`).all();
rates.forEach(r => console.log(`  ${r.from_currency}→${r.to_currency}: ${r.rate} (from ${r.effective_from})`));
console.log();

// 2. Find operations where currency != CZK but amount_company = amount (not converted)
console.log('--- Case A: currency != CZK but amount_company ≈ amount (not converted) ---');
const caseA = db.prepare(`
  SELECT id, op_type, amount, currency, amount_company, fx_rate, paid_at, comment,
         account_from_id, account_to_id
  FROM fin_operations 
  WHERE currency != 'CZK' 
    AND (amount_company = amount OR amount_company IS NULL OR fx_rate IS NULL)
  ORDER BY paid_at DESC
`).all();
console.log(`  Found: ${caseA.length} operations`);
caseA.forEach(r => {
  console.log(`  ${r.id} | ${r.paid_at?.substring(0,10)} | ${r.currency} ${r.amount} | company=${r.amount_company} | fx=${r.fx_rate} | ${(r.comment||'').substring(0,40)}`);
});
console.log();

// 3. Find EUR-looking operations on CZK-marked: amounts that look like EUR 
//    (small amounts on accounts that should have EUR)
//    Check which accounts are named with "EUR" or "cash" patterns
console.log('--- Accounts ---');
const accounts = db.prepare('SELECT id, name, currency FROM finance_accounts ORDER BY name').all();
accounts.forEach(a => console.log(`  ${a.id} | ${a.currency} | ${a.name}`));
console.log();

// 4. Find operations where currency='CZK' but the account is EUR-denominated
console.log('--- Case B: currency=CZK but posted to EUR account ---');
const caseB = db.prepare(`
  SELECT o.id, o.op_type, o.amount, o.currency, o.amount_company, o.fx_rate, o.paid_at, o.comment,
         o.account_from_id, o.account_to_id,
         COALESCE(af.currency, '') as from_acct_currency,
         COALESCE(at2.currency, '') as to_acct_currency,
         COALESCE(af.name, '') as from_acct_name,
         COALESCE(at2.name, '') as to_acct_name
  FROM fin_operations o
  LEFT JOIN finance_accounts af ON af.id = o.account_from_id
  LEFT JOIN finance_accounts at2 ON at2.id = o.account_to_id
  WHERE o.currency = 'CZK'
    AND (af.currency = 'EUR' OR at2.currency = 'EUR')
  ORDER BY o.paid_at DESC
`).all();
console.log(`  Found: ${caseB.length} operations`);
caseB.forEach(r => {
  console.log(`  ${r.id} | ${r.paid_at?.substring(0,10)} | marked ${r.currency} ${r.amount} | company=${r.amount_company} | acct_to=${r.to_acct_name}(${r.to_acct_currency}) | ${(r.comment||'').substring(0,30)}`);
});
console.log();

// 5. Show ALL non-CZK currency operations
console.log('--- All non-CZK operations ---');
const allNonCzk = db.prepare(`
  SELECT id, op_type, amount, currency, amount_company, fx_rate, paid_at, comment
  FROM fin_operations WHERE currency != 'CZK' ORDER BY paid_at DESC
`).all();
console.log(`  Found: ${allNonCzk.length} operations`);
allNonCzk.forEach(r => {
  console.log(`  ${r.id} | ${r.paid_at?.substring(0,10)} | ${r.currency} ${r.amount} | company=${r.amount_company} | fx=${r.fx_rate} | ${(r.comment||'').substring(0,40)}`);
});
console.log();

// 6. Show total counts
const total = db.prepare('SELECT COUNT(*) as c FROM fin_operations').get();
console.log(`Total operations: ${total.c}`);
console.log();

// 7. If --apply: Fix Case A (non-CZK with wrong amount_company)
if (!DRY_RUN && caseA.length > 0) {
  console.log('=== Applying fixes for Case A ===');
  const getRate = db.prepare(`
    SELECT rate FROM finance_exchange_rates 
    WHERE from_currency = ? AND to_currency = 'CZK' AND effective_from <= ?
    ORDER BY effective_from DESC LIMIT 1
  `);
  const getRateFallback = db.prepare(`
    SELECT rate FROM finance_exchange_rates 
    WHERE from_currency = ? AND to_currency = 'CZK'
    ORDER BY effective_from DESC LIMIT 1
  `);
  const update = db.prepare(`
    UPDATE fin_operations SET amount_company = ?, fx_rate = ? WHERE id = ?
  `);

  const tx = db.transaction(() => {
    for (const op of caseA) {
      let rateRow = getRate.get(op.currency, op.paid_at?.substring(0, 10) || '2026-01-01');
      if (!rateRow) rateRow = getRateFallback.get(op.currency);
      if (!rateRow) {
        console.log(`  ⚠️ SKIP ${op.id}: no ${op.currency}→CZK rate found`);
        continue;
      }
      const newCompany = Math.round(op.amount * rateRow.rate * 100) / 100;
      console.log(`  ✅ ${op.id}: ${op.currency} ${op.amount} × ${rateRow.rate} = ${newCompany} CZK (was ${op.amount_company})`);
      update.run(newCompany, rateRow.rate, op.id);
    }
  });
  tx();
  console.log(`  Done: ${caseA.length} operations fixed.`);
}

// 8. If --apply: Fix Case B (CZK-marked on EUR accounts — need to set currency to EUR)
if (!DRY_RUN && caseB.length > 0) {
  console.log('\n=== Applying fixes for Case B ===');
  const getRate = db.prepare(`
    SELECT rate FROM finance_exchange_rates 
    WHERE from_currency = 'EUR' AND to_currency = 'CZK' AND effective_from <= ?
    ORDER BY effective_from DESC LIMIT 1
  `);
  const getRateFallback = db.prepare(`
    SELECT rate FROM finance_exchange_rates 
    WHERE from_currency = 'EUR' AND to_currency = 'CZK'
    ORDER BY effective_from DESC LIMIT 1
  `);
  const update = db.prepare(`
    UPDATE fin_operations SET currency = 'EUR', amount_company = ?, fx_rate = ? WHERE id = ?
  `);

  const tx = db.transaction(() => {
    for (const op of caseB) {
      let rateRow = getRate.get(op.paid_at?.substring(0, 10) || '2026-01-01');
      if (!rateRow) rateRow = getRateFallback.get();
      if (!rateRow) {
        console.log(`  ⚠️ SKIP ${op.id}: no EUR→CZK rate found`);
        continue;
      }
      const newCompany = Math.round(op.amount * rateRow.rate * 100) / 100;
      console.log(`  ✅ ${op.id}: EUR ${op.amount} × ${rateRow.rate} = ${newCompany} CZK (was currency=${op.currency}, company=${op.amount_company})`);
      update.run(newCompany, rateRow.rate, op.id);
    }
  });
  tx();
  console.log(`  Done: ${caseB.length} operations fixed.`);
}

if (DRY_RUN) {
  console.log('\n💡 To apply fixes, run: node fix-eur-operations.js --apply\n');
}

db.close();
