#!/usr/bin/env node
/**
 * Removes terminal (card) payment fin_operations that were incorrectly created.
 * Only removes booking_widget ops with method='card'.
 * Cash ops (method='cash') are preserved.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = !process.argv.includes('--apply');
const db = new Database(path.join(__dirname, 'data', 'alisio.db'));
db.pragma('journal_mode = WAL');

console.log(`\n=== Remove Terminal fin_operations ===`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

// Find all booking_widget operations with method='card' (terminal)
const terminalOps = db.prepare(`
  SELECT id, amount, currency, method, comment, reservation_id, paid_at
  FROM fin_operations
  WHERE source = 'booking_widget' AND method = 'card'
  ORDER BY paid_at
`).all();

console.log(`Found ${terminalOps.length} terminal operations to remove:`);
terminalOps.forEach(o => {
  console.log(`  ${o.id} | ${o.amount} ${o.currency} | ${o.method} | ${(o.comment||'').substring(0,50)} | ${o.paid_at}`);
});

// Show cash ops that will be preserved
const cashOps = db.prepare(`
  SELECT id, amount, currency, method, comment, reservation_id
  FROM fin_operations
  WHERE source = 'booking_widget' AND method = 'cash'
`).all();
console.log(`\nCash operations to KEEP: ${cashOps.length}`);
cashOps.forEach(o => {
  console.log(`  KEEP: ${o.id} | ${o.amount} ${o.currency} | ${o.comment}`);
});

if (!DRY_RUN && terminalOps.length > 0) {
  const tx = db.transaction(() => {
    for (const op of terminalOps) {
      // Null out bank_transactions references
      db.prepare('UPDATE bank_transactions SET matched_operation_id = NULL WHERE matched_operation_id = ?').run(op.id);
      // Delete the operation
      db.prepare('DELETE FROM fin_operations WHERE id = ?').run(op.id);
      console.log(`  DELETED: ${op.id}`);
    }
  });
  tx();
  console.log(`\nDeleted ${terminalOps.length} terminal operations.`);
}

const total = db.prepare('SELECT COUNT(*) as c FROM fin_operations').get();
const bw = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE source = 'booking_widget'").get();
console.log(`\nTotal fin_operations: ${total.c}`);
console.log(`booking_widget ops remaining: ${bw.c}`);

db.close();
