#!/usr/bin/env node
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
    fo.source,
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
  WHERE fo.source_ref LIKE 'pin_recovery_%' 
     OR fo.source_ref LIKE 'pin_r_%'
     OR fo.comment LIKE '%(recovery)%'
  ORDER BY fo.paid_at ASC
`).all();

console.log('TABLE_START');
for (const o of ops) {
  console.log(`ROW|${o.paid_at}|${o.first_name || ''} ${o.last_name || ''}|${o.amount}|${o.currency}|${o.method}|${o.comment}|${o.account_name}|${o.check_in}|${o.check_out}|${o.reservation_id}`);
}
console.log(`TOTAL_OPS|${ops.length}`);
console.log('TABLE_END');
db.close();
