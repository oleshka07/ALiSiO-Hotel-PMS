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

    const {
      unitId, checkIn, checkOut,
      adults = 2, children = 0,
      hasPet = false,
      firstName, lastName, email, phone,
      couponCode, certificateCode, extraCouponCode,
      siteId,
      currency: clientCurrency,
    } = body;

    if (!unitId || !checkIn || !checkOut || !firstName || !lastName || !phone) {
      return NextResponse.json({
        error: 'unitId, checkIn, checkOut, firstName, lastName, phone are required',
      }, { status: 400, headers: CORS_HEADERS });
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
        if (site) siteName = site.name;
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

    const resId = `r_${Date.now()}`;
    const resStatus = finalPrice === 0 ? 'confirmed' : 'tentative';
    const payStatus = finalPrice === 0 ? 'paid' : 'unpaid';

    db.prepare(`
      INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights, adults, children, status, payment_status, source, total_price, currency, payment_id, promotions_applied)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resId, unit.property_id, unitId, guestId,
      checkIn, checkOut, nights, adults, children,
      resStatus, payStatus, siteName, finalPrice, resCurrency, null, JSON.stringify([couponCode, extraCouponCode].filter(Boolean))
    );

    // --- Emit event for CRM and other modules ---
    await eventBus.emit('booking.created', {
      bookingId: resId,
      guestId,
      unitId,
      unitName: unit.name,
      checkIn,
      checkOut,
      adults,
      children,
      total: finalPrice,
      currency: resCurrency,
      source: siteName
    }).catch(e => console.error('[EventBus] booking.created emit failed:', e));

    try {
      const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://kemp-carlsbad.cz';
      const { sendBookingConfirmationEmail } = await import('../data/send-confirmation-email');
      sendBookingConfirmationEmail(resId, origin).catch(() => {});
    } catch (err: any) {
      console.error('[Widget Reserve] Failed to trigger confirmation email:', err.message);
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

    notifyReservationCreated(resId, { sourceLabel: 'Widget · публічне бронювання', emoji: '🌐' });

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
    }, { status: 201, headers: CORS_HEADERS });
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
