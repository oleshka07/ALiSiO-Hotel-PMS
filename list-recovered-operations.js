#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'alisio.db'), { readonly: true });

// First, check what source_refs exist for booking_widget
const refs = db.prepare(`
  SELECT id, source_ref, comment, amount, currency, paid_at, reservation_id, account_to_id
  FROM fin_operations
  WHERE source = 'booking_widget'
  ORDER BY paid_at ASC
`).all();

console.log(`WIDGET_OPS_COUNT|${refs.length}`);
refs.forEach(r => {
  console.log(`WIDGET|${r.id}|${r.source_ref}|${r.amount}|${r.currency}|${r.paid_at}|${r.reservation_id}`);
});

// Also check for inc_recovery_ IDs
const recovery = db.prepare(`
  SELECT fo.id, fo.reservation_id, fo.amount, fo.currency, fo.method,
         fo.comment, fo.paid_at, fo.source, fo.source_ref,
         fa.name AS account_name,
         g.first_name, g.last_name, r.check_in, r.check_out
  FROM fin_operations fo
  LEFT JOIN finance_accounts fa ON fa.id = fo.account_to_id
  LEFT JOIN reservations r ON r.id = fo.reservation_id
  LEFT JOIN guests g ON g.id = r.guest_id
  WHERE fo.id LIKE 'inc_recovery_%'
  ORDER BY fo.paid_at ASC
`).all();

console.log(`RECOVERY_OPS_COUNT|${recovery.length}`);
recovery.forEach(o => {
  console.log(`REC|${o.paid_at}|${(o.first_name||'')} ${(o.last_name||'')}|${o.amount}|${o.currency}|${o.method}|${o.comment}|${o.account_name}|${o.check_in}|${o.check_out}|${o.reservation_id}`);
});

db.close();
