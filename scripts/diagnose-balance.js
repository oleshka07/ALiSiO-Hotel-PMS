#!/usr/bin/env node
/**
 * Diagnose: why "Олег наличные" shows 1.2M instead of 128k
 */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'), { readonly: true });

const OLEG_ACCT = 'acct_imp_1777364002109_935c64';

const acct = db.prepare('SELECT * FROM finance_accounts WHERE id = ?').get(OLEG_ACCT);
console.log(`Account: ${acct.name} [${acct.currency}], initial: ${acct.initial_balance}\n`);

// Mismatched currency inflows
console.log('═══ INFLOWS with currency ≠ CZK ═══\n');
const mismIn = db.prepare(`
  SELECT o.id, o.amount, o.currency, o.amount_company, o.paid_at, o.comment, o.source
  FROM fin_operations o
  WHERE o.account_to_id = ? AND o.currency != ? AND o.status = 'completed'
  ORDER BY o.amount_company DESC
`).all(OLEG_ACCT, acct.currency);

let totalMismInAmt = 0, totalMismInCo = 0;
for (const op of mismIn) {
  console.log(`  ${op.id} | ${op.amount} ${op.currency} → company: ${op.amount_company}`);
  console.log(`    ${op.paid_at?.substring(0,10)} | ${op.source} | ${(op.comment||'').substring(0,80)}`);
  totalMismInAmt += Number(op.amount || 0);
  totalMismInCo += Number(op.amount_company || 0);
}
console.log(`\n  COUNT: ${mismIn.length} | SUM amount: ${totalMismInAmt} | SUM amount_company: ${totalMismInCo}`);
console.log(`  INFLATION: +${totalMismInCo - totalMismInAmt} CZK added by using amount_company\n`);

// Mismatched currency outflows
console.log('═══ OUTFLOWS with currency ≠ CZK ═══\n');
const mismOut = db.prepare(`
  SELECT o.id, o.amount, o.currency, o.amount_company, o.paid_at, o.comment, o.source
  FROM fin_operations o
  WHERE o.account_from_id = ? AND o.currency != ? AND o.status = 'completed'
  ORDER BY o.amount_company DESC
`).all(OLEG_ACCT, acct.currency);

let totalMismOutAmt = 0, totalMismOutCo = 0;
for (const op of mismOut) {
  console.log(`  ${op.id} | ${op.amount} ${op.currency} → company: ${op.amount_company}`);
  console.log(`    ${op.paid_at?.substring(0,10)} | ${op.source} | ${(op.comment||'').substring(0,80)}`);
  totalMismOutAmt += Number(op.amount || 0);
  totalMismOutCo += Number(op.amount_company || 0);
}
console.log(`\n  COUNT: ${mismOut.length} | SUM amount: ${totalMismOutAmt} | SUM amount_company: ${totalMismOutCo}`);
console.log(`  INFLATION: -${totalMismOutCo - totalMismOutAmt} CZK removed by using amount_company\n`);

// Balance comparison
console.log('═══ BALANCE COMPARISON ═══\n');

const rawBal = db.prepare(`
  SELECT (? 
    + COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_to_id = ? AND status='completed'), 0)
    - COALESCE((SELECT SUM(amount) FROM fin_operations WHERE account_from_id = ? AND status='completed'), 0)
  ) AS bal
`).get(acct.initial_balance || 0, OLEG_ACCT, OLEG_ACCT);

const dashBal = db.prepare(`
  SELECT (?
    + COALESCE((SELECT SUM(CASE WHEN currency = ? THEN amount ELSE amount_company END) FROM fin_operations WHERE account_to_id = ? AND status='completed'), 0)
    - COALESCE((SELECT SUM(CASE WHEN currency = ? THEN amount ELSE amount_company END) FROM fin_operations WHERE account_from_id = ? AND status='completed'), 0)
  ) AS bal
`).get(acct.initial_balance || 0, acct.currency, OLEG_ACCT, acct.currency, OLEG_ACCT);

console.log(`  SUM(amount) only:     ${Number(rawBal.bal).toLocaleString()} CZK`);
console.log(`  Dashboard CASE logic: ${Number(dashBal.bal).toLocaleString()} CZK`);
console.log(`  DIFFERENCE:           +${(Number(dashBal.bal) - Number(rawBal.bal)).toLocaleString()} CZK`);
console.log(`\n  ➡️  The CASE logic inflates the balance by using amount_company for EUR ops`);
console.log(`     These EUR ops should NOT be on a CZK cash account at all,`);
console.log(`     or the balance formula should always use o.amount for same-type accounts.`);

db.close();
