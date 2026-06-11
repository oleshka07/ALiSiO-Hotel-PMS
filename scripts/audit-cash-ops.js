#!/usr/bin/env node
/**
 * Audit: find misrouted cash operations (last 21 days)
 * Runs directly against data/alisio.db — no HTTP needed.
 */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'), { readonly: true });

console.log('═══════════════════════════════════════════════════════════');
console.log('  AUDIT: Cash operations routing — last 21 days');
console.log('═══════════════════════════════════════════════════════════\n');

const totalOps = db.prepare('SELECT COUNT(*) as n FROM fin_operations').get();
console.log(`Total fin_operations: ${totalOps.n}`);
const totalAudit = db.prepare('SELECT COUNT(*) as n FROM fin_operation_audit').get();
console.log(`Total audit entries: ${totalAudit.n}\n`);

// ── Cash accounts ──
console.log('── Cash Accounts ──');
const accounts = db.prepare(`
  SELECT a.id, a.name, a.type, a.currency, a.sort_order
  FROM finance_accounts a WHERE a.is_active = 1 AND a.type = 'cash'
  ORDER BY a.sort_order
`).all();
for (const a of accounts) {
  console.log(`  ${a.name} (${a.id}) [${a.currency}] sort=${a.sort_order}`);
}

// ── Users ──
console.log('\n── Users ──');
let users = [];
let hasDefaultColumn = false;
try {
  users = db.prepare(`
    SELECT u.id, u.full_name, u.role, u.default_cash_account_id,
           a.name AS default_account_name
    FROM app_users u
    LEFT JOIN finance_accounts a ON a.id = u.default_cash_account_id
  `).all();
  hasDefaultColumn = true;
} catch {
  users = db.prepare('SELECT id, full_name, role FROM app_users').all();
}
for (const u of users) {
  const acct = hasDefaultColumn
    ? (u.default_account_name || 'NOT SET')
    : 'column missing';
  console.log(`  ${u.full_name} (${u.role}) → ${acct}`);
}

// Build name→account mapping (heuristic fallback when default_cash_account_id not set)
const NAME_HINTS = {
  'Андрій': 'Андріїв cash',
  'Андрей': 'Андріїв cash',
  'Andrii': 'Андріїв cash',
  'Олег':  'Олег наличные',
  'Oleg':  'Олег наличные',
  'Наталія': 'Каса Кемпінг і проживання',
  'Наташа': 'Каса Кемпінг і проживання',
  'Антон': 'Антон Готівка',
  'Anton': 'Антон Готівка',
};

// Build user→expected_account map
const userExpected = {};
for (const u of users) {
  if (hasDefaultColumn && u.default_cash_account_id) {
    userExpected[u.id] = { acctName: u.default_account_name, acctId: u.default_cash_account_id };
  } else {
    for (const [hint, acctName] of Object.entries(NAME_HINTS)) {
      if (u.full_name && u.full_name.includes(hint)) {
        const acct = accounts.find(a => a.name === acctName);
        if (acct) userExpected[u.id] = { acctName: acct.name, acctId: acct.id };
        break;
      }
    }
  }
}

console.log('\n── User → Expected Account ──');
for (const u of users) {
  const exp = userExpected[u.id];
  console.log(`  ${u.full_name} → ${exp ? exp.acctName : 'NO MAPPING'}`);
}

// ── Specific operations (ZVIRECI PETR, Bronislav Košťál) ──
console.log('\n── 1. Specific operations (ZVIRECI PETR, Bronislav Košťál) ──\n');

const specific = db.prepare(`
  SELECT o.id, o.op_type, o.amount, o.currency, o.paid_at, o.comment, o.source,
         o.reservation_id, o.method, o.payment_subtype, o.created_by,
         COALESCE(o.account_to_id, o.account_from_id) AS acct_id
  FROM fin_operations o
  WHERE o.comment LIKE '%ZVIRECI%' OR o.comment LIKE '%Košťál%' OR o.comment LIKE '%Kostal%'
     OR o.comment LIKE '%r_178006%' OR o.comment LIKE '%hx_5_6AY%'
     OR o.reservation_id LIKE 'r_178006%' OR o.reservation_id LIKE 'hx_5_6AY%'
  ORDER BY o.paid_at
`).all();

if (specific.length === 0) {
  console.log('  Not found. Searching all manual ops from 2026-05-28 to 2026-05-31...\n');
  const broader = db.prepare(`
    SELECT o.id, o.op_type, o.amount, o.currency, o.paid_at, o.comment, o.source,
           o.reservation_id, o.method, o.payment_subtype, o.created_by,
           COALESCE(o.account_to_id, o.account_from_id) AS acct_id
    FROM fin_operations o
    WHERE o.source IN ('manual', 'booking_widget')
      AND o.paid_at >= '2026-05-28' AND o.paid_at < '2026-06-01'
    ORDER BY o.paid_at
  `).all();
  console.log(`  Found ${broader.length} manual/widget ops:\n`);
  for (const op of broader) {
    const acctRow = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(op.acct_id);
    const audit = db.prepare("SELECT user_name, user_id FROM fin_operation_audit WHERE operation_id = ? AND action = 'create'").get(op.id);
    console.log(`  ${op.id} | ${op.amount} ${op.currency} | ${op.paid_at}`);
    console.log(`    Method: ${op.method} | Source: ${op.source} | RES: ${op.reservation_id}`);
    console.log(`    Account: ${acctRow?.name || 'NULL'}`);
    console.log(`    Created by: ${audit?.user_name || op.created_by || 'UNKNOWN'} (${audit?.user_id || '-'})`);
    console.log(`    Comment: ${op.comment}`);
    console.log('');
  }
} else {
  for (const op of specific) {
    const acctRow = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(op.acct_id);
    const audit = db.prepare("SELECT user_name, user_id FROM fin_operation_audit WHERE operation_id = ? AND action = 'create'").get(op.id);
    console.log(`  ${op.id} | ${op.amount} ${op.currency} | ${op.paid_at}`);
    console.log(`    Method: ${op.method} | Source: ${op.source} | RES: ${op.reservation_id}`);
    console.log(`    Account: ${acctRow?.name || 'NULL'}`);
    console.log(`    Created by: ${audit?.user_name || op.created_by || 'UNKNOWN'} (${audit?.user_id || '-'})`);
    console.log(`    Comment: ${op.comment}`);
    console.log('');
  }
}

// ── ALL cash operations last 21 days ──
console.log('\n── 2. ALL manual/widget operations (last 21 days) ──\n');

const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
console.log(`From: ${since}\n`);

const allRecent = db.prepare(`
  SELECT o.id, o.op_type, o.amount, o.currency, o.paid_at, o.comment, o.source,
         o.reservation_id, o.method, o.payment_subtype, o.created_by,
         COALESCE(o.account_to_id, o.account_from_id) AS acct_id
  FROM fin_operations o
  WHERE o.source IN ('manual', 'booking_widget')
    AND date(o.paid_at) >= ?
  ORDER BY o.paid_at DESC
`).all(since);

console.log(`Found ${allRecent.length} operations:\n`);

const misrouted = [];

for (const op of allRecent) {
  const acctRow = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(op.acct_id);
  const audit = db.prepare("SELECT user_name, user_id FROM fin_operation_audit WHERE operation_id = ? AND action = 'create'").get(op.id);
  const createdBy = audit?.user_name || op.created_by || 'UNKNOWN';
  const createdById = audit?.user_id || null;
  const acctName = acctRow?.name || 'NULL';

  const expected = createdById ? userExpected[createdById] : null;
  const wrongAccount = expected && op.acct_id !== expected.acctId;
  const marker = wrongAccount ? '❌ MISROUTED' : '✅';

  console.log(`${marker} ${op.id} | ${op.amount} ${op.currency} | ${op.paid_at}`);
  console.log(`   Source: ${op.source} | Method: ${op.method} | Subtype: ${op.payment_subtype}`);
  console.log(`   Account: ${acctName}`);
  console.log(`   Created by: ${createdBy}`);
  if (wrongAccount) {
    console.log(`   ⚠️  SHOULD BE ON: ${expected.acctName}`);
    misrouted.push({
      op_id: op.id,
      amount: op.amount,
      currency: op.currency,
      current_account: acctName,
      current_account_id: op.acct_id,
      correct_account: expected.acctName,
      correct_account_id: expected.acctId,
      created_by: createdBy,
      comment: op.comment,
      reservation_id: op.reservation_id,
    });
  }
  console.log(`   Comment: ${op.comment}`);
  console.log('');
}

// ── Summary ──
console.log('═══════════════════════════════════════════════════════════');
console.log(`  SUMMARY: ${allRecent.length} total, ${misrouted.length} misrouted`);
console.log('═══════════════════════════════════════════════════════════');

if (misrouted.length > 0) {
  console.log('\nMISROUTED OPERATIONS (need account_to_id fix):');
  console.log('───────────────────────────────────────────────');
  for (const m of misrouted) {
    console.log(`  ${m.op_id}: ${m.amount} ${m.currency}`);
    console.log(`    NOW: "${m.current_account}" → SHOULD: "${m.correct_account}"`);
    console.log(`    Created by: ${m.created_by} | RES: ${m.reservation_id}`);
    console.log('');
  }
}

db.close();
