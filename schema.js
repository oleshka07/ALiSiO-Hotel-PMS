const db = require('better-sqlite3')('data/alisio.db', {readonly: true});
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='fin_operations'").get().sql);
