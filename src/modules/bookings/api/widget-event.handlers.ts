/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function trackWidgetEventOptions(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  return new NextResponse(null, { status: 204, headers });
}

export async function trackWidgetEvent(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Origin': origin || '*',
  };

  try {
    const db = getDb();
    const body = await request.json();

    const site_id = body.site_id || body.siteId;
    const session_id = body.session_id || body.sessionId;
    const event_type = body.event_type || body.eventType;
    const step = body.step !== undefined ? body.step : null;
    const page = body.page || null;
    const lang = body.lang || null;
    const reservation_id = body.reservation_id || body.reservationId;

    const utmParams = body.utmParams || body.utm_params || {};
    const utm_source = body.utm_source || utmParams.utm_source || null;
    const utm_medium = body.utm_medium || utmParams.utm_medium || null;
    const utm_campaign = body.utm_campaign || utmParams.utm_campaign || null;

    // Get country from headers (Vercel or Cloudflare)
    const country = request.headers.get('x-vercel-ip-country') || request.headers.get('cf-ipcountry') || null;

    if (!site_id) {
      return NextResponse.json({ error: 'Missing site_id' }, { status: 400, headers });
    }

    // Check if site exists by ID or slug
    const site = db.prepare("SELECT id, site_url FROM booking_sites WHERE (id = ? OR slug = ?) AND status != 'deleted'").get(site_id, site_id) as any;
    if (!site) {
      return NextResponse.json({ error: 'Site not found or deleted' }, { status: 404, headers });
    }

    const allowedTypes = [
      'page_view',
      'widget_opened',
      'widget_step_1',
      'widget_step_2',
      'widget_step_3',
      'widget_step_4',
      'widget_step_5',
      'abandon',
      'complete'
    ];

    if (!event_type || !allowedTypes.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid or missing event_type' }, { status: 400, headers });
    }

    // Insert event using the resolved site.id
    db.prepare(`
      INSERT INTO widget_events (
        site_id, session_id, event_type, step, page,
        utm_source, utm_medium, utm_campaign, lang, reservation_id, country
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      site.id,
      session_id || null,
      event_type,
      step !== undefined ? step : null,
      page || null,
      utm_source || null,
      utm_medium || null,
      utm_campaign || null,
      lang || null,
      reservation_id || null,
      country
    );

    return NextResponse.json({ success: true }, { status: 200, headers });
  } catch (error: any) {
    console.error('Error tracking widget event:', error?.message || error);
    return NextResponse.json({ error: 'Failed to track event' }, { status: 500, headers });
  }
}
