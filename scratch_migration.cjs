const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'alisio.db');
const db = new Database(dbPath);

console.log('Starting data migration...');

// Find all tables that have a column 'unit_id'
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
const tablesWithUnitId = [];

for (const table of tables) {
  const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
  if (columns.some(c => c.name === 'unit_id')) {
    tablesWithUnitId.push(table.name);
  }
}

console.log('Tables with unit_id:', tablesWithUnitId);

try {
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');

  // 1. Rename Units
  const renameStmt = db.prepare('UPDATE units SET name = ? WHERE id = ?');
  renameStmt.run('A1 - Mirror - River Wood', 'u_mr1');
  renameStmt.run('A2 - Mirror - Slow Down', 'u_mr2');
  renameStmt.run('B1 - Stealth - Stealth 1', 'u_st1');
  renameStmt.run('B2 - Stealth - Stealth 2', 'u_st2');
  renameStmt.run('B3 - Stealth - Stealth 3', 'u_st3');
  
  // Stealth 4 has the old ID
  const oldSt4Id = 'd503be0cd56044e5fe4d1a5a727c8bdb';
  const newSt4Id = 'u_st4';
  
  // First rename it
  db.prepare('UPDATE units SET name = ? WHERE id = ?').run('B4 - Stealth - Svitanok - Stealth 4', oldSt4Id);
  
  // Now update its ID in units table
  db.prepare('UPDATE units SET id = ? WHERE id = ?').run(newSt4Id, oldSt4Id);
  
  // Update all referencing tables
  for (const table of tablesWithUnitId) {
    console.log(`Updating ${table}.unit_id...`);
    db.prepare(`UPDATE ${table} SET unit_id = ? WHERE unit_id = ?`).run(newSt4Id, oldSt4Id);
  }

  // 2. Create Business Units
  const orgIdRow = db.prepare('SELECT id FROM organizations LIMIT 1').get();
  const orgId = orgIdRow ? orgIdRow.id : 'org_alisio_001';
  
  const insertBu = db.prepare(`
    INSERT INTO business_units (id, organization_id, name, unit_type, is_shared, is_active, sort_order, parent_id)
    VALUES (?, ?, ?, ?, 0, 1, ?, 'bu_glamping')
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, parent_id=excluded.parent_id
  `);
  
  insertBu.run('bu_mr1', orgId, 'A1 - Mirror - River Wood', 'Mirror House (2 місця)', 10);
  insertBu.run('bu_mr2', orgId, 'A2 - Mirror - Slow Down', 'Mirror House (2 місця)', 11);
  insertBu.run('bu_st1', orgId, 'B1 - Stealth - Stealth 1', 'Stealth House (2 beds)', 12);
  insertBu.run('bu_st2', orgId, 'B2 - Stealth - Stealth 2', 'Stealth House (2 beds)', 13);
  insertBu.run('bu_st3', orgId, 'B3 - Stealth - Stealth 3', 'Stealth House (2 beds)', 14);
  insertBu.run('bu_st4', orgId, 'B4 - Stealth - Svitanok - Stealth 4', 'Stealth House (2 beds)', 15);
  
  db.exec('COMMIT;');
  db.exec('PRAGMA foreign_keys = ON;');
  console.log('Migration completed successfully.');
  
} catch(e) {
  db.exec('ROLLBACK;');
  db.exec('PRAGMA foreign_keys = ON;');
  console.error('Migration failed:', e.message);
  process.exit(1);
}

db.close();
