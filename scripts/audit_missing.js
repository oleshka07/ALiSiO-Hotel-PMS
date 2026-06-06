const db = require('better-sqlite3')('data/alisio.db');

// Check June reservations without registry entries
const missing = db.prepare(`
  SELECT r.id, g.first_name, g.last_name, r.check_in, r.check_out, r.status, r.source, r.registration_status
  FROM reservations r
  JOIN guests g ON r.guest_id = g.id
  WHERE r.id NOT LIKE 'res_hist_%'
  AND r.id NOT IN (SELECT DISTINCT reservation_id FROM reservation_guests)
  AND r.status IN ('confirmed','checked_in','checked_out')
  AND r.check_in >= '2026-06-01'
  ORDER BY r.check_in
  LIMIT 15
`).all();

console.log('=== JUNE+ RESERVATIONS WITHOUT REGISTRY ENTRIES ===');
missing.forEach(r => {
  console.log(`  ${r.check_in} | ${r.first_name} ${r.last_name} | ${r.status} | src: ${r.source} | reg: ${r.registration_status || 'null'}`);
});
console.log(`Total missing: ${missing.length} (showing max 15)`);

// Check if any guests registered yesterday/today
const recent = db.prepare(`
  SELECT rg.first_name, rg.last_name, rg.created_at, r.check_in
  FROM reservation_guests rg
  JOIN reservations r ON rg.reservation_id = r.id
  WHERE rg.created_at >= '2026-06-04'
  ORDER BY rg.created_at DESC
`).all();
console.log('\n=== RECENTLY REGISTERED GUESTS (since June 4) ===');
recent.forEach(r => {
  console.log(`  ${r.created_at} | ${r.first_name} ${r.last_name} | check_in: ${r.check_in}`);
});
if (recent.length === 0) console.log('  (none)');
