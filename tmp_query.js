const db = require('better-sqlite3')('./data/alisio.db');

// booking_drafts schema + all entries
console.log('=== BOOKING_DRAFTS schema ===');
const bd = db.prepare("PRAGMA table_info(booking_drafts)").all();
console.log(bd.map(c => c.name).join(', '));
console.log('\n=== ALL BOOKING_DRAFTS ===');
const drafts = db.prepare("SELECT * FROM booking_drafts ORDER BY created_at DESC LIMIT 20").all();
console.log(JSON.stringify(drafts, null, 2));
console.log(`Total: ${drafts.length}`);

// early_bookings 
console.log('\n=== EARLY_BOOKINGS schema ===');
const eb = db.prepare("PRAGMA table_info(early_bookings)").all();
console.log(eb.map(c => c.name).join(', '));
const ebAll = db.prepare("SELECT * FROM early_bookings ORDER BY created_at DESC LIMIT 10").all();
console.log(JSON.stringify(ebAll, null, 2));

// Full text search across all CRM leads  
console.log('\n=== ALL CRM LEADS ===');
const allLeads = db.prepare("SELECT id, first_name, last_name, email, phone, source, stage, check_in_date, check_out_date, estimated_value, created_at FROM crm_leads ORDER BY created_at DESC").all();
allLeads.forEach(l => {
  console.log(`${l.created_at} | ${l.first_name} ${l.last_name} | ${l.email || '-'} | ${l.source} | ${l.stage} | ${l.check_in_date || '-'} → ${l.check_out_date || '-'} | ${l.estimated_value}`);
});

// All guests with stipek/daniel recently
console.log('\n=== GUESTS search ===');
const guests = db.prepare("SELECT * FROM guests WHERE LOWER(first_name||last_name) LIKE '%tipek%' OR LOWER(first_name||last_name) LIKE '%daniel%st%'").all();
console.log(JSON.stringify(guests, null, 2));
