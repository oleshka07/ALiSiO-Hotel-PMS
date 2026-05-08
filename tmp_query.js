var db = require(process.cwd() + '/node_modules/better-sqlite3')('data/alisio.db');
var r = db.prepare("UPDATE reservations SET payment_status = 'paid', updated_at = datetime('now') WHERE id = 'hx_9_5092701928_icoyc2mcn9' AND payment_status = 'unpaid'").run();
console.log('Updated reservation payment_status:', r.changes);
// Verify
var res = db.prepare("SELECT id, payment_status, status FROM reservations WHERE id = 'hx_9_5092701928_icoyc2mcn9'").get();
console.log('Current state:', JSON.stringify(res));
