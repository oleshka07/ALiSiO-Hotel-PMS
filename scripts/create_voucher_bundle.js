const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'alisio.db');
const db = new Database(dbPath);

const siteId = '20b5d7d00feb2a47237d8785f949bc1c';

const services = [
  { service_id: 'svc_breakfast', qty: 2, free: true },
  { service_id: 'svc_sauna', qty: 2, free: true },
  { service_id: 'svc_bbq', qty: 1, free: true }
];

db.prepare(`
  INSERT INTO voucher_bundles (id, site_id, name, description, price, currency, nights_included, included_services, validity_months, promo_code, redemption_limit)
  VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  siteId,
  'VIP Weekend All-Inclusive',
  'Проживання на 2 ночі, сніданки, 2 сесії сауни та мангал',
  8200, // Roughly 349 EUR
  'CZK',
  2,
  JSON.stringify(services),
  12,
  'VIP349',
  100
);

console.log('Bundle created successfully!');
