const db = require('better-sqlite3')('data/alisio.db');

// Check Honsa
const rows = db.prepare(`
  SELECT rg.first_name, rg.last_name, rg.date_of_birth, rg.document_type, rg.document_number, rg.nationality, rg.created_at, r.check_in, r.check_out, r.source
  FROM reservation_guests rg 
  JOIN reservations r ON rg.reservation_id = r.id 
  WHERE rg.last_name LIKE '%Honsa%' OR rg.first_name LIKE '%Pavel%Honsa%' OR rg.first_name LIKE '%Honsa%'
`).all();
console.log('Honsa records:', rows);

// Check all incomplete registrations
const incomplete = db.prepare(`
  SELECT rg.first_name, rg.last_name, rg.date_of_birth, rg.document_type, rg.document_number, rg.created_at
  FROM reservation_guests rg
  WHERE (rg.date_of_birth IS NULL OR rg.date_of_birth = '')
     OR (rg.document_type IS NULL OR rg.document_type = '')
     OR (rg.document_number IS NULL OR rg.document_number = '')
  ORDER BY rg.created_at DESC
  LIMIT 20
`).all();
console.log('\nIncomplete registrations (last 20):');
incomplete.forEach(r => console.log(`  ${r.first_name} ${r.last_name} | DOB: ${r.date_of_birth || 'MISSING'} | Doc: ${r.document_type || 'MISSING'}: ${r.document_number || 'MISSING'} | Created: ${r.created_at}`));
console.log(`  Total: ${incomplete.length}`);

// Check ALL with missing fields
const total = db.prepare(`
  SELECT count(*) as c FROM reservation_guests rg
  WHERE (rg.date_of_birth IS NULL OR rg.date_of_birth = '')
     OR (rg.document_type IS NULL OR rg.document_type = '')
     OR (rg.document_number IS NULL OR rg.document_number = '')
`).get();
console.log('\nTotal incomplete:', total.c);
console.log('Total records:', db.prepare('SELECT count(*) as c FROM reservation_guests').get().c);
