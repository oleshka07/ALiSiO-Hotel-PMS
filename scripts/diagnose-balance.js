#!/usr/bin/env node
/**
 * Show ALL operations on "Олег наличные" between 22.01 and 24.01.2026
 * to explain the balance jump
 */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'), { readonly: true });

const OLEG_ACCT = 'acct_imp_1777364002109_935c64';
const acct = db.prepare('SELECT * FROM finance_accounts WHERE id = ?').get(OLEG_ACCT);
console.log(`Account: ${acct.name} [${acct.currency}], initial: ${acct.initial_balance}\n`);

// All operations on this account between Jan 20-25
const ops = db.prepare(`
  SELECT id, op_type, paid_at, amount, currency, amount_company,
    CASE WHEN currency = ? THEN amount ELSE amount_company END AS effective_amount,
    account_from_id, account_to_id, comment, source
  FROM fin_operations
  WHERE (account_to_id = ? OR account_from_id = ?)
    AND status = 'completed'
    AND paid_at >= '2026-01-20' AND paid_at <= '2026-01-25'
  ORDER BY paid_at ASC, created_at ASC
`).all(acct.currency, OLEG_ACCT, OLEG_ACCT);

console.log(`Operations on "${acct.name}" from 20-25 Jan 2026: ${ops.length}\n`);

// Also compute running balance up to Jan 20
const beforeOps = db.prepare(`
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN account_to_id = ? THEN (CASE WHEN currency = ? THEN amount ELSE amount_company END)
        WHEN account_from_id = ? THEN -(CASE WHEN currency = ? THEN amount ELSE amount_company END)
      END
    ), 0) as total
  FROM fin_operations
  WHERE (account_to_id = ? OR account_from_id = ?)
    AND status = 'completed'
    AND paid_at < '2026-01-20'
`).get(OLEG_ACCT, acct.currency, OLEG_ACCT, acct.currency, OLEG_ACCT, OLEG_ACCT);

let running = Number(acct.initial_balance || 0) + Number(beforeOps.total);
console.log(`Opening balance (before Jan 20): ${running.toFixed(2)}\n`);

for (const op of ops) {
  const amt = Number(op.effective_amount || 0);
  const direction = op.account_to_id === OLEG_ACCT ? 'IN' : 'OUT';
  if (op.account_to_id === OLEG_ACCT) running += amt;
  if (op.account_from_id === OLEG_ACCT) running -= amt;
  
  console.log(`${op.paid_at?.substring(0,10)} | ${direction} | ${op.op_type.padEnd(8)} | ${amt.toFixed(2).padStart(12)} ${acct.currency} | balance: ${running.toFixed(2).padStart(12)} | ${op.source} | ${(op.comment || '').substring(0,60)}`);
}

console.log(`\nFinal balance after Jan 25: ${running.toFixed(2)}`);
db.close();
