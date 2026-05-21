var db = require(process.cwd() + '/node_modules/better-sqlite3')('data/alisio.db');

// 1. Fix Diana Driukova's breakfast: set correct payment_id and service_date
console.log('=== DATA REPAIR ===');

// Diana's breakfast should have service_date = 2026-05-22 (day after check-in 2026-05-21)
var r1 = db.prepare(`
  UPDATE service_orders 
  SET service_date = '2026-05-22'
  WHERE id = 'so_1779381019218'
`).run();
console.log('Diana breakfast date fix:', r1.changes);

// Also the earlier duplicate breakfast for Diana (so_1779353110388) with date 2026-05-20
var r1b = db.prepare(`
  UPDATE service_orders 
  SET service_date = '2026-05-22'
  WHERE id = 'so_1779353110388'
`).run();
console.log('Diana breakfast date fix (earlier order):', r1b.changes);

// 2. Fix BBQ orders that have payment_id but are still 'pending'
// Mila Orlyk - BBQ
var r2 = db.prepare(`
  UPDATE service_orders 
  SET payment_status = 'paid', status = 'confirmed'
  WHERE id = '269620e0e15e435f6547b3cd4a0763b2' 
    AND payment_id = '019e4b3c-0ba7-7bc2-aaf2-753be8b9c756'
    AND payment_status = 'pending'
`).run();
console.log('Mila BBQ fix:', r2.changes);

// Sandor Vamos - BBQ
var r3 = db.prepare(`
  UPDATE service_orders 
  SET payment_status = 'paid', status = 'confirmed'
  WHERE id = '6c5a20991b6743d2be21208545120321'
    AND payment_id = '019e4b4c-0843-7f3d-a72c-ab42faf93969'
    AND payment_status = 'pending'
`).run();
console.log('Sandor BBQ fix:', r3.changes);

// 3. Verify repairs
console.log('\n=== VERIFICATION ===');
var orders = db.prepare(`
  SELECT so.id, so.service_date, so.payment_id, so.payment_status, so.status,
         ads.name_en, g.first_name, g.last_name
  FROM service_orders so
  JOIN additional_services ads ON so.service_id = ads.id
  LEFT JOIN reservations r ON so.reservation_id = r.id
  LEFT JOIN guests g ON r.guest_id = g.id
  WHERE so.id IN ('so_1779381019218', 'so_1779353110388', '269620e0e15e435f6547b3cd4a0763b2', '6c5a20991b6743d2be21208545120321')
`).all();
orders.forEach(function(o) {
  console.log(o.id, '|', o.name_en, '|', o.first_name, o.last_name, '| date:', o.service_date, '| pay:', o.payment_status, '| status:', o.status);
});

console.log('\nDone!');
