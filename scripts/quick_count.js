const db = require('better-sqlite3')('data/alisio.db');
console.log('Total rg:', db.prepare('SELECT count(*) as c FROM reservation_guests').get());
console.log('Historical:', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE id LIKE 'rg_hist_%'").get());
console.log('Non-historical:', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE id NOT LIKE 'rg_hist_%'").get());

// Check months
const months = db.prepare(`
  SELECT substr(r.check_in, 1, 7) as month, count(*) as cnt
  FROM reservation_guests rg
  JOIN reservations r ON rg.reservation_id = r.id
  GROUP BY month ORDER BY month
`).all();
console.log('\nMonth distribution:');
months.forEach(m => console.log(`  ${m.month}: ${m.cnt}`));
