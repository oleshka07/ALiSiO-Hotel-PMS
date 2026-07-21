/**
 * add-test-product.js
 * 
 * Додає тестовий товар "Kámen (testovací platba)" за 1 Kč у widget.
 * Використовується для перевірки webhook інтеграції Teya.
 *
 * Запуск: node src/scripts/add-test-product.js
 * 
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(process.cwd(), 'data', 'alisio.db');
const db = new Database(DB_PATH);

// Знаходимо property_id (перше активне)
const property = db.prepare('SELECT id FROM properties WHERE is_active = 1 LIMIT 1').get();
if (!property) {
  console.error('❌ No active property found in DB');
  process.exit(1);
}

console.log('✅ Property ID:', property.id);

// Перевіряємо чи таблиця існує
const tableExists = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='additional_services'"
).get();

if (!tableExists) {
  console.error('❌ Table additional_services does not exist');
  process.exit(1);
}

// Перевіряємо чи є вже тестовий товар
const existing = db.prepare("SELECT id FROM additional_services WHERE id = 'svc_test_stone'").get();
if (existing) {
  console.log('ℹ️  Test product already exists. Updating price to 1...');
  db.prepare("UPDATE additional_services SET price = 1 WHERE id = 'svc_test_stone'").run();
  console.log('✅ Updated svc_test_stone price to 1 Kč');
} else {
  // Перевіряємо наявність колонки available_in_widget
  const cols = db.prepare('PRAGMA table_info(additional_services)').all().map(c => c.name);
  console.log('📋 Columns:', cols.join(', '));

  const hasWidget = cols.includes('available_in_widget');
  const hasSortOrder = cols.includes('sort_order');
  const hasCategory = cols.includes('category');
  const hasIcon = cols.includes('icon');
  const hasAvailableFor = cols.includes('available_for');

  const insertCols = ['id', 'property_id', 'name', 'name_en', 'price', 'currency', 'unit_label'];
  const insertVals = ['svc_test_stone', property.id, 'Kámen (testovací platba 1 Kč)', 'Test Stone (1 Kč payment test)', 1, 'CZK', 'ks'];

  if (hasIcon) { insertCols.push('icon'); insertVals.push('🪨'); }
  if (hasCategory) { insertCols.push('category'); insertVals.push('other'); }
  if (hasWidget) { insertCols.push('available_in_widget'); insertVals.push(1); }
  if (hasSortOrder) { insertCols.push('sort_order'); insertVals.push(999); }
  if (hasAvailableFor) { insertCols.push('available_for'); insertVals.push('all'); }

  const placeholders = insertVals.map(() => '?').join(', ');
  const sql = `INSERT INTO additional_services (${insertCols.join(', ')}) VALUES (${placeholders})`;

  console.log('📝 Inserting test product...');
  db.prepare(sql).run(...insertVals);
  console.log('✅ Test product svc_test_stone added (1 Kč)');
}

// Перевіряємо
const check = db.prepare("SELECT id, name, price, currency FROM additional_services WHERE id = 'svc_test_stone'").get();
console.log('\n📦 Product in DB:', check);

// Додаємо також у widget_price_list, щоб він відображався у вкладці Camping
try {
  const existingPrice = db.prepare("SELECT id FROM widget_price_list WHERE item_code = 'svc_test_stone'").get();
  if (existingPrice) {
    db.prepare("UPDATE widget_price_list SET rate_standard = 1 WHERE item_code = 'svc_test_stone'").run();
    console.log('✅ Updated svc_test_stone in widget_price_list to 1 Kč');
  } else {
    db.prepare(`
      INSERT INTO widget_price_list (id, category, item_code, item_name, rate_standard, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'wpl_test_stone', 'camping', 'svc_test_stone', 'Test Stone (1 Kč payment test)', 1, 1, 999
    );
    console.log('✅ Inserted svc_test_stone into widget_price_list (1 Kč)');
  }
} catch (e) {
  console.log('ℹ️ Could not add to widget_price_list (table might not exist yet):', e.message);
}

console.log('\n🎯 Now the test stone will appear in the Camping step!');
