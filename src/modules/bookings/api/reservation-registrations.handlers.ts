/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { syncReservationGuestData } from '../../guests/data/registration.repo';
import { publicMessage } from '@core/security/public-error';

export async function listRegistrations(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    syncReservationGuestData(db, id);
    const rows = db.prepare(`
      SELECT gr.id as reg_id, gr.is_primary, gr.registered_at,
             g.id as guest_id, g.first_name, g.last_name, g.email, g.phone,
             g.document_type, g.document_number, g.date_of_birth,
             g.nationality, g.country, g.address
      FROM guest_registrations gr
      JOIN guests g ON gr.guest_id = g.id
      WHERE gr.reservation_id = ?
      ORDER BY gr.is_primary DESC, gr.created_at ASC
    `).all(id);
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function registerGuest(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const body = await request.json();

    const { firstName, lastName, dateOfBirth, documentType, documentNumber, nationality, country, address, isPrimary } = body;

    if (!firstName || !lastName || !documentNumber) {
      return NextResponse.json({ error: 'Missing required fields (name + document)' }, { status: 400 });
    }

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string };

    let guestId: string;
    const existingGuest = db.prepare(
      'SELECT id FROM guests WHERE document_number = ? AND organization_id = ?'
    ).get(documentNumber, org.id) as { id: string } | undefined;

    if (existingGuest) {
      guestId = existingGuest.id;
      db.prepare(`
        UPDATE guests SET first_name=?, last_name=?, date_of_birth=?, document_type=?,
        document_number=?, nationality=?, country=?, address=?, updated_at=datetime('now')
        WHERE id=?
      `).run(firstName, lastName, dateOfBirth || null, documentType || null,
        documentNumber, nationality || null, country || null, address || null, guestId);
    } else {
      guestId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      db.prepare(`
        INSERT INTO guests (id, organization_id, first_name, last_name, date_of_birth,
        document_type, document_number, nationality, country, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(guestId, org.id, firstName, lastName, dateOfBirth || null,
        documentType || null, documentNumber, nationality || null, country || null, address || null);
    }

    const existingReg = db.prepare(
      'SELECT id FROM guest_registrations WHERE reservation_id = ? AND guest_id = ?'
    ).get(id, guestId) as { id: string } | undefined;

    if (existingReg) {
      return NextResponse.json({ error: 'Guest already registered for this reservation' }, { status: 409 });
    }

    const regId = `gr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO guest_registrations (id, reservation_id, guest_id, is_primary, registered_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(regId, id, guestId, isPrimary ? 1 : 0);

    // Run bi-directional sync to update reservation_guests, guests, and registration_status
    syncReservationGuestData(db, id);

    return NextResponse.json({ id: regId, guestId }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function removeRegistration(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const regId = searchParams.get('reg_id');
    if (!regId) return NextResponse.json({ error: 'reg_id required' }, { status: 400 });

    db.prepare('DELETE FROM guest_registrations WHERE id = ? AND reservation_id = ?').run(regId, id);

    // Run bi-directional sync to update reservation_guests and registration_status
    syncReservationGuestData(db, id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
