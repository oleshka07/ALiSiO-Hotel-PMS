#!/usr/bin/env node
/**
 * Diagnose: why is there ~1.2M on an account?
 * Checks all account balances and top operations.
 */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'), { readonly: true });

console.log('═══════════════════════════════════════════════════════════');
console.log('  BALANCE DIAGNOSIS');
console.log('═══════════════════════════════════════════════════════════\n');

// 1. All account balances (calculated from operations)
console.log('── 1. Account balances (from fin_operations) ──\n');

const accounts = db.prepare(`
  SELECT a.id, a.name, a.type, a.currency, a.initial_balance
  FROM finance_accounts a
  WHERE a.is_active = 1
  ORDER BY a.type, a.sort_order
`).all();

let grandTotal = { CZK: 0, EUR: 0 };

for (const a of accounts) {
  // Income to this account
  const inflow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
    FROM fin_operations WHERE account_to_id = ?
  `).get(a.id);

  // Expense from this account
  const outflow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
    FROM fin_operations WHERE account_from_id = ?
  `).get(a.id);

  const initial = Number(a.initial_balance || 0);
  const balance = initial + Number(inflow.total) - Number(outflow.total);

  console.log(`  ${a.name} [${a.type}/${a.currency}]`);
  console.log(`    Initial: ${initial.toLocaleString()} | In: +${Number(inflow.total).toLocaleString()} (${inflow.cnt} ops) | Out: -${Number(outflow.total).toLocaleString()} (${outflow.cnt} ops)`);
  console.log(`    BALANCE: ${balance.toLocaleString()} ${a.currency}`);
  
  if (balance > 100000) {
    console.log(`    ⚠️  LARGE BALANCE — investigating...`);
    
    // Top 10 largest inflows
    const topIn = db.prepare(`
      SELECT o.id, o.amount, o.currency, o.paid_at, o.comment, o.source, o.op_type,
             o.reservation_id, o.method
      FROM fin_operations o
      WHERE o.account_to_id = ?
      ORDER BY o.amount DESC
      LIMIT 10
    `).all(a.id);
    
    console.log(`    Top 10 inflows:`);
    for (const op of topIn) {
      console.log(`      ${op.amount.toLocaleString()} ${op.currency} | ${op.paid_at?.substring(0,10)} | ${op.source} | ${(op.comment || '').substring(0,60)}`);
    }
  }
  
  grandTotal[a.currency] = (grandTotal[a.currency] || 0) + balance;
  console.log('');
}

console.log('── Grand Totals ──');
for (const [cur, total] of Object.entries(grandTotal)) {
  console.log(`  ${cur}: ${total.toLocaleString()}`);
}

// 2. Check for potential issues
console.log('\n── 2. Potential issues ──\n');

// Check for duplicate source_refs (double-counted operations)
const dupes = db.prepare(`
  SELECT source_ref, source, COUNT(*) as cnt, SUM(amount) as total_amount
  FROM fin_operations
  WHERE source_ref IS NOT NULL AND source_ref != ''
  GROUP BY source_ref, source
  HAVING COUNT(*) > 1
  ORDER BY total_amount DESC
  LIMIT 10
`).all();

if (dupes.length > 0) {
  console.log(`  ⚠️  ${dupes.length} duplicate source_refs found:`);
  for (const d of dupes) {
    console.log(`    source_ref="${d.source_ref}" source=${d.source} count=${d.cnt} total=${d.total_amount}`);
  }
} else {
  console.log('  ✅ No duplicate source_refs');
}

// Check for very large single operations (>50k CZK)
const largeOps = db.prepare(`
  SELECT o.id, o.amount, o.currency, o.paid_at, o.comment, o.source, o.op_type,
         COALESCE(a_to.name, '') as to_account, COALESCE(a_from.name, '') as from_account
  FROM fin_operations o
  LEFT JOIN finance_accounts a_to ON a_to.id = o.account_to_id
  LEFT JOIN finance_accounts a_from ON a_from.id = o.account_from_id
  WHERE o.amount > 50000
  ORDER BY o.amount DESC
`).all();

console.log(`\n  Large operations (>50k):`);
if (largeOps.length === 0) {
  console.log('    None');
} else {
  for (const op of largeOps) {
    console.log(`    ${op.id} | ${op.op_type} | ${op.amount.toLocaleString()} ${op.currency} | ${op.paid_at?.substring(0,10)}`);
    console.log(`      ${op.from_account || '-'} → ${op.to_account || '-'} | ${op.source} | ${(op.comment || '').substring(0,80)}`);
  }
}

// 3. Breakdown by source
console.log('\n── 3. Operations breakdown by source ──\n');
const bySource = db.prepare(`
  SELECT source, op_type, COUNT(*) as cnt, SUM(amount) as total,
         currency
  FROM fin_operations
  GROUP BY source, op_type, currency
  ORDER BY total DESC
`).all();

for (const r of bySource) {
  console.log(`  ${r.source || 'NULL'} | ${r.op_type} | ${r.cnt} ops | ${Number(r.total).toLocaleString()} ${r.currency}`);
}

// 4. Check amount_company field — maybe company amounts are inflated
console.log('\n── 4. Amount vs amount_company comparison ──\n');
const companyCheck = db.prepare(`
  SELECT o.id, o.amount, o.currency, o.amount_company, o.currency_company,
         o.comment, o.source
  FROM fin_operations o
  WHERE o.amount_company IS NOT NULL AND o.amount_company > 0
    AND o.amount_company > o.amount * 30
  ORDER BY o.amount_company DESC
  LIMIT 10
`).all();

if (companyCheck.length > 0) {
  console.log(`  ⚠️  ${companyCheck.length} ops where amount_company >> amount * 30:`);
  for (const op of companyCheck) {
    console.log(`    ${op.id}: amount=${op.amount} ${op.currency}, company=${op.amount_company} ${op.currency_company} | ${op.source}`);
  }
} else {
  console.log('  ✅ No abnormal amount_company values');
}

// 5. Which account has ~1.2M?
console.log('\n── 5. Accounts with balance > 500k ──\n');
for (const a of accounts) {
  const inflow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM fin_operations WHERE account_to_id = ?').get(a.id);
  const outflow = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM fin_operations WHERE account_from_id = ?').get(a.id);
  const balance = Number(a.initial_balance || 0) + Number(inflow.total) - Number(outflow.total);
  
  if (Math.abs(balance) > 500000) {
    console.log(`  🔴 ${a.name}: ${balance.toLocaleString()} ${a.currency}`);
    
    // Show monthly breakdown
    const monthly = db.prepare(`
      SELECT strftime('%Y-%m', paid_at) as month,
             SUM(CASE WHEN account_to_id = ? THEN amount ELSE 0 END) as inflow,
             SUM(CASE WHEN account_from_id = ? THEN amount ELSE 0 END) as outflow,
             COUNT(*) as ops
      FROM fin_operations
      WHERE account_to_id = ? OR account_from_id = ?
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `).all(a.id, a.id, a.id, a.id);
    
    console.log('    Monthly breakdown:');
    for (const m of monthly) {
      const net = Number(m.inflow) - Number(m.outflow);
      console.log(`      ${m.month}: in=${Number(m.inflow).toLocaleString()} out=${Number(m.outflow).toLocaleString()} net=${net > 0 ? '+' : ''}${net.toLocaleString()} (${m.ops} ops)`);
    }
  }
}

db.close();
