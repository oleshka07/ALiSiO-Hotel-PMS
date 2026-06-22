const db = require('better-sqlite3')('./data/alisio.db');

// What is BB25?
console.log('=== BB25 unit ===');
const bb25 = db.prepare("SELECT id, code, name, category_id FROM units WHERE code = 'BB25'").all();
console.log(JSON.stringify(bb25, null, 2));

// What is ST4 / B4-Svitanok?
console.log('\n=== ST4 / Svitanok ===');
const st4 = db.prepare("SELECT id, code, name, category_id FROM units WHERE code = 'ST4'").all();
console.log(JSON.stringify(st4, null, 2));

// Decode timestamp: r_178188xxxx → Date.now() starts with 178188
// Let's see what date range that covers
const tsMin = 1781880000000;
const tsMax = 1781889999999;
console.log('\n=== Timestamp range for r_178188* ===');
console.log(`From: ${new Date(tsMin).toISOString()}`);
console.log(`To:   ${new Date(tsMax).toISOString()}`);

// Check if there are any reservations created around that time
console.log('\n=== Reservations created around that time ===');
const fromDate = new Date(tsMin).toISOString().replace('T', ' ').slice(0, 19);
const toDate = new Date(tsMax).toISOString().replace('T', ' ').slice(0, 19);
const nearby = db.prepare(`
  SELECT r.id, r.created_at, r.check_in, r.check_out, r.total_price, r.currency,
         r.status, r.payment_status, r.source, r.is_multi_room, r.group_id, r.multi_room_marker,
         g.first_name, g.last_name, g.email, g.phone,
         u.code, u.name as unit_name
  FROM reservations r
  LEFT JOIN guests g ON r.guest_id = g.id  
  LEFT JOIN units u ON r.unit_id = u.id
  WHERE r.id LIKE 'r_178188%' OR r.id LIKE 'r_17818%'
  ORDER BY r.created_at DESC
`).all();
console.log(JSON.stringify(nearby, null, 2));
console.log(`Found: ${nearby.length}`);

// Price 1980 CZK - check if that's B4/Svitanok (glamping)
// Price 225 CZK - check if that's BB25 (camping, likely city tax or addon)
console.log('\n=== BB25 category ===');
const bb25cat = db.prepare(`
  SELECT u.id, u.code, u.name, c.name as cat_name, c.type as cat_type, ut.name as ut_name
  FROM units u 
  JOIN categories c ON u.category_id = c.id
  JOIN unit_types ut ON u.unit_type_id = ut.id
  WHERE u.code = 'BB25'
`).all();
console.log(JSON.stringify(bb25cat, null, 2));
