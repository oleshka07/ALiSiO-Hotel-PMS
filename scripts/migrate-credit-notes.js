/**
 * Migration: Add is_credit_note column to invoices table.
 *
 * Allows marking batch-created invoices as credit notes (storno faktury)
 * for Teya REFUND transactions.
 *
 * Run once: node scripts/migrate-credit-notes.js
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(process.cwd(), 'data', 'alisio.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const migrate = db.transaction(() => {
  const cols = db.prepare("PRAGMA table_info('invoices')").all().map(c => c.name);
  console.log('Existing columns:', cols.join(', '));

  if (!cols.includes('is_credit_note')) {
    db.prepare("ALTER TABLE invoices ADD COLUMN is_credit_note INTEGER NOT NULL DEFAULT 0").run();
    console.log('  ✓ Added column: is_credit_note');
  } else {
    console.log('  · Skipped (exists): is_credit_note');
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
