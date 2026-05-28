#!/usr/bin/env node
/**
 * recover-pin-payments-v3.js
 * 
 * Re-creates the 22 missing cash/terminal PIN-confirmed payments.
 * Now that Cleanup #G is removed, these will persist across restarts.
 * 
 * Uses audit_log as source of truth (cash_payment_confirmed / terminal_payment_confirmed).
 */
const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = !process.argv.includes('--apply');
const DB_PATH = path.join(__dirname, 'data', 'alisio.db');

console.log(`\n=== PIN Payments Recovery V3 ===`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// PIN to account mapping
const PIN_TO_ACCOUNT = {
  '1315': 'Андріїв cash',
  '2099': 'Каса Кемпінг і проживання',
  '0309': 'Олег наличные',
  '0912': 'Антон Готівка',
};

// Get org ID
const orgRow = db.prepare('SELECT organization_id FROM properties LIMIT 1').get();
const orgId = orgRow?.organization_id || 'org_alisio_001';

// Get all cash/terminal confirmed reservations from audit_log
const auditEntries = db.prepare(`
  SELECT DISTINCT entity_id AS reservation_id, new_values, created_at, action
  FROM audit_log 
  WHERE action IN ('cash_payment_confirmed', 'terminal_payment_confirmed')
  ORDER BY created_at
`).all();

console.log(`Found ${auditEntries.length} audit entries for PIN-confirmed payments`);

let created = 0;
let skipped = 0;

const insertOp = db.prepare(`
  INSERT INTO fin_operations (
    id, organization_id, op_type, account_to_id, amount, currency,
    amount_company, paid_at, accrued_at, reservation_id, status, method,
    payment_subtype, comment, source, source_ref, created_at, updated_at
  ) VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, ?, 'completed', ?, 'full', ?, 'booking_widget', ?, datetime('now'), datetime('now'))
`);

const tx = db.transaction(() => {
  for (const entry of auditEntries) {
    const rid = entry.reservation_id;
    
    // Check if operation already exists
    const existing = db.prepare(
      "SELECT id FROM fin_operations WHERE reservation_id = ? AND source = 'booking_widget' LIMIT 1"
    ).get(rid);
    if (existing) {
      skipped++;
      continue;
    }

    // Get reservation data
    const res = db.prepare('SELECT total_price, currency, check_in FROM reservations WHERE id = ?').get(rid);
    if (!res) {
      console.log(`  SKIP ${rid}: reservation not found`);
      skipped++;
      continue;
    }

    // Parse audit data for admin name and PIN
    let adminName = 'Unknown';
    let pin = '';
    try {
      const vals = JSON.parse(entry.new_values);
      adminName = vals.confirmed_by || 'Unknown';
    } catch {}

    // Determine method from action
    const isTerminal = entry.action === 'terminal_payment_confirmed';
    const method = isTerminal ? 'card' : 'cash';
    const methodLabel = isTerminal ? 'Термінал' : 'Готівка';

    // Try to match PIN from admin name
    let accountId = null;
    for (const [pinCode, accountName] of Object.entries(PIN_TO_ACCOUNT)) {
      const acct = db.prepare(
        "SELECT id FROM finance_accounts WHERE organization_id = ? AND name = ? AND is_active = 1 LIMIT 1"
      ).get(orgId, accountName);
      if (acct) {
        // Check if this admin name matches this PIN's known admin
        const PIN_ADMINS = { '1315': 'Andrii', '2099': 'Natasha', '0309': 'Oleg', '0912': 'Anton' };
        if (adminName.includes(PIN_ADMINS[pinCode]) || adminName.toLowerCase().includes(PIN_ADMINS[pinCode].toLowerCase())) {
          accountId = acct.id;
          pin = pinCode;
          break;
        }
      }
    }

    // Fallback: use first cash account
    if (!accountId) {
      const fallback = db.prepare(
        "SELECT id FROM finance_accounts WHERE organization_id = ? AND type = 'cash' AND is_active = 1 ORDER BY sort_order LIMIT 1"
      ).get(orgId);
      accountId = fallback?.id;
    }

    const amount = res.total_price || 0;
    const currency = res.currency || 'CZK';
    const paidAt = entry.created_at;
    const opId = `rec3_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const comment = `${methodLabel} · ${adminName} (відновлено v3)`;

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: ${opId} | ${amount} ${currency} | ${method} | ${comment} | res=${rid}`);
    } else {
      insertOp.run(opId, orgId, accountId, amount, currency, amount, paidAt, paidAt, rid, method, comment, `pin_${rid}`);
      console.log(`  CREATED: ${opId} | ${amount} ${currency} | ${method} | ${comment}`);
    }
    created++;
  }
});

tx();

// Verify
const total = db.prepare('SELECT COUNT(*) as c FROM fin_operations').get();
const bw = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE source = 'booking_widget'").get();
const rec3 = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE id LIKE 'rec3_%'").get();

console.log(`\n=== Results ===`);
console.log(`Created: ${created}`);
console.log(`Skipped (already exist): ${skipped}`);
console.log(`Total fin_operations: ${total.c}`);
console.log(`booking_widget ops: ${bw.c}`);
console.log(`rec3_ ops: ${rec3.c}`);

db.close();
