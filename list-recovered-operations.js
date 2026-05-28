#!/usr/bin/env node
/**
 * list-recovered-operations.js
 * Lists all recovered PIN payment operations with guest details.
 */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'alisio.db'), { readonly: true });

const ops = db.prepare(`
  SELECT 
    fo.id,
    fo.reservation_id,
    fo.amount,
    fo.currency,
    fo.method,
    fo.comment,
    fo.paid_at,
    fo.source_ref,
    fa.name AS account_name,
    g.first_name,
    g.last_name,
    r.check_in,
    r.check_out
  FROM fin_operations fo
  LEFT JOIN finance_accounts fa ON fa.id = fo.account_to_id
  LEFT JOIN reservations r ON r.id = fo.reservation_id
  LEFT JOIN guests g ON g.id = r.guest_id
  WHERE fo.source_ref LIKE 'pin_recovery_%' OR fo.source_ref LIKE 'pin_r_%'
  ORDER BY fo.paid_at ASC
`).all();

console.log('TABLE_START');
console.log(JSON.stringify(ops));
console.log('TABLE_END');
db.close();
