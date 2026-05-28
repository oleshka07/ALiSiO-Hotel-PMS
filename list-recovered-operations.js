#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'alisio.db'), { readonly: true });

// Find potential duplicates: same reservation_id with multiple fin_operations
const dupes = db.prepare(`
  SELECT fo.reservation_id, COUNT(*) as cnt,
         GROUP_CONCAT(fo.id, ' | ') as op_ids,
         GROUP_CONCAT(fo.amount || ' ' || fo.currency, ' | ') as amounts,
         GROUP_CONCAT(fo.source, ' | ') as sources,
         GROUP_CONCAT(SUBSTR(fo.comment, 1, 40), ' | ') as comments,
         g.first_name, g.last_name
  FROM fin_operations fo
  LEFT JOIN reservations r ON r.id = fo.reservation_id
  LEFT JOIN guests g ON g.id = r.guest_id
  WHERE fo.reservation_id IS NOT NULL
  GROUP BY fo.reservation_id
  HAVING COUNT(*) > 1
  ORDER BY fo.reservation_id
`).all();

console.log('DUPES_START');
console.log(`DUPES_COUNT|${dupes.length}`);
dupes.forEach(d => {
  console.log(`DUPE|${d.first_name||''} ${d.last_name||''}|${d.reservation_id}|cnt=${d.cnt}|ops=${d.op_ids}|amounts=${d.amounts}|sources=${d.sources}|comments=${d.comments}`);
});
console.log('DUPES_END');

// Also check: recovery ops where guest has OTHER telegram/manual income on same date ± 1 day
const crossCheck = db.prepare(`
  SELECT r.id as rec_id, r.amount, r.currency, r.comment as r_comment, r.paid_at as r_paid,
         g.first_name, g.last_name,
         t.id as t_id, t.amount as t_amount, t.currency as t_currency, t.comment as t_comment, t.paid_at as t_paid, t.source as t_source
  FROM fin_operations r
  JOIN fin_operations t ON t.id != r.id
    AND t.account_to_id = r.account_to_id
    AND ABS(julianday(t.paid_at) - julianday(r.paid_at)) <= 14
    AND t.amount = r.amount
    AND t.currency = r.currency
  LEFT JOIN reservations res ON res.id = r.reservation_id
  LEFT JOIN guests g ON g.id = res.guest_id
  WHERE r.id LIKE 'rec2_%'
  ORDER BY r.paid_at
`).all();

console.log('CROSS_START');
console.log(`CROSS_COUNT|${crossCheck.length}`);
crossCheck.forEach(c => {
  console.log(`CROSS|${c.first_name||''} ${c.last_name||''}|${c.amount} ${c.currency}|rec=${c.rec_id}|match=${c.t_id}|${c.t_source}|${(c.t_comment||'').substring(0,50)}`);
});
console.log('CROSS_END');

db.close();
