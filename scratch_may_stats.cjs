const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'alisio.db');
const db = new Database(dbPath, { readonly: true });

const MAY_START = '2026-05-01';
const MAY_END = '2026-05-31';
const DAYS_IN_MAY = 31;

const targetUnitIds = ['u_mr1', 'u_mr2', 'u_st1', 'u_st2', 'u_st3', 'u_st4'];

const results = [];

for (const unitId of targetUnitIds) {
  const unit = db.prepare('SELECT name, code FROM units WHERE id = ?').get(unitId);
  
  if (!unit) {
    console.log(`Unit ${unitId} not found`);
    continue;
  }

  // Calculate Occupancy (Days)
  let occupiedDays = 0;
  for (let d = 0; d < DAYS_IN_MAY; d++) {
    const dateStr = new Date(2026, 4, d + 1).toISOString().slice(0, 10);
    const occ = db.prepare(`
      SELECT COUNT(*) as cnt FROM reservations
      WHERE unit_id = ? AND check_in <= ? AND check_out > ?
        AND status NOT IN ('cancelled', 'no_show', 'draft')
    `).get(unitId, dateStr, dateStr);
    if (occ.cnt > 0) occupiedDays++;
  }
  
  const occPct = Math.round((occupiedDays / DAYS_IN_MAY) * 100);

  // Calculate Bookings and Revenue (for reservations intersecting May)
  const stats = db.prepare(`
    SELECT 
      COUNT(DISTINCT r.id) as bookings_count,
      ROUND(COALESCE(SUM(r.total_price), 0), 2) as total_revenue,
      r.currency
    FROM reservations r
    WHERE r.unit_id = ?
      AND r.check_in <= ? AND r.check_out > ?
      AND r.status NOT IN ('cancelled', 'no_show', 'draft')
  `).get(unitId, MAY_END, MAY_START);

  results.push({
    unitId,
    name: unit.name,
    occupiedDays,
    occPct,
    bookings: stats.bookings_count,
    revenue: stats.total_revenue,
    currency: stats.currency || 'CZK'
  });
}

db.close();

console.log(JSON.stringify(results, null, 2));
