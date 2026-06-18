const Database = require('better-sqlite3');
const db = new Database('data/alisio.db', {readonly:true});
console.log('=== ALL UNITS ===');
db.prepare("SELECT id, name, category_id, sort_order FROM units WHERE category_id = 'cat_glamping' ORDER BY sort_order").all().forEach(r => console.log(JSON.stringify(r)));
db.close();
