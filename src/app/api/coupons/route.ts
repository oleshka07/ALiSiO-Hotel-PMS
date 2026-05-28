/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

/* ─── GET /api/coupons?site_id=xxx ─── */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const url = new URL(req.url);
    const siteId = url.searchParams.get('site_id');
    const ruleId = url.searchParams.get('rule_id');

    let sql = 'SELECT * FROM coupons WHERE 1=1';
    const params: (string | number)[] = [];

    if (siteId) { sql += ' AND site_id = ?'; params.push(siteId); }
    if (ruleId) { sql += ' AND gift_card_rule_id = ?'; params.push(ruleId); }

    sql += ' ORDER BY created_at DESC';
    const codes = db.prepare(sql).all(...params);

    return NextResponse.json(codes);
  } catch (e: any) {
    console.error('GET /api/coupons error:', e?.message || e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/* ─── POST /api/coupons ─── */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      code, discount_type, offer_amount,
      valid_from, valid_until,
      min_nights, max_nights,
      redemption_limit, site_id,
      allowed_days,
      description,
      applies_to,
      applied_listings,
      applicable_services,
    } = body;

    if (!code || offer_amount === undefined || offer_amount === '') {
      return NextResponse.json({ error: 'code and offer_amount are required' }, { status: 400 });
    }

    const db = getDb();

    const id = `promo_${Date.now()}`;
    db.prepare(`
      INSERT INTO coupons
        (id, code, description, discount_type, offer_amount,
         valid_from, valid_until,
         min_nights, max_nights,
         max_uses, redemption_limit,
         site_id, allowed_days, applies_to, applied_listings, applicable_services, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
    `).run(
      id,
      String(code).toUpperCase().trim(),
      description || null,
      discount_type || 'percentage',
      Number(offer_amount),
      valid_from || null,
      valid_until || null,
      min_nights ? Number(min_nights) : null,
      max_nights ? Number(max_nights) : null,
      redemption_limit ? Number(redemption_limit) : null,
      redemption_limit ? Number(redemption_limit) : null,
      site_id || null,
      allowed_days ? JSON.stringify(allowed_days) : null,
      applies_to || 'services',
      applied_listings ? JSON.stringify(applied_listings) : null,
      applicable_services ? JSON.stringify(applicable_services) : null,
    );

    const created = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id);
    return NextResponse.json({ code: created }, { status: 201 });
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Промокод з таким кодом вже існує' }, { status: 409 });
    }
    console.error('POST /api/coupons error:', e?.message || e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
