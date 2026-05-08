/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function createBookingDraftOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ─── Helper: generate a short token ─────────────────────────────────────────
function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function genToken(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ─── POST — create draft + real PMS reservation ──────────────────────────────
export async function createBookingDraft(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();

    const draftId = genId('bkd');
    const sessionId = body.session_id || genId('sess');

    // 1. Save booking_draft (always — as a log)
    db.prepare(`
      INSERT INTO booking_drafts (id, session_id, accommodation_type, unit_type, check_in, check_out,
        adults, children, extras, options, guest_name, guest_email, guest_phone,
        total_price, deposit_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(
      draftId, sessionId,
      body.accommodation_type || null,
      body.accommodation_data?.unit || body.accommodation_data?.building || null,
      body.check_in || null,
      body.check_out || null,
      body.accommodation_data?.adults || 1,
      body.accommodation_data?.children || 0,
      JSON.stringify(body.extras || []),
      JSON.stringify(body.accommodation_data || {}),
      body.guest_name || null,
      body.guest_email || null,
      body.guest_phone || null,
      body.total_price || 0,
      body.deposit_amount || 0,
    );

    // 2. Find or create Guest in PMS
    const [firstName, ...rest] = (body.guest_name || 'Guest').trim().split(' ');
    const lastName = rest.join(' ') || '';

    // Get first property's organization_id
    const property = db.prepare(`SELECT id, organization_id FROM properties LIMIT 1`).get() as any;
    if (!property) {
      console.warn('[BookingDraft] No property found — returning draft only');
      return NextResponse.json({ id: draftId, session_id: sessionId }, { headers: CORS_HEADERS });
    }

    let guestId: string | null = null;
    const existingGuest = body.guest_email
      ? (db.prepare(`SELECT id FROM guests WHERE organization_id = ? AND email = ? LIMIT 1`).get(property.organization_id, body.guest_email) as any)
      : null;

    if (existingGuest) {
      guestId = existingGuest.id;
      // Update phone if provided
      if (body.guest_phone) {
        db.prepare(`UPDATE guests SET phone = COALESCE(phone, ?), updated_at = datetime('now') WHERE id = ?`)
          .run(body.guest_phone, guestId);
      }
    } else {
      guestId = genId('g');
      db.prepare(`
        INSERT INTO guests (id, organization_id, first_name, last_name, email, phone, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'widget_kemp', datetime('now'))
      `).run(guestId, property.organization_id, firstName, lastName, body.guest_email || null, body.guest_phone || null);
    }

    // 3. Find a suitable unit
    const accommodationType: string = body.accommodation_type || 'camping';
    let unitId: string | null = null;

    if (accommodationType === 'camping') {
      const campingUnit = db.prepare(`
        SELECT u.id FROM units u
        JOIN unit_types ut ON u.unit_type_id = ut.id
        WHERE u.property_id = ? AND u.is_active = 1
          AND (LOWER(ut.code) LIKE '%camp%' OR LOWER(ut.name) LIKE '%camp%'
               OR LOWER(u.name) LIKE '%camp%' OR LOWER(ut.code) = 'bb'
               OR LOWER(ut.code) = 'fr' OR LOWER(ut.code) = 'br')
        ORDER BY u.sort_order, u.name
        LIMIT 1
      `).get(property.id) as any;
      unitId = campingUnit?.id || null;
    } else if (accommodationType === 'glamping') {
      const unitCode = (body.accommodation_data?.unit === 'barn') ? 'barn' : 'tiny';
      const glamUnit = db.prepare(`
        SELECT u.id FROM units u
        JOIN unit_types ut ON u.unit_type_id = ut.id
        WHERE u.property_id = ? AND u.is_active = 1
          AND (LOWER(ut.code) LIKE '%glamp%' OR LOWER(ut.name) LIKE '%glamp%'
               OR LOWER(u.name) LIKE ? OR LOWER(ut.code) LIKE ?)
        ORDER BY u.sort_order LIMIT 1
      `).get(property.id, `%${unitCode}%`, `%${unitCode}%`) as any;
      unitId = glamUnit?.id || null;
    }

    // Ultimate fallback: any unit at all (so we never fail with NOT NULL constraint)
    if (!unitId) {
      const anyUnit = db.prepare(`SELECT id FROM units WHERE property_id = ? AND is_active = 1 ORDER BY sort_order LIMIT 1`).get(property.id) as any;
      unitId = anyUnit?.id || null;
    }

    // If still no unit — abort gracefully (return draft without PMS reservation)
    if (!unitId) {
      console.warn('[BookingDraft] No units found — returning draft only');
      db.prepare(`UPDATE booking_drafts SET guest_page_token = ? WHERE id = ?`).run(genToken(32), draftId);
      const d = db.prepare('SELECT * FROM booking_drafts WHERE id = ?').get(draftId) as any;
      return NextResponse.json({ id: draftId, session_id: sessionId, reservation_id: null, guest_page_token: d?.guest_page_token }, { headers: CORS_HEADERS });
    }

    // 4. Calculate nights
    const nights = (() => {
      if (!body.check_in || !body.check_out) return 1;
      const d1 = new Date(body.check_in);
      const d2 = new Date(body.check_out);
      return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
    })();

    // 5. Create Reservation in PMS
    const reservationId = genId('r');
    const guestPageToken = genToken(32);

    db.prepare(`
      INSERT INTO reservations (
        id, property_id, unit_id, guest_id, source,
        check_in, check_out, nights,
        adults, children,
        total_price, currency,
        status, payment_status,
        guest_page_token,
        notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, 'widget_kemp',
        ?, ?, ?,
        ?, ?,
        ?, 'CZK',
        'tentative', 'unpaid',
        ?,
        ?, datetime('now'), datetime('now')
      )
    `).run(
      reservationId,
      property.id,
      unitId,
      guestId,
      body.check_in || null,
      body.check_out || null,
      nights,
      body.accommodation_data?.adults || 1,
      body.accommodation_data?.children || 0,
      body.total_price || 0,
      guestPageToken,
      body.accommodation_data ? `Type: ${accommodationType}, Options: ${JSON.stringify(body.accommodation_data)}` : null,
    );

    // Link draft → reservation + save token in draft
    db.prepare(`UPDATE booking_drafts SET reservation_id = ?, guest_page_token = ? WHERE id = ?`).run(reservationId, guestPageToken, draftId);

    // 6. Create service_orders for extras
    const extras: any[] = body.extras || [];
    for (const extra of extras) {
      if (!extra.id || !extra.price) continue;
      const orderId = genId('so');
      try {
        db.prepare(`
          INSERT INTO service_orders (
            id, reservation_id, service_id, quantity, total_price,
            status, payment_status, service_date, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, 'pending', 'unpaid', ?, 'Booked via widget', datetime('now'))
        `).run(orderId, reservationId, extra.id, extra.quantity || 1, extra.price || 0, body.check_in || null);
      } catch (e: any) {
        // service_orders table might use different schema — try booking_service_orders
        try {
          db.prepare(`
            INSERT INTO booking_service_orders (
              id, reservation_id, service_id, quantity, unit_price, total_price,
              status, payment_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unpaid', datetime('now'))
          `).run(orderId, reservationId, extra.id, extra.quantity || 1,
            (extra.price / (extra.quantity || 1)) || 0, extra.price || 0);
        } catch { /* ignore if neither table exists */ }
      }
    }

    console.log(`[BookingDraft] Created draft=${draftId} reservation=${reservationId} guest=${guestId}`);

    return NextResponse.json({
      id: draftId,
      session_id: sessionId,
      reservation_id: reservationId,
      guest_page_token: guestPageToken,
    }, { headers: CORS_HEADERS });

  } catch (err: any) {
    console.error('[BookingDraft] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// ─── PUT — admin confirm payment ─────────────────────────────────────────────
// Admin PINs — server-side only, never sent to client
const ADMIN_PINS: Record<string, string> = {
  '1315': 'Андрей',
  '2099': 'т. Наташа',
  '0309': 'Олег',
  '0912': 'Антон',
};

export async function updateBookingDraft(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();
    const { id, status, reservation_id: directResId, admin_pin } = body;
    if (!id && !directResId) return NextResponse.json({ error: 'Missing id or reservation_id' }, { status: 400, headers: CORS_HEADERS });

    // ─── PIN validation (required for status = 'paid') ────────────────────
    let adminName: string | null = null;
    if (status === 'paid') {
      if (!admin_pin) {
        return NextResponse.json({ error: 'PIN required', code: 'PIN_REQUIRED' }, { status: 401, headers: CORS_HEADERS });
      }
      adminName = ADMIN_PINS[String(admin_pin).trim()] || null;
      if (!adminName) {
        console.warn(`[AdminConfirm] Invalid PIN attempt: ${String(admin_pin).substring(0, 2)}**`);
        return NextResponse.json({ error: 'Невірний PIN-код. Зверніться до адміністратора.', code: 'WRONG_PIN' }, { status: 401, headers: CORS_HEADERS });
      }
    }

    // ─── Resolve reservation ID ────────────────────────────────────────────
    let rid: string | null = directResId || null;
    if (!rid && id) {
      const draft = db.prepare('SELECT reservation_id FROM booking_drafts WHERE id = ?').get(id) as any;
      rid = draft?.reservation_id || null;
      if (!rid) {
        const res = db.prepare('SELECT id FROM reservations WHERE id = ?').get(id) as any;
        rid = res?.id || null;
      }
    }

    // ─── Confirm payment ───────────────────────────────────────────────────
    if (status === 'paid' && rid) {
      const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Prague' });
      const note = `✅ Оплату прийняв: ${adminName} · ${now}`;

      db.prepare(`
        UPDATE reservations
        SET payment_status = 'paid',
            status = 'confirmed',
            internal_notes = CASE
              WHEN internal_notes IS NULL OR internal_notes = '' THEN ?
              ELSE internal_notes || char(10) || ?
            END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(note, note, rid);

      try { db.prepare(`UPDATE service_orders SET payment_status = 'paid', status = 'confirmed' WHERE reservation_id = ?`).run(rid); } catch { /* */ }
      try { db.prepare(`UPDATE booking_service_orders SET payment_status = 'paid', status = 'confirmed' WHERE reservation_id = ?`).run(rid); } catch { /* */ }

      // ─── Audit log ──────────────────────────────────────────────────────
      try {
        const orgRow = db.prepare('SELECT organization_id FROM properties LIMIT 1').get() as any;
        const orgId = orgRow?.organization_id || 'org_alisio_001';
        db.prepare(`
          INSERT INTO audit_log (organization_id, action, entity_type, entity_id, new_values, created_at)
          VALUES (?, 'payment_confirmed', 'reservation', ?, ?, datetime('now'))
        `).run(orgId, rid, JSON.stringify({ confirmed_by: adminName, reservation_id: rid, status: 'paid' }));
      } catch { /* audit_log might not exist */ }

      console.log(`[AdminConfirm] Reservation ${rid} confirmed by ${adminName}`);
    }

    // ─── Update draft status ───────────────────────────────────────────────
    if (id) {
      try { db.prepare(`UPDATE booking_drafts SET status = ? WHERE id = ?`).run(status, id); } catch { /* */ }
    }

    return NextResponse.json({ ok: true, reservation_id: rid, admin_name: adminName }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function getBookingDraft(req: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const id = searchParams.get('id');

    let draft: any;
    if (sessionId) {
      draft = db.prepare('SELECT * FROM booking_drafts WHERE session_id = ?').get(sessionId);
    } else if (id) {
      draft = db.prepare('SELECT * FROM booking_drafts WHERE id = ?').get(id);
    }

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404, headers: CORS_HEADERS });
    }

    return NextResponse.json(draft, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function deleteBookingDraft(req: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers: CORS_HEADERS });

    db.prepare('DELETE FROM booking_drafts WHERE id = ?').run(id);
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
