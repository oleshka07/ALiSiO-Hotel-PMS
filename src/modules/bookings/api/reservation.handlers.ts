/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateGuestToken } from '@core/db';
import { generateInvoiceForReservation } from '@finance';

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

    return NextResponse.json(row);
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

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      values.push(id);
      const sql = `UPDATE reservations SET ${sets.join(', ')} WHERE id = ?`;
      console.log('[PATCH] SQL:', sql, 'values:', values);
      const result = db.prepare(sql).run(...values);
      console.log('[PATCH] result:', JSON.stringify(result));
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

    try {
      const logActions: { action: string; details: string }[] = [];
      if (body.status) logActions.push({ action: 'status_change', details: `Статус → ${body.status}` });
      if (body.payment_status) logActions.push({ action: 'payment_status_change', details: `Оплата → ${body.payment_status}` });
      if (body.total_price !== undefined) logActions.push({ action: 'price_change', details: `Ціна → ${body.total_price} CZK` });
      // Forensic trail for unit moves — without this we can't tell whether
      // a "stale unit in TG" report is a save failure, a duplicate-booking
      // edit, or a downstream cache.
      if (body.unit_id !== undefined) {
        const nextRow = db.prepare('SELECT name FROM units WHERE id = ?').get(body.unit_id) as { name?: string } | undefined;
        const before = prevUnitLabel || '—';
        const after  = nextRow?.name || body.unit_id;
        logActions.push({ action: 'unit_change', details: `Юніт: ${before} → ${after}` });
      }
      for (const log of logActions) {
        db.prepare("INSERT INTO booking_activity_log (id, reservation_id, action, details) VALUES (?, ?, ?, ?)")
          .run(`al_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, id, log.action, log.details);
      }
    } catch { /* non-critical */ }

    // Auto-generate invoice when payment_status is manually set to 'paid'
    if (body.payment_status === 'paid') {
      generateInvoiceForReservation(id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/bookings/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to update booking' }, { status: 500 });
  }
}

export async function deleteReservation(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;

    db.prepare('DELETE FROM reservations WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/bookings/[id] error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to delete booking' }, { status: 500 });
  }
}
