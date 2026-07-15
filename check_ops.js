const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
const countAll = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE op_type = 'income'").get().c;
const countWithRes = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE op_type = 'income' AND reservation_id IS NOT NULL").get().c;
const countWithCat = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE op_type = 'income' AND category_id IS NOT NULL").get().c;
const countWithProj = db.prepare("SELECT COUNT(*) as c FROM fin_operations WHERE op_type = 'income' AND project_id IS NOT NULL").get().c;
console.log({ countAll, countWithRes, countWithCat, countWithProj });
