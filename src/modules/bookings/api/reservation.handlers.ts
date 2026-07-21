/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateGuestToken } from '@core/db';
import { generateInvoiceForReservation } from '@finance';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { writeBookingAudit, getBookingActor, buildBookingLabel } from './audit-log.handlers';

export async function getReservation(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;

    const row = db.prepare(`
      SELECT
        r.*, r.guest_page_token, g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone, g.country as guest_country,
        u.name as unit_name, u.code as unit_code,
        c.name as category_name, c.type as category_type,
        ut.name as unit_type_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      WHERE r.id = ?
    `).get(id);

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Attach sub-bookings + line items
    const subBookings = db.prepare(`
      SELECT sb.*,
        cr.unit_id as child_unit_id,
        cr.payment_status as child_payment_status,
        cr.guest_page_token as child_guest_page_token,
        u2.name as child_unit_name, u2.code as child_unit_code
      FROM reservation_sub_bookings sb
      LEFT JOIN reservations cr ON sb.child_reservation_id = cr.id
      LEFT JOIN units u2 ON cr.unit_id = u2.id
      WHERE sb.reservation_id = ?
      ORDER BY sb.sort_order, sb.created_at
    `).all(id) as any[];

    const lineItemsStmt = db.prepare(
      'SELECT * FROM reservation_line_items WHERE sub_booking_id = ? ORDER BY sort_order'
    );
    const subBookingsWithItems = subBookings.map((sb: any) => ({
      ...sb,
      lineItems: lineItemsStmt.all(sb.id),
    }));

    // Count children
    const childCount = (db.prepare(
      'SELECT COUNT(*) as n FROM reservations WHERE parent_id = ?'
    ).get(id) as any).n;

    return NextResponse.json({
      ...row as any,
      subBookings: subBookingsWithItems,
      childReservationCount: childCount,
    });
  } catch (error: any) {
    console.error('GET /api/bookings/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch booking' }, { status: 500 });
  }
}

export async function updateReservation(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const body = await request.json();

    console.log('[PATCH] booking id:', id, 'body:', JSON.stringify(body));

    const allowed = [
      'unit_id', 'check_in', 'check_out', 'nights', 'adults', 'children', 'infants',
      'status', 'payment_status', 'source', 'total_price', 'commission_amount',
      'notes', 'internal_notes',
      'city_tax_amount', 'city_tax_included', 'city_tax_paid', 'registration_status',
      // Invoice-to-company override fields (PATCH from BookingViewModal)
      'invoice_company_name', 'invoice_company_ico', 'invoice_company_dic',
      'invoice_company_address', 'invoice_company_city', 'invoice_company_country',
      'invoice_company_email',
    ];
    const sets: string[] = [];
    const values: (string | number)[] = [];

    // Capture full row snapshot BEFORE the update for audit trail
    const beforeSnapshot = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);

    if (body.status === 'checked_in') {
      const current = db.prepare('SELECT payment_status, registration_status FROM reservations WHERE id = ?').get(id) as any;
      const payStatus = body.payment_status || current?.payment_status;
      const regStatus = current?.registration_status;

      if (!['paid', 'prepaid'].includes(payStatus)) {
        return NextResponse.json({ error: 'Неможливо заселити без повної оплати. Спочатку завершіть оплату.' }, { status: 422 });
      }
      if (regStatus !== 'registered') {
        return NextResponse.json({ error: 'Неможливо заселити без реєстрації гостей. Заповніть документи всіх гостей.' }, { status: 422 });
      }
    }

    // Snapshot BEFORE the UPDATE so the activity log can record the
    // previous unit. Reading after the UPDATE would just echo the new
    // value back at us.
    let prevUnitLabel: string | null = null;
    if (body.unit_id !== undefined) {
      const prevRow = db.prepare(
        'SELECT u.name AS unit_name, r.unit_id FROM reservations r LEFT JOIN units u ON u.id = r.unit_id WHERE r.id = ?',
      ).get(id) as { unit_name?: string; unit_id?: string } | undefined;
      prevUnitLabel = prevRow?.unit_name || prevRow?.unit_id || null;
    }

    // Overlap guard: if unit_id and/or date range is changing, make sure
    // the target unit is free across the (possibly new) dates. POST has
    // this check; PATCH historically did not, so unit reassignment via
    // edit forms or the room-allocation modal could silently double-book.
    // Staging pool units intentionally hold many bookings at once — skip
    // the check when the target unit is a pool.
    if (body.unit_id !== undefined || body.check_in !== undefined || body.check_out !== undefined) {
      const current = db.prepare(
        'SELECT unit_id, check_in, check_out FROM reservations WHERE id = ?',
      ).get(id) as { unit_id: string; check_in: string; check_out: string } | undefined;
      if (current) {
        const targetUnit = body.unit_id !== undefined ? body.unit_id : current.unit_id;
        const targetIn  = body.check_in   !== undefined ? body.check_in  : current.check_in;
        const targetOut = body.check_out  !== undefined ? body.check_out : current.check_out;
        const targetUnitRow = db.prepare('SELECT is_pool FROM units WHERE id = ?').get(targetUnit) as { is_pool?: number } | undefined;
        if (!targetUnitRow?.is_pool) {
          const overlap = db.prepare(`
            SELECT id FROM reservations
            WHERE unit_id = ? AND id <> ? AND status NOT IN ('cancelled', 'no_show')
              AND check_in < ? AND check_out > ?
            LIMIT 1
          `).get(targetUnit, id, targetOut, targetIn) as { id: string } | undefined;
          if (overlap) {
            return NextResponse.json(
              { error: 'Кімната зайнята на ці дати іншим бронюванням', conflictBookingId: overlap.id },
              { status: 409 },
            );
          }
        }
      }
    }

    for (const key of allowed) {
      if (body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(body[key]);
      }
    }

    if (body.status && (body.status === 'confirmed' || body.status === 'checked_in')) {
      const existing = db.prepare('SELECT guest_page_token FROM reservations WHERE id = ?').get(id) as any;
      if (!existing?.guest_page_token) {
        sets.push('guest_page_token = ?');
        values.push(generateGuestToken());
      }
    }

    // Generate guest token on demand (from mobile footer buttons)
    if (body.generate_guest_token) {
      const existing = db.prepare('SELECT guest_page_token FROM reservations WHERE id = ?').get(id) as any;
      if (!existing?.guest_page_token) {
        sets.push('guest_page_token = ?');
        values.push(generateGuestToken());
      }
    }

    // Track old payment_status for TG notification editing
    let oldPaymentStatus: string | null = null;
    if (body.payment_status) {
      const oldRes = db.prepare('SELECT payment_status FROM reservations WHERE id = ?').get(id) as any;
      oldPaymentStatus = oldRes?.payment_status || null;
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      values.push(id);
      const sql = `UPDATE reservations SET ${sets.join(', ')} WHERE id = ?`;
      console.log('[PATCH] SQL:', sql, 'values:', values);
      const result = db.prepare(sql).run(...values);
      console.log('[PATCH] result:', JSON.stringify(result));
    }

    // Emit payment status change event for TG notification editing
    if (body.payment_status && oldPaymentStatus !== body.payment_status) {
      import('@core/event-bus').then(({ eventBus }) => {
        eventBus.emit('booking.payment_status_changed', {
          bookingId: id,
          oldStatus: oldPaymentStatus || 'unpaid',
          newStatus: body.payment_status,
        });
      }).catch(() => {});
    }

    if (body.firstName || body.lastName || body.email || body.phone) {
      const res = db.prepare('SELECT guest_id FROM reservations WHERE id = ?').get(id) as any;
      if (res) {
        const guestSets: string[] = [];
        const guestVals: string[] = [];

        if (body.firstName) { guestSets.push('first_name = ?'); guestVals.push(body.firstName); }
        if (body.lastName) { guestSets.push('last_name = ?'); guestVals.push(body.lastName); }
        if (body.email) { guestSets.push('email = ?'); guestVals.push(body.email); }
        if (body.phone) { guestSets.push('phone = ?'); guestVals.push(body.phone); }

        if (guestSets.length > 0) {
          guestVals.push(res.guest_id);
          db.prepare(`UPDATE guests SET ${guestSets.join(', ')} WHERE id = ?`).run(...guestVals);
        }
      }
    }

    // --- Audit logging with user + before/after ---
    try {
      const actor = await getBookingActor();
      const afterRow = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
      const logActions: { action: string; details: string }[] = [];
      if (body.status) logActions.push({ action: 'status_change', details: `Статус → ${body.status}` });
      if (body.payment_status) logActions.push({ action: 'payment_status_change', details: `Оплата → ${body.payment_status}` });
      if (body.total_price !== undefined) logActions.push({ action: 'price_change', details: `Ціна → ${body.total_price} CZK` });
      if (body.unit_id !== undefined) {
        const nextRow = db.prepare('SELECT name FROM units WHERE id = ?').get(body.unit_id) as { name?: string } | undefined;
        const before = prevUnitLabel || '—';
        const after  = nextRow?.name || body.unit_id;
        logActions.push({ action: 'unit_change', details: `Юніт: ${before} → ${after}` });
      }
      if (body.check_in || body.check_out) logActions.push({ action: 'dates_change', details: `Дати: ${body.check_in || '—'} — ${body.check_out || '—'}` });
      if (body.notes !== undefined) logActions.push({ action: 'notes_change', details: 'Нотатки змінено' });
      if (body.internal_notes !== undefined) logActions.push({ action: 'internal_notes_change', details: 'Внутрішні нотатки змінено' });
      if (body.registration_status) logActions.push({ action: 'registration_change', details: `Реєстрація → ${body.registration_status}` });
      for (const log of logActions) {
        writeBookingAudit(db, id, log.action, log.details, actor, beforeSnapshot, afterRow);
      }
    } catch { /* non-critical */ }

    // Auto-generate invoice when payment_status is manually set to 'paid'.
    // Cash marked by the operator counts as confirmed; any other manual "paid"
    // (card/online without a Teya confirmation) stays unconfirmed and is excluded
    // from the monthly ISDOC export until reconciled.
    if (body.payment_status === 'paid') {
      const isCash = body.payment_method === 'cash';
      generateInvoiceForReservation(id, isCash ? { confirmed: true, source: 'cash' } : { confirmed: false, source: 'manual' });
    }

    // ── Cascade to child reservations ──
    // When master's status or payment_status changes, mirror to all children
    try {
      const cascadeFields: string[] = [];
      const cascadeValues: any[] = [];
      if (body.status) { cascadeFields.push('status = ?'); cascadeValues.push(body.status); }
      if (body.payment_status) { cascadeFields.push('payment_status = ?'); cascadeValues.push(body.payment_status); }
      if (body.check_in) { cascadeFields.push('check_in = ?'); cascadeValues.push(body.check_in); }
      if (body.check_out) { cascadeFields.push('check_out = ?'); cascadeValues.push(body.check_out); }
      if (body.nights) { cascadeFields.push('nights = ?'); cascadeValues.push(body.nights); }
      if (body.source) { cascadeFields.push('source = ?'); cascadeValues.push(body.source); }
      if (cascadeFields.length > 0) {
        cascadeFields.push("updated_at = datetime('now')");
        cascadeValues.push(id);
        db.prepare(
          `UPDATE reservations SET ${cascadeFields.join(', ')} WHERE parent_id = ?`
        ).run(...cascadeValues);
      }
    } catch (cascErr) { console.error('[PATCH] cascade to children error (non-fatal):', cascErr); }

    // Return updated booking with guest_page_token
    const updated = db.prepare('SELECT guest_page_token FROM reservations WHERE id = ?').get(id) as any;
    return NextResponse.json({ success: true, guest_page_token: updated?.guest_page_token || null });
  } catch (error: any) {
    console.error('PATCH /api/bookings/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to update booking' }, { status: 500 });
  }
}

export async function deleteReservation(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;

    // Capture snapshot + actor BEFORE deletion for audit
    const beforeSnapshot = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as any;
    const label = buildBookingLabel(db, id);
    const actor = await getBookingActor();

    db.transaction(() => {
      // 1. Unlink from CRM leads
      db.prepare('UPDATE crm_leads SET reservation_id = NULL WHERE reservation_id = ?').run(id);

      // 2. Delete related cart events (keep activity logs — no cascade)
      db.prepare('DELETE FROM cart_events WHERE reservation_id = ?').run(id);

      // 3. Delete service orders
      db.prepare('DELETE FROM service_orders WHERE reservation_id = ?').run(id);
      db.prepare('DELETE FROM booking_service_orders WHERE reservation_id = ?').run(id);

      // 4. Delete sub-booking structures (bundles)
      db.prepare(`
        DELETE FROM reservation_line_items 
        WHERE sub_booking_id IN (SELECT id FROM reservation_sub_bookings WHERE reservation_id = ?)
      `).run(id);
      db.prepare('DELETE FROM reservation_sub_bookings WHERE reservation_id = ? OR child_reservation_id = ?').run(id, id);

      // 5. Delete child reservations
      db.prepare('DELETE FROM reservations WHERE parent_id = ?').run(id);

      // 6. Finally delete the main reservation
      db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
    })();

    // Write audit AFTER deletion (FK removed in migration, so this works)
    writeBookingAudit(db, id, 'deleted', `Видалено: ${label}`, actor, beforeSnapshot, null, label);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/bookings/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to delete booking' }, { status: 500 });
  }
}
