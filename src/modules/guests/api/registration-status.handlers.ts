/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { checkRateLimit } from '@/lib/rate-limit';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * GET /api/guest/[token]/registration-status
 * Returns reservation summary + per-guest registration status.
 * Used by the kemp-carlsbad.cz /registration page.
 */
export async function getRegistrationStatus(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const db = getDb();

    // Resolve reservation by token
    const reservation = db.prepare(`
      SELECT r.id, r.adults, r.children, r.check_in, r.check_out, r.status,
             r.registration_status, r.total_price, r.currency,
             g.first_name, g.last_name, g.email, g.phone,
             u.name as unit_name, ut.name as unit_type_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      WHERE r.guest_page_token = ?
        AND r.status NOT IN ('cancelled', 'no_show')
    `).get(token) as any;

    if (!reservation) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // Fetch existing registrations with reg_status
    const existingGuests = db.prepare(`
      SELECT gr.id, gr.guest_id, gr.is_primary, gr.reg_status, gr.doc_photo_url,
             g.first_name, g.last_name, g.date_of_birth, g.document_type,
             g.document_number, g.country as nationality, g.address
      FROM guest_registrations gr
      JOIN guests g ON gr.guest_id = g.id
      WHERE gr.reservation_id = ?
      ORDER BY gr.is_primary DESC, gr.created_at ASC
    `).all(reservation.id) as any[];

    const guestCount = reservation.adults + (reservation.children || 0);
    const completedCount = existingGuests.filter((g: any) => g.reg_status === 'completed').length;

    return NextResponse.json({
      reservationId: reservation.id,
      checkIn: reservation.check_in,
      checkOut: reservation.check_out,
      unitName: reservation.unit_name,
      unitTypeName: reservation.unit_type_name,
      totalPrice: reservation.total_price,
      currency: reservation.currency,
      guestCount,
      adults: reservation.adults,
      children: reservation.children || 0,
      registrationStatus: reservation.registration_status,
      completedCount,
      primaryGuest: {
        firstName: reservation.first_name,
        lastName: reservation.last_name,
        email: reservation.email,
        phone: reservation.phone,
      },
      guests: existingGuests,
    }, { status: 200, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[RegistrationStatus] GET error:', error?.message);
    return NextResponse.json(
      { error: 'Failed to fetch registration status' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

/**
 * PATCH /api/guest/[token]/registration-status
 * Saves a partial guest draft (reg_status = 'draft').
 * Does NOT enforce required fields — allows incremental saving.
 */
export async function saveDraftRegistration(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const db = getDb();

    // Rate limit: 10 drafts per 5 min per token
    const rl = checkRateLimit(token, 'registration', 10, 5);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a few minutes.' },
        { status: 429, headers: CORS_HEADERS },
      );
    }

    const reservation = db.prepare(`
      SELECT r.id, r.adults, r.children, r.guest_id, p.organization_id,
             g.first_name, g.last_name, g.email, g.phone
      FROM reservations r
      JOIN properties p ON r.property_id = p.id
      JOIN guests g ON r.guest_id = g.id
      WHERE r.guest_page_token = ?
        AND r.status NOT IN ('cancelled', 'no_show')
    `).get(token) as any;

    if (!reservation) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const body = await request.json();
    const { guestIndex, guestData } = body as {
      guestIndex: number; // 0-based index
      guestData: Record<string, any>;
    };

    if (typeof guestIndex !== 'number' || !guestData) {
      return NextResponse.json(
        { error: 'guestIndex (number) and guestData (object) are required' },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const isPrimary = guestIndex === 0 ? 1 : 0;

    // For primary guest, use booking contact data as fallback
    const firstName = guestData.firstName || (isPrimary ? reservation.first_name : '');
    const lastName = guestData.lastName || (isPrimary ? reservation.last_name : '');

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'firstName and lastName are required even for drafts' },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Upsert guest record
    const existing = db.prepare(
      `SELECT id FROM guests WHERE organization_id = ? AND LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?) LIMIT 1`
    ).get(reservation.organization_id, firstName, lastName) as any;

    let guestId: string;
    if (existing) {
      guestId = existing.id;
      db.prepare(
        `UPDATE guests SET date_of_birth = COALESCE(?, date_of_birth), country = COALESCE(?, country),
         document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number),
         updated_at = datetime('now') WHERE id = ?`
      ).run(
        guestData.dateOfBirth ?? null,
        guestData.nationality ?? null,
        guestData.documentType ?? null,
        guestData.documentNumber ?? null,
        guestId,
      );
    } else {
      const result = db.prepare(
        `INSERT INTO guests (organization_id, first_name, last_name, date_of_birth, country, document_type, document_number)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        reservation.organization_id, firstName, lastName,
        guestData.dateOfBirth ?? null, guestData.nationality ?? null,
        guestData.documentType ?? null, guestData.documentNumber ?? null,
      );
      const newGuest = db.prepare('SELECT id FROM guests WHERE rowid = ?').get(result.lastInsertRowid) as any;
      guestId = newGuest.id;
    }

    // Upsert guest_registrations with reg_status = 'draft'
    const existingReg = db.prepare(
      `SELECT id FROM guest_registrations WHERE reservation_id = ? AND is_primary = ?`
    ).get(reservation.id, isPrimary) as any;

    if (existingReg) {
      db.prepare(
        `UPDATE guest_registrations
         SET guest_id = ?, reg_status = 'draft', purpose_of_stay = COALESCE(?, purpose_of_stay),
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(guestId, guestData.purposeOfStay ?? null, existingReg.id);
    } else {
      const grId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO guest_registrations (id, reservation_id, guest_id, is_primary, reg_status, registered_at, consent_given, consent_at, purpose_of_stay)
         VALUES (?, ?, ?, ?, 'draft', datetime('now'), 0, datetime('now'), ?)`
      ).run(grId, reservation.id, guestId, isPrimary, guestData.purposeOfStay ?? null);
    }

    return NextResponse.json(
      { success: true, message: 'Draft saved', guestIndex },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (error: any) {
    console.error('[RegistrationStatus] PATCH error:', error?.message);
    return NextResponse.json(
      { error: error?.message || 'Failed to save draft' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export function handleOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
