const db = require('better-sqlite3')('data/alisio.db');
const rows = db.prepare(`
  SELECT rg.*, r.check_in, r.check_out, r.source
  FROM reservation_guests rg 
  JOIN reservations r ON rg.reservation_id = r.id 
  WHERE rg.last_name = 'Honsa'
`).all();
console.log(JSON.stringify(rows, null, 2));
