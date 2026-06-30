const { getDb } = require('./src/core/db');
const db = getDb();
const rows = db.prepare(`
  SELECT r.id, r.unit_id, u.name as unit_name, r.source, r.total_price, r.status, g.first_name, g.last_name, r.channel_remarks, r.external_uid, r.hostex_listing_id
  FROM reservations r 
  LEFT JOIN guests g ON r.guest_id = g.id 
  LEFT JOIN units u ON u.id = r.unit_id
  WHERE g.first_name LIKE '%Judenhofer%' OR g.last_name LIKE '%Judenhofer%'
`).all();
console.log(JSON.stringify(rows, null, 2));
