const Database = require('better-sqlite3');
const db = new Database(process.argv[2] || './data/pms.db');
const row = db.prepare("SELECT sql FROM sqlite_master WHERE name='invoices'").get();
console.log(row ? row.sql : 'NOT FOUND');
db.close();
