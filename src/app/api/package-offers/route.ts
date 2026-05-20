/**
 * GET  /api/package-offers?site_id=xxx  — список бандлів
 * POST /api/package-offers              — створити бандл
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const siteId = new URL(req.url).searchParams.get('site_id');
    if (!siteId) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

    const bundles = db.prepare(`
      SELECT b.*,
        COUNT(v.id) as issued_count,
        SUM(CASE WHEN v.status = 'activated' THEN 1 ELSE 0 END) as activated_count
      FROM gift_card_bundles b
      LEFT JOIN gift_cards v ON v.bundle_id = b.id
      WHERE b.site_id = ?
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `).all(siteId);

    return NextResponse.json({ bundles });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const body = await req.json();
    const {
      site_id, name, description, price, currency = 'CZK',
      nights_included = 0, listing_type,
      included_services = [], validity_months = 12,
      allowed_days, coupon_code, redemption_limit, applied_listings, allowed_promo_codes,
    } = body;

    if (!site_id || !name || price === undefined) {
      return NextResponse.json({ error: 'site_id, name, price required' }, { status: 400 });
    }

    const id = db.prepare(`
      INSERT INTO gift_card_bundles
        (site_id, name, description, price, currency, nights_included,
         listing_type, included_services, validity_months, allowed_days,
         coupon_code, redemption_limit, applied_listings, allowed_promo_codes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      RETURNING id
    `).get(
      site_id, name, description || null, Number(price), currency,
      Number(nights_included), listing_type || null,
      JSON.stringify(included_services), Number(validity_months),
      allowed_days ? JSON.stringify(allowed_days) : null,
      coupon_code ? String(coupon_code).trim().toUpperCase() : null,
      redemption_limit !== undefined ? Number(redemption_limit) : 1,
      applied_listings && applied_listings.length > 0 ? JSON.stringify(applied_listings) : null,
      allowed_promo_codes && allowed_promo_codes.length > 0 ? JSON.stringify(allowed_promo_codes) : null
    ) as { id: string };

    const bundle = db.prepare('SELECT * FROM gift_card_bundles WHERE id = ?').get(id.id);
    return NextResponse.json({ bundle }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
