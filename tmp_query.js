var db = require(process.cwd() + '/node_modules/better-sqlite3')('data/alisio.db');

// Find Anna Jusmann's orders
console.log('=== ANNA JUSMANN ORDERS ===');
var orders = db.prepare(`
  SELECT so.*, ads.name_en, ads.service_type,
         g.first_name, g.last_name, u.name as unit_name,
         r.check_in, r.check_out, r.guest_page_token
  FROM service_orders so
  JOIN additional_services ads ON so.service_id = ads.id
  LEFT JOIN reservations r ON so.reservation_id = r.id
  LEFT JOIN guests g ON r.guest_id = g.id
  LEFT JOIN units u ON r.unit_id = u.id
  WHERE g.last_name LIKE '%Jusmann%' OR g.last_name LIKE '%Jusmann%'
  ORDER BY so.created_at DESC
`).all();
orders.forEach(function(o) {
  console.log(JSON.stringify({
    id: o.id,
    service: o.name_en,
    service_type: o.service_type,
    qty: o.quantity,
    price: o.total_price,
    service_date: o.service_date,
    payment_status: o.payment_status,
    payment_id: o.payment_id,
    notes: o.notes,
    guest: o.first_name + ' ' + o.last_name,
    unit: o.unit_name,
    check_in: o.check_in,
    check_out: o.check_out,
    created: o.created_at
  }, null, 2));
});

// Also check BSO
console.log('\n=== ANNA JUSMANN BSO ===');
var bso = db.prepare(`
  SELECT bso.*, ads.name_en, mi.name_en as menu_name,
         g.first_name, g.last_name
  FROM booking_service_orders bso
  JOIN additional_services ads ON bso.service_id = ads.id
  LEFT JOIN menu_items mi ON bso.menu_item_id = mi.id
  LEFT JOIN reservations r ON bso.reservation_id = r.id
  LEFT JOIN guests g ON r.guest_id = g.id
  WHERE g.last_name LIKE '%Jusmann%'
  ORDER BY bso.created_at DESC
`).all();
bso.forEach(function(o) {
  console.log(JSON.stringify(o, null, 2));
});

// Check all recent breakfast orders from all sources
console.log('\n=== ALL BREAKFAST ORDERS (last 3 days) ===');
var bf = db.prepare(`
  SELECT so.id, so.reservation_id, so.service_id, so.quantity, so.total_price,
         so.service_date, so.notes, so.payment_status, so.created_at,
         ads.name_en, ads.service_type,
         g.first_name, g.last_name, u.name as unit_name
  FROM service_orders so
  JOIN additional_services ads ON so.service_id = ads.id
  LEFT JOIN reservations r ON so.reservation_id = r.id
  LEFT JOIN guests g ON r.guest_id = g.id
  LEFT JOIN units u ON r.unit_id = u.id
  WHERE so.service_id = 'svc_breakfast'
    AND so.created_at > datetime('now', '-3 day')
  ORDER BY so.created_at DESC
`).all();
bf.forEach(function(o) {
  console.log(o.id, '|', o.first_name, o.last_name, '|', o.unit_name,
    '| date:', o.service_date, '| qty:', o.quantity, '| price:', o.total_price,
    '| pay:', o.payment_status, '| notes:', (o.notes || '').substring(0, 120));
});
