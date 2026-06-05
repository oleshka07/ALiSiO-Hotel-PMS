const Database = require('better-sqlite3');
const db = new Database('d:/Antigraviti/ALiSiO PMS/data/alisio.db', { readonly: true });

// Check for OTA operations
const ota = db.prepare("SELECT source, source_ref, paid_at, amount, currency, comment FROM fin_operations WHERE source IN ('airbnb','booking_com') ORDER BY paid_at DESC LIMIT 20").all();
console.log('OTA operations count:', ota.length);
if (ota.length > 0) {
  ota.forEach(r => console.log(' -', r.source, r.source_ref, r.paid_at, r.amount, r.currency));
} else {
  console.log('No OTA operations found in DB');
}

// Check EUR rate
const rate = db.prepare("SELECT * FROM finance_exchange_rates WHERE from_currency='EUR' AND to_currency='CZK' ORDER BY effective_from DESC LIMIT 3").all();
console.log('EUR->CZK rates configured:', rate.length, JSON.stringify(rate));

// Check all fin_operations for this month
const thisMonth = db.prepare("SELECT source, method, COUNT(*) as cnt FROM fin_operations WHERE strftime('%Y-%m', paid_at) IN ('2026-05','2026-06') AND op_type='income' GROUP BY source, method").all();
console.log('Income ops May-Jun 2026:', JSON.stringify(thisMonth));

db.close();
