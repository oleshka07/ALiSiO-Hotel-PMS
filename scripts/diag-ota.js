const db = require('better-sqlite3')('d:/Antigraviti/ALiSiO PMS/data/alisio.db', { readonly: true });

const r = db.prepare(
  "SELECT source, paid_at, amount, currency, status, op_type, comment FROM fin_operations WHERE source IN ('airbnb','booking_com') ORDER BY paid_at DESC"
).all();

console.log('Total OTA operations in DB:', r.length);
r.forEach(x => {
  console.log(`  [${x.source}] ${x.paid_at} | ${x.op_type} | ${x.amount} ${x.currency} | status=${x.status} | ${(x.comment || '').slice(0, 50)}`);
});

// Also check what months are covered
const months = db.prepare(
  "SELECT strftime('%Y-%m', paid_at) as m, COUNT(*) as cnt FROM fin_operations WHERE source IN ('airbnb','booking_com') GROUP BY m ORDER BY m"
).all();
console.log('\nBy month:', JSON.stringify(months));

db.close();
