const dbPath = require('path').resolve('./data/alisio.db');
const db = require('better-sqlite3')(dbPath);
console.log(db.prepare("SELECT price FROM voucher_bundles WHERE promo_code = 'VIP2026SUMMER'").get());
