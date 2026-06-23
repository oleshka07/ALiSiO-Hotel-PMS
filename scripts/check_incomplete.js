const db = require('better-sqlite3')('data/alisio.db');

// Find all incomplete reservation_guests records
const incomplete = db.prepare(`
  SELECT rg.id, rg.reservation_id, rg.first_name, rg.last_name, 
         rg.date_of_birth, rg.document_type, rg.document_number, rg.nationality,
         rg.created_at, rg.guest_id,
         r.check_in, r.check_out, r.source, u.name as unit_name
  FROM reservation_guests rg
  JOIN reservations r ON rg.reservation_id = r.id
  JOIN units u ON r.unit_id = u.id
  WHERE (rg.date_of_birth IS NULL OR rg.date_of_birth = '')
     OR (rg.document_type IS NULL OR rg.document_type = '')
     OR (rg.document_number IS NULL OR rg.document_number = '')
  ORDER BY r.check_in DESC
`).all();

console.log(`Found ${incomplete.length} incomplete records:\n`);
incomplete.forEach(r => {
  console.log(`  ${r.first_name} ${r.last_name} | Unit: ${r.unit_name} | Check-in: ${r.check_in}`);
  console.log(`    DOB: ${r.date_of_birth || 'MISSING'} | Doc: ${r.document_type || 'MISSING'}: ${r.document_number || 'MISSING'} | Nat: ${r.nationality || 'MISSING'}`);
  console.log(`    ID prefix: ${r.id?.substring(0, 15)} | Created: ${r.created_at} | Source: ${r.source}`);
  console.log();
});

// Check for duplicates — same reservation has both complete and incomplete records
const dupes = db.prepare(`
  SELECT r.id as res_id, u.name as unit_name, r.check_in,
         count(*) as cnt,
         group_concat(rg.first_name || ' ' || rg.last_name, ' | ') as guests,
         sum(CASE WHEN rg.document_number IS NOT NULL AND rg.document_number != '' THEN 1 ELSE 0 END) as with_docs,
         sum(CASE WHEN rg.document_number IS NULL OR rg.document_number = '' THEN 1 ELSE 0 END) as without_docs
  FROM reservation_guests rg
  JOIN reservations r ON rg.reservation_id = r.id
  JOIN units u ON r.unit_id = u.id
  GROUP BY r.id
  HAVING cnt > 1 AND without_docs > 0
  ORDER BY r.check_in DESC
`).all();

console.log(`\n=== Reservations with DUPLICATE entries (some complete, some not): ===\n`);
dupes.forEach(d => {
  console.log(`  ${d.unit_name} | Check-in: ${d.check_in} | ${d.cnt} records | ${d.with_docs} with docs, ${d.without_docs} without`);
  console.log(`    Guests: ${d.guests}`);
  console.log();
});

// Check what Telegram bot does
console.log('\n=== Total stats ===');
console.log('Total reservation_guests:', db.prepare('SELECT count(*) as c FROM reservation_guests').get().c);
console.log('Historical (rg_hist_):', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE id LIKE 'rg_hist_%'").get().c);
console.log('Incomplete:', incomplete.length);
