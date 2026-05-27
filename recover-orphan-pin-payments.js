#!/usr/bin/env node
/**
 * recover-orphan-pin-payments.js
 * 
 * Creates missing fin_operations for all PIN-confirmed reservations
 * that have audit_log entries but no corresponding fin_operation.
 * 
 * Routes payments to the correct admin cash account based on confirmed_by.
 * 
 * Usage:
 *   node recover-orphan-pin-payments.js           # dry-run (report only)
 *   node recover-orphan-pin-payments.js --apply    # actually create operations
 */

const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data', 'alisio.db');
const APPLY = process.argv.includes('--apply');

console.log(`\n${'='.repeat(70)}`);
console.log(`  RECOVER ORPHAN PIN PAYMENTS — ${new Date().toISOString()}`);
console.log(`  Mode: ${APPLY ? '🔧 APPLY (will create fin_operations)' : '👁️ DRY-RUN (report only)'}`);
console.log(`  DB: ${DB_PATH}`);
console.log(`${'='.repeat(70)}\n`);

const db = new Database(DB_PATH);

// Admin name → account name mapping (must match PIN_TO_ACCOUNT_NAME in booking-drafts.handlers.ts)
const ADMIN_TO_ACCOUNT = {
  'Андрей': 'Андріїв cash',
  'т. Наташа': 'Каса Кемпінг і проживання',
  'Олег': 'Олег наличные',
  'Антон': 'Антон Готівка',
};

// Get org_id
const orgRow = db.prepare('SELECT organization_id FROM properties LIMIT 1').get();
const orgId = orgRow?.organization_id;
if (!orgId) {
  console.error('No organization found!');
  process.exit(1);
}
console.log(`Organization: ${orgId}`);

// Resolve account IDs
const accountMap = {};
for (const [admin, accountName] of Object.entries(ADMIN_TO_ACCOUNT)) {
  const acct = db.prepare(
    "SELECT id, currency FROM finance_accounts WHERE organization_id = ? AND name = ? AND is_active = 1 LIMIT 1"
  ).get(orgId, accountName);
  if (acct) {
    accountMap[admin] = { id: acct.id, currency: acct.currency, name: accountName };
    console.log(`  ${admin} → ${accountName} (${acct.id}, ${acct.currency})`);
  } else {
    console.warn(`  ⚠️ ${admin} → "${accountName}" NOT FOUND in finance_accounts!`);
  }
}

// Find all PIN-confirmed reservations WITHOUT fin_operations
const orphans = db.prepare(`
  SELECT 
    al.entity_id AS reservation_id,
    al.new_values,
    al.action,
    al.created_at AS confirmed_at,
    r.total_price,
    r.currency,
    r.check_in,
    r.payment_status,
    r.source,
    g.first_name,
    g.last_name
  FROM audit_log al
  JOIN reservations r ON r.id = al.entity_id
  LEFT JOIN guests g ON g.id = r.guest_id
  WHERE al.action IN ('payment_confirmed', 'cash_payment_confirmed', 'terminal_payment_confirmed')
    AND NOT EXISTS (
      SELECT 1 FROM fin_operations fo WHERE fo.reservation_id = al.entity_id
    )
  ORDER BY al.created_at ASC
`).all();

console.log(`\nFound ${orphans.length} orphan PIN-confirmed reservations:\n`);

let created = 0;
let skipped = 0;
let errors = 0;

// Helper: compute amount_company
function computeAmountCompany(amount, currency, paidAt) {
  if (currency === 'CZK') return amount;
  // Try to find FX rate from exchange_rates table
  const fx = db.prepare(`
    SELECT rate FROM exchange_rates 
    WHERE from_currency = ? AND to_currency = 'CZK'
    ORDER BY ABS(julianday(date) - julianday(?)) ASC
    LIMIT 1
  `).get(currency, paidAt);
  if (fx) return +(amount * fx.rate).toFixed(2);
  // Fallback: 24.5 for EUR
  if (currency === 'EUR') return +(amount * 24.5).toFixed(2);
  return amount;
}

for (const orphan of orphans) {
  let vals = {};
  try { vals = JSON.parse(orphan.new_values || '{}'); } catch { /* */ }
  
  const adminName = vals.confirmed_by || 'Unknown';
  const paymentMethod = vals.payment_method || 'cash';
  const isTerminal = paymentMethod === 'terminal' || orphan.action === 'terminal_payment_confirmed';
  const amount = orphan.total_price || 0;
  const currency = orphan.currency || 'CZK';
  const guestName = `${orphan.first_name || ''} ${orphan.last_name || ''}`.trim();
  
  // Resolve account
  const account = accountMap[adminName];
  const accountId = account?.id || null;
  const accountName = account?.name || 'UNKNOWN';
  
  const methodLabel = isTerminal ? 'Термінал' : 'Готівка';
  const comment = `${methodLabel} · ${adminName} (recovery)`;
  
  console.log(`  ${orphan.reservation_id} | ${guestName} | ${amount} ${currency} | ${adminName} | ${methodLabel} → ${accountName}`);
  
  if (amount <= 0) {
    console.log(`    ⏭️ Skipped: amount=${amount}`);
    skipped++;
    continue;
  }
  
  if (!accountId) {
    console.log(`    ⚠️ Skipped: no account found for "${adminName}"`);
    skipped++;
    continue;
  }
  
  if (APPLY) {
    try {
      const id = `inc_recovery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const paidAt = orphan.confirmed_at?.substring(0, 10) || new Date().toISOString().substring(0, 10);
      const amountCompany = computeAmountCompany(amount, currency, paidAt);
      const fxRate = currency === 'CZK' ? null : +(amountCompany / amount).toFixed(4);
      
      db.prepare(`
        INSERT INTO fin_operations
          (id, organization_id, op_type,
           account_from_id, account_to_id,
           amount, currency, fx_rate, amount_company,
           paid_at, accrued_at,
           category_id, reservation_id,
           status, method, payment_subtype,
           comment, source, source_ref,
           needs_review, created_at)
        VALUES (?, ?, 'income',
                NULL, ?,
                ?, ?, ?, ?,
                ?, ?,
                NULL, ?,
                'completed', ?, 'full',
                ?, 'booking_widget', ?,
                0, datetime('now'))
      `).run(
        id, orgId,
        accountId,
        amount, currency, fxRate, amountCompany,
        paidAt, paidAt,
        orphan.reservation_id,
        isTerminal ? 'card' : 'cash',
        comment,
        `pin_recovery_${orphan.reservation_id}`
      );
      
      console.log(`    ✅ Created: ${id} → ${accountName} | ${amount} ${currency} (company=${amountCompany})`);
      created++;
    } catch (e) {
      console.error(`    ❌ Error: ${e.message}`);
      errors++;
    }
  }
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Summary:`);
console.log(`  Total orphans: ${orphans.length}`);
if (APPLY) {
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
} else {
  console.log(`  (DRY-RUN — run with --apply to create fin_operations)`);
}
console.log(`${'─'.repeat(50)}\n`);

db.close();
