/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { eventBus } from '@core/event-bus';
import { notifyReservationCreated } from '../domain/reservation-tg-notify';

// Fallback to guarantee event subscribers are registered in Serverless (Vercel) isolated functions
const ensureSubscribers = async () => {
  if (!(globalThis as any).__prodSubscribersRegistered) {
    try {
      const { registerCrmSubscribers } = await import('@crm');
      const { registerBookingsSubscribers } = await import('@bookings');
      registerCrmSubscribers();
      registerBookingsSubscribers();
      (globalThis as any).__prodSubscribersRegistered = true;
    } catch (e) { console.error('[EventBus] Bootstrap failed', e); }
  }
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function createWidgetReservationOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function createWidgetReservation(request: NextRequest) {
  try {
    await ensureSubscribers();
    const db = getDb();
    const body = await request.json();

    const siteId = body.siteId;
    const siteSlug = body.siteSlug;

    // Failsafe table creation for handshakes
    db.prepare(`
      CREATE TABLE IF NOT EXISTS widget_handshakes (
        token TEXT PRIMARY KEY,
        site_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )
    `).run();

    // Check allowed origin from DB
    let allowedSiteUrl: string | null = null;
    const searchSite = siteId || siteSlug;
    if (searchSite) {
      const site = db.prepare("SELECT site_url FROM booking_sites WHERE (id = ? OR slug = ?) AND status != 'deleted'").get(searchSite, searchSite) as { site_url: string | null } | undefined;
      if (site) {
        allowedSiteUrl = site.site_url;
      }
    }

    const origin = request.headers.get('origin');
    const dynamicHeaders: Record<string, string> = {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Handshake-Token',
    };
    
    if (origin) {
      if (allowedSiteUrl) {
        try {
          const originHost = new URL(origin).hostname;
          const allowedHost = new URL(allowedSiteUrl.startsWith('http') ? allowedSiteUrl : `https://${allowedSiteUrl}`).hostname;
          
          if (
            originHost !== allowedHost && 
            !originHost.endsWith(`.${allowedHost}`) && 
            originHost !== 'localhost' && 
            originHost !== '127.0.0.1'
          ) {
            return NextResponse.json({ error: 'Origin domain not authorized for this widget' }, { status: 403, headers: CORS_HEADERS });
          }
          dynamicHeaders['Access-Control-Allow-Origin'] = origin;
        } catch (e) {
          // ignore malformed URLs
        }
      } else {
        dynamicHeaders['Access-Control-Allow-Origin'] = origin;
      }
    } else {
      dynamicHeaders['Access-Control-Allow-Origin'] = '*';
    }

    // Verify and consume handshake token
    if (siteId || siteSlug) {
      const handshakeToken = request.headers.get('x-handshake-token') || body.handshakeToken || '';
      if (!handshakeToken) {
        return NextResponse.json({ error: 'Security handshake token required' }, { status: 403, headers: dynamicHeaders });
      }
      
      const handshake = db.prepare(`
        SELECT token FROM widget_handshakes 
        WHERE token = ? AND expires_at > datetime('now')
      `).get(handshakeToken) as { token: string } | undefined;

      if (!handshake) {
        return NextResponse.json({ error: 'Security handshake expired or invalid. Please retry.' }, { status: 403, headers: dynamicHeaders });
      }

      // Single-use token: consume it immediately
      db.prepare('DELETE FROM widget_handshakes WHERE token = ?').run(handshakeToken);
    }

    const {
      unitId, checkIn, checkOut,
      adults = 2, children = 0,
      hasPet = false,
      firstName, lastName, email, phone,
      couponCode, certificateCode, extraCouponCode,
      currency: clientCurrency,
      utmParams: rawUtmParams,
      lang: rawLang,
    } = body;

    const lang: string = ['en', 'uk', 'cs', 'de'].includes(rawLang) ? rawLang : 'en';

    // Validate & sanitise UTM params — allowlist keys, cap value length
    const ALLOWED_UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ttclid'];
    const utmParams: Record<string, string> = {};
    if (rawUtmParams && typeof rawUtmParams === 'object') {
      for (const key of ALLOWED_UTM_KEYS) {
        const val = (rawUtmParams as any)[key];
        if (typeof val === 'string' && val.length > 0 && val.length <= 300) {
          utmParams[key] = val;
        }
      }
    }

    if (!unitId || !checkIn || !checkOut || !firstName || !lastName || !phone) {
      return NextResponse.json({
        error: 'unitId, checkIn, checkOut, firstName, lastName, phone are required',
      }, { status: 400, headers: dynamicHeaders });
    }

    const ciDate = new Date(checkIn);
    const coDate = new Date(checkOut);
    if (coDate <= ciDate) {
      return NextResponse.json({ error: 'checkOut must be after checkIn' }, { status: 400, headers: CORS_HEADERS });
    }
    const nights = Math.round((coDate.getTime() - ciDate.getTime()) / 86400000);

    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
        .map(t => t.name)
    );
    const hasAvailBlocks = existingTables.has('availability_blocks');
    const hasPromotions = existingTables.has('promotions');
    const hasPriceCalendar = existingTables.has('price_calendar');

    const unit = db.prepare(`
      SELECT u.id, u.name, u.code, u.property_id, u.unit_type_id
      FROM units u
      JOIN categories c ON u.category_id = c.id
      WHERE u.id = ? AND u.is_active = 1 AND u.room_status = 'available' AND c.type = 'glamping'
    `).get(unitId) as any;

    if (unit && siteId && existingTables.has('site_listings')) {
      const allowed = db.prepare('SELECT 1 FROM site_listings WHERE site_id = ? AND unit_id = ?').get(siteId, unitId);
      if (!allowed) {
        return NextResponse.json({ error: 'Unit not available for this site' }, { status: 403, headers: CORS_HEADERS });
      }
    }

    if (!unit) {
      return NextResponse.json({ error: 'Unit not found or not available' }, { status: 404, headers: CORS_HEADERS });
    }

    let priceOverride: number | null = null;
    let thankYouUrl: string | null = null;
    let siteName: string = 'widget';

    if (siteId) {
      if (existingTables.has('booking_sites')) {
        const site = db.prepare('SELECT name FROM booking_sites WHERE id = ?').get(siteId) as any;
        if (site) siteName = `widget:${siteId}`;
      }
      if (existingTables.has('site_listings')) {
        const listing = db.prepare('SELECT price_override, thank_you_url FROM site_listings WHERE site_id = ? AND unit_id = ?').get(siteId, unitId) as any;
        if (listing) {
          if (listing.price_override != null) priceOverride = listing.price_override;
          if (listing.thank_you_url) thankYouUrl = listing.thank_you_url;
        }
      }
    }

    const isBooked = db.prepare(`
      SELECT 1 FROM reservations r
      WHERE r.unit_id = ?
        AND r.status NOT IN ('cancelled', 'no_show', 'pending_review')
        AND r.check_in < ? AND r.check_out > ?
      LIMIT 1
    `).get(unitId, checkOut, checkIn);

    if (isBooked) {
      return NextResponse.json({ error: 'This unit is already booked for the selected dates' }, { status: 409, headers: CORS_HEADERS });
    }

    if (hasAvailBlocks) {
      const isBlocked = db.prepare(`
        SELECT 1 FROM availability_blocks
        WHERE unit_id = ? AND date_from < ? AND date_to > ?
        LIMIT 1
      `).get(unitId, checkOut, checkIn);
      if (isBlocked) {
        return NextResponse.json({ error: 'This unit is blocked for the selected dates' }, { status: 409, headers: CORS_HEADERS });
      }
    }

    const STUB_PRICE = 2500;
    let prices: any[] = [];
    if (hasPriceCalendar) {
      prices = db.prepare(`
        SELECT pc.date, pc.base_price, pc.weekend_price
        FROM price_calendar pc
        WHERE pc.unit_type_id = ? AND pc.date >= ? AND pc.date < ?
        ORDER BY pc.date ASC
      `).all(unit.unit_type_id, checkIn, checkOut) as any[];
    }

    const priceMap = new Map<string, any>();
    for (const p of prices) priceMap.set(p.date, p);

    let totalPrice = 0;
    let resCurrency = clientCurrency || 'CZK';
    const current = new Date(ciDate);
    for (let i = 0; i < nights; i++) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
      const priceEntry = priceMap.get(dateStr);
      let dayPrice = STUB_PRICE;
      if (priceOverride != null) {
        dayPrice = priceOverride;
      } else if (priceEntry) {
        dayPrice = isWeekend && priceEntry.weekend_price != null
          ? priceEntry.weekend_price : priceEntry.base_price;
      }
      totalPrice += dayPrice;
      current.setDate(current.getDate() + 1);
    }

    let extraPersonTotal = 0;
    const unitTypeInfo = db.prepare(
      'SELECT base_occupancy, extra_person_charge, pet_allowed, pet_charge FROM unit_types WHERE id = ?'
    ).get(unit.unit_type_id) as any;
    if (unitTypeInfo) {
      const baseOcc = unitTypeInfo.base_occupancy || 2;
      const extraGuests = Math.max(0, adults - baseOcc);
      extraPersonTotal = extraGuests * (unitTypeInfo.extra_person_charge || 0) * nights;
      totalPrice += extraPersonTotal;
    }

    let petChargeTotal = 0;
    if (hasPet && unitTypeInfo?.pet_charge) {
      petChargeTotal = unitTypeInfo.pet_charge;
      totalPrice += petChargeTotal;
    }

    let offerDiscount = 0;
    let offer: any = null;
    let isBundle = false;

    if (couponCode) {
      try {
        const code = String(couponCode).toUpperCase().trim();
        offer = db.prepare(`
          SELECT * FROM coupons
          WHERE code = ? AND is_active = 1
            AND (valid_from IS NULL OR valid_from <= ?)
            AND (valid_until IS NULL OR valid_until >= ?)
            AND (max_uses IS NULL OR current_uses < max_uses)
        `).get(code, checkOut, checkIn) as any;

        if (!offer) {
          offer = db.prepare(`
            SELECT * FROM gift_card_bundles 
            WHERE coupon_code = ? AND is_active = 1 
              AND (redemption_limit IS NULL OR current_uses < redemption_limit)
          `).get(code) as any;
          if (offer) isBundle = true;
        }

        if (offer) {
          if (isBundle) {
            // Package overrides the totalPrice completely
            offerDiscount = Math.max(0, totalPrice - offer.price);
            // Bundle sets its own price and currency
            resCurrency = offer.currency || resCurrency;
            db.prepare('UPDATE gift_card_bundles SET current_uses = current_uses + 1 WHERE id = ?').run(offer.id);
          } else {
            if (offer.discount_type === 'percentage') {
              offerDiscount = Math.round(totalPrice * offer.offer_amount / 100);
            } else if (offer.discount_type === 'fixed_price' || offer.discount_type === 'fixed_amount') {
              offerDiscount = Math.max(0, totalPrice - offer.offer_amount);
            } else {
              offerDiscount = offer.offer_amount;
            }
            db.prepare('UPDATE coupons SET current_uses = current_uses + 1 WHERE id = ?').run(offer.id);
          }
        }
      } catch (err: any) { 
        console.error('[Coupon validation error]', err);
      }
    }

    let certificateDiscount = 0;
    if (certificateCode) {
      certificateDiscount = 0;
    }

    let extraDiscount = 0;
    if (extraCouponCode) {
      try {
        const extraCode = String(extraCouponCode).toUpperCase().trim();
        const extraOffer = db.prepare(`
          SELECT * FROM coupons
          WHERE code = ? AND is_active = 1
            AND (valid_from IS NULL OR valid_from <= ?)
            AND (valid_until IS NULL OR valid_until >= ?)
            AND (max_uses IS NULL OR current_uses < max_uses)
        `).get(extraCode, checkOut, checkIn) as any;

        if (extraOffer) {
          // Calculate discount based on the price AFTER package/first offer
          const currentPrice = Math.max(0, totalPrice - offerDiscount);
          if (extraOffer.discount_type === 'percentage') {
            extraDiscount = Math.round(currentPrice * extraOffer.offer_amount / 100);
          } else if (extraOffer.discount_type === 'fixed_price' || extraOffer.discount_type === 'fixed_amount') {
            extraDiscount = Math.max(0, currentPrice - extraOffer.offer_amount);
          } else {
            extraDiscount = extraOffer.offer_amount;
          }
          db.prepare('UPDATE coupons SET current_uses = current_uses + 1 WHERE id = ?').run(extraOffer.id);
        }
      } catch (err: any) {
        console.error('[Extra Coupon validation error]', err);
      }
    }

    const finalPrice = Math.max(0, totalPrice - offerDiscount - certificateDiscount - extraDiscount);

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string };

    let guestId: string;
    if (email) {
      const existing = db.prepare(
        'SELECT id FROM guests WHERE email = ? AND organization_id = ?'
      ).get(email, org.id) as { id: string } | undefined;

      if (existing) {
        guestId = existing.id;
        db.prepare(
          'UPDATE guests SET first_name = ?, last_name = ?, phone = COALESCE(?, phone), updated_at = datetime(\'now\') WHERE id = ?'
        ).run(firstName, lastName, phone || null, guestId);
      } else {
        guestId = `g_${Date.now()}`;
        db.prepare(
          'INSERT INTO guests (id, organization_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(guestId, org.id, firstName, lastName, email, phone || null);
      }
    } else {
      guestId = `g_${Date.now()}`;
      db.prepare(
        'INSERT INTO guests (id, organization_id, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)'
      ).run(guestId, org.id, firstName, lastName, phone || null);
    }

    // Bookings from a named site (🌍 Сайт source) always go to pending_review.
    // Bookings without a siteId (raw widget embed) use tentative.
    // Free bookings always skip to confirmed.
    const resStatus = finalPrice === 0 ? 'confirmed' : (siteId ? 'pending_review' : 'tentative');
    const payStatus = finalPrice === 0 ? 'paid' : 'unpaid';
    // Generate a unique guest_page_token — retries on collision (UNIQUE index exists)
    let guestPageToken = Math.random().toString(36).slice(2, 14);
    for (let i = 0; i < 5; i++) {
      const existing = db.prepare('SELECT 1 FROM reservations WHERE guest_page_token = ?').get(guestPageToken);
      if (!existing) break;
      guestPageToken = Math.random().toString(36).slice(2, 14);
    }

    db.prepare(`
      INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights, adults, children, status, payment_status, source, total_price, currency, payment_id, promotions_applied, guest_page_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resId, unit.property_id, unitId, guestId,
      checkIn, checkOut, nights, adults, children,
      resStatus, payStatus, siteName, finalPrice, resCurrency, null, JSON.stringify([couponCode, extraCouponCode].filter(Boolean)),
      guestPageToken
    );

    // --- Emit event for CRM and other modules ---
    await eventBus.emit('booking.created', {
      bookingId: resId,
      guestId,
      unitId,
      total: finalPrice,
      currency: resCurrency,
      source: siteName
    }).catch(e => console.error('[EventBus] booking.created emit failed:', e));

    let testEmailStatus = 'not_sent';
    if (email) {
      try {
        const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://kemp-carlsbad.cz';
        const { sendEmail } = await import('@/lib/email');
        const propertyInfo = db.prepare(`
          SELECT p.name, u.name as unit_name
          FROM units u LEFT JOIN properties p ON u.property_id = p.id
          WHERE u.id = ?
        `).get(unitId) as any;
        const propertyName = propertyInfo?.name || 'ALiSiO';
        const unitName = propertyInfo?.unit_name || '';

        // ── Build primary CTA URL ─────────────────────────────────────
        // Priority: thank_you_url (from site_listings) > guest portal
        // Append guest_token + UTM params to thank-you URL for FB Pixel tracking
        const guestPortalUrl = `${origin}/guest/${guestPageToken}`;
        let primaryUrl: string;
        if (thankYouUrl) {
          const sep = thankYouUrl.includes('?') ? '&' : '?';
          const utmString = Object.entries(utmParams)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
          primaryUrl = `${thankYouUrl}${sep}guest_token=${guestPageToken}${utmString ? '&' + utmString : ''}`;
        } else {
          primaryUrl = guestPortalUrl;
        }

        let widgetConfig: any = {};
        if (siteId) {
          const siteRow = db.prepare('SELECT widget_config FROM booking_sites WHERE id = ?').get(siteId) as any;
          if (siteRow?.widget_config) {
            try {
              widgetConfig = JSON.parse(siteRow.widget_config);
            } catch { /* */ }
          }
        }

        // ── Localized email defaults ──────────────────────────────────────
        const EMAIL_TEMPLATES: Record<string, { subject: string; body: string; header: string; btnText: string }> = {
          en: {
            subject: 'Complete your registration — {propertyName}',
            body: 'Your booking is registered. To secure your dates, please complete your booking on your personal page.',
            header: 'Complete your registration',
            btnText: 'Personal page →',
          },
          uk: {
            subject: 'Завершіть реєстрацію — {propertyName}',
            body: 'Ваше бронювання зареєстроване. Щоб зберегти обрані дати, потрібно завершити бронювання на вашій персональній сторінці.',
            header: 'Завершіть реєстрацію',
            btnText: 'Персональна сторінка →',
          },
          cs: {
            subject: 'Dokončete registraci — {propertyName}',
            body: 'Vaše rezervace je registrována. Pro zachování termínu prosím dokončete rezervaci na vaší osobní stránce.',
            header: 'Dokončete registraci',
            btnText: 'Osobní stránka →',
          },
          de: {
            subject: 'Schließen Sie Ihre Registrierung ab — {propertyName}',
            body: 'Ihre Buchung ist registriert. Um Ihre Termine zu sichern, schließen Sie bitte die Buchung auf Ihrer persönlichen Seite ab.',
            header: 'Registrierung abschließen',
            btnText: 'Persönliche Seite →',
          },
        };
        const emailTpl = EMAIL_TEMPLATES[lang] || EMAIL_TEMPLATES.en;

        const rawSubject = widgetConfig.email_received_subject || emailTpl.subject;
        const rawBody = widgetConfig.email_received_body || emailTpl.body;

        const replaceDict: Record<string, string> = {
          propertyName,
          bookingId: resId,
          guestName: `${firstName || ''} ${lastName || ''}`.trim(),
          firstName: firstName || '',
          lastName: lastName || '',
          checkIn,
          checkOut,
          nights: String(nights),
          totalPrice: `${finalPrice} ${resCurrency}`,
          unitName
        };

        const replacePlaceholders = (tpl: string, dict: Record<string, string>) => {
          let str = tpl;
          for (const [k, v] of Object.entries(dict)) {
            str = str.split(`{${k}}`).join(v);
          }
          return str;
        };

        const customizedSubject = replacePlaceholders(rawSubject, replaceDict);
        const customizedBody = replacePlaceholders(rawBody, replaceDict);

        testEmailStatus = 'scheduled';
        const delayMs = 10 * 60 * 1000;
        setTimeout(async () => {
          try {
            const currentDb = getDb();
            const currentRes = currentDb.prepare('SELECT payment_status FROM reservations WHERE id = ?').get(resId) as any;
            if (!currentRes) {
              console.log(`[Widget Reserve Delay] Reservation ${resId} not found, skipping email`);
              return;
            }
            if (currentRes.payment_status === 'paid' || currentRes.payment_status === 'prepaid') {
              console.log(`[Widget Reserve Delay] Reservation ${resId} is already paid (${currentRes.payment_status}), skipping "Complete registration" email`);
              return;
            }

            const { sendEmail } = await import('@/lib/email');
            await sendEmail({
              to: email,
              subject: customizedSubject,
              html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1a2e;max-width:560px;margin:0 auto;padding:24px;background:#f7f7f9;">
  <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
    <div style="font-size:28px;color:#2E6B4F;font-weight:700;margin-bottom:8px;">${propertyName}</div>
    <div style="font-size:14px;color:#666;margin-bottom:24px;">${emailTpl.header}</div>
    <p style="font-size:16px;margin:0 0 16px;">Hi ${firstName}!</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px;">${customizedBody}</p>
    <div style="background:#f0f9f4;border:1px solid #d4e9da;border-radius:12px;padding:16px 18px;margin:20px 0;">
      <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Booking ID</div>
      <div style="font-size:20px;font-weight:700;color:#2E6B4F;margin-top:2px;">${resId}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#666;">Accommodation</td><td style="text-align:right;font-weight:600;">${unitName}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Check-in</td><td style="text-align:right;font-weight:600;">${checkIn}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Check-out</td><td style="text-align:right;font-weight:600;">${checkOut}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Nights</td><td style="text-align:right;font-weight:600;">${nights}</td></tr>
      <tr><td style="padding:12px 0 0;color:#2E6B4F;font-size:15px;"><strong>Total</strong></td><td style="text-align:right;padding:12px 0 0;color:#2E6B4F;font-weight:700;font-size:15px;">${finalPrice} ${resCurrency}</td></tr>
    </table>
    <div style="margin-top:28px;text-align:center;">
      <a href="${guestPortalUrl}" style="display:inline-block;background:#2E6B4F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">${emailTpl.btnText}</a>
    </div>
  </div>
</body></html>`,
            });
            console.log(`[Widget Reserve Delay] Confirmation email sent to ${email} for ${resId}`);
          } catch (emailErr: any) {
            console.error('[Widget Reserve Delay] Email failed:', emailErr.message);
          }
        }, delayMs);
      } catch (err: any) {
        testEmailStatus = `failed: ${err.message}`;
        console.error('[Widget Reserve] Setup failed:', err.message);
      }
    }

    // ── Bundle: pre-create service_orders for included services ──────────
    // Guests schedule the time via their guest portal; staff sees them once scheduled.
    if (isBundle && offer?.included_services) {
      try {
        const bundleServices: Array<{ service_id: string; free?: boolean; isIncluded?: boolean }> =
          typeof offer.included_services === 'string'
            ? JSON.parse(offer.included_services)
            : offer.included_services;

        const bundleNotes = JSON.stringify({ bundle: offer.name || couponCode, included: true });

        for (let i = 0; i < bundleServices.length; i++) {
          const inc = bundleServices[i];
          // Only insert services that are included/free in the bundle
          if (!inc.service_id || (!inc.free && !inc.isIncluded)) continue;
          // Verify the service exists
          const svcExists = db.prepare('SELECT id FROM additional_services WHERE id = ?').get(inc.service_id);
          if (!svcExists) continue;

          db.prepare(`
            INSERT INTO service_orders (id, reservation_id, service_id, quantity, total_price, status, payment_status, service_date, notes)
            VALUES (?, ?, ?, 1, 0, 'confirmed', 'paid', NULL, ?)
          `).run(`so_bundle_${Date.now()}_${i}`, resId, inc.service_id, bundleNotes);
        }
      } catch (bundleErr: any) {
        console.error('[Reserve] Failed to create bundle service_orders:', bundleErr.message);
        // Non-fatal — reservation is already created
      }
    }

    notifyReservationCreated(resId, {
      sourceLabel: 'Widget · публічне бронювання',
      emoji: siteId ? '⏳' : '🌐',
      ...(siteId ? {
        extraFooter: '\n📋 <b>Потребує модерації</b> — підтвердіть або відхиліть заявку в PMS (Бронювання → фільтр «На модерацію»)',
      } : {}),
    });

    return NextResponse.json({
      success: true,
      reservationId: resId,
      unitName: unit.name,
      checkIn,
      checkOut,
      nights,
      totalPrice: finalPrice,
      originalPrice: totalPrice,
      offerDiscount: offerDiscount + extraDiscount,
      certificateDiscount,
      currency: resCurrency,
      thankYouUrl,
      testEmailStatus,
    }, { status: 201, headers: dynamicHeaders });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('POST /api/booking/reserve error:', msg);
    const clientMsg = process.env.NODE_ENV === 'development'
      ? `Failed to create reservation: ${msg}`
      : 'Failed to create reservation';
    return NextResponse.json({ error: clientMsg }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function getWidgetReservation(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    
    const res = db.prepare(`
      SELECT r.id as reservationId, r.check_in as checkIn, r.check_out as checkOut, r.nights, r.total_price as totalPrice, r.currency,
             u.name as unitName
      FROM reservations r
      JOIN units u ON r.unit_id = u.id
      WHERE r.id = ?
    `).get(id) as any;

    if (!res) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404, headers: CORS_HEADERS });
    }

    return NextResponse.json(res, { headers: CORS_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS });
  }
}
