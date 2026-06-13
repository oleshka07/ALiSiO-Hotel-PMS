#!/usr/bin/env node
/**
 * Diagnose: why "Олег наличные" shows 1.2M instead of 128k
 * Check the CASE WHEN o.currency = fa.currency logic
 */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'), { readonly: true });

const OLEG_ACCT = 'acct_imp_1777364002109_935c64';

// Get account info
const acct = db.prepare('SELECT * FROM finance_accounts WHERE id = ?').get(OLEG_ACCT);
console.log(`Account: ${acct.name} [${acct.currency}]`);
console.log(`Initial balance: ${acct.initial_balance}\n`);

// Check operations with MISMATCHED currency
console.log('═══ Operations where o.currency ≠ account currency (CZK) ═══\n');

const mismatchedIn = db.prepare(`
  SELECT o.id, o.amount, o.currency, o.amount_company, o.currency_company,
         o.paid_at, o.comment, o.source, o.op_type
  FROM fin_operations o
  WHERE o.account_to_id = ? AND o.currency != ?
  ORDER BY o.amount_company DESC
`).all(OLEG_ACCT, acct.currency);

console.log(`INFLOWS with mismatched currency: ${mismatchedIn.length}`);
let totalMismatchedCompany = 0;
let totalMismatchedAmount = 0;
for (const op of mismatchedIn) {
  console.log(`  ${op.id} | ${op.amount} ${op.currency} → company: ${op.amount_company} ${op.currency_company}`);
  console.log(`    ${op.paid_at?.substring(0,10)} | ${op.source} | ${(op.comment || '').substring(0,80)}`);
  totalMismatchedCompany += Number(op.amount_company || 0);
  totalMismatchedAmount += Number(op.amount || 0);
}
console.log(`  TOTAL mismatched inflows: amount=${totalMismatchedAmount}, company=${totalMismatchedCompany}\n`);

const mismatchedOut = db.prepare(`
  SELECT o.id, o.amount, o.currency, o.amount_company, o.currency_company,
         o.paid_at, o.comment, o.source, o.op_type
  FROM fin_operations o
  WHERE o.account_from_id = ? AND o.currency != ?
  ORDER BY o.amount_company DESC
`).all(OLEG_ACCT, acct.currency);

console.log(`OUTFLOWS with mismatched currency: ${mismatchedOut.length}`);
let totalMismatchedOutCompany = 0;
let totalMismatchedOutAmount = 0;
for (const op of mismatchedOut) {
  console.log(`  ${op.id} | ${op.amount} ${op.currency} → company: ${op.amount_company} ${op.currency_company}`);
  console.log(`    ${op.paid_at?.substring(0,10)} | ${op.source} | ${(op.comment || '').substring(0,80)}`);
  totalMismatchedOutCompany += Number(op.amount_company || 0);
  totalMismatchedOutAmount += Number(op.amount || 0);
}
console.log(`  TOTAL mismatched outflows: amount=${totalMismatchedOutAmount}, company=${totalMismatchedOutCompany}\n`);

// Now recalculate using the SAME logic as getBalanceSheet
console.log('═══ Balance calculation comparison ═══\n');

const balanceRaw = db.prepare(`
  SELECT 
    (? + COALESCE((SELECT SUM(o.amount) FROM fin_operations o WHERE o.account_to_id = ? AND o.status = 'completed'), 0)
       - COALESCE((SELECT SUM(o.amount) FROM fin_operations o WHERE o.account_from_id = ? AND o.status = 'completed'), 0)
    ) AS balance_raw
`).get(acct.initial_balance || 0, OLEG_ACCT, OLEG_ACCT);

const balanceDashboard = db.prepare(`
  SELECT 
    (? + COALESCE((SELECT SUM(
            CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END
          ) FROM fin_operations o WHERE o.account_to_id = ? AND o.status = 'completed'), 0)
       - COALESCE((SELECT SUM(
            CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END
          ) FROM fin_operations o WHERE o.account_from_id = ? AND o.status = 'completed'), 0)
    ) AS balance_dashboard
`).get(acct.initial_balance || 0, acct.currency, OLEG_ACCT, acct.currency, OLEG_ACCT);

console.log(`  Raw (SUM amount):         ${balanceRaw.balance_raw}`);
console.log(`  Dashboard (CASE logic):   ${balanceDashboard.balance_dashboard}`);
console.log(`  DIFFERENCE:               ${balanceDashboard.balance_dashboard - balanceRaw.balance_raw}`);
console.log(`\n  This difference = mismatched operations where amount_company was used instead of amount`);

// Check: what if amount_company is NULL or 0 for these?
console.log('\n═══ Check amount_company values for mismatched ops ═══\n');
const nullCompany = db.prepare(`
  SELECT COUNT(*) as cnt FROM fin_operations
  WHERE (account_to_id = ? OR account_from_id = ?)
    AND currency != ?
    AND (amount_company IS NULL OR amount_company = 0)
`).get(OLEG_ACCT, OLEG_ACCT, acct.currency);
console.log(`  Ops with NULL/0 amount_company: ${nullCompany.cnt}`);

// Status check
console.log('\n═══ Status breakdown ═══\n');
const statusBreak = db.prepare(`
  SELECT status, COUNT(*) as cnt FROM fin_operations
  WHERE account_to_id = ? OR account_from_id = ?
  GROUP BY status
`).all(OLEG_ACCT, OLEG_ACCT);
for (const s of statusBreak) {
  console.log(`  ${s.status}: ${s.cnt} ops`);
}

db.close();
