const db = require('better-sqlite3')('data/alisio.db', {readonly: true});
const ops = db.prepare(`
  SELECT o.id, o.amount_company, o.paid_at, o.accrued_at, o.category_id, o.project_id, o.comment, o.status,
         ec.name as cat_name, bu.name as bu_name
  FROM fin_operations o
  LEFT JOIN expense_categories ec ON o.category_id = ec.id
  LEFT JOIN business_units bu ON o.project_id = bu.id
  WHERE strftime('%Y-%m', o.paid_at) = '2026-06'
    AND o.op_type = 'expense'
`).all();

let elect = ops.find(o => o.amount_company === 5860);
console.log("Elect transaction:", elect);

let missingProj = ops.filter(o => !o.project_id);
console.log("Missing project count:", missingProj.length);
console.log("Missing project sum:", missingProj.reduce((acc, o) => acc + o.amount_company, 0));

console.log("Total expenses:", ops.reduce((acc, o) => acc + o.amount_company, 0));
