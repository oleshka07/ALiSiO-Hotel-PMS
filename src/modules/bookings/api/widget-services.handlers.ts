/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot'; // TODO: replace with eventBus

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SLOT_TTL_MINUTES = 15;

export async function getWidgetServicesOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function getWidgetServices(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const serviceId = searchParams.get('serviceId');
    const siteId = searchParams.get('siteId') || '';

    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
        .map(t => t.name)
    );

    if (!existingTables.has('additional_services')) {
      return NextResponse.json({ services: [] }, { headers: CORS_HEADERS });
    }

    if (serviceId && checkIn && checkOut) {
      const service = db.prepare('SELECT * FROM additional_services WHERE id = ? AND is_active = 1').get(serviceId) as any;
      if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404, headers: CORS_HEADERS });
      }

      const result: any = { ...formatService(service) };

      if (service.service_type === 'slot_booking' && existingTables.has('service_time_slots')) {
        db.prepare(`
          UPDATE service_time_slots
          SET booked_count = MAX(0, booked_count - 1), booking_session_id = NULL
          WHERE booking_session_id IS NOT NULL
            AND notes IS NULL
            AND created_at < datetime('now', '-' || ? || ' minutes')
        `).run(SLOT_TTL_MINUTES);

        const bookedSlots = db.prepare(`
          SELECT date, start_time, end_time, booked_count, max_capacity
          FROM service_time_slots
          WHERE service_id = ? AND date >= ? AND date < ? AND booked_count >= max_capacity
        `).all(serviceId, checkIn, checkOut) as any[];
        result.bookedSlots = bookedSlots;
      }

      if (service.service_type === 'menu_selection' && existingTables.has('menu_items')) {
        const items = db.prepare(
          'SELECT * FROM menu_items WHERE service_id = ? AND is_available = 1 ORDER BY sort_order'
        ).all(serviceId) as any[];
        result.menuItems = items.map(item => ({
          id: item.id,
          name: item.name,
          nameEn: item.name_en,
          nameCs: item.name_cs,
          nameDe: item.name_de,
          description: item.description,
          descriptionEn: item.description_en,
          descriptionCs: item.description_cs,
          descriptionDe: item.description_de,
          weightGrams: item.weight_grams,
          price: item.price,
          photoUrl: item.photo_url,
        }));
      }

      if (existingTables.has('service_addons')) {
        const addons = db.prepare(
          'SELECT * FROM service_addons WHERE service_id = ? ORDER BY sort_order'
        ).all(serviceId) as any[];
        result.addons = addons.map(a => ({
          id: a.id,
          name: a.name,
          nameEn: a.name_en,
          nameCs: a.name_cs,
          nameDe: a.name_de,
          price: a.price,
          icon: a.icon,
        }));
      }

      return NextResponse.json(result, { headers: CORS_HEADERS });
    }

    // ── List services ─────────────────────────────────────────────────────
    // If siteId is provided → filter by site_services (respect price_override)
    // Otherwise → return all active services (for /booking desktop page)
    const hasSiteServices = existingTables.has('site_services');

    let services: any[];

    if (siteId && hasSiteServices) {
      // Services enabled for this booking site (defaulting to enabled if no explicit config)
      services = db.prepare(`
        SELECT s.*, ss.price_override, ss.photo_override,
               COALESCE(ss.sort_order, s.sort_order) as site_sort_order, 
               COALESCE(ss.is_enabled, 1) as is_enabled
        FROM additional_services s
        LEFT JOIN site_services ss ON ss.service_id = s.id AND ss.site_id = ?
        WHERE s.is_active = 1 AND COALESCE(ss.is_enabled, 1) = 1
        ORDER BY COALESCE(ss.sort_order, s.sort_order), s.sort_order
      `).all(siteId) as any[];

      // Apply price_override where set
      services = services.map(s => ({
        ...s,
        price: s.price_override != null ? s.price_override : s.price,
      }));
    } else {
      // Fallback: all active glamping services (desktop /booking page)
      services = db.prepare(`
        SELECT * FROM additional_services
        WHERE is_active = 1 AND (available_for = 'all' OR available_for = 'glamping')
        ORDER BY sort_order
      `).all() as any[];
    }

    const ratePlanId = searchParams.get('ratePlanId') || searchParams.get('ratePlan');
    let includedServices: string[] = [];

    if (ratePlanId) {
      const ratePlan = db.prepare('SELECT * FROM rate_plans WHERE id = ? OR code = ?').get(ratePlanId, ratePlanId) as any;
      if (ratePlan && ratePlan.included_services_json) {
        try {
          includedServices = JSON.parse(ratePlan.included_services_json);
        } catch { /* ignore */ }
      }
    }

    return NextResponse.json({
      services: services.map(s => {
        const formatted = formatService(s);
        // Check if service is included in rate plan
        const isIncluded = includedServices.includes(s.id) || includedServices.includes(s.code || '');
        if (isIncluded) {
          (formatted as any).is_included = true;
          formatted.price = 0;
        }
        return formatted;
      }),
      hasServices: services.length > 0,
    }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('GET /api/booking/services error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to load services' }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function bookWidgetService(request: NextRequest) {

  try {
    const db = getDb();
    const body = await request.json();
    const { action } = body;

    if (action === 'book-slots') {
      const { serviceId, date, startHour, hours, persons, addons, reservationId, paymentId, couponCode } = body;

      if (!serviceId || !date || startHour === undefined || !hours || hours < 2) {
        return NextResponse.json(
          { error: 'serviceId, date, startHour, hours (min 2) required' },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const service = db.prepare('SELECT * FROM additional_services WHERE id = ?').get(serviceId) as any;
      if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404, headers: CORS_HEADERS });
      }

      let pricePerHour = service.price;

      let appliedPromo: string | null = null;
      if (couponCode) {
        const offer = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(String(couponCode).toUpperCase().trim()) as any;
        if (offer) {
          let applicable = true;
          if (offer.applicable_services) {
            try {
              const svcs = JSON.parse(offer.applicable_services) as string[];
              if (svcs.length > 0 && !svcs.includes(serviceId)) applicable = false;
            } catch { /* ignore */ }
          }
          if (offer.max_uses !== null && offer.current_uses >= offer.max_uses) applicable = false;
          const now = new Date().toISOString();
          if (offer.valid_from && now < offer.valid_from) applicable = false;
          if (offer.valid_until && now > offer.valid_until) applicable = false;

          if (applicable) {
            appliedPromo = offer.code;
            if (offer.discount_type === 'fixed_price') {
              pricePerHour = offer.offer_amount;
            } else if (offer.discount_type === 'percentage') {
              pricePerHour = pricePerHour * (1 - offer.offer_amount / 100);
            }
            db.prepare('UPDATE coupons SET current_uses = current_uses + 1 WHERE id = ?').run(offer.id);
            console.log('[Booking] Applied offer:', offer.code, '→', pricePerHour, 'CZK/hr');
          }
        }
      }

      let totalPrice = pricePerHour * hours;

      const existingTables = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
          .map(t => t.name)
      );

      if (existingTables.has('service_time_slots')) {
        for (let h = 0; h < hours; h++) {
          const slotStart = `${String(startHour + h).padStart(2, '0')}:00`;
          const existing = db.prepare(`
            SELECT id FROM service_time_slots
            WHERE service_id = ? AND date = ? AND start_time = ? AND booked_count >= max_capacity
          `).get(serviceId, date, slotStart) as any;

          if (existing) {
            return NextResponse.json(
              { error: `Slot ${slotStart} on ${date} is already booked` },
              { status: 409, headers: CORS_HEADERS }
            );
          }
        }
      }

      let addonTotal = 0;
      const addonDetails: any[] = [];
      if (addons && existingTables.has('service_addons')) {
        for (const addon of addons) {
          const addonRow = db.prepare('SELECT * FROM service_addons WHERE id = ?').get(addon.id) as any;
          if (addonRow) {
            const qty = addon.quantity || 1;
            addonTotal += addonRow.price * qty;
            addonDetails.push({ id: addonRow.id, name: addonRow.name, price: addonRow.price, quantity: qty });
          }
        }
      }
      totalPrice += addonTotal;

      const slotIds: string[] = [];
      for (let h = 0; h < hours; h++) {
        const slotStart = `${String(startHour + h).padStart(2, '0')}:00`;
        const slotEnd = `${String(startHour + h + 1).padStart(2, '0')}:00`;
        const slotId = `slot_${Date.now()}_${h}`;

        const existingSlot = db.prepare(`
          SELECT id, booked_count FROM service_time_slots
          WHERE service_id = ? AND date = ? AND start_time = ?
        `).get(serviceId, date, slotStart) as any;

        if (existingSlot) {
          db.prepare('UPDATE service_time_slots SET booked_count = booked_count + 1, reservation_id = ? WHERE id = ?')
            .run(reservationId || null, existingSlot.id);
          slotIds.push(existingSlot.id);
        } else {
          db.prepare(`
            INSERT INTO service_time_slots (id, service_id, date, start_time, end_time, max_capacity, booked_count, reservation_id)
            VALUES (?, ?, ?, ?, ?, 1, 1, ?)
          `).run(slotId, serviceId, date, slotStart, slotEnd, reservationId || null);
          slotIds.push(slotId);
        }
      }

      if (paymentId) {
        for (const sid of slotIds) {
          db.prepare('UPDATE service_time_slots SET booking_session_id = ? WHERE id = ?').run(paymentId, sid);
        }
      }

      if (existingTables.has('booking_service_orders')) {
        const orderId = `bso_${Date.now()}`;
        const { site_id } = body;
        db.prepare(`
          INSERT INTO booking_service_orders (id, reservation_id, service_id, quantity, service_date, time_slot_id, options_json, unit_price, total_price, status, payment_id, payment_status, coupon_code, site_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
        `).run(
          orderId, reservationId || null, serviceId, hours, date, slotIds[0],
          JSON.stringify({ persons: persons || 1, addons: addonDetails, hours, startHour }),
          pricePerHour, totalPrice,
          paymentId || null,
          paymentId ? 'pending' : 'none',
          appliedPromo,
          site_id || null
        );
      }

      try {
        const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
        let guestInfo = 'Зовнішній клієнт';
        if (reservationId) {
          const guest = db.prepare(`
            SELECT g.first_name, g.last_name, u.name as unit_name
            FROM reservations r
            JOIN guests g ON r.guest_id = g.id
            LEFT JOIN units u ON r.unit_id = u.id
            WHERE r.id = ?
          `).get(reservationId) as any;
          if (guest) guestInfo = `${esc(guest.first_name)} ${esc(guest.last_name)}${guest.unit_name ? ' · ' + esc(guest.unit_name) : ''}`;
        }
        const svcName = service.name_en || service.name;
        const payStatus = paymentId ? '💳 Створено замовлення · очікує оплати' : '✅ Без оплати';
        const text = [
          `🛒 <b>Замовлення · 🌐 Віджет</b>: ${esc(svcName)}`,
          ``,
          `👤 ${guestInfo}`,
          `📅 ${date}, ${startHour}:00–${startHour + hours}:00`,
          `💰 ${totalPrice} CZK`,
          payStatus,
        ].join('\n');
        sendTelegramMessage(text).catch(() => {});
      } catch { /* non-critical */ }

      return NextResponse.json({
        success: true,
        slotIds,
        hours,
        date,
        startHour,
        endHour: startHour + hours,
        persons: persons || 1,
        pricePerHour,
        addonTotal,
        totalPrice,
        addons: addonDetails,
        offerApplied: appliedPromo,
      }, { status: 201, headers: CORS_HEADERS });

    } else if (action === 'book-breakfast') {
      const { reservationId, items, serviceDate, paymentId } = body;

      if (!items || items.length === 0) {
        return NextResponse.json({ error: 'items required' }, { status: 400, headers: CORS_HEADERS });
      }

      let totalPrice = 0;
      const orderDetails: any[] = [];

      for (const item of items) {
        const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_available = 1').get(item.menuItemId) as any;
        if (!menuItem) continue;

        const qty = item.quantity || 1;
        const itemTotal = menuItem.price * qty;
        totalPrice += itemTotal;

        if (reservationId) {
          const orderId = `bso_${Date.now()}_${menuItem.id}`;
          db.prepare(`
            INSERT INTO booking_service_orders (id, reservation_id, service_id, menu_item_id, quantity, service_date, unit_price, total_price, status, payment_id, payment_status)
            VALUES (?, ?, 'svc_breakfast', ?, ?, ?, ?, ?, 'confirmed', ?, ?)
          `).run(orderId, reservationId, menuItem.id, qty, serviceDate || null, menuItem.price, itemTotal, paymentId || null, paymentId ? 'pending' : 'none');
        }

        orderDetails.push({
          menuItemId: menuItem.id,
          name: menuItem.name,
          quantity: qty,
          unitPrice: menuItem.price,
          totalPrice: itemTotal,
        });
      }

      return NextResponse.json({ success: true, items: orderDetails, totalPrice }, { status: 201, headers: CORS_HEADERS });

    } else if (action === 'book-toggle') {
      const { serviceId, reservationId, quantity: reqQuantity } = body;

      if (!serviceId || !reservationId) {
        return NextResponse.json({ error: 'serviceId and reservationId required' }, { status: 400, headers: CORS_HEADERS });
      }

      const service = db.prepare('SELECT * FROM additional_services WHERE id = ?').get(serviceId) as any;
      if (!service) {
        return NextResponse.json({ error: 'Service not found' }, { status: 404, headers: CORS_HEADERS });
      }

      const qty = reqQuantity || 1;
      const existingTables = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
          .map(t => t.name)
      );

      if (existingTables.has('booking_service_orders')) {
        const existing = db.prepare(
          'SELECT id FROM booking_service_orders WHERE reservation_id = ? AND service_id = ?'
        ).get(reservationId, serviceId) as any;

        if (existing) {
          db.prepare('DELETE FROM booking_service_orders WHERE id = ?').run(existing.id);
        } else {
          const orderId = `bso_${Date.now()}_${serviceId}`;
          db.prepare(`
            INSERT INTO booking_service_orders (id, reservation_id, service_id, quantity, unit_price, total_price, status)
            VALUES (?, ?, ?, ?, ?, ?, 'confirmed')
          `).run(orderId, reservationId, serviceId, qty, service.price, service.price * qty);
        }
      }

      return NextResponse.json({ success: true, serviceId, price: service.price }, { status: 201, headers: CORS_HEADERS });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('POST /api/booking/services error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to process service booking' }, { status: 500, headers: CORS_HEADERS });
  }
}

function formatService(s: any) {
  return {
    id: s.id,
    name: s.name,
    nameEn: s.name_en,
    nameCs: s.name_cs,
    nameDe: s.name_de,
    description: s.description,
    price: s.price,
    currency: s.currency || 'CZK',
    unitLabel: s.unit_label,
    icon: s.icon,
    category: s.category,
    serviceType: s.service_type || 'simple',
    durationMinutes: s.duration_minutes,
    photoUrl: s.photo_override || s.photo_url,
    minQuantity: s.min_quantity || 0,
    maxQuantity: s.max_quantity || 10,
  };
}
