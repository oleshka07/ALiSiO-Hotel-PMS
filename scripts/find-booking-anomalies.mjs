#!/usr/bin/env node
// Booking anomaly finder. Run from repo root: `node scripts/find-booking-anomalies.mjs`
//
// Reports three classes of issue, in order of severity:
//   1. Hostex multi-room bookings — stay_code carries an `_N` marker
//      (e.g. `9-5169043266_3-…`). Indicates Booking.com group bookings
//      where the guest reserved several cabins under one confirmation;
//      Hostex creates one reservation_code per cabin but our sync may
//      have only imported the listing whose property_id is mapped.
//   2. Duplicate reservations — same guest_id has 2+ active rows. Most
//      common cause: re-import after a Hostex modification, or manual
//      duplicate creation. Useful for finding the «I edited the wrong
//      one» class of mismatches.
//   3. Anomalously high totals — total_rate_eur > 900 on 1–4 night stays
//      almost always means a multi-cabin booking collapsed into one row.
//
// Read-only — never modifies the database.

import Database from 'better-sqlite3';

const db = new Database('data/alisio.db', { readonly: true });

const fmt = (s) => (s == null ? '—' : String(s));
const hr = () => console.log('─'.repeat(80));

console.log('\n🔎 Booking anomaly report');
console.log('   DB:', 'data/alisio.db');
hr();

// 1. Multi-room markers in stay_code
//    SQLite's `_` is a single-char wildcard in LIKE; ESCAPE clauses are
//    fiddly across drivers. Easier to fetch all stay_codes and post-filter
//    in JS — there's only ~hundreds of reservations.
const allWithStayCode = db.prepare(`
  SELECT id, hostex_channel_id, hostex_stay_code, hostex_reservation_code,
         unit_id, total_rate_eur, total_price, status,
         check_in, check_out
  FROM reservations
  WHERE hostex_stay_code IS NOT NULL
`).all();
const MULTI_ROOM_RE = /_[1-9]\d?-/;
const multiRoom = allWithStayCode
  .filter((r) => MULTI_ROOM_RE.test(r.hostex_stay_code || ''))
  .sort((a, b) => (a.check_in || '').localeCompare(b.check_in || ''));

console.log(`\n[1] Hostex multi-room markers: ${multiRoom.length} reservation(s)`);
if (multiRoom.length === 0) {
  console.log('    ✓ none');
} else {
  console.log('    Each row below was part of a multi-cabin Booking.com group booking.');
  console.log('    Its sibling cabins may NOT be in our DB — verify in Hostex.');
  hr();
  for (const r of multiRoom) {
    console.log(`    ${fmt(r.hostex_stay_code)}  →  ${fmt(r.unit_id)}  ${fmt(r.check_in)}…${fmt(r.check_out)}`);
    console.log(`      total: €${fmt(r.total_rate_eur)} / ${fmt(r.total_price)} CZK · status=${r.status} · id=${r.id}`);
  }
}

hr();

// 2. Same-guest duplicates among active reservations
const dupes = db.prepare(`
  SELECT g.id AS guest_id,
         g.first_name || ' ' || COALESCE(g.last_name,'') AS guest_name,
         COUNT(*) AS res_count,
         GROUP_CONCAT(r.id, ' | ') AS reservation_ids,
         GROUP_CONCAT(r.unit_id, ',') AS units,
         GROUP_CONCAT(r.check_in || '..' || r.check_out, ' | ') AS date_ranges,
         SUM(r.total_price) AS total_sum
  FROM reservations r
  JOIN guests g ON g.id = r.guest_id
  WHERE r.status NOT IN ('cancelled', 'no_show')
  GROUP BY g.id
  HAVING res_count > 1
  ORDER BY res_count DESC, total_sum DESC
  LIMIT 30
`).all();

console.log(`\n[2] Duplicate reservations per guest (active only): ${dupes.length} guest(s)`);
if (dupes.length === 0) {
  console.log('    ✓ none');
} else {
  console.log('    Same guest has multiple active reservations. Review whether they are');
  console.log('    legitimate (re-bookings, group bookings) or stale duplicates to merge.');
  hr();
  for (const d of dupes) {
    console.log(`    ${fmt(d.guest_name)} · ${d.res_count}× · total ${fmt(d.total_sum)} CZK`);
    console.log(`      units : ${fmt(d.units)}`);
    console.log(`      ranges: ${fmt(d.date_ranges)}`);
    console.log(`      ids   : ${fmt(d.reservation_ids)}`);
  }
}

hr();

// 3. Anomalously high totals on a single-cabin row
const high = db.prepare(`
  SELECT id, hostex_stay_code, unit_id, nights, adults, total_rate_eur,
         ROUND(total_rate_eur * 1.0 / NULLIF(nights, 0), 2) AS per_night,
         status, source,
         check_in, check_out
  FROM reservations
  WHERE total_rate_eur > 900
    AND nights <= 7
    AND status NOT IN ('cancelled')
  ORDER BY (total_rate_eur / NULLIF(nights, 0)) DESC
  LIMIT 30
`).all();

console.log(`\n[3] Anomalously high totals (€/night > 130): ${high.length} reservation(s)`);
if (high.length === 0) {
  console.log('    ✓ none');
} else {
  console.log('    These rows have a per-night cost that exceeds normal single-cabin');
  console.log('    pricing — typically multi-cabin bookings collapsed into one row.');
  hr();
  for (const r of high) {
    console.log(`    ${fmt(r.hostex_stay_code)}  →  ${fmt(r.unit_id)}  ${fmt(r.check_in)}…${fmt(r.check_out)}`);
    console.log(`      €${fmt(r.total_rate_eur)} total · €${fmt(r.per_night)}/night · ${r.nights}n · ${r.adults} adults · ${r.source}`);
    console.log(`      id=${r.id}`);
  }
}

hr();
console.log('\nDone.\n');
