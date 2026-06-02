const Database = require('better-sqlite3');
const db = new Database('./data/alisio.db');
const sites = db.prepare("SELECT id, slug, name FROM booking_sites WHERE status != 'deleted' LIMIT 5").all();
console.log('Sites:', JSON.stringify(sites, null, 2));
const plans = db.prepare("SELECT id, site_id, name, is_default, pricing_mode FROM site_rate_plans WHERE is_active = 1 LIMIT 10").all();
console.log('Rate plans:', JSON.stringify(plans, null, 2));
db.close();
