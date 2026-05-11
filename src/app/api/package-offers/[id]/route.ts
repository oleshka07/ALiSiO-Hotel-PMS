/**
 * PATCH  /api/package-offers/[id]  — оновити бандл
 * DELETE /api/package-offers/[id]  — видалити бандл
 * POST   /api/package-offers/[id]/issue — видати ваучер-код для цього бандлу
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';
import { buildGiftCode, calcExpiresAt } from '@/lib/gift-card-builder';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const user = await getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    const db = getDb();
    const body = await req.json();
    const allowed = ['name','description','price','currency','nights_included','listing_type','included_services','validity_months','is_active', 'allowed_days', 'promo_code', 'redemption_limit'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const k of allowed) {
      if (k in body) {
        sets.push(`${k} = ?`);
        let val = body[k];
        if (k === 'included_services' || k === 'allowed_days') val = val ? JSON.stringify(val) : null;
        if (k === 'promo_code') val = val ? String(val).trim().toUpperCase() : null;
        vals.push(val);
      }
    }
    if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    sets.push(`updated_at = datetime('now')`);
    vals.push(id);
    db.prepare(`UPDATE voucher_bundles SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const user = await getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    const db = getDb();
    db.prepare(`UPDATE voucher_bundles SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const user = await getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    const db = getDb();

    const bundle = db.prepare('SELECT * FROM voucher_bundles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!bundle) return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const { recipient_name, recipient_email, buyer_name, buyer_phone, message, notes } = body;

    const site = db.prepare('SELECT property_id FROM booking_sites WHERE id = ?').get(bundle.site_id) as { property_id: string } | undefined;
    if (!site?.property_id) return NextResponse.json({ error: 'Property not found for site' }, { status: 400 });

    // Generate unique code
    let code = '';
    for (let i = 0; i < 5; i++) {
      const c = buildGiftCode();
      if (!db.prepare('SELECT id FROM vouchers WHERE code = ?').get(c)) { code = c; break; }
    }
    if (!code) return NextResponse.json({ error: 'Code generation failed' }, { status: 500 });

    const expires_at = calcExpiresAt(Number(bundle.validity_months) || 12);
    const configJson = JSON.stringify({
      included_services: JSON.parse(String(bundle.included_services || '[]')),
      allowed_days: bundle.allowed_days ? JSON.parse(String(bundle.allowed_days)) : null,
    });

    const row = db.prepare(`
      INSERT INTO vouchers
        (property_id, code, bundle_id, name, type, value_type,
         face_value, currency, status,
         recipient_name, recipient_email, buyer_name, buyer_phone,
         message, expires_at, config_json, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      RETURNING id
    `).get(
      site.property_id, code, id,
      bundle.name, 'package', 'fixed_czk',
      bundle.price, bundle.currency, 'active',
      recipient_name || null, recipient_email || null,
      buyer_name || null, buyer_phone || null,
      message || null, expires_at,
      configJson, notes || null,
    ) as { id: string };

    const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(row.id);
    return NextResponse.json({ giftCard: voucher }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
