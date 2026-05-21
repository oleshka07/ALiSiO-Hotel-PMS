const Database = require('better-sqlite3');
const db = new Database('D:/Antigraviti/ALiSiO PMS/data/alisio.db', { readonly: true });

// List all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Get fin_operations schema
try {
  const schema = db.prepare("PRAGMA table_info(fin_operations)").all();
  console.log('\nfin_operations columns:', schema.map(c => c.name).join(', '));
} catch(e) { console.log('no fin_operations:', e.message); }

// Check all columns by getting one row
try {
  const sample = db.prepare("SELECT * FROM fin_operations ORDER BY created_at DESC LIMIT 1").get();
  console.log('\nSample fin_operation:', JSON.stringify(sample, null, 2));
} catch(e) { console.log('Error:', e.message); }

// Today's fin_operations (try common column names)
try {
  const ops = db.prepare("SELECT * FROM fin_operations WHERE date(created_at) >= date('now') ORDER BY created_at DESC LIMIT 20").all();
  console.log('\nToday fin_operations:', JSON.stringify(ops, null, 2));
} catch(e) { console.log('Error today query:', e.message); }

db.close();
