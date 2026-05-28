var db = require(process.cwd() + '/node_modules/better-sqlite3')('data/alisio.db');
var r = db.prepare("DELETE FROM service_orders WHERE id IN ('so_1779960066411','so_1779959933825')").run();
console.log('Deleted:', r.changes);
