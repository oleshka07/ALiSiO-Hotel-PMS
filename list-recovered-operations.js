#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'alisio.db'), { readonly: true });

// Get ALL operations, sorted by created_at descending, top 30
const ops = db.prepare(`
  SELECT fo.id, fo.reservation_id, fo.amount, fo.currency, fo.method,
         fo.comment, fo.paid_at, fo.source, fo.source_ref,
         fo.created_at,
         fa.name AS account_name,
         g.first_name, g.last_name, r.check_in, r.check_out
  FROM fin_operations fo
  LEFT JOIN finance_accounts fa ON fa.id = fo.account_to_id
  LEFT JOIN reservations r ON r.id = fo.reservation_id
  LEFT JOIN guests g ON g.id = r.guest_id
  ORDER BY fo.created_at DESC
  LIMIT 30
`).all();

console.log(`LAST30_COUNT|${ops.length}`);
ops.forEach(o => {
  console.log(`OP|${o.created_at}|${o.id?.substring(0,25)}|${(o.first_name||'')} ${(o.last_name||'')}|${o.amount}|${o.currency}|${o.method}|${o.source}|${o.source_ref}|${o.account_name}|${o.comment}`);
});

db.close();
