const db = require('better-sqlite3')('/root/projects/alisio-pms/data/alisio.db');

const count = db.prepare("SELECT COUNT(*) as n FROM invoices WHERE notes LIKE 'teya:%'").get();
console.log('Teya invoices found:', count.n);

if (count.n === 0) {
  console.log('Nothing to delete.');
  db.close();
  process.exit(0);
}

const result = db.prepare("DELETE FROM invoices WHERE notes LIKE 'teya:%'").run();
console.log('Deleted:', result.changes, 'invoices');
db.close();
