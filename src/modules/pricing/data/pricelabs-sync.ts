/* eslint-disable @typescript-eslint/no-explicit-any */
//
// PriceLabs → price_calendar sync. Pulls daily rates for the 6 glamping
// houses, converts EUR→CZK via the daily ČNB rate, and upserts into
// price_calendar (keyed on unit_type_id + date — the same table the widget
// and channel manager already read from).
//
// Designed to be called from /api/cron/sync-pricelabs once per day.
//

import { getDb } from '@core/db';
import { getListings, getListingPrices } from '@/lib/pricelabs';
import { getEurCzkRate } from '@/lib/hostex';

/**
 * Hostex property_id → ALiSiO unit_id. Same map used by hostex-sync.ts.
 * Duplicated here on purpose — both maps are hardcoded today and we'll
 * dedupe them into a shared constants file only when a third caller
 * appears. Premature DRY costs more than the two-line repeat.
 */
const HOSTEX_TO_UNIT: Record<number, string> = {
  12446083: 'u_mr1',                            // A1 - Mirror - River Wood
  12558043: 'u_mr2',                            // A2 - Mirror - Slow Down
  12590381: 'u_st1',                            // B1 - Stealth - Stealth 1
  12590382: 'u_st2',                            // B2 - Stealth - Stealth 2
  12446084: 'u_st3',                            // B3 - Stealth - Stealth 3
  12565124: 'u_st4',                            // B4 - Stealth - Svitanok
};

export interface SyncListingResult {
  pl_id: string;
  listing_name: string;
  unit_id: string;
  unit_type_id: string;
  unit_name: string;
  days_written: number;
}

export interface SyncResult {
  ok: boolean;
  daysAhead: number;
  dateFrom: string;
  dateTo: string;
  eurToCzk: number;
  listingsResolved: number;
  listingsSkipped: number;
  daysWrittenTotal: number;
  perListing: SyncListingResult[];
  conflicts: Array<{ unit_type_id: string; listing_names: string[] }>;
  errors: string[];
}

/** Parse the embedded Hostex property_id out of a PriceLabs listing id
 *  like `20345_12446083_house`. Returns null if the format doesn't match. */
function parseHostexIdFromPLId(plId: string): number | null {
  const m = plId.match(/^\d+_(\d+)_/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return isFinite(n) ? n : null;
}

function isoDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

export async function syncPriceLabsToCalendar(daysAhead = 90): Promise<SyncResult> {
  const result: SyncResult = {
    ok: false,
    daysAhead,
    dateFrom: '',
    dateTo: '',
    eurToCzk: 0,
    listingsResolved: 0,
    listingsSkipped: 0,
    daysWrittenTotal: 0,
    perListing: [],
    conflicts: [],
    errors: [],
  };

  let listings;
  try {
    listings = await getListings();
  } catch (e: any) {
    result.errors.push(`PriceLabs /listings failed: ${e?.message}`);
    return result;
  }
  // Only PMS-connected listings (drops the per-channel Airbnb/Booking duplicates).
  const hostexListings = listings.filter((l) => l.pms === 'hostex');

  const db = getDb();

  // 1. Resolve PL listing → unit_type_id via Hostex id → unit_id → units row.
  const resolved: Array<{ pl_id: string; pl_name: string; unit_id: string; unit_type_id: string; unit_name: string }> = [];
  for (const l of hostexListings) {
    const hostexId = parseHostexIdFromPLId(l.id);
    const unitId = hostexId != null ? HOSTEX_TO_UNIT[hostexId] : null;
    if (!unitId) {
      console.log(`[PL sync] Skip listing ${l.id} (${l.name}) — no Hostex→unit mapping`);
      result.listingsSkipped += 1;
      continue;
    }
    const row = db.prepare('SELECT unit_type_id, name FROM units WHERE id = ?').get(unitId) as any;
    if (!row || !row.unit_type_id) {
      console.log(`[PL sync] Skip listing ${l.id} — unit ${unitId} not found or no unit_type_id`);
      result.listingsSkipped += 1;
      continue;
    }
    resolved.push({ pl_id: l.id, pl_name: l.name, unit_id: unitId, unit_type_id: row.unit_type_id, unit_name: row.name });
  }

  if (resolved.length === 0) {
    result.errors.push('No PriceLabs listings resolved to a unit_type');
    return result;
  }

  // 2. Detect collisions — two PL listings landing on the same unit_type_id
  //    would overwrite each other's prices. We log and continue; last write
  //    wins. Admin should split unit_types per cabin when this happens.
  const typeBuckets = new Map<string, string[]>();
  for (const r of resolved) {
    const arr = typeBuckets.get(r.unit_type_id) || [];
    arr.push(r.pl_name);
    typeBuckets.set(r.unit_type_id, arr);
  }
  for (const [utId, names] of typeBuckets.entries()) {
    if (names.length > 1) {
      result.conflicts.push({ unit_type_id: utId, listing_names: names });
    }
  }

  // 3. Fetch prices.
  const today = new Date();
  const end = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  result.dateFrom = isoDate(today);
  result.dateTo = isoDate(end);

  try {
    result.eurToCzk = await getEurCzkRate();
  } catch (e: any) {
    result.errors.push(`EUR/CZK rate fetch failed: ${e?.message}`);
    return result;
  }

  let priced;
  try {
    priced = await getListingPrices(
      resolved.map((r) => ({ id: r.pl_id, pms: 'hostex' })),
      result.dateFrom,
      result.dateTo,
    );
  } catch (e: any) {
    result.errors.push(`PriceLabs /listing_prices failed: ${e?.message}`);
    return result;
  }

  // 4. Upsert into price_calendar. weekend_price is left NULL — PriceLabs
  //    already varies the daily rate, so the legacy weekend-multiplier
  //    branch should never kick in for these unit_types.
  const upsert = db.prepare(`
    INSERT INTO price_calendar (id, unit_type_id, date, base_price, weekend_price, min_stay, max_stay, closed, cta, ctd)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, NULL, ?, NULL, ?, 0, 0)
    ON CONFLICT(unit_type_id, date) DO UPDATE SET
      base_price = excluded.base_price,
      weekend_price = NULL,
      min_stay = excluded.min_stay,
      closed = excluded.closed,
      updated_at = datetime('now')
  `);

  const writeTx = db.transaction(() => {
    for (const entry of priced) {
      const item = resolved.find((r) => r.pl_id === entry.id);
      if (!item) continue;
      let daysWritten = 0;
      for (const d of entry.data || []) {
        if (!d.date || typeof d.price !== 'number' || d.price <= 0) continue;
        const baseCzk = Math.round(d.price * result.eurToCzk);
        const minStay = d.min_stay > 0 ? d.min_stay : 1;
        const closed = d.unbookable === 1 ? 1 : 0;
        upsert.run(item.unit_type_id, d.date, baseCzk, minStay, closed);
        daysWritten += 1;
      }
      result.perListing.push({
        pl_id: item.pl_id,
        listing_name: item.pl_name,
        unit_id: item.unit_id,
        unit_type_id: item.unit_type_id,
        unit_name: item.unit_name,
        days_written: daysWritten,
      });
      result.daysWrittenTotal += daysWritten;
    }
  });
  writeTx();

  result.listingsResolved = resolved.length;
  result.ok = result.errors.length === 0;
  return result;
}
