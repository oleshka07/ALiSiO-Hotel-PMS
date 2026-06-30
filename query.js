const db = require('better-sqlite3')('data/alisio.db', {readonly: true});
const ops = db.prepare(`SELECT o.amount_company, o.comment, ec.name as cat_name FROM fin_operations o LEFT JOIN expense_categories ec ON o.category_id = ec.id WHERE o.op_type = 'expense'`).all();
console.log(JSON.stringify(ops, null, 2));
