var db = require(process.cwd() + '/node_modules/better-sqlite3')('data/alisio.db');

console.log('=== DB INTEGRITY ===');
console.log('INTEGRITY:', db.pragma('integrity_check'));
console.log('FK VIOLATIONS:', db.pragma('foreign_key_check').length);

console.log('\n=== STALE ORDERS ===');
var p = db.prepare("SELECT COUNT(*) as c FROM service_orders WHERE payment_status='pending' AND created_at < datetime('now','-24 hours')").get();
console.log('STALE PENDING ORDERS (>24h):', p.c);
var p2 = db.prepare("SELECT COUNT(*) as c FROM service_orders WHERE payment_status='pending'").get();
console.log('ALL PENDING ORDERS:', p2.c);

// List stale orders
var stale = db.prepare(`
  SELECT so.id, so.service_id, so.total_price, so.created_at, so.service_date,
         ads.name_en, g.first_name, g.last_name
  FROM service_orders so
  JOIN additional_services ads ON so.service_id = ads.id
  LEFT JOIN reservations r ON so.reservation_id = r.id
  LEFT JOIN guests g ON r.guest_id = g.id
  WHERE so.payment_status = 'pending' AND so.created_at < datetime('now', '-24 hours')
  ORDER BY so.created_at DESC LIMIT 20
`).all();
stale.forEach(function(s) {
  console.log(' ', s.id, '|', s.name_en, '|', s.first_name, s.last_name, '| created:', s.created_at, '| price:', s.total_price);
});

console.log('\n=== PAYMENT STATUS DISTRIBUTION ===');
var dist = db.prepare("SELECT payment_status, COUNT(*) as c FROM service_orders GROUP BY payment_status").all();
dist.forEach(function(d) { console.log(' ', d.payment_status, ':', d.c); });

console.log('\n=== RESERVATIONS WITHOUT GUEST TOKEN ===');
var noToken = db.prepare("SELECT COUNT(*) as c FROM reservations WHERE guest_page_token IS NULL AND status IN ('confirmed','checked_in')").get();
console.log('Missing tokens:', noToken.c);

console.log('\n=== RECENT UNCAUGHT ERRORS (tasks FK) ===');
var fk = db.pragma('foreign_key_check');
if (fk.length > 0) {
  console.log('FK violations found:');
  fk.slice(0, 10).forEach(function(v) { console.log('  table:', v.table, '| rowid:', v.rowid, '| parent:', v.parent, '| fkid:', v.fkid); });
} else {
  console.log('No FK violations');
}
