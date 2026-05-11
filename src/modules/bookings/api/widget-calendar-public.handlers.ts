/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function getWidgetCalendarOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function getWidgetCalendar(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId  = searchParams.get('propertyId');
    const unitId      = searchParams.get('unitId');
    const siteSlug    = searchParams.get('siteSlug');
    const siteId      = searchParams.get('siteId');
    const monthParam  = searchParams.get('month');
    const ratePlanId  = searchParams.get('ratePlanId') || searchParams.get('ratePlan');

    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
        .map(t => t.name)
    );
    const hasAvailBlocks   = existingTables.has('availability_blocks');
    const hasSiteListings  = existingTables.has('site_listings');
    const hasPriceCalendar = existingTables.has('price_calendar');
    const hasBookingSites  = existingTables.has('booking_sites');

    // ── 1. Resolve site unit IDs (booking-site-aware) ──────────────────────
    // When siteSlug/siteId is given, we restrict to units listed for that site.
    let siteUnitIds: string[] | null = null;
    let siteIdObj: string | null = null;

    if ((siteSlug || siteId) && hasBookingSites && hasSiteListings) {
      let site: any;
      if (siteSlug) {
        site = db.prepare("SELECT id FROM booking_sites WHERE (slug = ? OR id = ?) AND status != 'deleted'").get(siteSlug, siteSlug);
      } else {
        site = db.prepare("SELECT id FROM booking_sites WHERE id = ? AND status != 'deleted'").get(siteId);
      }
      if (site) {
        siteIdObj = site.id;
        const listings = db.prepare('SELECT unit_id FROM site_listings WHERE site_id = ?').all(site.id) as any[];
        siteUnitIds = listings.map((l: any) => l.unit_id);
      }
    }

    let activeRatePlan: any = null;
    if (siteIdObj) {
      if (ratePlanId) {
        activeRatePlan = db.prepare('SELECT * FROM site_rate_plans WHERE id = ? AND site_id = ?').get(ratePlanId, siteIdObj);
      } else {
        activeRatePlan = db.prepare('SELECT * FROM site_rate_plans WHERE is_default = 1 AND site_id = ? LIMIT 1').get(siteIdObj);
      }
    }

    // ── 2. Resolve target unit ──────────────────────────────────────────────
    let targetUnitId: string | null = unitId;
    // Validate that requested unit belongs to the site
    if (targetUnitId && siteUnitIds && !siteUnitIds.includes(targetUnitId)) {
      targetUnitId = null;
    }

    // ── 3. Resolve property ─────────────────────────────────────────────────
    let property: any;

    if (targetUnitId) {
      const u = db.prepare('SELECT property_id FROM units WHERE id = ?').get(targetUnitId) as any;
      if (u) property = { id: u.property_id };
    }

    if (!property && siteUnitIds && siteUnitIds.length > 0) {
      const u = db.prepare('SELECT property_id FROM units WHERE id = ?').get(siteUnitIds[0]) as any;
      if (u) property = { id: u.property_id };
    }

    if (!property) {
      if (propertyId) {
        property = db.prepare('SELECT id FROM properties WHERE id = ? AND is_active = 1').get(propertyId);
      } else {
        property = db.prepare('SELECT id FROM properties WHERE is_active = 1 LIMIT 1').get();
      }
    }

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404, headers: CORS_HEADERS });
    }

    // ── 4. Date range ───────────────────────────────────────────────────────
    let year: number, month: number;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-');
      year  = parseInt(y, 10);
      month = parseInt(m, 10) - 1;
    } else {
      const now = new Date();
      year  = now.getFullYear();
      month = now.getMonth();
    }

    const daysInMonth    = new Date(year, month + 1, 0).getDate();
    const monthStart     = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd       = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const nextMonthStart = new Date(year, month + 1, 1).toISOString().split('T')[0];

    // ── 5. Total unit count ─────────────────────────────────────────────────
    let totalCount = 0;
    if (targetUnitId) {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM units WHERE id = ? AND is_active = 1').get(targetUnitId) as any;
      totalCount = row?.cnt || 0;
    } else if (siteUnitIds && siteUnitIds.length > 0) {
      const ph  = siteUnitIds.map(() => '?').join(',');
      const row = db.prepare(`SELECT COUNT(*) as cnt FROM units WHERE id IN (${ph}) AND is_active = 1`).get(...siteUnitIds) as any;
      totalCount = row?.cnt || 0;
    } else {
      // Fallback: all glamping units in property
      const row = db.prepare(`
        SELECT COUNT(*) as cnt FROM units u
        JOIN unit_types ut ON u.unit_type_id = ut.id
        JOIN categories c ON ut.category_id = c.id
        WHERE c.type = 'glamping' AND u.is_active = 1 AND u.room_status = 'available' AND ut.property_id = ?
      `).get(property.id) as any;
      totalCount = row?.cnt || 0;
    }

    // ── 6. Reservations ─────────────────────────────────────────────────────
    let reservations: any[];
    if (targetUnitId) {
      reservations = db.prepare(`
        SELECT r.unit_id, r.check_in, r.check_out FROM reservations r
        WHERE r.unit_id = ?
          AND r.status NOT IN ('cancelled', 'no_show')
          AND r.check_in < ? AND r.check_out > ?
      `).all(targetUnitId, nextMonthStart, monthStart) as any[];
    } else if (siteUnitIds && siteUnitIds.length > 0) {
      const ph = siteUnitIds.map(() => '?').join(',');
      reservations = db.prepare(`
        SELECT r.unit_id, r.check_in, r.check_out FROM reservations r
        WHERE r.unit_id IN (${ph})
          AND r.status NOT IN ('cancelled', 'no_show')
          AND r.check_in < ? AND r.check_out > ?
      `).all(...siteUnitIds, nextMonthStart, monthStart) as any[];
    } else {
      reservations = db.prepare(`
        SELECT r.unit_id, r.check_in, r.check_out FROM reservations r
        JOIN units u ON r.unit_id = u.id
        JOIN unit_types ut ON u.unit_type_id = ut.id
        JOIN categories c ON ut.category_id = c.id
        WHERE c.type = 'glamping' AND ut.property_id = ?
          AND r.status NOT IN ('cancelled', 'no_show')
          AND r.check_in < ? AND r.check_out > ?
      `).all(property.id, nextMonthStart, monthStart) as any[];
    }

    // ── 7. Availability blocks ──────────────────────────────────────────────
    let blocks: any[] = [];
    if (hasAvailBlocks) {
      if (targetUnitId) {
        blocks = db.prepare(`
          SELECT ab.unit_id, ab.date_from, ab.date_to FROM availability_blocks ab
          WHERE ab.unit_id = ? AND ab.date_from < ? AND ab.date_to > ?
        `).all(targetUnitId, nextMonthStart, monthStart) as any[];
      } else if (siteUnitIds && siteUnitIds.length > 0) {
        const ph = siteUnitIds.map(() => '?').join(',');
        blocks = db.prepare(`
          SELECT ab.unit_id, ab.date_from, ab.date_to FROM availability_blocks ab
          WHERE ab.unit_id IN (${ph}) AND ab.date_from < ? AND ab.date_to > ?
        `).all(...siteUnitIds, nextMonthStart, monthStart) as any[];
      } else {
        blocks = db.prepare(`
          SELECT ab.unit_id, ab.date_from, ab.date_to FROM availability_blocks ab
          JOIN units u ON ab.unit_id = u.id
          JOIN unit_types ut ON u.unit_type_id = ut.id
          JOIN categories c ON ut.category_id = c.id
          WHERE c.type = 'glamping' AND ut.property_id = ?
            AND ab.date_from < ? AND ab.date_to > ?
        `).all(property.id, nextMonthStart, monthStart) as any[];
      }
    }

    // ── 8. Price map (optional) ─────────────────────────────────────────────
    const unitTypes = db.prepare(`
      SELECT ut.id FROM unit_types ut
      JOIN categories c ON ut.category_id = c.id
      WHERE c.type = 'glamping' AND ut.is_active = 1 AND ut.property_id = ?
    `).all(property.id) as any[];

    const priceMap = new Map<string, any>();
    if (hasPriceCalendar && unitTypes.length > 0) {
      try {
        const ph = unitTypes.map(() => '?').join(',');
        const priceRows = db.prepare(`
          SELECT pc.date, MIN(pc.base_price) as min_price, MIN(pc.weekend_price) as min_weekend_price
          FROM price_calendar pc
          WHERE pc.unit_type_id IN (${ph}) AND pc.date >= ? AND pc.date <= ?
          GROUP BY pc.date
        `).all(...unitTypes.map((ut: any) => ut.id), monthStart, monthEnd) as any[];
        for (const p of priceRows) priceMap.set(p.date, p);
      } catch { /* price_calendar not available */ }
    }

    // ── 9. Build day array ──────────────────────────────────────────────────
    const STUB_PRICE = 2500;
    const days: { date: string; status: 'available' | 'booked' | 'partial'; price: number | null }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr   = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isWeekend = [0, 5, 6].includes(new Date(year, month, d).getDay());

      const bookedUnitIds = new Set<string>();
      for (const r of reservations) {
        if (dateStr >= r.check_in && dateStr < r.check_out) bookedUnitIds.add(r.unit_id);
      }
      for (const b of blocks) {
        if (dateStr >= b.date_from && dateStr < b.date_to) bookedUnitIds.add(b.unit_id);
      }

      const bookedCount    = bookedUnitIds.size;
      const availableCount = totalCount - bookedCount;

      let status: 'available' | 'booked' | 'partial' =
        availableCount <= 0 ? 'booked' :
        bookedCount > 0 ? 'partial' : 'available';

      const pe = priceMap.get(dateStr);
      let price: number | null = pe
        ? (isWeekend && pe.min_weekend_price != null ? pe.min_weekend_price : pe.min_price)
        : (unitTypes.length > 0 ? STUB_PRICE : null);

      if (activeRatePlan) {
        if (status !== 'booked') {
          if (activeRatePlan.valid_weekdays) {
            try {
              const allowedDays = JSON.parse(activeRatePlan.valid_weekdays);
              if (Array.isArray(allowedDays) && allowedDays.length > 0) {
                const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                if (!allowedDays.includes(dayMap[new Date(year, month, d).getDay()])) {
                  status = 'booked';
                }
              }
            } catch {}
          }
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          
          if (dateStr === todayStr && activeRatePlan.same_day_cutoff_hour != null) {
             if (today.getHours() >= activeRatePlan.same_day_cutoff_hour) status = 'booked';
          }
          
          if (activeRatePlan.min_days_before_checkin != null && activeRatePlan.min_days_before_checkin > 0) {
             today.setHours(0,0,0,0);
             const checkInDate = new Date(year, month, d);
             const diffDays = Math.round((checkInDate.getTime() - today.getTime()) / 86400000);
             if (diffDays < activeRatePlan.min_days_before_checkin) status = 'booked';
          }
        }
        
        if (price != null) {
          if (activeRatePlan.pricing_mode === 'dependent' && activeRatePlan.pricing_modifier_percent != null) {
            const pct = activeRatePlan.pricing_modifier_percent;
            const mType = activeRatePlan.pricing_modifier_type || 'less';
            price = mType === 'more' ? Math.round(price * (1 + pct / 100)) : Math.round(price * (1 - pct / 100));
          } else if (activeRatePlan.fixed_price != null) {
            price = activeRatePlan.fixed_price;
          }
        }
      }

      days.push({ date: dateStr, status, price });
    }

    return NextResponse.json({ year, month: month + 1, days }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('GET /api/widget/calendar error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500, headers: CORS_HEADERS });
  }
}
