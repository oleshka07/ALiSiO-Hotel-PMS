const dbPath = require('path').resolve('./data/alisio.db');
const db = require('better-sqlite3')(dbPath);

const stmt = db.prepare(`
  INSERT INTO site_services (site_id, service_id, is_enabled, price_override)
  VALUES ('0f58700ac7f9046e758b029fa2bba346', 'svc_tub', 1, 25)
  ON CONFLICT(site_id, service_id) DO UPDATE SET price_override = 25
`);
stmt.run();
console.log('Updated Badefass to 25 EUR');
