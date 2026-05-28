#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'alisio.db'), { readonly: true });

// Check total
const total = db.prepare('SELECT COUNT(*) as c FROM fin_operations').get();
console.log(`DIAG_TOTAL|${total.c}`);

// Check rec2_ records
const rec2 = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE id LIKE 'rec2_%'").get();
console.log(`DIAG_REC2|${rec2.c}`);

// Check all records with booking_widget source
const widget = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE source = 'booking_widget'").get();
console.log(`DIAG_WIDGET|${widget.c}`);

// Check any recovery-like records
const recovery = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE comment LIKE '%recovery%'").get();
console.log(`DIAG_RECOVERY_COMMENT|${recovery.c}`);

// Check WAL status
try {
  const walMode = db.pragma('journal_mode');
  console.log(`DIAG_WAL|${JSON.stringify(walMode)}`);
} catch(e) { console.log(`DIAG_WAL|error: ${e.message}`); }

// Check DB file info
const fs = require('fs');
const dbPath = path.join(__dirname, 'data', 'alisio.db');
const walPath = dbPath + '-wal';
const shmPath = dbPath + '-shm';
console.log(`DIAG_DB_SIZE|${fs.statSync(dbPath).size}`);
console.log(`DIAG_WAL_EXISTS|${fs.existsSync(walPath)}|${fs.existsSync(walPath) ? fs.statSync(walPath).size : 0}`);
console.log(`DIAG_SHM_EXISTS|${fs.existsSync(shmPath)}|${fs.existsSync(shmPath) ? fs.statSync(shmPath).size : 0}`);

// Show last 5 operations to confirm what's actually there
const last5 = db.prepare('SELECT id, amount, currency, source, comment FROM fin_operations ORDER BY created_at DESC LIMIT 5').all();
last5.forEach(o => console.log(`DIAG_LAST|${o.id}|${o.amount}|${o.currency}|${o.source}|${(o.comment||'').substring(0,50)}`));

db.close();
