const db = require('better-sqlite3')('D:/Antigraviti/ALiSiO PMS/data/alisio.db', {readonly: true});

// Schema
const schema = db.prepare("PRAGMA table_info(guest_registrations)").all();
console.log('=== guest_registrations columns ===');
console.log(schema.map(c => c.name).join(', '));

// Recent registrations
const regs = db.prepare("SELECT * FROM guest_registrations ORDER BY created_at DESC LIMIT 5").all();
console.log('\n=== Recent guest_registrations ===');
console.log(JSON.stringify(regs, null, 2));

// Check reservation_guests too
try {
  const rg_schema = db.prepare("PRAGMA table_info(reservation_guests)").all();
  console.log('\n=== reservation_guests columns ===');
  console.log(rg_schema.map(c => c.name).join(', '));
  
  const rg = db.prepare("SELECT * FROM reservation_guests ORDER BY created_at DESC LIMIT 10").all();
  console.log('\n=== Recent reservation_guests ===');
  console.log(JSON.stringify(rg, null, 2));
} catch(e) { console.log('reservation_guests:', e.message); }

db.close();
