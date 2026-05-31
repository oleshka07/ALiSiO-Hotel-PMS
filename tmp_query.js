var db = require(process.cwd() + '/node_modules/better-sqlite3')('data/alisio.db');
var r = db.prepare("SELECT id, name FROM units WHERE name LIKE '%B4%' OR name LIKE '%Svitanok%' OR name LIKE '%vitanok%'").all();
console.log('B4 search:', JSON.stringify(r, null, 2));

// Also check if it was the old ID:
var r2 = db.prepare("SELECT id, name FROM units WHERE id LIKE '%1e7f6c7bd383af9cdfaa43eb50160148%'").all();
console.log('1e7f6c...:', JSON.stringify(r2, null, 2));
