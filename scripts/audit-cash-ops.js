#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'), { readonly: true });

console.log('═══════════════════════════════════════════════════════════');
console.log('  AUDIT: Cash operations routing');
console.log('═══════════════════════════════════════════════════════════\n');

// ── Check DB sanity ──
const totalOps = db.prepare('SELECT COUNT(*) as n FROM fin_operations').get();
console.log(`Total fin_operations: ${totalOps.n}`);

const totalAudit = db.prepare('SELECT COUNT(*) as n FROM fin_operation_audit').get();
console.log(`Total audit entries: ${totalAudit.n}\n`);

// ── Cash accounts ──
console.log('── Cash Accounts ──');
const accounts = db.prepare(`
  SELECT a.id, a.name, a.type, a.currency, a.sort_order
  FROM finance_accounts a
  WHERE a.is_active = 1 AND a.type = 'cash'
  ORDER BY a.sort_order
`).all();
for (const a of accounts) {
  console.log(`  ${a.name} (${a.id}) [${a.type}/${a.currency}] sort=${a.sort_order}`);
}

// ── Users + default_cash_account_id ──
console.log('\n── Users ──');
try {
  const users = db.prepare('SELECT id, full_name, role, default_cash_account_id FROM app_users').all();
  for (const u of users) {
    const acctName = u.default_cash_account_id
      ? (db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(u.default_cash_account_id)?.name || '?')
      : 'NOT SET';
    console.log(`  ${u.full_name} (${u.role}) → ${acctName}`);
  }
} catch (e) {
  console.log('  default_cash_account_id column does not exist yet');
  const users = db.prepare('SELECT id, full_name, role FROM app_users').all();
  for (const u of users) {
    console.log(`  ${u.full_name} (${u.role})`);
  }
}

// ── 1. Find the 2 specific operations ──
console.log('\n── 1. Specific operations (ZVIRECI PETR, Bronislav Košťál) ──\n');

const specific = db.prepare(`
  SELECT o.id, o.op_type, o.amount, o.currency, o.paid_at, o.comment, o.source,
         o.reservation_id, o.method, o.payment_subtype, o.created_by,
         COALESCE(o.account_to_id, o.account_from_id) AS acct_id
  FROM fin_operations o
  WHERE (o.comment LIKE '%ZVIRECI%' OR o.comment LIKE '%Košťál%' OR o.comment LIKE '%Kostal%'
         OR o.comment LIKE '%r_178006%' OR o.comment LIKE '%hx_5_6AY%')
  ORDER BY o.paid_at
`).all();

if (specific.length === 0) {
  console.log('  Not found by name/comment. Trying broader search...\n');
  // Search all manual ops from May 28-31
  const broader = db.prepare(`
    SELECT o.id, o.op_type, o.amount, o.currency, o.paid_at, o.comment, o.source,
           o.reservation_id, o.method, o.payment_subtype, o.created_by,
           COALESCE(o.account_to_id, o.account_from_id) AS acct_id
    FROM fin_operations o
    WHERE o.source IN ('manual', 'booking_widget')
      AND o.paid_at LIKE '2026-05-29%'
    ORDER BY o.paid_at
  `).all();
  console.log(`  Found ${broader.length} manual/widget ops on 2026-05-29:\n`);
  for (const op of broader) {
    const acct = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(op.acct_id);
    const audit = db.prepare("SELECT user_name, user_id FROM fin_operation_audit WHERE operation_id = ? AND action = 'create'").get(op.id);
    console.log(`  ${op.id} | ${op.amount} ${op.currency} | ${op.method} | ${op.source}`);
    console.log(`    Account: ${acct?.name || 'NULL'} | Created by: ${audit?.user_name || op.created_by || 'UNKNOWN'}`);
    console.log(`    Comment: ${op.comment}`);
    console.log(`    RES: ${op.reservation_id}`);
    console.log('');
  }
}

for (const op of specific) {
  const acct = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(op.acct_id);
  const audit = db.prepare("SELECT user_name, user_id FROM fin_operation_audit WHERE operation_id = ? AND action = 'create'").get(op.id);
  console.log(`  ${op.id} | ${op.amount} ${op.currency} | ${op.method} | ${op.source}`);
  console.log(`    Account: ${acct?.name || 'NULL'} | Created by: ${audit?.user_name || op.created_by || 'UNKNOWN'}`);
  console.log(`    Comment: ${op.comment}`);
  console.log(`    RES: ${op.reservation_id}`);
  console.log('');
}

// ── 2. ALL cash operations last 2 weeks ──
console.log('\n── 2. ALL cash operations (source=manual OR booking_widget), last 2 weeks ──\n');

const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
console.log(`From: ${twoWeeksAgo}\n`);

const allRecent = db.prepare(`
  SELECT o.id, o.op_type, o.amount, o.currency, o.paid_at, o.comment, o.source,
         o.reservation_id, o.method, o.payment_subtype, o.created_by,
         COALESCE(o.account_to_id, o.account_from_id) AS acct_id
  FROM fin_operations o
  WHERE o.source IN ('manual', 'booking_widget')
    AND date(o.paid_at) >= ?
  ORDER BY o.paid_at DESC
`).all(twoWeeksAgo);

console.log(`Found ${allRecent.length} operations:\n`);

const misrouted = [];

for (const op of allRecent) {
  const acct = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(op.acct_id);
  const audit = db.prepare("SELECT user_name, user_id FROM fin_operation_audit WHERE operation_id = ? AND action = 'create'").get(op.id);
  const createdBy = audit?.user_name || op.created_by || 'UNKNOWN';
  
  // Detect misrouting: if Андрій created it but it's on Олег's account
  const acctName = acct?.name || 'NULL';
  let shouldBeOn = acctName; // default: correct
  if (createdBy.includes('Андрій') || createdBy.includes('Андрей') || createdBy.includes('Andri')) {
    shouldBeOn = 'Андріїв cash';
  } else if (createdBy.includes('Наталія') || createdBy.includes('Натал') || createdBy.includes('Natash')) {
    shouldBeOn = 'Каса Кемпінг і проживання';
  } else if (createdBy.includes('Антон') || createdBy.includes('Anton')) {
    shouldBeOn = 'Антон Готівка';
  }
  
  const wrongAccount = shouldBeOn !== acctName;
  const marker = wrongAccount ? '❌ MISROUTED' : '✅';
  
  console.log(`${marker} ${op.id} | ${op.amount} ${op.currency} | ${op.paid_at}`);
  console.log(`   Source: ${op.source} | Method: ${op.method} | Subtype: ${op.payment_subtype}`);
  console.log(`   Account: ${acctName}`);
  console.log(`   Created by: ${createdBy}`);
  if (wrongAccount) {
    console.log(`   ⚠️  SHOULD BE: ${shouldBeOn}`);
    misrouted.push({ op_id: op.id, current: acctName, correct: shouldBeOn, created_by: createdBy, amount: op.amount, currency: op.currency });
  }
  console.log(`   Comment: ${op.comment}`);
  console.log('');
}

// ── 3. Summary ──
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  SUMMARY: ${allRecent.length} total, ${misrouted.length} misrouted`);
console.log('═══════════════════════════════════════════════════════════');

if (misrouted.length > 0) {
  console.log('\nMISROUTED (need fix):');
  for (const m of misrouted) {
    console.log(`  ${m.op_id}: ${m.amount} ${m.currency} — NOW: "${m.current}" → SHOULD: "${m.correct}" (by ${m.created_by})`);
  }
}

db.close();
