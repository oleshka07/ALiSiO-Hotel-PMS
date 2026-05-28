#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'alisio.db'), { readonly: true });

// All cash/terminal confirmed in audit
const all = db.prepare(`
  SELECT entity_id, action, new_values, created_at
  FROM audit_log 
  WHERE action IN ('cash_payment_confirmed', 'terminal_payment_confirmed')
  ORDER BY created_at
`).all();
console.log(`AUDIT_CONFIRMED_TOTAL|${all.length}`);
all.forEach(a => {
  let vals = {};
  try { vals = JSON.parse(a.new_values); } catch {}
  console.log(`CONFIRMED|${a.entity_id}|${a.action}|${vals.confirmed_by || '?'}|${a.created_at}`);
});

// Check reservations that have status=paid but no fin_operation
const paidNoOp = db.prepare(`
  SELECT r.id, r.total_price, r.currency, r.check_in, r.status,
         g.first_name, g.last_name
  FROM reservations r
  LEFT JOIN guests g ON g.id = r.guest_id
  LEFT JOIN fin_operations f ON f.reservation_id = r.id
  WHERE r.status = 'paid'
    AND f.id IS NULL
  ORDER BY r.check_in DESC
`).all();
console.log(`\nPAID_NO_OP|${paidNoOp.length}`);
paidNoOp.forEach(r => console.log(`MISSING|${r.id}|${r.total_price} ${r.currency}|${r.first_name || ''} ${r.last_name || ''}|checkin=${r.check_in}`));

// Now verify rec3_ records survived this restart
const rec3 = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE id LIKE 'rec3_%'").get();
const bw = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE source = 'booking_widget'").get();
const total = db.prepare("SELECT COUNT(*) as c FROM fin_operations").get();
console.log(`\nVERIFY_REC3|${rec3.c}`);
console.log(`VERIFY_BW|${bw.c}`);
console.log(`VERIFY_TOTAL|${total.c}`);

db.close();
