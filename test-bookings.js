const db = require('better-sqlite3')('local.db');
const rows = db.prepare('SELECT r.unit_id, u.name as unit_name, r.guest_name, r.check_in, r.check_out, r.status, r.source, r.total_price, r.currency FROM reservations r JOIN units u ON u.id = r.unit_id WHERE r.status != ''cancelled'' AND r.check_out >= ''2026-05-01'' AND r.check_in <= ''2026-05-31'' ORDER BY u.name, r.check_in').all();
console.log(JSON.stringify(rows, null, 2));
