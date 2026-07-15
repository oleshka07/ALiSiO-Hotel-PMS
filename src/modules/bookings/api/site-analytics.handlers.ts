/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getFirstDayOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
}

function calculateDelta(current: number, prev: number): number {
  if (prev <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 100 * 10) / 10;
}

function getSitePropertyId(db: any, siteId: string): string | null {
  if (siteId === 'all') return null;
  const row = db.prepare('SELECT property_id FROM booking_sites WHERE id = ?').get(siteId) as any;
  return row ? row.property_id : null;
}

function getSourceFilter(siteId: string, propertyId: string | null, alias = '') {
  if (siteId === 'all') return '1=1'; 
  const propFilter = propertyId ? `${alias}property_id = ? AND ` : '';
  return `${propFilter}${alias}source IN (?, ?)`;
}

function getSourceParams(siteId: string, propertyId: string | null) {
  if (siteId === 'all') return [];
  return propertyId ? [propertyId, `widget:${siteId}`, 'widget'] : [`widget:${siteId}`, 'widget'];
}


function getReservationsStats(db: any, siteId: string, propertyId: string | null, from: string, to: string, dateType: string) {
  let sql = `
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END), 0) as revenue,
      COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END), 0) as unpaid_revenue,
      COALESCE(AVG(CASE WHEN payment_status = 'paid' THEN total_price ELSE NULL END), 0) as avg_check
    FROM reservations
    WHERE ${getSourceFilter(siteId, propertyId)} AND status != 'cancelled'
  `;
  const params: any[] = getSourceParams(siteId, propertyId);
  if (dateType === 'check_in') {
    sql += ' AND check_in >= ? AND check_in <= ?';
    params.push(from, to);
  } else {
    sql += ' AND created_at >= ? AND created_at <= ?';
    params.push(`${from} 00:00:00`, `${to} 23:59:59`);
  }
  return db.prepare(sql).get(...params) as { count: number; revenue: number; unpaid_revenue: number; avg_check: number };
}

function getSessionsCount(db: any, siteId: string, from: string, to: string) {
  if (siteId === 'all') {
    const sql = `SELECT COUNT(DISTINCT session_id) as count FROM widget_events WHERE created_at >= ? AND created_at <= ?`;
    const row = db.prepare(sql).get(`T00:00:00Z`, `T23:59:59Z`) as { count: number };
    return row ? row.count : 0;
  }
  const sql = `SELECT COUNT(DISTINCT session_id) as count FROM widget_events WHERE site_id = ? AND created_at >= ? AND created_at <= ?`;
  const row = db.prepare(sql).get(siteId, `T00:00:00Z`, `T23:59:59Z`) as { count: number };
  return row ? row.count : 0;
}

export async function getAnalyticsOverview(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: siteId } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId = getSitePropertyId(db, siteId);

    const dateFrom = searchParams.get('date_from') || getFirstDayOfMonth();
    const dateTo = searchParams.get('date_to') || getToday();
    const dateType = searchParams.get('date_type') || 'created_at';

    // Current period stats
    const currentStats = getReservationsStats(db, siteId, propertyId, dateFrom, dateTo, dateType);
    const currentSessions = getSessionsCount(db, siteId, dateFrom, dateTo);
    const currentConversion = currentSessions > 0 ? (currentStats.count / currentSessions) * 100 : 0;

    // Previous period dates
    const dFrom = new Date(dateFrom);
    const dTo = new Date(dateTo);
    const diffTime = Math.abs(dTo.getTime() - dFrom.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const prevFromDate = new Date(dFrom);
    prevFromDate.setDate(prevFromDate.getDate() - diffDays);
    const prevToDate = new Date(dTo);
    prevToDate.setDate(prevToDate.getDate() - diffDays);

    const prevFrom = prevFromDate.toISOString().split('T')[0];
    const prevTo = prevToDate.toISOString().split('T')[0];

    // Previous period stats
    const prevStats = getReservationsStats(db, siteId, propertyId, prevFrom, prevTo, dateType);
    const prevSessions = getSessionsCount(db, siteId, prevFrom, prevTo);
    const prevConversion = prevSessions > 0 ? (prevStats.count / prevSessions) * 100 : 0;

    return NextResponse.json({
      current: {
        revenue: Math.round(currentStats.revenue),
        unpaidRevenue: Math.round(currentStats.unpaid_revenue),
        bookings: currentStats.count,
        avgCheck: Math.round(currentStats.avg_check),
        sessions: currentSessions,
        conversion: Math.round(currentConversion * 100) / 100,
      },
      previous: {
        revenue: Math.round(prevStats.revenue),
        unpaidRevenue: Math.round(prevStats.unpaid_revenue),
        bookings: prevStats.count,
        avgCheck: Math.round(prevStats.avg_check),
        sessions: prevSessions,
        conversion: Math.round(prevConversion * 100) / 100,
      },
      deltas: {
        revenue: calculateDelta(currentStats.revenue, prevStats.revenue),
        bookings: calculateDelta(currentStats.count, prevStats.count),
        avgCheck: calculateDelta(currentStats.avg_check, prevStats.avg_check),
        sessions: calculateDelta(currentSessions, prevSessions),
        conversion: calculateDelta(currentConversion, prevConversion),
      },
    });
  } catch (error: any) {
    console.error('Error fetching site overview:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch site overview' }, { status: 500 });
  }
}

export async function getAnalyticsTraffic(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: siteId } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId = getSitePropertyId(db, siteId);

    const dateFrom = searchParams.get('date_from') || getFirstDayOfMonth();
    const dateTo = searchParams.get('date_to') || getToday();
    const dateType = searchParams.get('date_type') || 'created_at';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const fromTime = `${dateFrom}T00:00:00Z`;
    const toTime = `${dateTo}T23:59:59Z`;
    const source = `widget:${siteId}`;

    // Query 1: sessions by utm_source
    const sessionsRows = siteId === 'all'
      ? db.prepare(`
          SELECT utm_source, COUNT(DISTINCT session_id) as sessions
          FROM widget_events
          WHERE created_at >= ? AND created_at <= ? AND utm_source IS NOT NULL
          GROUP BY utm_source
        `).all(fromTime, toTime) as any[]
      : db.prepare(`
          SELECT utm_source, COUNT(DISTINCT session_id) as sessions
          FROM widget_events
          WHERE site_id = ? AND created_at >= ? AND created_at <= ? AND utm_source IS NOT NULL
          GROUP BY utm_source
        `).all(siteId, fromTime, toTime) as any[];

    // Query 2: bookings by utm_source
    let bookingsSql = `
      SELECT 
        utm_source, 
        COUNT(*) as bookings, 
        SUM(CASE WHEN payment_status = 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END) as revenue,
        SUM(CASE WHEN payment_status != 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END) as unpaid_revenue
      FROM reservations
      WHERE ${getSourceFilter(siteId, propertyId)} AND status != 'cancelled' AND utm_source IS NOT NULL
    `;
    const bookingsParams: any[] = getSourceParams(siteId, propertyId);
    if (dateType === 'check_in') {
      bookingsSql += ' AND check_in >= ? AND check_in <= ?';
      bookingsParams.push(dateFrom, dateTo);
    } else {
      bookingsSql += ' AND created_at >= ? AND created_at <= ?';
      bookingsParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }
    bookingsSql += ' GROUP BY utm_source';

    const bookingsRows = db.prepare(bookingsSql).all(...bookingsParams) as any[];

    // Merge logic
    const utmStatsMap = new Map<string, { utm_source: string; sessions: number; bookings: number; revenue: number; unpaid_revenue: number }>();

    for (const r of sessionsRows) {
      utmStatsMap.set(r.utm_source, {
        utm_source: r.utm_source,
        sessions: r.sessions,
        bookings: 0,
        revenue: 0, unpaid_revenue: 0,
      });
    }

    for (const r of bookingsRows) {
      const existing = utmStatsMap.get(r.utm_source);
      if (existing) {
        existing.bookings = r.bookings;
        existing.revenue = r.revenue;
        existing.unpaid_revenue = r.unpaid_revenue;
      } else {
        utmStatsMap.set(r.utm_source, {
          utm_source: r.utm_source,
          sessions: 0,
          bookings: r.bookings,
          revenue: r.revenue, unpaid_revenue: r.unpaid_revenue,
        });
      }
    }

    const allSources = Array.from(utmStatsMap.values()).map(item => ({
      ...item,
      revenue: Math.round(item.revenue), unpaid_revenue: Math.round(item.unpaid_revenue || 0),
      conversion: item.sessions > 0 ? Math.round((item.bookings / item.sessions) * 100 * 100) / 100 : 0
    }));

    // Sort: bookings desc, sessions desc, revenue desc
    allSources.sort((a, b) => b.bookings - a.bookings || b.sessions - a.sessions || b.revenue - a.revenue);

    const offset = (page - 1) * limit;
    const paginated = allSources.slice(offset, offset + limit);

    return NextResponse.json({
      data: paginated,
      pagination: {
        total: allSources.length,
        page,
        limit,
        totalPages: Math.ceil(allSources.length / limit)
      }
    });
  } catch (error: any) {
    console.error('Error fetching traffic analytics:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch traffic analytics' }, { status: 500 });
  }
}

export async function getAnalyticsGeo(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: siteId } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId = getSitePropertyId(db, siteId);

    const dateFrom = searchParams.get('date_from') || getFirstDayOfMonth();
    const dateTo = searchParams.get('date_to') || getToday();
    const dateType = searchParams.get('date_type') || 'created_at';

    const fromTime = `${dateFrom}T00:00:00Z`;
    const toTime = `${dateTo}T23:59:59Z`;
    const source = `widget:${siteId}`;

    // 1. Language analytics
    const langSessions = siteId === 'all'
      ? db.prepare(`
          SELECT lang, COUNT(DISTINCT session_id) as sessions
          FROM widget_events
          WHERE created_at >= ? AND created_at <= ? AND lang IS NOT NULL
          GROUP BY lang
        `).all(fromTime, toTime) as any[]
      : db.prepare(`
          SELECT lang, COUNT(DISTINCT session_id) as sessions
          FROM widget_events
          WHERE site_id = ? AND created_at >= ? AND created_at <= ? AND lang IS NOT NULL
          GROUP BY lang
        `).all(siteId, fromTime, toTime) as any[];

    let langBookingsSql = `
      SELECT 
        booking_lang as lang, 
        COUNT(*) as bookings, 
        SUM(CASE WHEN payment_status = 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END) as revenue,
        SUM(CASE WHEN payment_status != 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END) as unpaid_revenue
      FROM reservations
      WHERE ${getSourceFilter(siteId, propertyId)} AND status != 'cancelled' AND booking_lang IS NOT NULL
    `;
    const langParams = [source, 'widget'];
    if (dateType === 'check_in') {
      langBookingsSql += ' AND check_in >= ? AND check_in <= ?';
      langParams.push(dateFrom, dateTo);
    } else {
      langBookingsSql += ' AND created_at >= ? AND created_at <= ?';
      langParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }
    langBookingsSql += ' GROUP BY booking_lang';

    const langBookings = db.prepare(langBookingsSql).all(...langParams) as any[];

    // Merge languages
    const langMap = new Map<string, { lang: string; sessions: number; bookings: number; revenue: number; unpaid_revenue: number }>();
    for (const r of langSessions) {
      langMap.set(r.lang, { lang: r.lang, sessions: r.sessions, bookings: 0, revenue: 0, unpaid_revenue: 0 });
    }
    for (const r of langBookings) {
      const existing = langMap.get(r.lang);
      if (existing) {
        existing.bookings = r.bookings;
        existing.revenue = r.revenue;
        existing.unpaid_revenue = r.unpaid_revenue;
      } else {
        langMap.set(r.lang, { lang: r.lang, sessions: 0, bookings: r.bookings, revenue: r.revenue, unpaid_revenue: r.unpaid_revenue });
      }
    }
    const languages = Array.from(langMap.values()).map(item => ({
      ...item,
      revenue: Math.round(item.revenue), unpaid_revenue: Math.round(item.unpaid_revenue || 0),
      conversion: item.sessions > 0 ? Math.round((item.bookings / item.sessions) * 100 * 100) / 100 : 0
    }));
    languages.sort((a, b) => b.bookings - a.bookings || b.sessions - a.sessions);

    // 2. Country analytics
    const countrySessions = siteId === 'all'
      ? db.prepare(`
          SELECT country as country_code, COUNT(DISTINCT session_id) as sessions
          FROM widget_events
          WHERE created_at >= ? AND created_at <= ? AND country IS NOT NULL
          GROUP BY country
        `).all(fromTime, toTime) as any[]
      : db.prepare(`
          SELECT country as country_code, COUNT(DISTINCT session_id) as sessions
          FROM widget_events
          WHERE site_id = ? AND created_at >= ? AND created_at <= ? AND country IS NOT NULL
          GROUP BY country
        `).all(siteId, fromTime, toTime) as any[];

    let countrySql = `
      SELECT 
        country_code, 
        COUNT(*) as bookings, 
        SUM(CASE WHEN payment_status = 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END) as revenue,
        SUM(CASE WHEN payment_status != 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END) as unpaid_revenue
      FROM reservations
      WHERE ${getSourceFilter(siteId, propertyId)} AND status != 'cancelled' AND country_code IS NOT NULL
    `;
    const countryParams = [source, 'widget'];
    if (dateType === 'check_in') {
      countrySql += ' AND check_in >= ? AND check_in <= ?';
      countryParams.push(dateFrom, dateTo);
    } else {
      countrySql += ' AND created_at >= ? AND created_at <= ?';
      countryParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }
    countrySql += ' GROUP BY country_code';

    const countryBookings = db.prepare(countrySql).all(...countryParams) as any[];

    // Merge countries
    const countryMap = new Map<string, { country_code: string; sessions: number; bookings: number; revenue: number; unpaid_revenue: number }>();
    for (const r of countrySessions) {
      countryMap.set(r.country_code, { country_code: r.country_code, sessions: r.sessions, bookings: 0, revenue: 0, unpaid_revenue: 0 });
    }
    for (const r of countryBookings) {
      const existing = countryMap.get(r.country_code);
      if (existing) {
        existing.bookings = r.bookings;
        existing.revenue = r.revenue;
        existing.unpaid_revenue = r.unpaid_revenue;
      } else {
        countryMap.set(r.country_code, { country_code: r.country_code, sessions: 0, bookings: r.bookings, revenue: r.revenue, unpaid_revenue: r.unpaid_revenue });
      }
    }
    const formattedCountries = Array.from(countryMap.values()).map(c => ({
      ...c,
      revenue: Math.round(c.revenue),
      conversion: c.sessions > 0 ? Math.round((c.bookings / c.sessions) * 100 * 100) / 100 : 0
    }));
    formattedCountries.sort((a, b) => b.bookings - a.bookings || b.sessions - a.sessions);

    return NextResponse.json({ languages, countries: formattedCountries });
  } catch (error: any) {
    console.error('Error fetching site geo analytics:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch geo analytics' }, { status: 500 });
  }
}

export async function getAnalyticsListings(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: siteId } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId = getSitePropertyId(db, siteId);

    const dateFrom = searchParams.get('date_from') || getFirstDayOfMonth();
    const dateTo = searchParams.get('date_to') || getToday();
    const dateType = searchParams.get('date_type') || 'created_at';

    const fromTime = `${dateFrom}T00:00:00Z`;
    const toTime = `${dateTo}T23:59:59Z`;
    const source = `widget:${siteId}`;

    // 1. Unit Type breakdowns
    let utSql = `
      SELECT 
        ut.name as unit_type_name,
        ut.code as unit_type_code,
        COUNT(r.id) as bookings,
        SUM(CASE WHEN r.payment_status = 'paid' THEN (r.total_price - COALESCE(r.commission_amount, 0)) ELSE 0 END) as revenue,
        SUM(CASE WHEN r.payment_status != 'paid' THEN (r.total_price - COALESCE(r.commission_amount, 0)) ELSE 0 END) as unpaid_revenue
      FROM reservations r
      JOIN units u ON r.unit_id = u.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      WHERE ${getSourceFilter(siteId, propertyId, 'r.')} AND r.status != 'cancelled'
    `;
    const utParams: any[] = getSourceParams(siteId, propertyId);
    if (dateType === 'check_in') {
      utSql += ' AND r.check_in >= ? AND r.check_in <= ?';
      utParams.push(dateFrom, dateTo);
    } else {
      utSql += ' AND r.created_at >= ? AND r.created_at <= ?';
      utParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }
    utSql += ' GROUP BY ut.id ORDER BY bookings DESC';

    const unitTypes = db.prepare(utSql).all(...utParams) as any[];

    // 2. Category breakdowns
    let catSql = `
      SELECT 
        c.name as category_name,
        c.type as category_type,
        COUNT(r.id) as bookings,
        SUM(CASE WHEN r.payment_status = 'paid' THEN (r.total_price - COALESCE(r.commission_amount, 0)) ELSE 0 END) as revenue,
        SUM(CASE WHEN r.payment_status != 'paid' THEN (r.total_price - COALESCE(r.commission_amount, 0)) ELSE 0 END) as unpaid_revenue
      FROM reservations r
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      WHERE ${getSourceFilter(siteId, propertyId, 'r.')} AND r.status != 'cancelled'
    `;
    const catParams: any[] = getSourceParams(siteId, propertyId);
    if (dateType === 'check_in') {
      catSql += ' AND r.check_in >= ? AND r.check_in <= ?';
      catParams.push(dateFrom, dateTo);
    } else {
      catSql += ' AND r.created_at >= ? AND r.created_at <= ?';
      catParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }
    catSql += ' GROUP BY c.id ORDER BY bookings DESC';

    const categories = db.prepare(catSql).all(...catParams) as any[];

    return NextResponse.json({
      unitTypes: unitTypes.map(ut => ({ ...ut, revenue: Math.round(ut.revenue), unpaid_revenue: Math.round(ut.unpaid_revenue || 0) })),
      categories: categories.map(cat => ({ ...cat, revenue: Math.round(cat.revenue), unpaid_revenue: Math.round(cat.unpaid_revenue || 0) }))
    });
  } catch (error: any) {
    console.error('Error fetching site listings analytics:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch listings analytics' }, { status: 500 });
  }
}

export async function getAnalyticsCampaigns(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: siteId } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId = getSitePropertyId(db, siteId);

    const dateFrom = searchParams.get('date_from') || getFirstDayOfMonth();
    const dateTo = searchParams.get('date_to') || getToday();
    const dateType = searchParams.get('date_type') || 'created_at';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const fromTime = `${dateFrom}T00:00:00Z`;
    const toTime = `${dateTo}T23:59:59Z`;
    const source = `widget:${siteId}`;

    // 1. Sessions by Campaign keys
    const campaignsSessions = siteId === 'all'
      ? db.prepare(`
          SELECT 
            COALESCE(utm_source, '(direct)') as utm_source, 
            COALESCE(utm_medium, '(none)') as utm_medium, 
            COALESCE(utm_campaign, '(organic)') as utm_campaign, 
            COUNT(DISTINCT session_id) as sessions
          FROM widget_events
          WHERE created_at >= ? AND created_at <= ?
          GROUP BY utm_source, utm_medium, utm_campaign
        `).all(fromTime, toTime) as any[]
      : db.prepare(`
          SELECT 
            COALESCE(utm_source, '(direct)') as utm_source, 
            COALESCE(utm_medium, '(none)') as utm_medium, 
            COALESCE(utm_campaign, '(organic)') as utm_campaign, 
            COUNT(DISTINCT session_id) as sessions
          FROM widget_events
          WHERE site_id = ? AND created_at >= ? AND created_at <= ?
          GROUP BY utm_source, utm_medium, utm_campaign
        `).all(siteId, fromTime, toTime) as any[];

    // 2. Bookings by Campaign keys
    let bookingsSql = `
      SELECT 
        COALESCE(utm_source, '(direct)') as utm_source, 
        COALESCE(utm_medium, '(none)') as utm_medium, 
        COALESCE(utm_campaign, '(organic)') as utm_campaign,
        COUNT(*) as bookings, 
        SUM(CASE WHEN payment_status = 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END) as revenue,
        SUM(CASE WHEN payment_status != 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END) as unpaid_revenue
      FROM reservations
      WHERE ${getSourceFilter(siteId, propertyId)} AND status != 'cancelled'
    `;
    const bookingsParams: any[] = getSourceParams(siteId, propertyId);
    if (dateType === 'check_in') {
      bookingsSql += ' AND check_in >= ? AND check_in <= ?';
      bookingsParams.push(dateFrom, dateTo);
    } else {
      bookingsSql += ' AND created_at >= ? AND created_at <= ?';
      bookingsParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }
    bookingsSql += ' GROUP BY utm_source, utm_medium, utm_campaign';

    const campaignsBookings = db.prepare(bookingsSql).all(...bookingsParams) as any[];

    // Merge campaigns
    const campaignMap = new Map<string, { utm_source: string; utm_medium: string; utm_campaign: string; sessions: number; bookings: number; revenue: number; unpaid_revenue: number }>();

    for (const r of campaignsSessions) {
      const key = `${r.utm_source}|||${r.utm_medium}|||${r.utm_campaign}`;
      campaignMap.set(key, {
        utm_source: r.utm_source,
        utm_medium: r.utm_medium,
        utm_campaign: r.utm_campaign,
        sessions: r.sessions,
        bookings: 0,
        revenue: 0, unpaid_revenue: 0 });
    }

    for (const r of campaignsBookings) {
      const key = `${r.utm_source}|||${r.utm_medium}|||${r.utm_campaign}`;
      const existing = campaignMap.get(key);
      if (existing) {
        existing.bookings = r.bookings;
        existing.revenue = r.revenue;
        existing.unpaid_revenue = r.unpaid_revenue;
      } else {
        campaignMap.set(key, {
          utm_source: r.utm_source,
          utm_medium: r.utm_medium,
          utm_campaign: r.utm_campaign,
          sessions: 0,
          bookings: r.bookings,
          revenue: r.revenue, unpaid_revenue: r.unpaid_revenue });
      }
    }

    const campaigns = Array.from(campaignMap.values()).map(item => ({
      ...item,
      revenue: Math.round(item.revenue), unpaid_revenue: Math.round(item.unpaid_revenue || 0),
      conversion: item.sessions > 0 ? Math.round((item.bookings / item.sessions) * 100 * 100) / 100 : 0
    }));

    campaigns.sort((a, b) => b.bookings - a.bookings || b.sessions - a.sessions || b.revenue - a.revenue);

    const offset = (page - 1) * limit;
    const paginated = campaigns.slice(offset, offset + limit);

    return NextResponse.json({
      data: paginated,
      pagination: {
        total: campaigns.length,
        page,
        limit,
        totalPages: Math.ceil(campaigns.length / limit)
      }
    });
  } catch (error: any) {
    console.error('Error fetching campaigns analytics:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch campaigns analytics' }, { status: 500 });
  }
}

export async function getAnalyticsFunnel(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: siteId } = await params;
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const propertyId = getSitePropertyId(db, siteId);

    const dateFrom = searchParams.get('date_from') || getFirstDayOfMonth();
    const dateTo = searchParams.get('date_to') || getToday();
    const dateType = searchParams.get('date_type') || 'created_at';
    const pageFilter = searchParams.get('pageFilter') || 'all';

    const fromTime = `${dateFrom}T00:00:00Z`;
    const toTime = `${dateTo}T23:59:59Z`;

    // Helpers to query events
    const getEventSessions = (eventType: string) => {
      let sql = `
        SELECT COUNT(DISTINCT session_id) as count 
        FROM widget_events 
        WHERE ${siteId === 'all' ? '1=1 AND ' : 'site_id = ? AND '}event_type = ? AND created_at >= ? AND created_at <= ?
      `;
      const p: any[] = siteId === 'all' ? [eventType, fromTime, toTime] : [siteId, eventType, fromTime, toTime];
      if (eventType === 'page_view' && pageFilter && pageFilter !== 'all') {
        sql += ' AND page = ?';
        p.push(pageFilter);
      }
      const row = db.prepare(sql).get(...p) as { count: number };
      return row ? row.count : 0;
    };

    // 1-7. Widget event steps
    const siteViews = getEventSessions('page_view');
    const bookClicks = getEventSessions('widget_opened');
    const step1 = getEventSessions('widget_step_1');
    const step2 = getEventSessions('widget_step_2');
    const step3 = getEventSessions('widget_step_3');
    const step4 = getEventSessions('widget_step_4');
    const step5 = getEventSessions('widget_step_5');

    // Removed old step 8 (crmLeads) as it is now in the Contact Funnel
    // 9-11. Reservations counts
    const getReservationsFunnelCount = (statusFilter?: string, paidFilter?: boolean) => {
      const source = `widget:${siteId}`;
      let sql = `
        SELECT COUNT(*) as count 
        FROM reservations 
        WHERE ${getSourceFilter(siteId, propertyId)} AND status != 'cancelled'
      `;
      const p = [source, 'widget'];
      
      if (statusFilter) {
        if (statusFilter === 'checked_in') {
          sql += " AND status IN ('checked_in', 'checked_out')";
        } else {
          sql += ' AND status = ?';
          p.push(statusFilter);
        }
      }
      if (paidFilter) {
        sql += " AND payment_status = 'paid'";
      }
      
      if (dateType === 'check_in') {
        sql += ' AND check_in >= ? AND check_in <= ?';
        p.push(dateFrom, dateTo);
      } else {
        sql += ' AND created_at >= ? AND created_at <= ?';
        p.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
      }
      
      const row = db.prepare(sql).get(...p) as { count: number };
      return row ? row.count : 0;
    };

    const bookingsCreated = getReservationsFunnelCount();
    const bookingsCheckedIn = getReservationsFunnelCount('checked_in');
    const bookingsPaid = getReservationsFunnelCount(undefined, true);

    const funnelWidgetRaw = [
      { step: 1, name: "Відвідування сайту", count: siteViews, key: "site_views" },
      { step: 2, name: "Розпочато бронювання", count: bookClicks, key: "book_clicks" },
      { step: 3, name: "Крок 1 (Вибір дат)", count: step1, key: "widget_step_1" },
      { step: 4, name: "Крок 2 (Вибір житла)", count: step2, key: "widget_step_2" },
      { step: 5, name: "Крок 3 (Послуги)", count: step3, key: "widget_step_3" },
      { step: 6, name: "Крок 4 (Дані гостя)", count: step4, key: "widget_step_4" },
      { step: 7, name: "Крок 5 (Оплата/Підтвердження)", count: step5, key: "widget_step_5" },
      { step: 8, name: "Створено бронювань", count: bookingsCreated, key: "bookings_created" },
      { step: 9, name: "Успішних заселень", count: bookingsCheckedIn, key: "bookings_checked_in" },
      { step: 10, name: "Оплачено повністю", count: bookingsPaid, key: "bookings_paid" }
    ];

    const funnelWidget = funnelWidgetRaw.map((item, idx) => {
      const fromFirst = funnelWidgetRaw[0].count > 0 ? (item.count / funnelWidgetRaw[0].count) * 100 : 0;
      const fromPrev = idx > 0 && funnelWidgetRaw[idx - 1].count > 0 ? (item.count / funnelWidgetRaw[idx - 1].count) * 100 : 100;
      return {
        ...item,
        conversionFromFirst: Math.round(fromFirst * 10) / 10,
        conversionFromPrevious: Math.round(fromPrev * 10) / 10
      };
    });

    // Funnel 2: Contact Leads
    const leadsSql = `
      SELECT id, email, phone, status 
      FROM site_incoming_leads 
      WHERE site_id = ? AND created_at >= ? AND created_at <= ?
    `;
    const submittedLeads = db.prepare(leadsSql).all(siteId, `${dateFrom} 00:00:00`, `${dateTo} 23:59:59`) as any[];
    const leadsSubmitted = submittedLeads.length;

    let leadsProcessed = 0;
    let leadsBooked = 0;
    let leadsPaid = 0;
    let leadsCheckedIn = 0;

    if (submittedLeads.length > 0) {
      const emails = submittedLeads.map(l => l.email).filter(Boolean);
      const phones = submittedLeads.map(l => l.phone).filter(Boolean);
      
      const emailList = emails.map(e => `'${e.replace(/'/g, "''")}'`).join(',');
      const phoneList = phones.map(p => `'${p.replace(/'/g, "''")}'`).join(',');

      let processedCount = submittedLeads.filter(l => l.status !== 'new').length;
      let crmProcessedCount = 0;

      if (emailList || phoneList) {
        const crmConds = [];
        if (emailList) crmConds.push(`cl.email IN (${emailList})`);
        if (phoneList) crmConds.push(`cl.phone IN (${phoneList})`);
        const crmCond = crmConds.join(' OR ');

        // Outbound messages check
        const crmProcessedSql = `
          SELECT COUNT(DISTINCT cl.id) as count
          FROM crm_leads cl
          JOIN crm_conversations cc ON cc.lead_id = cl.id
          JOIN crm_messages cm ON cm.conversation_id = cc.id
          WHERE (${crmCond}) AND cm.direction = 'outbound'
        `;
        crmProcessedCount = (db.prepare(crmProcessedSql).get() as any).count;
      }
      
      leadsProcessed = Math.max(processedCount, crmProcessedCount);

      if (emailList || phoneList) {
        const guestConds = [];
        if (emailList) guestConds.push(`g.email IN (${emailList})`);
        if (phoneList) guestConds.push(`g.phone IN (${phoneList})`);
        const guestCond = guestConds.join(' OR ');

        // We count reservations created AFTER the start of the period
        const resSql = `
          SELECT DISTINCT r.id, r.status, r.payment_status 
          FROM reservations r
          JOIN guests g ON r.guest_id = g.id
          WHERE (${guestCond}) AND r.created_at >= ? AND r.status != 'cancelled'
        `;
        const linkedReservations = db.prepare(resSql).all(`${dateFrom} 00:00:00`) as any[];
        
        leadsBooked = linkedReservations.length;
        leadsCheckedIn = linkedReservations.filter(r => r.status === 'checked_in' || r.status === 'checked_out').length;
        leadsPaid = linkedReservations.filter(r => r.payment_status === 'paid').length;
      }
    }

    const funnelContactRaw = [
      { step: 1, name: "Надіслано форму", count: leadsSubmitted, key: "leads_submitted" },
      { step: 2, name: "Опрацьовано (відповідь)", count: leadsProcessed, key: "leads_processed" },
      { step: 3, name: "Заброньовано", count: leadsBooked, key: "leads_booked" },
      { step: 4, name: "Оплачено повністю", count: leadsPaid, key: "leads_paid" },
      { step: 5, name: "Успішних заселень", count: leadsCheckedIn, key: "leads_checked_in" }
    ];

    const funnelContact = funnelContactRaw.map((item, idx) => {
      const fromFirst = funnelContactRaw[0].count > 0 ? (item.count / funnelContactRaw[0].count) * 100 : 0;
      const fromPrev = idx > 0 && funnelContactRaw[idx - 1].count > 0 ? (item.count / funnelContactRaw[idx - 1].count) * 100 : 100;
      return {
        ...item,
        conversionFromFirst: Math.round(fromFirst * 10) / 10,
        conversionFromPrevious: Math.round(fromPrev * 10) / 10
      };
    });

    return NextResponse.json({ funnelWidget, funnelContact });
  } catch (error: any) {
    console.error('Error fetching site funnel analytics:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch funnel analytics' }, { status: 500 });
  }
}





