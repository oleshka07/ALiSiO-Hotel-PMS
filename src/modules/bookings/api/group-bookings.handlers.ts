/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { findOrCreateGuest } from '@guests';
import { notifyGroupBookingCreated } from '../domain/reservation-tg-notify';
import { publicMessage } from '@core/security/public-error';

export async function listGroupBookings() {
  try {
    const db = getDb();
    const groups = db.prepare(`
      SELECT rg.*,
        g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
        b.name as building_name, b.code as building_code,
        (SELECT COUNT(*) FROM reservations WHERE group_id = rg.id) as room_count
      FROM reservation_groups rg
      JOIN guests g ON rg.guest_id = g.id
      LEFT JOIN buildings b ON rg.building_id = b.id
      ORDER BY rg.created_at DESC
    `).all();
    return NextResponse.json(groups);
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function createGroupBooking(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const {
      firstName, lastName, email, phone,
      groupType, buildingId, unitIds,
      checkIn, checkOut, totalPrice, source, notes,
    } = body;

    if (!firstName || !lastName || !checkIn || !checkOut) {
      return NextResponse.json({ error: "Обов'язкові поля: ім'я, прізвище, дати" }, { status: 400 });
    }

    let finalUnitIds: string[] = unitIds || [];

    if (groupType === 'building' && buildingId) {
      const buildingUnits = db.prepare(
        'SELECT id FROM units WHERE building_id = ? AND is_active = 1 ORDER BY sort_order'
      ).all(buildingId) as { id: string }[];
      finalUnitIds = buildingUnits.map(u => u.id);
    }

    if (finalUnitIds.length === 0) {
      return NextResponse.json({ error: 'Не обрано жодної кімнати' }, { status: 400 });
    }

    // Pre-check overlap for ALL units up-front. Without this, the loop below
    // would either rely on the prevent_overbooking trigger (which aborts the
    // transaction mid-group, leaving partial state) or silently overbook if
    // units come from external sync sources that bypass it. Better to fail
    // the whole request with a clear conflict report than to half-create.
    const overlapPlaceholders = finalUnitIds.map(() => '?').join(',');
    const conflicts = db.prepare(`
      SELECT r.unit_id, u.code as unit_code, u.name as unit_name,
             r.id as conflict_id, r.check_in, r.check_out, r.status
      FROM reservations r
      JOIN units u ON u.id = r.unit_id
      WHERE r.unit_id IN (${overlapPlaceholders})
        AND r.status NOT IN ('cancelled', 'no_show')
        AND r.check_in < ? AND r.check_out > ?
    `).all(...finalUnitIds, checkOut, checkIn) as any[];
    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          error: 'Один або кілька юнітів вже зайняті на ці дати',
          conflicts: conflicts.map((c) => ({
            unitCode: c.unit_code,
            unitName: c.unit_name,
            conflictReservationId: c.conflict_id,
            checkIn: c.check_in,
            checkOut: c.check_out,
            status: c.status,
          })),
        },
        { status: 409 },
      );
    }

    const nights = Math.max(1, Math.floor(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
    ));

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    const firstUnit = db.prepare('SELECT property_id FROM units WHERE id = ?').get(finalUnitIds[0]) as any;
    if (!firstUnit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 400 });
    }

    const guestId = findOrCreateGuest({
      organizationId: org.id,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
    }).id;

    const groupId = `grp_${Date.now()}`;
    db.prepare(`
      INSERT INTO reservation_groups (id, property_id, guest_id, group_type, building_id, check_in, check_out, nights, total_price, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(groupId, firstUnit.property_id, guestId, groupType || 'custom', buildingId || null, checkIn, checkOut, nights, totalPrice || 0, source || 'direct', notes || null);

    const pricePerUnit = finalUnitIds.length > 0 ? Math.round((totalPrice || 0) / finalUnitIds.length) : 0;
    const insertRes = db.prepare(`
      INSERT INTO reservations (id, property_id, unit_id, guest_id, group_id, check_in, check_out, nights, adults, children, status, payment_status, source, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdResIds: string[] = [];
    for (let i = 0; i < finalUnitIds.length; i++) {
      const resId = `r_${Date.now()}_${i}`;
      insertRes.run(resId, firstUnit.property_id, finalUnitIds[i], guestId, groupId, checkIn, checkOut, nights, 1, 0, 'confirmed', 'unpaid', source || 'direct', pricePerUnit);
      createdResIds.push(resId);
    }

    notifyGroupBookingCreated({
      reservationIds: createdResIds,
      sourceLabel: `Групове · ${source || 'direct'}`,
      guestName: `${firstName} ${lastName}`,
      checkIn,
      checkOut,
      totalPrice: totalPrice || 0,
      currency: 'CZK',
    });

    return NextResponse.json({ id: groupId, guestId, roomCount: finalUnitIds.length }, { status: 201 });
  } catch (e: any) {
    console.error('POST /api/group-bookings error:', e);
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
