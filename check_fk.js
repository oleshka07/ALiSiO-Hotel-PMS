const path = require('path');
const db = require(path.join(__dirname, 'node_modules/better-sqlite3'))('data/alisio.db');
// Check which reservation code is the second failing one
const res = db.prepare("SELECT id, unit_id, hostex_reservation_code, hostex_stay_code FROM reservations WHERE hostex_reservation_code LIKE '9-6904786425%'").get();
console.log('Second failing res:', JSON.stringify(res));

// Also check ALL reservations that use the old u_st4 ID
const oldSt4 = db.prepare("SELECT id, unit_id, hostex_reservation_code FROM reservations WHERE unit_id = 'u_st4'").all();
console.log('Reservations with u_st4 (old ID):', oldSt4.length);
oldSt4.forEach(r => console.log('  ', r.id, r.unit_id, r.hostex_reservation_code));

// Check B4 proper
const b4proper = db.prepare("SELECT id, unit_id, hostex_reservation_code, check_in, check_out FROM reservations WHERE unit_id = '1e7f6c7bd383af9cdfaa43eb50160148'").all();
console.log('Reservations with correct B4 ID:', b4proper.length);
b4proper.forEach(r => console.log(' ', r.id, r.check_in, '-', r.check_out, r.hostex_reservation_code));
