/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createPaymentSession, resolveSiteCredentials, isGlobalTeyaConfigured } from '@payments';
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
      couponCode,
      // Breakfast-specific fields from service-embed.js
      breakfast_dates,
      menu_items: clientMenuItems,
      // Legacy fields from booking/page.tsx (glamping flow)
      amount: clientAmount,
      currency: clientCurrency,
      description: clientDescription,
    } = body;

    const db = getDb();

    // пінг щоб оновити проект на сервері

    // 1. Resolve Site and Payment Config
    //    site_slug is optional — when absent, fall back to global ENV credentials
    let site: any = null;
    let siteCreds: any = null;

    // Identifier may arrive as site_slug OR site_id. It can be a UUID, a DB slug,
    // or a friendly slug like 'kemp-carlsbad'. If it is missing OR does not match
    // any row, fall through to global/default ENV credentials (NO hard 404) so a
    // single-property site (e.g. alisio.swipescape.eu) not registered in
    // booking_sites can still take payment.
    let siteKey: string | undefined = site_slug || clientSiteId;
    if (siteKey) {
      if (siteKey === 'kv.kemp-carlsbad.cz' || siteKey === 'www.kemp-carlsbad.cz' || siteKey === 'kemp-carlsbad.cz') {
        siteKey = 'kemp-carlsbad';
      }
      // Exact slug/id, loose Kemp Carlsbad slug (DB stores the slugified full URL,
      // e.g. 'https-kv-kemp-carlsbad-cz'), or a site_url substring match.
      site = db.prepare(
        `SELECT id, payment_config, site_url, slug FROM booking_sites
         WHERE slug = ? OR id = ?
            OR (? = 'kemp-carlsbad' AND slug LIKE '%kemp-carlsbad%')
            OR (site_url IS NOT NULL AND site_url <> '' AND site_url LIKE ?)`
      ).get(siteKey, siteKey, siteKey, `%${siteKey}%`) as any;
      if (site) {
        siteCreds = resolveSiteCredentials({ id: site.id, slug: site.slug });
      } else {
        console.warn('[Checkout Session] Site not registered, using default ENV creds:', siteKey);
      }
    }

    // Check if payment is possible: either site-specific Teya config or global ENV
    const hasSiteTeya = !!siteCreds?.credentials;
    if (!hasSiteTeya && !isGlobalTeyaConfigured()) {
      if (reservation_id) {
        // Fire email explicitly for offline/bank-transfer partner bookings
        try {
          const { sendBookingConfirmationEmail } = await import('../data/send-confirmation-email');
          sendBookingConfirmationEmail(reservation_id).catch(() => { });
        } catch (err: any) {
          console.error('[Checkout Session] Failed to trigger email:', err.message);
        }
      }
      return NextResponse.json({ error: 'Online payments not configured' }, { status: 403, headers: CORS_HEADERS });
    }


    // 2. Resolve Amount (Recalculate from DB for security, with client fallback)
    let amount = 0;
    let currency = 'CZK';
    let description = 'ALiSiO Booking';

    if (service_id && service_date) {
      // Service-only order (e.g. Sauna/Tub/Breakfast from Guest Page widget)
      const svc = db.prepare('SELECT name, name_en, price, currency, service_type FROM additional_services WHERE id = ?').get(service_id) as any;
      if (!svc) return NextResponse.json({ error: 'Service not found' }, { status: 404, headers: CORS_HEADERS });

      const isBreakfast = svc.service_type === 'menu_selection' || service_id === 'svc_breakfast';
      const h = isBreakfast ? 1 : (hours || 1);
      let basePrice = svc.price;

      // Apply Coupon code discount if provided
      if (body.couponCode) {
        try {
          const offer = db.prepare("SELECT discount_type, offer_amount FROM coupons WHERE code = ? AND is_active = 1").get(body.couponCode) as any;
          if (offer) {
            if (offer.discount_type === 'fixed_price') {
              basePrice = offer.offer_amount;
            } else if (offer.discount_type === 'percentage') {
              basePrice = Math.round(svc.price * (1 - offer.offer_amount / 100));
            }
          }
        } catch { /* offer lookup failed — use full price */ }
      }

      // For breakfast, use client-sent amount (calculated from menu items × days)
      // because per-item pricing varies. For slot services, recalculate server-side.
      if (isBreakfast && clientAmount && typeof clientAmount === 'number' && clientAmount > 0) {
        amount = clientAmount;
      } else {
        amount = basePrice * h;
      }
      currency = svc.currency || 'CZK';
      const svcName = svc.name_en || svc.name;

      if (isBreakfast) {
        // Breakfast: "Breakfast — 2026-05-30" or "Breakfast — 2 days"
        const bDays = breakfast_dates && breakfast_dates.length > 0 ? breakfast_dates : [service_date];
        description = bDays.length > 1
          ? `${svcName} — ${bDays.length} days (${bDays[0]} – ${bDays[bDays.length - 1]})`
          : `${svcName} — ${bDays[0]}`;
      } else {
        // Slot service: "Sauna — 2 hodin, 2026-05-27"
        const sHour = start_hour || 14;
        description = `${svcName} — ${h} hodin, ${service_date}`;
      }

      // Handle addons (slot services only)
      if (!isBreakfast && addons && Array.isArray(addons)) {
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

      // Short-circuit: reservation is already fully covered (e.g. 100% offer) — no Teya needed
      if (amount === 0) {
        try {
          db.prepare("UPDATE reservations SET payment_status = 'paid', status = 'confirmed' WHERE id = ? AND payment_status != 'paid'").run(reservation_id);
        } catch { /* non-fatal */ }
        return NextResponse.json({ session_url: null, already_paid: true }, { headers: CORS_HEADERS });
      }

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
    const svcInfo = service_id ? db.prepare('SELECT service_type FROM additional_services WHERE id = ?').get(service_id) as any : null;
    const isBreakfastOrder = svcInfo?.service_type === 'menu_selection' || service_id === 'svc_breakfast';

    if (service_id && service_date) {
      try {
        orderId = `so_${Date.now()}`;

        if (isBreakfastOrder) {
          // Breakfast order: store selected dates and menu items, no hours/slots
          const bDays = breakfast_dates && breakfast_dates.length > 0 ? breakfast_dates : [service_date];
          const notesObj = {
            type: 'breakfast',
            breakfast_dates: bDays,
            menu_items: clientMenuItems || [],
            payment_id: 'pending_teya'
          };
          db.prepare(`
            INSERT INTO service_orders (id, reservation_id, service_id, quantity, total_price, status, payment_status, service_date, notes)
            VALUES (?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)
          `).run(
            orderId, reservation_id || 'system_fallback', service_id,
            bDays.length,  // quantity = number of breakfast days
            amount, bDays[0], JSON.stringify(notesObj)
          );
        } else {
          // Slot service (sauna, tub): keep existing behavior
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
            INSERT INTO service_orders (id, reservation_id, service_id, quantity, total_price, status, payment_status, service_date, notes)
            VALUES (?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)
          `).run(
            orderId, reservation_id || 'system_fallback', service_id, h, amount, service_date || null, JSON.stringify(notesObj)
          );
        }
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

      const lines = [
        `🛒 <b>Замовлення · 🌐 Віджет</b>: ${esc(description)}`,
        '',
      ];
      if (guestName) lines.push(`👤 ${esc(guestName)}`);
      if (unitName) lines.push(`🏠 ${esc(unitName)}`);

      if (isBreakfastOrder) {
        // Breakfast: show dates without time range
        const bDays = breakfast_dates && breakfast_dates.length > 0 ? breakfast_dates : [service_date];
        lines.push(`📅 ${bDays.join(', ')}`);
        // Show menu items if available
        if (clientMenuItems && Array.isArray(clientMenuItems)) {
          for (const mi of clientMenuItems) {
            if (mi.quantity > 0) {
              lines.push(`  🍽️ ${esc(mi.name || mi.menuItemId)} × ${mi.quantity}`);
            }
          }
        }
      } else if (service_id && service_date) {
        // Slot service: show date + time range
        const sHour = start_hour || 14;
        const h = hours || 2;
        const timeRange = `${String(sHour).padStart(2, '0')}:00–${String(sHour + h).padStart(2, '0')}:00`;
        lines.push(`📅 ${service_date}, ${timeRange}`);
      }

      lines.push(`💰 ${amount} ${currency}`);
      if (body.couponCode) lines.push(`🏷️ Промокод: ${esc(body.couponCode)}`);
      lines.push(`💳 Створено замовлення · очікує оплати`);

      sendTelegramMessage(lines.join('\n')).catch(() => { });
    } catch { /* */ }


    // Step 3: Call Teya with dynamic credentials
    //
    // Behind nginx the socket request is http://localhost:3001, so
    // `new URL(req.url).origin` yields a localhost origin. Teya's edge (AWS ELB)
    // returns 403 Forbidden when the success/cancel URL host is localhost. Rebuild
    // the PUBLIC origin from the proxy's forwarded headers (or the browser's
    // Origin/Referer, or the site's own URL) so return URLs point at the real host.
    const firstHeader = (v: string | null) => (v ? v.split(',')[0].trim() : '');
    const isLocalHost = (h: string) => !h || h.includes('localhost') || h.includes('127.0.0.1');
    const resolvePublicOrigin = (): string => {
      const raw = new URL(req.url).origin;
      const xfHost = firstHeader(req.headers.get('x-forwarded-host'));
      const xfProto = firstHeader(req.headers.get('x-forwarded-proto')) || 'https';
      if (xfHost && !isLocalHost(xfHost)) return `${xfProto}://${xfHost}`;

      const originHdr = req.headers.get('origin');
      if (originHdr && originHdr.startsWith('https://') && !isLocalHost(originHdr)) return originHdr;

      const referer = req.headers.get('referer');
      if (referer) {
        try {
          const u = new URL(referer);
          if (u.protocol === 'https:' && !isLocalHost(u.hostname)) return u.origin;
        } catch { /* invalid referer — ignore */ }
      }

      if (site?.site_url) {
        try { return new URL(site.site_url).origin; } catch { /* invalid site_url — ignore */ }
      }
      if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/+$/, '');

      // Last resort: never hand Teya a localhost/http URL — force https on the raw host.
      return raw.replace(/^http:\/\//, 'https://');
    };
    const origin = resolvePublicOrigin();
    const isProduction = !origin.includes('localhost') && !origin.includes('127.0.0.1');

    // Validate returnTo for security (prevent open redirects)
    let returnTo = return_path || (reservation_id ? `/guest/${reservation_id}` : '/');
    if (returnTo.startsWith('http') && site?.site_url) {
      try {
        const allowedHost = new URL(site.site_url).hostname;
        const targetHost = new URL(returnTo).hostname;
        // Allow: same site host, any alisio.eu subdomain, kemp-carlsbad.cz (partner domain)
        const isAllowed = allowedHost === targetHost
          || targetHost.includes('alisio.eu')
          || targetHost.includes('kemp-carlsbad.cz');
        if (!isAllowed) {
          returnTo = site.site_url;
        }
      } catch { /* invalid URL — keep returnTo */ }
    }

    if (reservation_id) {
      try {
        const tokenRes = db.prepare('SELECT guest_page_token FROM reservations WHERE id = ?').get(reservation_id) as any;
        if (tokenRes?.guest_page_token) {
          const sep = returnTo.includes('?') ? '&' : '?';
          returnTo = `${returnTo}${sep}guest_page_token=${tokenRes.guest_page_token}`;
        }
      } catch { /* non-fatal */ }
    }

    // test
    // 
    console.log('[Checkout Session] Creating Teya session:', {
      reservation_id,
      site_id: clientSiteId,
      resolved_site: site,
      hasSiteCredentials: !!siteCreds?.credentials,
      amount,
      currency,
      description,
    });

    try {
      // додано для тесту
      if (!siteCreds?.credentials) {
        console.error('[Checkout Session] Missing site Teya credentials', {
          site,
          clientSiteId,
          siteCreds
        });
      }

      console.log('[Checkout Session] SITE:', site);
      console.log('[Checkout Session] CREDS:', !!siteCreds?.credentials);
      console.log('[Teya DEBUG]', {
        siteId: site?.id,
        slug: site?.slug,
        siteCreds,
        hasCredentials: !!siteCreds?.credentials,
      });

      const session = await createPaymentSession({
        kind: service_id && service_date ? (reservation_id ? 'reservation_services' : 'service_standalone') : 'booking_full',
        amount,
        currency: currency || 'CZK',
        description,
        metadata: reservation_id
          ? {
            reservation_id,
            // source: 'widget_service', змінено для тесту
            source: service_id ? 'widget_service' : 'booking_payment',
            ...(orderId && { order_id: orderId }),
            ...(site?.id && { site_id: site.id })
          }
          : (site?.id ? { site_id: site.id } : {}),
        credentials: siteCreds?.credentials,

        // NOTE: Teya does NOT support {CHECKOUT_SESSION_ID} placeholder (Stripe only).
        // We use reservation_id in the return URL so payment-return can identify the booking.
        // прибрав тестово перевірку чи прод чи дев версія, можливо допоможе з редіректом
        successUrl: `${origin}/api/booking/payment-return?status=success&reservation_id=${encodeURIComponent(reservation_id || '')}&return=${encodeURIComponent(returnTo)}`,
        cancelUrl: `${origin}/api/booking/payment-return?status=cancel&reservation_id=${encodeURIComponent(reservation_id || '')}&return=${encodeURIComponent(returnTo)}`,
      });

      if (reservation_id) {
        try {
          db.prepare('UPDATE reservations SET payment_id = ? WHERE id = ?').run(session.sessionId, reservation_id);
        } catch (e: any) { console.error('[Checkout Session] Update res payment_id error:', e.message); }
      }

      if (orderId) {
        try {
          // Update payment_id COLUMN (critical for webhook matching) AND notes JSON
          const so = db.prepare("SELECT notes FROM service_orders WHERE id = ?").get(orderId) as any;
          if (so && so.notes) {
            const parsed = JSON.parse(so.notes);
            parsed.payment_id = session.sessionId;
            db.prepare('UPDATE service_orders SET payment_id = ?, notes = ? WHERE id = ?').run(session.sessionId, JSON.stringify(parsed), orderId);
          } else {
            db.prepare('UPDATE service_orders SET payment_id = ? WHERE id = ?').run(session.sessionId, orderId);
          }
        } catch { /* */ }
      }

      if (reservation_id) {
        try {
          const { sendBookingConfirmationEmail } = await import('../data/send-confirmation-email');
          sendBookingConfirmationEmail(reservation_id).catch(() => { });
        } catch (err: any) {
          console.error('[Checkout Session] Failed to trigger email:', err.message);
        }
      }

      return NextResponse.json({
        session_token: session.sessionToken,
        session_id: session.sessionId,
        session_url: session.sessionUrl,
      }, { headers: CORS_HEADERS });

    } catch (teyaErr: any) {
      // console.error('[Checkout Session] Teya error:', teyaErr.message); // test bugs
      console.error(
        '[Checkout Session] Teya error:',
        teyaErr.response?.data || teyaErr.message,
        teyaErr
      );
      return NextResponse.json({ error: 'Payment gateway error' }, { status: 502, headers: CORS_HEADERS });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500, headers: CORS_HEADERS });
  }
}
