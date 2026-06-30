const { getDb } = require('./src/core/db');
const db = getDb();
const rows = db.prepare(`
  SELECT 
    r.unit_id, 
    u.name as unit_name,
    g.first_name || ' ' || g.last_name as guest_name,
    r.check_in,
    r.check_out,
    r.status,
    r.source,
    r.total_price,
    r.currency,
    r.nights
  FROM reservations r
  JOIN units u ON u.id = r.unit_id
  LEFT JOIN guests g ON g.id = r.guest_id
  WHERE r.status != 'cancelled'
    AND r.check_out >= '2026-05-01'
    AND r.check_in <= '2026-05-31'
  ORDER BY u.name, r.check_in
`).all();
console.log(JSON.stringify(rows, null, 2));
