#!/usr/bin/env node
/**
 * recover-orphan-pin-payments.js v2
 * 
 * Creates missing fin_operations for PIN-confirmed reservations.
 * Idempotent: checks for existing reservation_id match before insert.
 * Verifies persistence after insert.
 */
const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data', 'alisio.db');
const APPLY = process.argv.includes('--apply');

console.log(`\n${'='.repeat(60)}`);
console.log(`  RECOVER ORPHAN PIN PAYMENTS v2 — ${new Date().toISOString()}`);
console.log(`  Mode: ${APPLY ? '🔧 APPLY' : '👁️ DRY-RUN'}`);
console.log(`  DB: ${DB_PATH}`);
console.log(`${'='.repeat(60)}\n`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Pre-check: total count
const before = db.prepare('SELECT COUNT(*) as c FROM fin_operations').get();
console.log(`fin_operations BEFORE: ${before.c}`);

// Admin name → account name
const ADMIN_TO_ACCOUNT = {
  'Андрей': 'Андріїв cash',
  'т. Наташа': 'Каса Кемпінг і проживання',
  'Олег': 'Олег наличные',
  'Антон': 'Антон Готівка',
};

const orgRow = db.prepare('SELECT organization_id FROM properties LIMIT 1').get();
const orgId = orgRow?.organization_id;
if (!orgId) { console.error('No org!'); process.exit(1); }

// Resolve accounts
const accountMap = {};
for (const [admin, name] of Object.entries(ADMIN_TO_ACCOUNT)) {
  const a = db.prepare("SELECT id, currency FROM finance_accounts WHERE organization_id = ? AND name = ? AND is_active = 1 LIMIT 1").get(orgId, name);
  if (a) { accountMap[admin] = { id: a.id, currency: a.currency, name }; console.log(`  ${admin} → ${name} (${a.id})`); }
  else console.warn(`  ⚠️ ${admin} → "${name}" NOT FOUND!`);
}

// Find orphans
const orphans = db.prepare(`
  SELECT al.entity_id AS reservation_id, al.new_values, al.action, al.created_at AS confirmed_at,
         r.total_price, r.currency, r.check_in, g.first_name, g.last_name
  FROM audit_log al
  JOIN reservations r ON r.id = al.entity_id
  LEFT JOIN guests g ON g.id = r.guest_id
  WHERE al.action IN ('payment_confirmed','cash_payment_confirmed','terminal_payment_confirmed')
    AND NOT EXISTS (SELECT 1 FROM fin_operations fo WHERE fo.reservation_id = al.entity_id)
  ORDER BY al.created_at ASC
`).all();

console.log(`\nOrphans found: ${orphans.length}\n`);

let created = 0, skipped = 0;

if (APPLY && orphans.length > 0) {
  const insertStmt = db.prepare(`
    INSERT INTO fin_operations
      (id, organization_id, op_type, account_from_id, account_to_id,
       amount, currency, fx_rate, amount_company,
       paid_at, accrued_at, category_id, reservation_id,
       status, method, payment_subtype,
       comment, source, source_ref, needs_review, created_at)
    VALUES (?, ?, 'income', NULL, ?,
            ?, ?, ?, ?,
            ?, ?, NULL, ?,
            'completed', ?, 'full',
            ?, 'booking_widget', ?, 0, datetime('now'))
  `);

  const tx = db.transaction(() => {
    for (const o of orphans) {
      let vals = {};
      try { vals = JSON.parse(o.new_values || '{}'); } catch {}
      
      const admin = vals.confirmed_by || 'Unknown';
      const method = vals.payment_method || 'cash';
      const isTerminal = method === 'terminal' || o.action === 'terminal_payment_confirmed';
      const amount = o.total_price || 0;
      const currency = o.currency || 'CZK';
      const guest = `${o.first_name||''} ${o.last_name||''}`.trim();
      const account = accountMap[admin];
      
      if (amount <= 0 || !account) {
        console.log(`  SKIP ${o.reservation_id} | ${guest} | ${amount} ${currency} | no account for "${admin}"`);
        skipped++;
        continue;
      }
      
      const id = `rec2_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const paidAt = o.confirmed_at?.substring(0,10) || new Date().toISOString().substring(0,10);
      const amountCompany = currency === 'CZK' ? amount : +(amount * 24.5).toFixed(2);
      const fxRate = currency === 'CZK' ? null : 24.5;
      const comment = `${isTerminal ? 'Термінал' : 'Готівка'} · ${admin} (recovery v2)`;
      
      insertStmt.run(
        id, orgId, account.id,
        amount, currency, fxRate, amountCompany,
        paidAt, paidAt, o.reservation_id,
        isTerminal ? 'card' : 'cash',
        comment, `recovery2_${o.reservation_id}`
      );
      
      console.log(`  ✅ ${id} | ${guest} | ${amount} ${currency} | ${admin} → ${account.name}`);
      created++;
    }
  });
  tx();
}

// Post-check
const after = db.prepare('SELECT COUNT(*) as c FROM fin_operations').get();
console.log(`\nfin_operations AFTER: ${after.c}`);
console.log(`Delta: +${after.c - before.c}`);
console.log(`Created: ${created}, Skipped: ${skipped}`);

// Verify persistence: immediately re-read
if (APPLY && created > 0) {
  const verify = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE id LIKE 'rec2_%'").get();
  console.log(`\n🔍 VERIFY: rec2_* records in DB right now: ${verify.c}`);
  if (verify.c === created) {
    console.log('✅ All records persisted successfully!');
  } else {
    console.log(`⚠️ MISMATCH: expected ${created}, found ${verify.c}`);
  }
}

console.log(`\n${'─'.repeat(60)}\n`);
db.close();
