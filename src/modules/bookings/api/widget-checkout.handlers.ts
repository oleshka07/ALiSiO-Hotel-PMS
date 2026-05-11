/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createPaymentSession } from '@payments';
import { getDb } from '@core/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot'; // TODO: replace with eventBus

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function createCheckoutSessionOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function createWidgetCheckoutSession(req: Request) {
  try {
    const body = await req.json();
    const {
      reservation_id,
      site_slug,
      site_id: clientSiteId,
      return_path,
      service_id,
      service_date,
      start_hour,
      hours,
      addons,
      // Legacy fields from booking/page.tsx (glamping flow)
      amount: clientAmount,
      currency: clientCurrency,
      description: clientDescription,
    } = body;

    const db = getDb();

    // 1. Resolve Site and Payment Config
    //    site_slug is optional — when absent, fall back to global ENV credentials
    let site: any = null;
    let payCfg: any = {};

    if (site_slug) {
      site = db.prepare('SELECT id, payment_config, site_url FROM booking_sites WHERE slug = ?').get(site_slug) as any;
      if (!site) {
        return NextResponse.json({ error: 'Site not found' }, { status: 404, headers: CORS_HEADERS });
      }
      payCfg = JSON.parse(site.payment_config || '{}');
    } else if (clientSiteId) {
      // booking/page.tsx sends site_id instead of site_slug
      site = db.prepare('SELECT id, payment_config, site_url FROM booking_sites WHERE id = ?').get(clientSiteId) as any;
      if (site) payCfg = JSON.parse(site.payment_config || '{}');
    }

    // Check if payment is possible: either site-specific Teya config or global ENV
    const hasSiteTeya = payCfg.enabled && payCfg.provider === 'teya' && payCfg.teya?.client_id;
    if (!hasSiteTeya && !process.env.TEYA_CLIENT_ID) {
      return NextResponse.json({ error: 'Online payments not configured' }, { status: 403, headers: CORS_HEADERS });
    }


    // 2. Resolve Amount (Recalculate from DB for security, with client fallback)
    let amount = 0;
    let currency = 'CZK';
    let description = 'ALiSiO Booking';

    if (service_id && service_date) {
      // Service-only order (e.g. Sauna/Tub from Guest Page widget)
      const svc = db.prepare('SELECT name, name_en, price, currency FROM additional_services WHERE id = ?').get(service_id) as any;
      if (!svc) return NextResponse.json({ error: 'Service not found' }, { status: 404, headers: CORS_HEADERS });

      const h = hours || 1;
      let basePrice = svc.price;

      // Apply Coupon code discount if provided
      if (body.couponCode) {
        try {
          const offer = db.prepare("SELECT discount_type, discount_value FROM promo_codes WHERE code = ? AND is_active = 1").get(body.couponCode) as any;
          if (offer) {
            if (offer.discount_type === 'fixed_price') {
              basePrice = offer.discount_value;
            } else if (offer.discount_type === 'percentage') {
              basePrice = Math.round(svc.price * (1 - offer.discount_value / 100));
            }
          }
        } catch { /* offer lookup failed — use full price */ }
      }

      amount = basePrice * h;
      currency = svc.currency || 'CZK';
      const svcName = svc.name_en || svc.name;
      const sHour = start_hour || 14;
      description = `${svcName} — ${h} hodin, ${service_date}`;

      // Handle addons
      if (addons && Array.isArray(addons)) {
        for (const addon of addons) {
          const addonPrice = addon.price || 0;
          const addonQty = addon.quantity || 1;
          amount += addonPrice * addonQty;
          // If addon price not sent from client, look up in DB
          if (!addon.price && addon.id) {
            try {
              const dbAddon = db.prepare("SELECT price FROM service_addons WHERE id = ?").get(addon.id) as any;
              if (dbAddon) amount += (dbAddon.price || 0) * addonQty;
            } catch { /* */ }
          }
        }
      }

    } else if (reservation_id) {
      // Main Reservation payment
      const res = db.prepare('SELECT total_price, currency FROM reservations WHERE id = ?').get(reservation_id) as any;
      if (!res) return NextResponse.json({ error: 'Reservation not found' }, { status: 404, headers: CORS_HEADERS });
      
      amount = res.total_price || 0;
      currency = res.currency || 'CZK';
      description = `Booking #${reservation_id.substring(0, 8)}`;

      // Also add unpaid service_orders to the total
      try {
        const svcOrders = db.prepare(
          "SELECT SUM(total_price) as svc_total FROM service_orders WHERE reservation_id = ? AND status = 'pending'"
        ).get(reservation_id) as any;
        if (svcOrders?.svc_total) amount += svcOrders.svc_total;
      } catch (err: any) {
        console.error('[Checkout Session] Error calculating service_orders:', err.message);
      }

      // If DB amount is still 0 (brand new reservation), use client-sent amount
      if (amount <= 0 && clientAmount && typeof clientAmount === 'number' && clientAmount > 0) {
        amount = clientAmount;
        if (clientCurrency) currency = clientCurrency;
        if (clientDescription) description = clientDescription;
        // Backfill reservation with the correct total
        try { db.prepare('UPDATE reservations SET total_price = ?, currency = ? WHERE id = ?').run(amount, currency, reservation_id); } catch { /* */ }
      }
      // Legacy fallback: booking/page.tsx sends amount directly (no reservation_id)
    } else if (clientAmount && typeof clientAmount === 'number' && clientAmount > 0) {
      amount = clientAmount;
      currency = clientCurrency || 'CZK';
      description = clientDescription || 'ALiSiO Booking';
    } else {
      return NextResponse.json({ error: 'reservation_id or service_id is required' }, { status: 400, headers: CORS_HEADERS });
    }


    const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';

    // Step 1: Create preliminary order for services if needed
    let orderId: string | null = null;
    if (service_id && service_date) {
      try {
        orderId = `so_${Date.now()}`;
        const h = hours || 2;
        const sHour = start_hour || 14;
        const notesObj = {
          service_date,
          startHour: sHour,
          hours: h,
          addons: addons || [],
          unit_price: amount / h,
          payment_id: 'pending_teya'
        };

        db.prepare(`
          INSERT INTO service_orders (id, reservation_id, service_id, quantity, total_price, status, notes)
          VALUES (?, ?, ?, ?, ?, 'pending', ?)
        `).run(
          orderId, reservation_id || 'system_fallback', service_id, h, amount, JSON.stringify(notesObj)
        );
      } catch (dbErr: any) {
        console.error('[Checkout Session] DB error inserting service_orders:', dbErr.message);
      }
    }

    // Step 2: TG Notification (enriched with guest details)
    try {
      let guestName = '';
      let unitName = '';
      if (reservation_id) {
        try {
          const resInfo = db.prepare(`
            SELECT r.id, rg.first_name, rg.last_name, u.name as unit_name
            FROM reservations r
            LEFT JOIN reservation_guests rg ON rg.reservation_id = r.id
            LEFT JOIN units u ON u.id = r.unit_id
            WHERE r.id = ?
          `).get(reservation_id) as any;
          if (resInfo) {
            guestName = [resInfo.first_name, resInfo.last_name].filter(Boolean).join(' ');
            unitName = resInfo.unit_name || '';
          }
        } catch { /* guest lookup failed */ }
      }

      const sHour = start_hour || 14;
      const h = hours || 2;
      const timeRange = service_id ? `${String(sHour).padStart(2, '0')}:00–${String(sHour + h).padStart(2, '0')}:00` : '';

      const lines = [
        `📦 <b>Нове замовлення: ${esc(description)}</b>`,
        '',
      ];
      if (guestName) lines.push(`👤 ${esc(guestName)}`);
      if (unitName) lines.push(`🏠 ${esc(unitName)}`);
      if (service_date && timeRange) lines.push(`📅 ${service_date}, ${timeRange}`);
      lines.push(`💰 ${amount} ${currency}`);
      if (body.couponCode) lines.push(`🏷️ Промокод: ${esc(body.couponCode)}`);
      lines.push(`💳 Очікує оплати`);

      sendTelegramMessage(lines.join('\n')).catch(() => { });
    } catch { /* */ }


    // Step 3: Call Teya with dynamic credentials
    const origin = new URL(req.url).origin;
    const isProduction = !origin.includes('localhost') && !origin.includes('127.0.0.1');

    // Validate returnTo for security (prevent open redirects)
    let returnTo = return_path || (reservation_id ? `/guest/${reservation_id}` : '/');
    if (returnTo.startsWith('http') && site?.site_url) {
      try {
        const allowedHost = new URL(site.site_url).hostname;
        const targetHost = new URL(returnTo).hostname;
        if (allowedHost !== targetHost && !targetHost.includes('alisio.eu')) {
          returnTo = site.site_url;
        }
      } catch { /* invalid URL — keep returnTo */ }
    }

    try {
      const session = await createPaymentSession({
        kind: service_id && service_date ? (reservation_id ? 'reservation_services' : 'service_standalone') : 'booking_full',
        amount,
        currency: currency || 'CZK',
        description,
        metadata: reservation_id ? { reservation_id, ...(site?.id && { site_id: site.id }) } : (site?.id ? { site_id: site.id } : {}),
        credentials: hasSiteTeya ? {
          client_id: payCfg.teya.client_id,
          client_secret: payCfg.teya.client_secret,
          store_id: payCfg.teya.store_id
        } : undefined,
        ...(isProduction ? {
          successUrl: `${origin}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=success&return=${encodeURIComponent(returnTo)}`,
          cancelUrl: `${origin}/api/booking/payment-return?session_id={CHECKOUT_SESSION_ID}&status=cancel&return=${encodeURIComponent(returnTo)}`,
        } : {}),
      });

      if (reservation_id) {
        try {
          db.prepare('UPDATE reservations SET payment_id = ? WHERE id = ?').run(session.sessionId, reservation_id);
        } catch (e: any) { console.error('[Checkout Session] Update res payment_id error:', e.message); }
      }

      if (orderId) {
        try {
          const so = db.prepare("SELECT notes FROM service_orders WHERE id = ?").get(orderId) as any;
          if (so && so.notes) {
            const parsed = JSON.parse(so.notes);
            parsed.payment_id = session.sessionId;
            db.prepare('UPDATE service_orders SET notes = ? WHERE id = ?').run(JSON.stringify(parsed), orderId);
          }
        } catch { /* */ }
      }

      return NextResponse.json({
        session_token: session.sessionToken,
        session_id: session.sessionId,
        session_url: session.sessionUrl,
      }, { headers: CORS_HEADERS });

    } catch (teyaErr: any) {
      console.error('[Checkout Session] Teya error:', teyaErr.message);
      return NextResponse.json({ error: 'Payment gateway error' }, { status: 502, headers: CORS_HEADERS });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: CORS_HEADERS });
  }
}
