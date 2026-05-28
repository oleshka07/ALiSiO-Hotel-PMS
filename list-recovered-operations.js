#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'alisio.db'), { readonly: true });

// Check payments table
try {
  const payments = db.prepare('SELECT COUNT(*) as c FROM payments').get();
  console.log(`PAYMENTS_TOTAL|${payments.c}`);
  
  // PIN payments (confirmed by admin)
  const pinPayments = db.prepare("SELECT COUNT(*) as c FROM payments WHERE notes LIKE '%PIN%' OR notes LIKE '%Готівка%' OR notes LIKE '%Термінал%'").get();
  console.log(`PAYMENTS_PIN|${pinPayments.c}`);
  
  // All booking widget payments
  const bwPayments = db.prepare("SELECT COUNT(*) as c FROM payments WHERE auto_created = 1").get();
  console.log(`PAYMENTS_AUTO|${bwPayments.c}`);
  
  // Show recent PIN payments
  const recent = db.prepare(`
    SELECT p.id, p.amount, p.currency, p.method, p.paid_at, p.notes, p.reservation_id,
           r.guest_id, g.first_name, g.last_name
    FROM payments p
    LEFT JOIN reservations r ON r.id = p.reservation_id
    LEFT JOIN guests g ON g.id = r.guest_id
    WHERE p.notes LIKE '%PIN%' OR p.notes LIKE '%Готівка%' OR p.notes LIKE '%Термінал%'
    ORDER BY p.paid_at DESC LIMIT 30
  `).all();
  recent.forEach(p => console.log(`PAY|${p.first_name||''} ${p.last_name||''}|${p.amount} ${p.currency}|${p.method}|${(p.notes||'').substring(0,60)}|${p.paid_at}`));
} catch(e) {
  console.log(`PAYMENTS_ERROR|${e.message}`);
}

// Check if any fin_operations reference booking_widget
const bwOps = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE source = 'booking_widget'").get();
console.log(`FINOPS_BW|${bwOps.c}`);

// Check if fin_operations has any records from payments migration
const paymentOps = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE source_ref IS NOT NULL AND payment_subtype IS NOT NULL").get();
console.log(`FINOPS_PAYMENT_TYPE|${paymentOps.c}`);

// Check audit log for recent deletes
try {
  const deletes = db.prepare(`
    SELECT id, operation_id, action, user_name, performed_at
    FROM fin_operation_audit 
    WHERE action = 'delete'
    ORDER BY performed_at DESC LIMIT 10
  `).all();
  console.log(`AUDIT_DELETES|${deletes.length}`);
  deletes.forEach(d => console.log(`DEL|${d.operation_id}|${d.user_name||'System'}|${d.performed_at}`));
} catch(e) {
  console.log(`AUDIT_ERROR|${e.message}`);
}

// Check total audit count
try {
  const auditTotal = db.prepare('SELECT COUNT(*) as c FROM fin_operation_audit').get();
  console.log(`AUDIT_TOTAL|${auditTotal.c}`);
} catch(e) {
  console.log(`AUDIT_TOTAL_ERROR|${e.message}`);
}

db.close();
