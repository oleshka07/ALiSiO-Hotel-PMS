const Database = require('better-sqlite3');
const db = new Database('data/alisio.db', {readonly:true});
console.log('=== UNITS ===');
db.prepare("SELECT id, name FROM units WHERE category_id = 'cat_glamping'").all().forEach(r => console.log(JSON.stringify(r)));
console.log('\n=== BUSINESS UNITS ===');
db.prepare("SELECT id, name, parent_id FROM business_units WHERE parent_id = 'bu_glamping'").all().forEach(r => console.log(JSON.stringify(r)));
db.close();
