/**
 * Export all incoming leads / bookings to a single table
 * Run on the SERVER: node export-all-leads.js
 */
const db = require('better-sqlite3')('./data/alisio.db');
const fs = require('fs');

const lines = [];
lines.push([
  'Дата створення',
  'Джерело',
  'Ім\'я',
  'Email',
  'Телефон',
  'Тип',
  'Заїзд',
  'Виїзд',
  'Ночей',
  'Дорослих',
  'Дітей',
  'Ціна',
  'Валюта',
  'Статус',
  'Статус оплати',
  'Юніт',
  'Reservation ID',
].join('\t'));

// 1. Widget reservations (source starts with 'widget:' or equals 'widget')
const widgetBookings = db.prepare(`
  SELECT r.id, r.created_at, r.source, r.status, r.payment_status,
         r.check_in, r.check_out, r.nights, r.adults, r.children,
         r.total_price, r.currency,
         g.first_name, g.last_name, g.email, g.phone,
         u.code as unit_code, u.name as unit_name
  FROM reservations r
  JOIN guests g ON r.guest_id = g.id
  JOIN units u ON r.unit_id = u.id
  WHERE r.source LIKE 'widget%' OR r.source = 'direct'
  ORDER BY r.created_at DESC
`).all();

for (const r of widgetBookings) {
  lines.push([
    r.created_at,
    r.source,
    `${r.first_name} ${r.last_name}`,
    r.email || '',
    r.phone || '',
    'Бронювання',
    r.check_in,
    r.check_out,
    r.nights,
    r.adults,
    r.children,
    r.total_price,
    r.currency,
    r.status,
    r.payment_status,
    r.unit_code || r.unit_name,
    r.id,
  ].join('\t'));
}

// 2. CRM leads
try {
  const leads = db.prepare(`
    SELECT id, first_name, last_name, email, phone, source, stage,
           check_in_date, check_out_date, adults, children,
           estimated_value, currency, created_at, reservation_id
    FROM crm_leads
    ORDER BY created_at DESC
  `).all();
  for (const l of leads) {
    lines.push([
      l.created_at,
      l.source,
      `${l.first_name || ''} ${l.last_name || ''}`.trim(),
      l.email || '',
      l.phone || '',
      'CRM Lead',
      l.check_in_date || '',
      l.check_out_date || '',
      '',
      l.adults || '',
      l.children || '',
      l.estimated_value || '',
      l.currency || '',
      l.stage,
      '',
      '',
      l.reservation_id || '',
    ].join('\t'));
  }
} catch(e) { console.error('crm_leads:', e.message); }

// 3. Waitlist entries
try {
  const wl = db.prepare(`SELECT * FROM waitlist ORDER BY created_at DESC`).all();
  for (const w of wl) {
    lines.push([
      w.created_at,
      'waitlist',
      w.name || '',
      w.email || '',
      w.phone || '',
      'Waitlist',
      w.check_in || '',
      w.check_out || '',
      '', '', '', '', '',
      w.status,
      '', '',
      '',
    ].join('\t'));
  }
} catch(e) { console.error('waitlist:', e.message); }

// 4. Site incoming leads
try {
  const sil = db.prepare(`SELECT * FROM site_incoming_leads ORDER BY created_at DESC`).all();
  for (const s of sil) {
    lines.push([
      s.created_at,
      `site:${s.site_id}`,
      s.full_name || '',
      s.email || '',
      s.phone || '',
      'Site Lead',
      '', '', '', '', '',
      '', '',
      s.status,
      '',
      s.source_url || '',
      '',
    ].join('\t'));
  }
} catch(e) { console.error('site_incoming_leads:', e.message); }

// 5. Booking drafts (widget checkout sessions)
try {
  const bd = db.prepare(`SELECT * FROM booking_drafts ORDER BY created_at DESC`).all();
  for (const d of bd) {
    lines.push([
      d.created_at,
      'widget-draft',
      d.guest_name || '',
      d.guest_email || '',
      d.guest_phone || '',
      'Widget Draft',
      d.check_in || '',
      d.check_out || '',
      '', '', '',
      d.total_price || '',
      '',
      d.status,
      '',
      d.unit_type || '',
      d.reservation_id || '',
    ].join('\t'));
  }
} catch(e) { console.error('booking_drafts:', e.message); }

const output = lines.join('\n');
const filename = `export-leads-${new Date().toISOString().split('T')[0]}.tsv`;
fs.writeFileSync(filename, output, 'utf-8');
console.log(`Written ${lines.length - 1} entries to ${filename}`);
console.log('\nPreview (first 15 lines):');
lines.slice(0, 16).forEach(l => console.log(l));
