/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateGuestToken } from '@core/db';
import { findOrCreateGuest } from '@guests';
import { notifyReservationCreated } from '../domain/reservation-tg-notify';
import { writeBookingAudit, getBookingActor } from './audit-log.handlers';

export async function listReservations(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const search = searchParams.get('search') || '';
    const excludeChildren = searchParams.get('exclude_children') === '1';

    let query = `
      SELECT
        r.id, r.check_in, r.check_out, r.nights, r.adults, r.children,
        r.status, r.payment_status, r.source, r.total_price, r.currency, r.notes, r.internal_notes, r.created_at, r.guest_page_token,
        r.group_id, r.parent_id, r.commission_amount,
        r.city_tax_amount, r.city_tax_included, r.city_tax_paid,
        r.registration_status, r.hostex_channel_type, r.hostex_reservation_code,
        r.is_multi_room, r.multi_room_marker,
        r.utm_source, r.utm_medium, r.utm_campaign, r.utm_term, r.utm_content,
        (SELECT COUNT(*) FROM reservation_sub_bookings WHERE reservation_id = r.id) as sub_booking_count,
        g.id as guest_id, g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone, g.nationality,
        u.id as unit_id, u.name as unit_name, u.code as unit_code, u.is_pool as unit_is_pool,
        c.id as category_id, c.name as category_name, c.type as category_type,
        ut.id as unit_type_id, ut.name as unit_type_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      WHERE 1=1
    `;

    const params: string[] = [];

    // Hide child reservations on Bookings list page, but show them on Calendar
    if (excludeChildren) {
      query += ' AND r.parent_id IS NULL';
    }

    const excludeCancelled = searchParams.get('exclude_cancelled') === '1';
    if (excludeCancelled) {
      query += " AND r.status NOT IN ('cancelled', 'no_show')";
    } else if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }

    if (category) {
      query += ' AND c.type = ?';
      params.push(category);
    }

    if (search) {
      query += ` AND (
        g.first_name LIKE ? OR g.last_name LIKE ? OR
        (g.first_name || ' ' || g.last_name) LIKE ? OR
        u.name LIKE ? OR u.code LIKE ? OR r.id LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like, like, like, like);
    }

    const paymentStatus = searchParams.get('payment_status') || '';
    if (paymentStatus) {
      query += ' AND r.payment_status = ?';
      params.push(paymentStatus);
    }

    const dateFrom = searchParams.get('date_from') || '';
    if (dateFrom) {
      query += ' AND r.check_in >= ?';
      params.push(dateFrom);
    }

    const dateTo = searchParams.get('date_to') || '';
    if (dateTo) {
      query += ' AND r.check_in <= ?';
      params.push(dateTo);
    }

    // Hide bookings already checked out before given date. Use this for
    // "current + upcoming" lists where stale departures are noise.
    const checkOutFrom = searchParams.get('check_out_from') || '';
    if (checkOutFrom) {
      query += ' AND r.check_out >= ?';
      params.push(checkOutFrom);
    }

    const sourceFilter = searchParams.get('source') || '';
    if (sourceFilter) {
      if (sourceFilter === 'widget') {
        query += " AND (r.source = 'widget' OR r.source LIKE 'widget:%')";
      } else {
        query += ' AND r.source = ?';
        params.push(sourceFilter);
      }
    }

    // Filter by specific unit (e.g. pool unit for staging strip)
    const unitIdFilter = searchParams.get('unit_id') || '';
    if (unitIdFilter) {
      query += ' AND r.unit_id = ?';
      params.push(unitIdFilter);
    }

    query += ' ORDER BY r.check_in ASC';

    const rows = db.prepare(query).all(...params);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/bookings error:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}

export async function createReservation(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();

    const {
      firstName, lastName, email, phone,
      unitId, checkIn, checkOut, nights,
      adults, children, status, source, totalPrice,
      commissionAmount: commissionOverride,
      cityTaxAmount, cityTaxIncluded, cityTaxPaid,
      internalNotes,
    } = body;

    if (!firstName || !lastName || !unitId || !checkIn || !checkOut) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const unit = db.prepare('SELECT property_id, category_id FROM units WHERE id = ?').get(unitId) as { property_id: string; category_id: string } | undefined;
    if (!unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const overlap = db.prepare(`
      SELECT 1 FROM reservations
      WHERE unit_id = ? AND status NOT IN ('cancelled', 'no_show')
        AND check_in < ? AND check_out > ?
      LIMIT 1
    `).get(unitId, checkOut, checkIn);
    if (overlap) {
      return NextResponse.json({ error: 'This unit is already booked for the selected dates' }, { status: 409 });
    }

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string };

    const dedup = findOrCreateGuest({
      organizationId: org.id,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
    });
    const guestId = dedup.id;

    const resId = `r_${Date.now()}`;
    let commissionAmount = 0;
    if (commissionOverride !== undefined && commissionOverride !== null) {
      commissionAmount = Number(commissionOverride);
    } else if (source) {
      const bsRow = db.prepare('SELECT commission_percent FROM booking_sources WHERE code = ?').get(source) as { commission_percent: number } | undefined;
      if (bsRow && bsRow.commission_percent > 0) {
        commissionAmount = Math.round((totalPrice || 0) * bsRow.commission_percent / 100);
      }
    }

    const finalCityTaxAmount = cityTaxAmount !== undefined ? Number(cityTaxAmount) : 0;
    const finalCityTaxIncluded = cityTaxIncluded ? 1 : 0;
    const finalCityTaxPaid = cityTaxPaid || 'pending';

    const bookingStatus = status || 'confirmed';
    const guestPageToken = (bookingStatus === 'confirmed' || bookingStatus === 'checked_in') ? generateGuestToken() : null;

    db.prepare(`
      INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights, adults, children, status, payment_status, source, total_price, commission_amount, guest_page_token, city_tax_amount, city_tax_included, city_tax_paid, internal_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(resId, unit.property_id, unitId, guestId, checkIn, checkOut, nights || 1, adults || 1, children || 0, bookingStatus, body.paymentStatus || 'unpaid', source || 'direct', totalPrice || 0, commissionAmount, guestPageToken, finalCityTaxAmount, finalCityTaxIncluded, finalCityTaxPaid, internalNotes || null);

    // Auto-link to CRM lead
    try {
      const crmLeadId = body.crmLeadId;
      let linkedLeadId: string | null = null;

      if (crmLeadId) {
        const lead = db.prepare('SELECT id FROM crm_leads WHERE id = ?').get(crmLeadId) as { id: string } | undefined;
        if (lead) linkedLeadId = lead.id;
      }

      if (!linkedLeadId && email) {
        const lead = db.prepare(
          "SELECT id FROM crm_leads WHERE email = ? AND organization_id = ? AND reservation_id IS NULL ORDER BY updated_at DESC LIMIT 1"
        ).get(email, org.id) as { id: string } | undefined;
        if (lead) linkedLeadId = lead.id;
      }

      if (linkedLeadId) {
        db.prepare(`
          UPDATE crm_leads
          SET reservation_id = ?, guest_id = ?, stage = 'booked',
              updated_at = datetime('now')
          WHERE id = ?
        `).run(resId, guestId, linkedLeadId);
        console.log(`[Booking] Linked reservation ${resId} to CRM lead ${linkedLeadId}`);
      }
    } catch (linkErr) {
      console.error('[Booking] CRM link error (non-fatal):', linkErr);
    }

    notifyReservationCreated(resId, { sourceLabel: `Ручне додавання · ${source || 'direct'}` });

    // Audit log
    try {
      const actor = await getBookingActor();
      const afterRow = db.prepare('SELECT * FROM reservations WHERE id = ?').get(resId);
      writeBookingAudit(db, resId, 'created', `Створено: ${firstName} ${lastName} · ${source || 'direct'}`, actor, null, afterRow);
    } catch { /* non-critical */ }

    return NextResponse.json({ id: resId, guestId, guestPageToken }, { status: 201 });
  } catch (error) {
    console.error('POST /api/bookings error:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
