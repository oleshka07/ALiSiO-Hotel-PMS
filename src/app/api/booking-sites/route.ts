/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';
import { publicMessage } from '@core/security/public-error';

// GET /api/booking-sites — list all sites for property
export async function GET(_req: NextRequest) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(_req.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const sites = db.prepare(`
      SELECT
        bs.*,
        (SELECT COUNT(*) FROM site_listings sl WHERE sl.site_id = bs.id) as listings_count
      FROM booking_sites bs
      WHERE bs.status != 'deleted'
      ORDER BY bs.created_at DESC
    `).all() as any[];

    return NextResponse.json({ sites });
  } catch (error: any) {
    console.error('GET /api/booking-sites error:', error?.message);
    return NextResponse.json({ error: 'Failed to fetch sites' }, { status: 500 });
  }
}

// POST /api/booking-sites — create new site
export async function POST(request: NextRequest) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(request.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const body = await request.json();
    const { name, type = 'self-hosted', currency = 'CZK', property_id } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Назва сайту обовʼязкова' }, { status: 400 });
    }

    // Get property_id from first property if not provided
    let propId = property_id;
    if (!propId) {
      const prop = db.prepare('SELECT id FROM properties LIMIT 1').get() as any;
      if (!prop) {
        return NextResponse.json({ error: 'Спочатку створіть об’єкт (Property) у налаштуваннях' }, { status: 400 });
      }
      propId = prop.id;
    }

    const defaultDesignConfig = JSON.stringify({
      theme: 'Classical',
      primary_color: '#A2845E',
      button_style: 'rounded_filled',
      show_shadow: true,
      logo_url: null,
      favicon_url: null,
    });

    const defaultWidgetConfig = JSON.stringify({
      search_result_url: '/',
      enable_prefill: false,
    });

    let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `site-${Date.now()}`;
    
    // Ensure slug uniqueness
    const existing = db.prepare('SELECT id FROM booking_sites WHERE slug = ?').get(slug);
    if (existing) {
      slug = `${slug}-${Math.random().toString(36).substring(2, 5)}`;
    }

    const result = db.prepare(`
      INSERT INTO booking_sites (property_id, name, slug, type, currency, design_config, widget_config, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(propId, name.trim(), slug, type, currency, defaultDesignConfig, defaultWidgetConfig, session.id);

    const site = db.prepare('SELECT * FROM booking_sites WHERE rowid = ?').get(result.lastInsertRowid) as any;

    return NextResponse.json({ site }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/booking-sites error:', error);
    return NextResponse.json({ error: publicMessage(error, 'Failed to create site') }, { status: 500 });
  }
}
