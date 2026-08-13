/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Telegram bot ↔ Bookings bridge.
//
// The receptionist works from a phone, in a Telegram chat, standing next to the
// guest. These endpoints are the whole vocabulary that flow needs: what arrives
// today, what one booking looks like, change it, take the money, check them in,
// cancel, and what never showed up.
//
// The bot stays a thin keyboard over this — same division as the day-log, where
// handlers/daylog.py is 2.6 KB because every decision lives in the PMS.
//
// Auth is the shared TELEGRAM_BRIDGE_TOKEN, like the finance and registration
// bridges: the bot has no user session.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';
import { calculateQuote } from '@/modules/pricing/data/quote.repo';

function authorizeBridge(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expected = process.env.TELEGRAM_BRIDGE_TOKEN;
  if (!expected) {
    return { ok: false, response: NextResponse.json({ error: 'Bridge not configured' }, { status: 503 }) };
  }
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.substring(7) : '';
  if (!token || token !== expected) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid bridge token' }, { status: 401 }) };
  }
  return { ok: true };
}

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** One booking, shaped for a Telegram card. */
const CARD_SQL = `
  SELECT r.id, r.check_in, r.check_out, r.nights, r.adults, r.children,
         r.status, r.payment_status, r.payment_method, r.registration_status,
         r.total_price, r.currency, r.source, r.camping_electricity,
         r.unit_id, r.notes,
         u.code AS unit_code, u.name AS unit_name, u.unit_type_id,
         ut.name AS unit_type_name,
         TRIM(COALESCE(g.first_name,'') || ' ' || COALESCE(g.last_name,'')) AS guest,
         g.phone AS guest_phone, g.email AS guest_email,
         (SELECT COUNT(*) FROM reservation_guests rg WHERE rg.reservation_id = r.id) AS guests_registered
  FROM reservations r
  LEFT JOIN units u ON u.id = r.unit_id
  LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
  LEFT JOIN guests g ON g.id = r.guest_id
`;

function card(row: any) {
  if (!row) return null;
  const paid = row.payment_status === 'paid' || row.payment_status === 'prepaid';
  const registered = row.registration_status === 'registered';
  return {
    id: row.id,
    guest: row.guest || '—',
    phone: row.guest_phone, email: row.guest_email,
    unit: row.unit_code || row.unit_name || '—',
    unitTypeId: row.unit_type_id,
    unitType: row.unit_type_name,
    checkIn: row.check_in, checkOut: row.check_out, nights: row.nights,
    adults: row.adults, children: row.children,
    electricity: !!row.camping_electricity,
    totalPrice: row.total_price, currency: row.currency || 'CZK',
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    registrationStatus: row.registration_status,
    guestsRegistered: row.guests_registered,
    source: row.source,
    paid, registered,
    // The two conditions the PMS enforces on check-in, precomputed so the bot
    // can grey out the button instead of offering an action that will 422.
    canCheckIn: paid && registered && row.status !== 'checked_in' && row.status !== 'cancelled',
    blockedBy: [
      ...(paid ? [] : ['оплата']),
      ...(registered ? [] : ['реєстрація гостей']),
    ],
  };
}

// ── GET /today ──────────────────────────────────────────────────────────────
// Everything arriving today, whatever its state. Unpaid tentative bookings are
// the ones that need a person, so excluding them — as the registration bridge
// used to — hid exactly the work this flow exists for.
export async function listTodayBookings(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const rows = db.prepare(`${CARD_SQL}
      WHERE r.check_in = ? AND r.status NOT IN ('cancelled', 'no_show')
      ORDER BY (r.status = 'checked_in'), u.code`).all(today) as any[];
    return NextResponse.json({ date: today, count: rows.length, bookings: rows.map(card) });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── GET /booking?id= ────────────────────────────────────────────────────────
export async function getBookingCard(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return fail('id is required');
    const row = getDb().prepare(`${CARD_SQL} WHERE r.id = ?`).get(id) as any;
    if (!row) return fail('Бронювання не знайдено', 404);
    return NextResponse.json({ booking: card(row) });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── POST /adjust ────────────────────────────────────────────────────────────
// Change nights, guest counts or electricity, and re-price. Refuses once money
// has been taken: re-pricing a paid booking silently would leave the guest owing
// or owed an amount nobody recorded.
export async function adjustBooking(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const { reservation_id, nights, adults, children, electricity } = body;
    if (!reservation_id) return fail('reservation_id is required');

    const db = getDb();
    const res = db.prepare(`${CARD_SQL} WHERE r.id = ?`).get(reservation_id) as any;
    if (!res) return fail('Бронювання не знайдено', 404);
    if (res.status === 'cancelled') return fail('Бронювання скасовано', 409);
    if (res.payment_status === 'paid' || res.payment_status === 'prepaid') {
      return fail('Бронювання вже оплачене — зміна суми потребує повернення або доплати вручну', 409);
    }

    const newNights = Number.isFinite(nights) && nights > 0 ? Math.floor(nights) : res.nights;
    const newAdults = Number.isFinite(adults) && adults > 0 ? Math.floor(adults) : res.adults;
    const newChildren = Number.isFinite(children) && children >= 0 ? Math.floor(children) : res.children;
    const newElectricity = electricity === undefined ? res.camping_electricity : (electricity ? 1 : 0);

    const checkOut = new Date(res.check_in);
    checkOut.setDate(checkOut.getDate() + newNights);
    const newCheckOut = checkOut.toISOString().slice(0, 10);

    let total = res.total_price;
    if (res.unit_type_id) {
      try {
        const q = calculateQuote(res.unit_type_id, res.check_in, newCheckOut, newAdults, newChildren);
        if (q && Number.isFinite((q as any).total)) total = (q as any).total;
      } catch (e: any) {
        console.error('[bookings-bridge] quote failed, keeping old price:', e.message);
      }
    }

    db.prepare(`
      UPDATE reservations
      SET nights = ?, check_out = ?, adults = ?, children = ?,
          camping_electricity = ?, total_price = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newNights, newCheckOut, newAdults, newChildren, newElectricity, total, reservation_id);

    const after = db.prepare(`${CARD_SQL} WHERE r.id = ?`).get(reservation_id) as any;
    return NextResponse.json({ ok: true, booking: card(after) });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── POST /payment ───────────────────────────────────────────────────────────
// method: cash | terminal.  currency: CZK | EUR.
//
// Cash creates a fin_operation immediately, because there is no bank trail to
// pick it up later. Terminal deliberately does not: that money reaches the
// ledger through the bank statement, and recording it here as well would count
// the same koruna twice. The clearing table keeps it visible in the meantime.
export async function recordBookingPayment(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const { reservation_id, method, currency = 'CZK', amount, recorded_by } = body;
    if (!reservation_id) return fail('reservation_id is required');
    if (!['cash', 'terminal'].includes(method)) return fail('method must be cash or terminal');

    const db = getDb();
    const res = db.prepare(`${CARD_SQL} WHERE r.id = ?`).get(reservation_id) as any;
    if (!res) return fail('Бронювання не знайдено', 404);
    if (res.status === 'cancelled') return fail('Бронювання скасовано', 409);
    if (res.payment_status === 'paid') {
      return NextResponse.json({ ok: true, alreadyPaid: true, booking: card(res) });
    }

    const cur = String(currency).toUpperCase();
    const sum = Number.isFinite(amount) && amount > 0 ? Number(amount) : Number(res.total_price || 0);
    if (sum <= 0) return fail('Сума не визначена — вкажи amount');

    const { createPaymentOperation } = await import('@/modules/finance/api/payment-bridge');
    const who = recorded_by ? ` · Внесено: ${recorded_by}` : '';
    const { operationId } = createPaymentOperation({
      reservationId: reservation_id,
      amount: sum,
      currency: cur,
      method: method === 'cash' ? 'cash' : 'card',
      paymentSubtype: 'full',
      source: 'manual',
      sourceRef: `tg_checkin:${reservation_id}`,
      comment: `${method === 'cash' ? `Готівка ${cur}` : 'Термінал'} (Telegram)${who}`,
      ...(recorded_by ? { actor: { id: `tg:${recorded_by}`, name: String(recorded_by) } } : {}),
    });

    db.prepare(`
      UPDATE reservations
      SET payment_status = 'paid',
          payment_method = ?,
          status = CASE WHEN status = 'tentative' THEN 'confirmed' ELSE status END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(method, reservation_id);

    // Terminal money is Teya's until it settles — keep it visible without
    // putting it in the ledger twice.
    if (method === 'terminal') {
      try {
        const { recordTeyaReceivable } = await import('@/modules/finance/data/clearing-engine');
        recordTeyaReceivable(db, reservation_id);
      } catch (e: any) {
        console.error('[bookings-bridge] clearing receivable failed (non-fatal):', e.message);
      }
    }

    const after = db.prepare(`${CARD_SQL} WHERE r.id = ?`).get(reservation_id) as any;
    return NextResponse.json({
      ok: true,
      operationId: operationId || null,
      ledgerEntry: method === 'cash',
      booking: card(after),
    });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── POST /checkin ───────────────────────────────────────────────────────────
// The PMS refuses to check a guest in without payment and registration. Rather
// than let the bot discover that as a 422, the same two conditions are checked
// here and returned as a list the receptionist can act on.
export async function checkinBooking(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const { reservation_id } = body;
    if (!reservation_id) return fail('reservation_id is required');

    const db = getDb();
    const res = db.prepare(`${CARD_SQL} WHERE r.id = ?`).get(reservation_id) as any;
    if (!res) return fail('Бронювання не знайдено', 404);
    const c = card(res)!;
    if (res.status === 'checked_in') return NextResponse.json({ ok: true, already: true, booking: c });
    if (!c.canCheckIn) {
      return NextResponse.json(
        { error: `Не можна заселити — бракує: ${c.blockedBy.join(', ')}`, blockedBy: c.blockedBy, booking: c },
        { status: 422 },
      );
    }

    db.prepare("UPDATE reservations SET status = 'checked_in', updated_at = datetime('now') WHERE id = ?")
      .run(reservation_id);
    const after = db.prepare(`${CARD_SQL} WHERE r.id = ?`).get(reservation_id) as any;
    return NextResponse.json({ ok: true, booking: card(after) });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── POST /cancel ────────────────────────────────────────────────────────────
export async function cancelBooking(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const { reservation_id, reason, recorded_by } = body;
    if (!reservation_id) return fail('reservation_id is required');

    const db = getDb();
    const res = db.prepare(`${CARD_SQL} WHERE r.id = ?`).get(reservation_id) as any;
    if (!res) return fail('Бронювання не знайдено', 404);
    if (res.status === 'checked_in') return fail('Гість уже заселений — скасувати не можна', 409);
    // A paid booking cancelled from a phone would leave money recorded against a
    // stay that never happened, with no refund trail. That needs a human.
    if (res.payment_status === 'paid' || res.payment_status === 'prepaid') {
      return fail('Бронювання оплачене — скасування потребує повернення коштів, зроби це в PMS', 409);
    }

    const note = `скасовано в Telegram${recorded_by ? ` (${recorded_by})` : ''}${reason ? `: ${reason}` : ''}`;
    db.prepare(`
      UPDATE reservations
      SET status = 'cancelled',
          notes = TRIM(COALESCE(notes,'') || ' | ' || ?),
          updated_at = datetime('now')
      WHERE id = ? AND status <> 'checked_in'
    `).run(note, reservation_id);

    const after = db.prepare(`${CARD_SQL} WHERE r.id = ?`).get(reservation_id) as any;
    return NextResponse.json({ ok: true, booking: card(after) });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── GET /no-shows ───────────────────────────────────────────────────────────
// The 22:00 list: arrived-today bookings nobody checked in. Each carries the
// two actions the evening review needs.
export async function listNoShows(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const rows = getDb().prepare(`${CARD_SQL}
      WHERE r.check_in = ?
        AND r.status NOT IN ('checked_in', 'cancelled', 'no_show')
      ORDER BY u.code`).all(date) as any[];
    return NextResponse.json({ date, count: rows.length, bookings: rows.map(card) });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── POST /quote ─────────────────────────────────────────────────────────────
// Price before anything is written, so the receptionist can read the number to
// the guest and only then commit.
export async function quoteBooking(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const { unit_type_id, check_in, nights = 1, adults = 2, children = 0 } = body;
    if (!unit_type_id || !check_in) return fail('unit_type_id and check_in are required');
    const n = Math.max(1, Math.floor(Number(nights) || 1));
    const out = new Date(check_in);
    out.setDate(out.getDate() + n);
    const checkOut = out.toISOString().slice(0, 10);
    const quote = calculateQuote(unit_type_id, check_in, checkOut, Number(adults) || 1, Number(children) || 0);
    return NextResponse.json({ ok: true, checkIn: check_in, checkOut, nights: n, quote });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── GET /unit-types ─────────────────────────────────────────────────────────
// What the bot offers as the first step of a new booking, with free units for
// the date so it never proposes something that cannot be booked.
export async function listBookableUnitTypes(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const rows = getDb().prepare(`
      SELECT ut.id, ut.name, c.type AS category_type,
             COUNT(u.id) AS units_total,
             SUM(CASE WHEN NOT EXISTS (
                   SELECT 1 FROM reservations r
                   WHERE r.unit_id = u.id
                     AND r.status NOT IN ('cancelled','no_show')
                     AND date(?) >= date(r.check_in) AND date(?) < date(r.check_out)
                 ) THEN 1 ELSE 0 END) AS units_free
      FROM unit_types ut
      JOIN units u ON u.unit_type_id = ut.id AND COALESCE(u.is_active, 1) = 1
      LEFT JOIN categories c ON c.id = ut.category_id
      GROUP BY ut.id
      HAVING units_free > 0
      ORDER BY ut.name
    `).all(date, date) as any[];
    return NextResponse.json({ date, unitTypes: rows });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}
