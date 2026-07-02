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
  'Access-Control-Allow-Headers': 'Content-Type, X-Handshake-Token',
};

export async function createWidgetReservationOptions(request: NextRequest) {
  const origin = request.headers.get('origin') || '*';
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Allow-Origin': origin,
    },
  });
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
            originHost !== '127.0.0.1' &&
            originHost !== 'kemp-carlsbad-cz.onrender.com'
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
      conversationId,
      // Group booking: how many identical units to reserve
      quantity = 1,
      // Passport / doc data for primary guest — saved as pending registration
      documentType,
      documentNumber,
      dateOfBirth,
      guestCountry,
      // Payment method (cash | terminal) — informational, stored in notes
      paymentMethod,
      documentStrategy, // 'now' | 'portal' | 'reception'
    } = body;

    const lang: string = ['en', 'uk', 'cs', 'de'].includes(rawLang) ? rawLang : 'en';
    const bookingQuantity = Math.max(1, Math.min(Number(quantity) || 1, 20)); // cap at 20

    // Validate & sanitise UTM params — allowlist keys, cap value length
    const ALLOWED_UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ttclid','ga_client_id'];
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
      WHERE u.id = ? AND u.is_active = 1 AND u.room_status = 'available'
    `).get(unitId) as any;

    if (unit && siteId && existingTables.has('site_listings')) {
      const allowed = db.prepare('SELECT 1 FROM site_listings WHERE site_id = ? AND unit_id = ?').get(siteId, unitId);
      if (!allowed) {
        const isRender = request.headers.get('origin')?.includes('kemp-carlsbad-cz.onrender.com');
        if (process.env.NODE_ENV === 'development' || isRender) {
          console.log(`[DEV BYPASS] Allowing unmapped unit ${unitId} for site ${siteId}`);
        } else {
          return NextResponse.json({ error: 'Unit not available for this site' }, { status: 403, headers: CORS_HEADERS });
        }
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
        if (site) siteName = `widget:${siteId}`; // unified format: widget:<siteId>
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
        AND r.status NOT IN ('cancelled', 'no_show')
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

    const resStatus = finalPrice === 0 ? 'confirmed' : 'tentative';
    const payStatus = finalPrice === 0 ? 'paid' : 'unpaid';

    const utmSource = utmParams['utm_source'] || null;
    const utmMedium = utmParams['utm_medium'] || null;
    const utmCampaign = utmParams['utm_campaign'] || null;
    const utmContent = utmParams['utm_content'] || null;
    const utmTerm = utmParams['utm_term'] || null;
    const gaClientId = utmParams['ga_client_id'] || null;
    const session_id_to_store = body.widget_session_id || body.widgetSessionId || null;
    let countryCode = request.headers.get('cf-ipcountry') || request.headers.get('x-vercel-ip-country') || null;
    if (countryCode && typeof countryCode === 'string') {
      countryCode = countryCode.toUpperCase().slice(0, 2);
    }

    // For group bookings (quantity > 1): create a reservation_groups record first
    // so that group_id satisfies the FK → reservation_groups(id)
    let groupId: string | null = null;
    if (bookingQuantity > 1) {
      groupId = `grp_${Date.now()}`;
      try {
        db.prepare(`
          INSERT INTO reservation_groups
            (id, property_id, guest_id, group_type, check_in, check_out, nights,
             total_price, currency, source, status, payment_status)
          VALUES (?, ?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          groupId, unit.property_id, guestId,
          checkIn, checkOut, nights,
          finalPrice * bookingQuantity, resCurrency,
          siteName, resStatus, payStatus
        );
      } catch (grpErr: any) {
        console.error('[Reserve] Failed to create reservation_group:', grpErr.message);
        groupId = null; // non-fatal — reservations will have no group link
      }
    }

    // Helper to generate a unique guest_page_token
    const generateToken = (): string => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const t = Math.random().toString(36).slice(2, 14);
        const existing = db.prepare('SELECT 1 FROM reservations WHERE guest_page_token = ?').get(t);
        if (!existing) return t;
      }
      return `${Math.random().toString(36).slice(2)}_${Date.now()}`;
    };

    // Ensure guest_registrations table has the group_id column (graceful migration)
    try {
      db.prepare('ALTER TABLE guest_registrations ADD COLUMN group_id TEXT').run();
    } catch { /* column already exists */ }

    const createdReservations: { reservationId: string; guestPageToken: string; unitName: string; slot: number }[] = [];

    for (let slot = 1; slot <= bookingQuantity; slot++) {
      const resId = `r_${Date.now()}_${slot}`;
      const guestPageToken = generateToken();

      const notesArr = [];
      if (paymentMethod) notesArr.push(`payment_method:${paymentMethod}`);
      if (documentStrategy) notesArr.push(`document_strategy:${documentStrategy}`);
      const finalNotes = notesArr.length > 0 ? notesArr.join(' | ') : null;

      db.prepare(`
        INSERT INTO reservations (
          id, property_id, unit_id, guest_id, check_in, check_out,
          nights, adults, children, status, payment_status, source,
          total_price, currency, payment_id, promotions_applied, guest_page_token,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term, ga_client_id,
          booking_lang, country_code, widget_session_id, group_id, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        resId, unit.property_id, unitId, guestId,
        checkIn, checkOut, nights, adults, children,
        resStatus, payStatus, siteName, finalPrice, resCurrency, null,
        JSON.stringify([couponCode, extraCouponCode].filter(Boolean)),
        guestPageToken,
        utmSource, utmMedium, utmCampaign, utmContent, utmTerm, gaClientId,
        lang, countryCode, session_id_to_store, groupId,
        finalNotes
      );

      // Save passport data as a pending guest_registration for the primary guest
      // Staff will confirm/complete at check-in. Only for slot=1 (primary guest).
      if (slot === 1 && documentNumber) {
        try {
          const grId = `gr_${Date.now()}_widget`;
          db.prepare(`
            INSERT OR IGNORE INTO guest_registrations
              (id, reservation_id, guest_id, is_primary, reg_status, purpose_of_stay, group_id)
            VALUES (?, ?, ?, 1, 'pending', 'Tourism', ?)
          `).run(grId, resId, guestId, groupId);

          // Also enrich the guest record with passport data
          db.prepare(`
            UPDATE guests
            SET document_type    = COALESCE(?, document_type),
                document_number  = COALESCE(?, document_number),
                date_of_birth    = COALESCE(?, date_of_birth),
                country          = COALESCE(?, country),
                updated_at       = datetime('now')
            WHERE id = ?
          `).run(
            documentType || null,
            documentNumber || null,
            dateOfBirth   || null,
            guestCountry  || null,
            guestId
          );
        } catch (grErr: any) {
          console.error('[Reserve] Failed to save guest_registration draft:', grErr.message);
          // Non-fatal — reservation already created
        }
      }

      // Emit event for CRM and other modules
      await eventBus.emit('booking.created', {
        bookingId: resId,
        guestId,
        unitId,
        total: finalPrice,
        currency: resCurrency,
        source: siteName,
      }).catch(e => console.error('[EventBus] booking.created emit failed:', e));

      createdReservations.push({
        reservationId: resId,
        guestPageToken,
        unitName: unit.name,
        slot,
      });
    }

    // Use first reservation as the primary for emails/notifications
    const primaryRes = createdReservations[0];
    const resId = primaryRes.reservationId;
    const guestPageToken = primaryRes.guestPageToken;

    let testEmailStatus = 'not_sent';
    if (email) {
      try {
        const alisioAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://alisio.swipescape.eu';
        const { sendEmail } = await import('@/lib/email');
        const propertyInfo = db.prepare(`
          SELECT p.name, u.name as unit_name
          FROM units u LEFT JOIN properties p ON u.property_id = p.id
          WHERE u.id = ?
        `).get(unitId) as any;
        const propertyName = propertyInfo?.name || 'ALiSiO';
        const unitName = propertyInfo?.unit_name || '';

        // ── Build primary CTA URL ─────────────────────────────────────
        // The email CTA should always lead to the Guest Portal.
        const guestPortalUrl = `${alisioAppUrl}/guest/${guestPageToken}`;

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
        const EMAIL_TEMPLATES: Record<string, any> = {
          en: {
            subject: 'Booking Confirmed — {propertyName}',
            body: 'Thank you for booking with us! Your reservation is confirmed.',
            header: 'Booking Confirmed',
            btnText: 'Guest Portal →',
            docWarning: '⚠️ IMPORTANT: You must complete your online guest registration and provide passport details via the link below before arrival.',
            greeting: 'Hi {firstName}!',
            bookingId: 'Booking ID',
            accommodation: 'Accommodation',
            checkIn: 'Check-in',
            checkOut: 'Check-out',
            nights: 'Nights',
            total: 'Total',
            payment: 'Payment',
            paymentReception: 'Cash/Terminal at Reception',
            paymentOnline: 'Online Paid',
          },
          uk: {
            subject: 'Бронювання підтверджено — {propertyName}',
            body: 'Дякуємо за бронювання! Ваше бронювання підтверджено.',
            header: 'Бронювання підтверджено',
            btnText: 'Особистий кабінет →',
            docWarning: '⚠️ ВАЖЛИВО: До вашого приїзду обов\'язково потрібно заповнити паспортні дані для онлайн-реєстрації за посиланням нижче.',
            greeting: 'Привіт, {firstName}!',
            bookingId: 'Номер броні',
            accommodation: 'Розміщення',
            checkIn: 'Заїзд',
            checkOut: 'Виїзд',
            nights: 'Ночей',
            total: 'Разом',
            payment: 'Оплата',
            paymentReception: 'На місці на рецепції',
            paymentOnline: 'Оплачено онлайн',
          },
          cs: {
            subject: 'Rezervace potvrzena — {propertyName}',
            body: 'Děkujeme za rezervaci! Vaše rezervace je potvrzena.',
            header: 'Rezervace potvrzena',
            btnText: 'Osobní stránka →',
            docWarning: '⚠️ DŮLEŽITÉ: Před příjezdem musíte nutně vyplnit údaje z pasu pro online registraci hostů na odkazu níže.',
            greeting: 'Dobrý den, {firstName}!',
            bookingId: 'Číslo rezervace',
            accommodation: 'Ubytování',
            checkIn: 'Příjezd',
            checkOut: 'Odjezd',
            nights: 'Počet nocí',
            total: 'Celkem',
            payment: 'Platba',
            paymentReception: 'Hotově/kartou na recepci',
            paymentOnline: 'Zaplaceno online',
          },
          de: {
            subject: 'Buchung bestätigt — {propertyName}',
            body: 'Vielen Dank für Ihre Buchung! Ihre Reservierung ist bestätigt.',
            header: 'Buchung bestätigt',
            btnText: 'Persönliche Seite →',
            docWarning: '⚠️ WICHTIG: Sie müssen Ihre Passdaten für die Online-Gästeregistrierung über den unten stehenden Link vor der Anreise zwingend ausfüllen.',
            greeting: 'Hallo {firstName}!',
            bookingId: 'Buchungsnummer',
            accommodation: 'Unterkunft',
            checkIn: 'Check-in',
            checkOut: 'Check-out',
            nights: 'Nächte',
            total: 'Gesamt',
            payment: 'Zahlung',
            paymentReception: 'Bar/Karte an der Rezeption',
            paymentOnline: 'Online bezahlt',
          },
        };
        const emailTpl = EMAIL_TEMPLATES[lang] || EMAIL_TEMPLATES.en;
        
        const needsDocs = !documentNumber;
        const docWarningHtml = needsDocs ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;color:#856404;font-size:14px;font-weight:600;line-height:1.5;">${emailTpl.docWarning}</div>` : '';

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

        // Fire-and-forget immediate email sending via standard ALiSiO mail (email.cz)
        // We use import() dynamically so we don't have to await it, preventing UI freezing
        import('@/lib/email').then(({ sendEmail }) => {
          sendEmail({
            to: email,
            subject: customizedSubject,
            html: `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1a2e;max-width:600px;margin:0 auto;padding:12px;background:#f7f7f9;">
  <div style="background:#fff;border-radius:12px;padding:24px 20px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
    <div style="font-size:26px;color:#2E6B4F;font-weight:700;margin-bottom:8px;">${propertyName}</div>
    <div style="font-size:14px;color:#666;margin-bottom:24px;">${emailTpl.header}</div>
    <p style="font-size:16px;margin:0 0 16px;">${emailTpl.greeting.replace('{firstName}', firstName || '')}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px;">${customizedBody}</p>
    ${docWarningHtml}
    <div style="background:#f0f9f4;border:1px solid #d4e9da;border-radius:12px;padding:16px;margin:20px 0;">
      <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">${emailTpl.bookingId}</div>
      <div style="font-size:20px;font-weight:700;color:#2E6B4F;margin-top:2px;">${resId}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#666;">${emailTpl.accommodation}</td><td style="text-align:right;font-weight:600;">${unitName}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">${emailTpl.checkIn}</td><td style="text-align:right;font-weight:600;">${checkIn}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">${emailTpl.checkOut}</td><td style="text-align:right;font-weight:600;">${checkOut}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">${emailTpl.nights}</td><td style="text-align:right;font-weight:600;">${nights}</td></tr>
      <tr><td style="padding:12px 0 0;color:#2E6B4F;font-size:15px;"><strong>${emailTpl.total}</strong></td><td style="text-align:right;padding:12px 0 0;color:#2E6B4F;font-weight:700;font-size:15px;">${finalPrice} ${resCurrency}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">${emailTpl.payment}</td><td style="text-align:right;font-weight:600;color:${paymentMethod === 'reception' ? '#b45309' : '#2E6B4F'};">${paymentMethod === 'reception' ? emailTpl.paymentReception : emailTpl.paymentOnline}</td></tr>
    </table>
    <div style="margin-top:28px;text-align:center;">
      <a href="${guestPortalUrl}" style="display:inline-block;background:#2E6B4F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">${emailTpl.btnText}</a>
    </div>
  </div>
</body></html>`,
          }).catch(err => console.error('[Widget Reserve] Immediate email failed:', err));
        });
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

    // Smart source label for Telegram notification
    const isAdminLikely = !utmParams['utm_source'] && (paymentMethod === 'cash' || paymentMethod === 'terminal');
    const payMethodLabel = paymentMethod === 'cash' ? '💵 готівка'
      : paymentMethod === 'terminal' ? '💳 термінал'
      : paymentMethod === 'reception' ? '🏨 на рецепції'
      : '';
    let widgetSourceLabel = '';
    let widgetEmoji = '🌐';
    if (isAdminLikely) {
      widgetSourceLabel = `📋 Адмін через віджет${payMethodLabel ? ` · ${payMethodLabel}` : ''}`;
      widgetEmoji = '📋';
    } else if (utmParams['utm_source']) {
      widgetSourceLabel = `🌐 Віджет · ${utmParams['utm_source']}${utmParams['utm_medium'] ? `/${utmParams['utm_medium']}` : ''}${payMethodLabel ? ` · ${payMethodLabel}` : ''}`;
    } else {
      widgetSourceLabel = `🌐 Віджет · прямий перехід${payMethodLabel ? ` · ${payMethodLabel}` : ''}`;
    }
    notifyReservationCreated(resId, { sourceLabel: widgetSourceLabel, emoji: widgetEmoji });

    if (conversationId) {
      try {
        const docStatus = documentStrategy === 'reception' 
          ? 'Заповнять на рецепції ⚠️' 
          : documentStrategy === 'portal' 
            ? 'Заповнять онлайн 💻'
            : documentStrategy === 'now'
              ? 'Заповнили зараз ✅'
              : 'Не вказано';

        const content = [
          `✅ <b>Бронювання завершено (через віджет)!</b>`,
          `🆔 Бронювання ID: <code>${resId}</code>`,
          `🏕️ Тип: ${unit.name}`,
          `📅 Дати: ${checkIn} — ${checkOut} (${nights} ночей)`,
          `👥 Гості: Дорослих ${adults}, Дітей ${children}${hasPet ? ', Тварина 🐾' : ''}`,
          `💳 Сума: ${finalPrice} ${resCurrency}`,
          `📋 Документи: ${docStatus}`
        ].join('\n');

        const { executeCreateMessage } = await import('@crm');
        await executeCreateMessage(db, conversationId, {
          channelType: 'web_form',
          direction: 'inbound',
          senderType: 'guest',
          senderName: firstName || 'Гість',
          content,
          contentType: 'text'
        });
      } catch (e: any) {
        console.error('[Reserve] Failed to add CRM message:', e.message);
      }
    }

    return NextResponse.json({
      success: true,
      // Primary reservation (for backwards compat with old widget)
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
      guestPageToken,
      testEmailStatus,
      // Group booking — all reservations with their individual tokens
      quantity: bookingQuantity,
      groupId,
      reservations: createdReservations,
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
