var db = require(process.cwd() + '/node_modules/better-sqlite3')('data/alisio.db');

// Check Alexandra Sekeľová's order
console.log('=== ALEXANDRA SEKELOVA ORDER ===');
var orders = db.prepare(`
  SELECT so.id, so.reservation_id, so.service_id, so.quantity, so.total_price,
         so.service_date, so.payment_status, so.status, so.payment_id, so.notes, so.created_at,
         ads.name_en, ads.service_type,
         g.first_name, g.last_name, u.name as unit_name,
         r.check_in, r.check_out
  FROM service_orders so
  JOIN additional_services ads ON so.service_id = ads.id
  LEFT JOIN reservations r ON so.reservation_id = r.id
  LEFT JOIN guests g ON r.guest_id = g.id
  LEFT JOIN units u ON r.unit_id = u.id
  WHERE g.last_name LIKE '%Sekel%' OR r.id LIKE '%idb1yrgse5%'
  ORDER BY so.created_at DESC
`).all();
console.log('Found:', orders.length, 'orders');
orders.forEach(function(o) {
  console.log(JSON.stringify({
    id: o.id,
    service: o.name_en,
    type: o.service_type,
    qty: o.quantity,
    price: o.total_price,
    date: o.service_date,
    pay: o.payment_status,
    status: o.status,
    payment_id: o.payment_id,
    guest: (o.first_name || '') + ' ' + (o.last_name || ''),
    unit: o.unit_name,
    checkIn: o.check_in,
    checkOut: o.check_out,
    notes: o.notes ? o.notes.substring(0, 200) : null,
    created: o.created_at
  }, null, 2));
});

// Also check reservation
console.log('\n=== RESERVATION ===');
var res = db.prepare(`
  SELECT r.id, r.check_in, r.check_out, r.payment_id, r.payment_status, r.guest_page_token,
         g.first_name, g.last_name, u.name as unit_name
  FROM reservations r
  LEFT JOIN guests g ON r.guest_id = g.id
  LEFT JOIN units u ON r.unit_id = u.id
  WHERE g.last_name LIKE '%Sekel%'
  ORDER BY r.created_at DESC LIMIT 3
`).all();
res.forEach(function(r) {
  console.log(r.id, '|', r.first_name, r.last_name, '|', r.unit_name, '|', r.check_in, '->', r.check_out, '| pay:', r.payment_status, '| token:', r.guest_page_token ? 'yes' : 'no');
});

// Check all recent service_orders (last 24h) to verify dashboard will work
console.log('\n=== RECENT ORDERS (24h) ===');
var recent = db.prepare(`
  SELECT so.id, so.service_date, so.payment_status, so.status, so.total_price,
         ads.name_en, ads.service_type,
         g.first_name, g.last_name, u.name as unit_name
  FROM service_orders so
  JOIN additional_services ads ON so.service_id = ads.id
  JOIN reservations r ON so.reservation_id = r.id
  JOIN guests g ON r.guest_id = g.id
  LEFT JOIN units u ON r.unit_id = u.id
  WHERE so.created_at > datetime('now', '-1 day')
    AND so.status != 'cancelled'
  ORDER BY so.created_at DESC
`).all();
console.log('Count:', recent.length);
recent.forEach(function(o) {
  console.log(o.id, '|', o.name_en, '|', o.first_name, o.last_name, '|', o.unit_name, '| date:', o.service_date, '| pay:', o.payment_status, '| price:', o.total_price);
});
