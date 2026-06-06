/**
 * One-time backfill: Create registry entries for existing reservations
 * that don't have any reservation_guests records.
 * 
 * This covers the 136 Hostex-synced reservations that were missing from
 * the Evidenční kniha.
 *
 * Safe to run multiple times — only inserts where no entry exists.
 */
const db = require('better-sqlite3')('data/alisio.db');

const FEE_PER_NIGHT = 20; // CZK

// Find all reservations without registry entries
const missing = db.prepare(`
  SELECT r.id, r.guest_id, r.nights, r.check_in, r.check_out, r.status,
         g.first_name, g.last_name, g.country, g.date_of_birth
  FROM reservations r
  JOIN guests g ON r.guest_id = g.id
  WHERE r.id NOT IN (SELECT DISTINCT reservation_id FROM reservation_guests)
    AND r.status IN ('confirmed', 'checked_in', 'checked_out')
    AND r.check_in >= '2026-01-01'
`).all();

console.log(`Found ${missing.length} reservations without registry entries`);

const insert = db.prepare(`
  INSERT INTO reservation_guests (
    reservation_id, first_name, last_name, nationality, guest_id,
    fee_amount, fee_exempt, fee_exempt_reason, purpose_of_stay,
    date_of_birth
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Tourism', ?)
`);

let created = 0;
let errors = 0;

const tx = db.transaction(() => {
  for (const r of missing) {
    try {
      const firstName = r.first_name || '';
      const lastName = r.last_name || '';
      if (!firstName && !lastName) continue;

      let feeAmount = (r.nights || 1) * FEE_PER_NIGHT;
      let feeExempt = 0;
      let feeReason = null;

      if (r.date_of_birth) {
        try {
          const dob = new Date(r.date_of_birth);
          const ageDiffMs = Date.now() - dob.getTime();
          const ageDate = new Date(ageDiffMs);
          const age = Math.abs(ageDate.getUTCFullYear() - 1970);
          if (age < 18) {
            feeExempt = 1;
            feeAmount = 0;
            feeReason = 'Dítě do 18 let';
          }
        } catch {}
      }

      insert.run(
        r.id, firstName, lastName,
        r.country || null, r.guest_id,
        feeAmount, feeExempt, feeReason,
        r.date_of_birth || null,
      );
      created++;
    } catch (e) {
      errors++;
      console.error(`  Error for ${r.id}: ${e.message}`);
    }
  }
});

tx();

console.log(`\nDone: ${created} created, ${errors} errors`);

// Verify
const total = db.prepare('SELECT count(*) as c FROM reservation_guests').get();
console.log(`Total reservation_guests records: ${total.c}`);
