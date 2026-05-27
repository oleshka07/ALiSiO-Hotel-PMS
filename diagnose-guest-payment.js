#!/usr/bin/env node
/**
 * diagnose-guest-payment.js
 * 
 * Deep investigation for guest "Štepanek Petr" and any other
 * reservations that may have lost fin_operations.
 * 
 * Usage: node diagnose-guest-payment.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data', 'alisio.db');

console.log(`\n${'='.repeat(70)}`);
console.log(`  PAYMENT DIAGNOSTIC — ${new Date().toISOString()}`);
console.log(`  DB: ${DB_PATH}`);
console.log(`${'='.repeat(70)}\n`);

const db = new Database(DB_PATH, { readonly: true });

// ─── 1. Find guest "Štepanek Petr" ──────────────────────────────────────
console.log('━━━ 1. GUEST LOOKUP: Štepanek Petr ━━━');
const guests = db.prepare(`
  SELECT id, first_name, last_name, email, phone, source, created_at 
  FROM guests 
  WHERE LOWER(first_name || ' ' || last_name) LIKE '%stepanek%' 
     OR LOWER(last_name || ' ' || first_name) LIKE '%stepanek%'
     OR LOWER(first_name) LIKE '%stepanek%'
     OR LOWER(last_name) LIKE '%stepanek%'
     OR LOWER(first_name) LIKE '%štepanek%'
     OR LOWER(last_name) LIKE '%štepanek%'
     OR LOWER(first_name) LIKE '%petr%' AND LOWER(last_name) LIKE '%step%'
`).all();
console.log(`  Found ${guests.length} guest(s):`);
guests.forEach(g => console.log(`    ${g.id} | ${g.first_name} ${g.last_name} | ${g.email} | ${g.phone} | src=${g.source} | ${g.created_at}`));

// ─── 2. Find reservations for this guest ─────────────────────────────────
console.log('\n━━━ 2. RESERVATIONS ━━━');
const guestIds = guests.map(g => g.id);
let reservations = [];
if (guestIds.length > 0) {
  const plh = guestIds.map(() => '?').join(',');
  reservations = db.prepare(`
    SELECT r.id, r.guest_id, r.check_in, r.check_out, r.total_price, r.currency,
           r.status, r.payment_status, r.source, r.internal_notes,
           r.created_at, r.updated_at, r.guest_page_token
    FROM reservations r
    WHERE r.guest_id IN (${plh})
    ORDER BY r.created_at DESC
  `).all(...guestIds);
}
// Also search by name in notes/comments
const resByName = db.prepare(`
  SELECT r.id, r.guest_id, r.check_in, r.check_out, r.total_price, r.currency,
         r.status, r.payment_status, r.source, r.internal_notes,
         r.created_at, r.updated_at
  FROM reservations r
  WHERE r.internal_notes LIKE '%tepanek%' OR r.internal_notes LIKE '%Petr%'
`).all();
const allRes = [...reservations, ...resByName.filter(r => !reservations.find(x => x.id === r.id))];
console.log(`  Found ${allRes.length} reservation(s):`);
allRes.forEach(r => {
  console.log(`    ${r.id}`);
  console.log(`      check_in=${r.check_in} check_out=${r.check_out}`);
  console.log(`      total_price=${r.total_price} ${r.currency}`);
  console.log(`      status=${r.status} payment_status=${r.payment_status}`);
  console.log(`      source=${r.source} created=${r.created_at} updated=${r.updated_at}`);
  console.log(`      internal_notes: ${(r.internal_notes || '').substring(0, 200)}`);
  console.log(`      guest_page_token: ${r.guest_page_token ? 'yes' : 'no'}`);
});

// ─── 3. Check fin_operations for these reservations ──────────────────────
console.log('\n━━━ 3. FIN_OPERATIONS FOR THESE RESERVATIONS ━━━');
const resIds = allRes.map(r => r.id);
if (resIds.length > 0) {
  const plh = resIds.map(() => '?').join(',');
  const ops = db.prepare(`
    SELECT id, reservation_id, op_type, amount, currency, amount_company,
           method, payment_subtype, source, source_ref, status,
           account_to_id, account_from_id, comment, paid_at, created_at
    FROM fin_operations
    WHERE reservation_id IN (${plh})
    ORDER BY created_at DESC
  `).all(...resIds);
  console.log(`  Found ${ops.length} operation(s):`);
  ops.forEach(o => {
    console.log(`    ${o.id} | res=${o.reservation_id} | ${o.op_type} ${o.amount} ${o.currency}`);
    console.log(`      method=${o.method} subtype=${o.payment_subtype} source=${o.source} ref=${o.source_ref}`);
    console.log(`      account_to=${o.account_to_id} | status=${o.status}`);
    console.log(`      comment: ${o.comment}`);
    console.log(`      paid=${o.paid_at} created=${o.created_at}`);
  });
  if (ops.length === 0) {
    console.log('  ⚠️ NO FIN_OPERATIONS FOUND — payment was NOT recorded in finance!');
  }
} else {
  console.log('  (no reservations found to check)');
}

// ─── 4. Check booking_drafts ─────────────────────────────────────────────
console.log('\n━━━ 4. BOOKING_DRAFTS ━━━');
if (resIds.length > 0) {
  const plh = resIds.map(() => '?').join(',');
  const drafts = db.prepare(`
    SELECT id, session_id, reservation_id, guest_name, guest_email, 
           total_price, status, created_at
    FROM booking_drafts
    WHERE reservation_id IN (${plh})
    ORDER BY created_at DESC
  `).all(...resIds);
  console.log(`  Found ${drafts.length} draft(s):`);
  drafts.forEach(d => {
    console.log(`    ${d.id} | res=${d.reservation_id} | ${d.guest_name} | ${d.guest_email}`);
    console.log(`      total=${d.total_price} status=${d.status} created=${d.created_at}`);
  });
}
// Also search by name
const draftsByName = db.prepare(`
  SELECT id, session_id, reservation_id, guest_name, guest_email, 
         total_price, status, created_at
  FROM booking_drafts
  WHERE guest_name LIKE '%tepanek%' OR guest_name LIKE '%Petr%'
  ORDER BY created_at DESC
`).all();
if (draftsByName.length > 0) {
  console.log(`  By name search: ${draftsByName.length} draft(s):`);
  draftsByName.forEach(d => {
    console.log(`    ${d.id} | res=${d.reservation_id} | ${d.guest_name} | status=${d.status} | ${d.created_at}`);
  });
}

// ─── 5. Check audit_log for payment_confirmed ────────────────────────────
console.log('\n━━━ 5. AUDIT LOG (payment confirmations) ━━━');
if (resIds.length > 0) {
  const plh = resIds.map(() => '?').join(',');
  const audits = db.prepare(`
    SELECT * FROM audit_log
    WHERE entity_id IN (${plh}) OR entity_type = 'reservation'
    ORDER BY created_at DESC
    LIMIT 20
  `).all(...resIds);
  console.log(`  Found ${audits.length} audit entries:`);
  audits.forEach(a => {
    console.log(`    ${a.action} | entity=${a.entity_id} | ${a.new_values?.substring(0, 150)} | ${a.created_at}`);
  });
}

// ─── 6. BROADER: all recent confirmations via PIN (last 14 days) ─────────
console.log('\n━━━ 6. ALL RECENT PIN CONFIRMATIONS (last 14 days) ━━━');
try {
  const recentAudits = db.prepare(`
    SELECT entity_id, action, new_values, created_at
    FROM audit_log
    WHERE (action = 'cash_payment_confirmed' OR action = 'terminal_payment_confirmed' OR action = 'payment_confirmed')
      AND created_at >= datetime('now', '-14 days')
    ORDER BY created_at DESC
  `).all();
  console.log(`  Found ${recentAudits.length} confirmation(s):`);
  recentAudits.forEach(a => {
    const vals = (() => { try { return JSON.parse(a.new_values); } catch { return {}; } })();
    // Check if this reservation has a fin_operation
    const hasOp = db.prepare(`SELECT COUNT(*) as c FROM fin_operations WHERE reservation_id = ?`).get(a.entity_id);
    const opCount = hasOp?.c || 0;
    const marker = opCount === 0 ? '❌ NO FIN_OP' : `✅ ${opCount} op(s)`;
    console.log(`    ${a.entity_id} | ${a.action} | by=${vals.confirmed_by} | method=${vals.payment_method || 'cash'} | ${marker} | ${a.created_at}`);
  });
} catch (e) {
  console.log(`  (audit_log query failed: ${e.message})`);
}

// ─── 7. All reservations paid but WITHOUT fin_operations (last 30 days) ──
console.log('\n━━━ 7. PAID RESERVATIONS WITHOUT FIN_OPERATIONS (last 30 days) ━━━');
const orphans = db.prepare(`
  SELECT r.id, r.guest_id, r.check_in, r.total_price, r.currency,
         r.payment_status, r.source, r.internal_notes, r.created_at,
         g.first_name, g.last_name
  FROM reservations r
  LEFT JOIN guests g ON g.id = r.guest_id
  WHERE r.payment_status = 'paid'
    AND r.created_at >= datetime('now', '-30 days')
    AND NOT EXISTS (
      SELECT 1 FROM fin_operations fo WHERE fo.reservation_id = r.id
    )
  ORDER BY r.created_at DESC
`).all();
console.log(`  Found ${orphans.length} orphan(s):`);
orphans.forEach(o => {
  console.log(`    ${o.id} | ${o.first_name} ${o.last_name} | ${o.total_price} ${o.currency}`);
  console.log(`      check_in=${o.check_in} src=${o.source} created=${o.created_at}`);
  console.log(`      notes: ${(o.internal_notes || '').substring(0, 150)}`);
});

// ─── 8. Check deployment timing ──────────────────────────────────────────
console.log('\n━━━ 8. RECENT FIN_OPERATIONS WITH source=booking_widget ━━━');
const widgetOps = db.prepare(`
  SELECT id, reservation_id, amount, currency, source, source_ref, comment, 
         account_to_id, created_at
  FROM fin_operations
  WHERE source = 'booking_widget'
  ORDER BY created_at DESC
  LIMIT 10
`).all();
console.log(`  Found ${widgetOps.length} booking_widget operation(s):`);
widgetOps.forEach(o => {
  console.log(`    ${o.id} | res=${o.reservation_id} | ${o.amount} ${o.currency} | acct=${o.account_to_id}`);
  console.log(`      ref=${o.source_ref} comment=${o.comment} created=${o.created_at}`);
});

console.log(`\n${'='.repeat(70)}`);
console.log('  DIAGNOSIS COMPLETE');
console.log(`${'='.repeat(70)}\n`);

db.close();
