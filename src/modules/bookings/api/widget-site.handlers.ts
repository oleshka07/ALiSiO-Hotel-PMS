/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function getWidgetSiteConfigOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function getWidgetSiteConfig(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let slug = searchParams.get('slug');
    
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400, headers: CORS_HEADERS });
    }
    
    if (slug === 'kv.kemp-carlsbad.cz') slug = 'kemp-carlsbad';

    const db = getDb();
    const site = db.prepare(`
      SELECT id, name, slug, design_config, widget_config, payment_config, currency, site_url
      FROM booking_sites
      WHERE slug = ? OR id = ?
    `).get(slug, slug) as any;

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404, headers: CORS_HEADERS });
    }


    const payCfg = JSON.parse(site.payment_config || '{}');
    const hasPayment = !!(payCfg.enabled && payCfg.provider === 'teya' && payCfg.teya?.client_id)
      || !!process.env.TEYA_CLIENT_ID;

    let maxAdults = 2;
    let maxChildren = 2;
    try {
      const maxCap = db.prepare(`
        SELECT MAX(ut.max_adults) as maxA, MAX(ut.max_children) as maxC
        FROM site_listings sl
        JOIN unit_types ut ON sl.unit_type_id = ut.id
        WHERE sl.site_id = ? AND sl.is_active = 1
      `).get(site.id) as any;
      if (maxCap && maxCap.maxA) maxAdults = maxCap.maxA;
      if (maxCap && maxCap.maxC) maxChildren = maxCap.maxC;
    } catch (e) {
      // ignore
    }

    return NextResponse.json({

      id: site.id,
      name: site.name,
      slug: site.slug,
      title: site.name,
      design: JSON.parse(site.design_config || '{}'),
      config: JSON.parse(site.widget_config || '{}'),
      currency: site.currency || 'CZK',
      siteUrl: site.site_url,
      hasPayment,
      maxAdults,
      maxChildren,
      // Analytics fields — read from widget_config JSON, no DB migration needed
      ...(() => {
        try {
          const cfg = JSON.parse(site.widget_config || '{}');
          return {
            fbPixelId: cfg.fb_pixel_id || null,
            ga4Id: cfg.ga4_id || null,
            tiktokPixelId: cfg.tiktok_pixel_id || null,
            returnUrl: cfg.return_url || cfg.thank_you_url || null,
          };
        } catch { return { fbPixelId: null, ga4Id: null, tiktokPixelId: null, returnUrl: null }; }
      })(),
    }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('GET /api/booking/site-config error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch site config' }, { status: 500, headers: CORS_HEADERS });
  }
}
