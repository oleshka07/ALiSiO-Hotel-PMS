const db = require('better-sqlite3')('data/alisio.db');

console.log('=== DATA QUALITY REPORT ===');
console.log('Total reservation_guests:', db.prepare('SELECT count(*) as c FROM reservation_guests').get().c);
console.log('Historical (imported):', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE id LIKE 'rg_hist_%'").get().c);
console.log('Portal-registered:', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE id NOT LIKE 'rg_hist_%'").get().c);
console.log('With nationality:', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE nationality IS NOT NULL AND nationality != ''").get().c);
console.log('With document:', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE document_number IS NOT NULL AND document_number != ''").get().c);
console.log('With DOB:', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE date_of_birth IS NOT NULL").get().c);
console.log('With fees > 0:', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE fee_amount > 0").get().c);
console.log('Fee exempt:', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE fee_exempt = 1").get().c);
console.log('Police reported:', db.prepare("SELECT count(*) as c FROM reservation_guests WHERE police_reported = 1").get().c);

console.log('\n=== MONTH DISTRIBUTION ===');
const months = db.prepare(`
  SELECT substr(r.check_in, 1, 7) as month, count(*) as cnt
  FROM reservation_guests rg
  JOIN reservations r ON rg.reservation_id = r.id
  GROUP BY month ORDER BY month
`).all();
months.forEach(m => console.log(`  ${m.month}: ${m.cnt} guests`));

console.log('\n=== HOSTEX RESERVATIONS WITHOUT REGISTRY ===');
const missing = db.prepare(`
  SELECT count(*) as c FROM reservations r
  WHERE r.id NOT LIKE 'res_hist_%'
  AND r.id NOT IN (SELECT DISTINCT reservation_id FROM reservation_guests)
  AND r.status IN ('confirmed', 'checked_in', 'checked_out')
  AND r.check_in >= '2026-03-01'
`).get();
console.log('Reservations without registry entries:', missing.c);

console.log('\n=== SIDEBAR CHECK ===');
const fs = require('fs');
const path = require('path');
function findInDir(dir, pattern) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const fp = path.join(dir, f);
      const stat = fs.statSync(fp);
      if (stat.isDirectory() && !f.startsWith('.') && f !== 'node_modules') {
        findInDir(fp, pattern);
      } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
        const content = fs.readFileSync(fp, 'utf8');
        if (content.includes('guest-registry') && (content.includes('Sidebar') || content.includes('sidebar') || content.includes('nav') || content.includes('menu'))) {
          console.log('Found in:', fp);
        }
      }
    }
  } catch(e) {}
}
findInDir('src', 'guest-registry');
