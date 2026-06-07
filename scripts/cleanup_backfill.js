const db = require('better-sqlite3')('data/alisio.db');

// Remove backfill entries that have no document info (auto-created from Hostex)
// These are entries without document_type AND document_number AND that are NOT historical imports
const r = db.prepare(`
  DELETE FROM reservation_guests
  WHERE document_type IS NULL
    AND document_number IS NULL
    AND id NOT LIKE 'rg_hist_%'
`).run();

console.log('Deleted backfill entries:', r.changes);
console.log('Remaining:', db.prepare('SELECT count(*) as c FROM reservation_guests').get());
