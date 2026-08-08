/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function assignGuest(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: groupId } = await params;
    const db = getDb();
    const body = await request.json();
    const { reservationId, firstName, lastName, email, phone } = body;

    if (!reservationId || !firstName || !lastName) {
      return NextResponse.json({ error: "Обов'язкові поля: reservationId, ім'я, прізвище" }, { status: 400 });
    }

    const reservation = db.prepare(
      'SELECT id, guest_id FROM reservations WHERE id = ? AND group_id = ?'
    ).get(reservationId, groupId) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found in this group' }, { status: 404 });
    }

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;

    let guestId: string;
    if (email) {
      const existing = db.prepare('SELECT id FROM guests WHERE email = ? AND organization_id = ?').get(email, org.id) as any;
      if (existing) {
        guestId = existing.id;
        db.prepare('UPDATE guests SET first_name = ?, last_name = ?, phone = COALESCE(?, phone), updated_at = datetime(\'now\') WHERE id = ?')
          .run(firstName, lastName, phone || null, guestId);
      } else {
        guestId = `g_${Date.now()}`;
        db.prepare('INSERT INTO guests (id, organization_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)')
          .run(guestId, org.id, firstName, lastName, email, phone || null);
      }
    } else {
      guestId = `g_${Date.now()}`;
      db.prepare('INSERT INTO guests (id, organization_id, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)')
        .run(guestId, org.id, firstName, lastName, phone || null);
    }

    db.prepare('UPDATE reservations SET guest_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(guestId, reservationId);

    return NextResponse.json({ success: true, guestId });
  } catch (e: any) {
    console.error('POST /api/group-bookings/[id]/assign-guest error:', e);
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
