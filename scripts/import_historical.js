const fs = require('fs');
const path = require('path');
const db = require('better-sqlite3')('data/alisio.db');
const { v4: uuidv4 } = require('uuid');

const csvPath = path.join(__dirname, '..', 'Evidenční kniha poplatku z pobytu.csv');
const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(l => l.trim().length > 0);

// Clear old historical data
db.prepare("DELETE FROM reservation_guests WHERE id LIKE 'rg_hist_%'").run();
db.prepare("DELETE FROM reservations WHERE id LIKE 'res_hist_%'").run();
db.prepare("DELETE FROM guests WHERE id LIKE 'g_hist_%'").run();

function parseCsvLine(text) {
  let ret = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      ret.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  ret.push(current);
  return ret;
}

const UNIT_ID = 'u_st1';
const PROP_ID = 'prop_main_001';

function parseDate(dStr) {
  if (!dStr) return null;
  dStr = dStr.trim();
  if (dStr.includes('.')) {
    const parts = dStr.split('.');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  if (dStr.includes('-')) {
    return dStr.substring(0, 10);
  }
  return null;
}

let imported = 0;

const insertGuestLead = db.prepare(`
  INSERT OR IGNORE INTO guests (id, organization_id, first_name, last_name, email, phone, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const insertReservation = db.prepare(`
  INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights, status, source, total_price, currency, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'checked_out', 'manual', 0, 'CZK', datetime('now'), datetime('now'))
`);

const insertGuest = db.prepare(`
  INSERT INTO reservation_guests (
    id, reservation_id, guest_id, first_name, last_name, date_of_birth, nationality, 
    document_type, document_number, address, purpose_of_stay, visa_number, 
    is_foreigner, fee_amount, fee_exempt, fee_exempt_reason, police_reported, 
    police_reported_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const resCache = {};

db.transaction(() => {
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]).map(s => s.trim());
    if (row.length < 10) continue; 
    
    const rawName = row[1];
    if (!rawName || rawName === 'qq') continue; 
    
    const parts = rawName.split(' ');
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ') || '';

    const date_of_birth = parseDate(row[2]);
    const document_type = (row[3] || '').toLowerCase(); 
    const document_number = row[4] || '';
    const nationality = row[5] || '';
    const address = row[6] ? row[6].replace(/"/g, '') : '';
    const check_in = parseDate(row[7]);
    const check_out = parseDate(row[8]);
    const nights = parseInt(row[9]) || 1;
    const is_foreigner_raw = (row[10] || '').toLowerCase();
    const is_foreigner = (is_foreigner_raw.includes('tak') || is_foreigner_raw.includes('так')) ? 1 : 0;
    const fee_amount = parseFloat(row[12]) || 0;
    const fee_exempt_reason = row[13] || null;
    const fee_exempt = fee_exempt_reason ? 1 : (fee_amount === 0 ? 1 : 0);

    if (!check_in || !check_out) continue;

    const resKey = `${check_in}_${check_out}`;
    let resId = resCache[resKey];
    let leadGuestId = 'g_hist_' + uuidv4().replace(/-/g, '').substring(0, 16);
    
    if (!resId) {
      resId = 'res_hist_' + uuidv4().replace(/-/g, '').substring(0, 16);
      insertGuestLead.run(leadGuestId, 'org_alisio_001', first_name, last_name, 'hist@example.com', '');
      insertReservation.run(resId, PROP_ID, UNIT_ID, leadGuestId, check_in, check_out, nights);
      resCache[resKey] = resId;
    } else {
      insertGuestLead.run(leadGuestId, 'org_alisio_001', first_name, last_name, 'hist@example.com', '');
    }

    const guestId = 'rg_hist_' + uuidv4().replace(/-/g, '').substring(0, 16);
    const purpose_of_stay = 'Tourism';
    const visa_number = null;
    
    const police_reported = is_foreigner ? 1 : 0;
    const police_reported_at = is_foreigner ? new Date().toISOString() : null;

    insertGuest.run(
      guestId, resId, leadGuestId, first_name, last_name, date_of_birth, nationality,
      document_type, document_number, address, purpose_of_stay, visa_number,
      is_foreigner, fee_amount, fee_exempt, fee_exempt_reason, police_reported, police_reported_at
    );

    imported++;
  }
})();

console.log(`Imported ${imported} historical guests cleanly.`);
