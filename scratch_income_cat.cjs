const db = require('better-sqlite3')('data/alisio.db'); 
console.table(db.prepare("SELECT name, op_type, classifier FROM expense_categories WHERE op_type = 'income'").all());
