const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'alisio.db');
const db = new Database(dbPath);

const property = db.prepare('SELECT id FROM properties LIMIT 1').get();
if (!property) {
  console.log("No property found.");
  process.exit(1);
}

const services = db.prepare('SELECT id, name FROM additional_services').all();

const targetServices = services.filter(s => 
  s.name.toLowerCase().includes('снідан') || 
  s.name.toLowerCase().includes('сауна') || 
  s.name.toLowerCase().includes('проектор') || 
  s.name.toLowerCase().includes('мангал') || 
  s.name.toLowerCase().includes('pet') ||
  s.name.toLowerCase().includes('тварин') ||
  s.name.toLowerCase().includes('собак')
).map(s => s.id);

console.log("Services to include:", targetServices);

const ratePlanCode = 'VIP_WEEKEND_V5';
const existing = db.prepare('SELECT id FROM rate_plans WHERE code = ?').get(ratePlanCode);

if (!existing) {
  db.prepare(`
    INSERT INTO rate_plans (id, property_id, name, code, pricing_model, fixed_price, included_services_json, is_hidden)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)
  `).run(
    property.id,
    'VIP Weekend All-Inclusive',
    ratePlanCode,
    'standard',
    174.5, // 349 / 2
    JSON.stringify(targetServices),
    1 // is_hidden
  );
  console.log("Rate plan created!");
} else {
  db.prepare(`
    UPDATE rate_plans 
    SET fixed_price = ?, included_services_json = ? 
    WHERE code = ?
  `).run(174.5, JSON.stringify(targetServices), ratePlanCode);
  console.log("Rate plan updated!");
}
