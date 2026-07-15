const db = require('better-sqlite3')('data/alisio.db', {readonly: true});
console.log(db.prepare("SELECT id, name FROM business_units").all());
