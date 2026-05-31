const db = require('better-sqlite3')('./data/alisio.db');
const rows = db.prepare(`
  SELECT r.id, r.status, r.check_in, r.check_out, g.first_name, g.last_name, u.code
  FROM reservations r
  JOIN units u ON u.id = r.unit_id
  LEFT JOIN guests g ON g.id = r.guest_id
  WHERE u.is_pool = 1 AND r.status NOT IN ('cancelled', 'no_show')
  ORDER BY r.check_in
`).all();
console.log(JSON.stringify(rows, null, 2));
console.log('Total:', rows.length);
