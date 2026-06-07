/**
 * Migration: Add custom invoice columns to invoices table.
 *
 * Allows creating standalone invoices not tied to a reservation:
 *   - Makes reservation_id nullable
 *   - Adds buyer, description, and metadata columns for custom invoices
 *
 * Run once on the server: node scripts/migrate-custom-invoices.js
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(process.cwd(), 'data', 'alisio.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // temporarily disabled for column add

const migrate = db.transaction(() => {
  const cols = db.prepare("PRAGMA table_info('invoices')").all().map(c => c.name);
  console.log('Existing columns:', cols.join(', '));

  // Step 1: Add custom columns if missing
  const newCols = [
    ['is_custom',           'INTEGER NOT NULL DEFAULT 0'],
    ['custom_buyer_name',   'TEXT'],
    ['custom_buyer_ico',    'TEXT'],
    ['custom_buyer_dic',    'TEXT'],
    ['custom_buyer_address','TEXT'],
    ['custom_buyer_city',   'TEXT'],
    ['custom_buyer_country','TEXT'],
    ['custom_description',  'TEXT'],
    ['custom_email',        'TEXT'],
  ];

  for (const [col, def] of newCols) {
    if (!cols.includes(col)) {
      db.prepare(`ALTER TABLE invoices ADD COLUMN ${col} ${def}`).run();
      console.log(`  ✓ Added column: ${col}`);
    } else {
      console.log(`  · Skipped (exists): ${col}`);
    }
  }

  // Step 2: Allow NULL reservation_id for custom invoices.
  // SQLite doesn't support ALTER COLUMN, so we recreate the table.
  const hasNullable = db.prepare("PRAGMA table_info('invoices')")
    .all()
    .find(c => c.name === 'reservation_id');

  if (hasNullable && hasNullable.notnull === 1) {
    console.log('\nRebuilding invoices table to allow NULL reservation_id...');

    db.prepare(`CREATE TABLE invoices_new (
      id TEXT PRIMARY KEY,
      reservation_id TEXT REFERENCES reservations(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      due_date TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CZK',
      status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      fin_operation_id TEXT REFERENCES fin_operations(id),
      is_custom INTEGER NOT NULL DEFAULT 0,
      custom_buyer_name    TEXT,
      custom_buyer_ico     TEXT,
      custom_buyer_dic     TEXT,
      custom_buyer_address TEXT,
      custom_buyer_city    TEXT,
      custom_buyer_country TEXT,
      custom_description   TEXT,
      custom_email         TEXT
    )`).run();

    // Get current columns that exist
    const existingCols = db.prepare("PRAGMA table_info('invoices')").all().map(c => c.name);
    const newTableCols = db.prepare("PRAGMA table_info('invoices_new')").all().map(c => c.name);
    const copyable = existingCols.filter(c => newTableCols.includes(c));

    db.prepare(`INSERT INTO invoices_new (${copyable.join(',')}) SELECT ${copyable.join(',')} FROM invoices`).run();
    db.prepare('DROP TABLE invoices').run();
    db.prepare('ALTER TABLE invoices_new RENAME TO invoices').run();

    console.log('  ✓ Table rebuilt — reservation_id is now nullable');
  } else {
    console.log('\nreservation_id is already nullable — skipping table rebuild');
  }
});

try {
  migrate();
  console.log('\n✅ Migration complete');
} catch (e) {
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
} finally {
  db.close();
}
