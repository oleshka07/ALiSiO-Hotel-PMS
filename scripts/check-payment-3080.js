const Database = require('better-sqlite3');
const db = new Database('D:/Antigraviti/ALiSiO PMS/data/alisio.db', { readonly: true });

console.log('\n=== finance_accounts (cash/bank) ===');
const accounts = db.prepare("SELECT id, name, type, currency, is_active FROM finance_accounts WHERE type IN ('cash','bank') ORDER BY sort_order").all();
console.log(JSON.stringify(accounts, null, 2));

console.log('\n=== fin_operations (source=booking_widget, last 10) ===');
const ops = db.prepare("SELECT id, amount, currency, method, source, source_ref, account_to_id, comment, status, created_at FROM fin_operations WHERE source = 'booking_widget' ORDER BY created_at DESC LIMIT 10").all();
console.log(JSON.stringify(ops, null, 2));

console.log('\n=== Reservations з internal_notes (Андрей, last 5) ===');
const res = db.prepare("SELECT id, total_price, payment_status, status, internal_notes, created_at FROM reservations WHERE internal_notes LIKE '%Андрей%' OR internal_notes LIKE '%Готівку%' OR internal_notes LIKE '%Термінал%' ORDER BY created_at DESC LIMIT 10").all();
console.log(JSON.stringify(res, null, 2));

console.log('\n=== audit_log payment_confirmed (last 10) ===');
try {
  const al = db.prepare("SELECT action, entity_id, new_values, created_at FROM audit_log WHERE action IN ('cash_payment_confirmed','terminal_payment_confirmed','payment_confirmed') ORDER BY created_at DESC LIMIT 10").all();
  console.log(JSON.stringify(al, null, 2));
} catch(e) { console.log('N/A:', e.message); }

db.close();
