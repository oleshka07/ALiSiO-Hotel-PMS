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
import { calcCampingBreakdown, CAMPING_ITEMS } from '@pricing';
import { resolveCashAccount } from '@/modules/finance/data/cash-account.repo';
import { getCzkPerEur, czkToEurCash } from '@/modules/finance/data/fx.repo';

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
         r.camping_tent_type, r.camping_vehicle_type, r.camping_pets,
         r.unit_id, r.notes,
         u.code AS unit_code, u.name AS unit_name, u.unit_type_id,
         ut.name AS unit_type_name, c.type AS category_type,
         TRIM(COALESCE(g.first_name,'') || ' ' || COALESCE(g.last_name,'')) AS guest,
         g.phone AS guest_phone, g.email AS guest_email,
         (SELECT COUNT(*) FROM reservation_guests rg WHERE rg.reservation_id = r.id) AS guests_registered
  FROM reservations r
  LEFT JOIN units u ON u.id = r.unit_id
  LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
  LEFT JOIN categories c ON c.id = ut.category_id
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
    isCamping: row.category_type === 'camping',
    campingItems: [row.camping_tent_type, row.camping_vehicle_type]
      .filter(Boolean).join(',').split(',').filter(Boolean),
    pets: Number(row.camping_pets) || 0,
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
    const { reservation_id, method, currency = 'CZK', amount, recorded_by, telegram_user_id } = body;
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

    // total_price is in CZK. Taking the number as-is and labelling it EUR — as
    // this did — records twenty-four times the money that changed hands.
    // The guest is quoted euros at BOT_EUR_RATE on the receipt, so that is the
    // figure they hand over and the figure the ledger has to hold.
    const org = db.prepare(
      'SELECT prop.organization_id AS id FROM reservations r JOIN properties prop ON prop.id = r.property_id WHERE r.id = ?',
    ).get(reservation_id) as { id: string } | undefined;

    let sum: number;
    if (Number.isFinite(amount) && amount > 0) {
      sum = Number(amount);
    } else {
      const czk = Number(res.total_price || 0);
      // The rate comes from finance settings, the same one the receipt quoted.
      sum = cur === 'EUR' && org ? czkToEurCash(czk, getCzkPerEur(db, org.id)) : czk;
    }
    if (sum <= 0) return fail('Сума не визначена — вкажи amount');

    // Whose till. Telegram already knows who pressed the button; without this
    // the resolver falls to "first account in this currency by sort order",
    // which is one fixed person no matter who took the money.
    const till = org
      ? resolveCashAccount(db, org.id, cur, { telegramUserId: telegram_user_id, recordedBy: recorded_by })
      : null;

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
      ...(method === 'cash' && till?.accountId ? { accountId: till.accountId } : {}),
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
      amount: sum,
      currency: cur,
      // The bot repeats these back to the receptionist. A payment filed in
      // somebody else's till should say so at the counter, not weeks later in
      // a reconciliation.
      account: method === 'cash' ? till?.accountName || null : null,
      accountOwner: till?.userName || null,
      accountGuessed: method === 'cash' ? !!till?.fellBack : false,
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
    const q = request.nextUrl.searchParams;
    const date = q.get('check_in') || q.get('date') || new Date().toISOString().slice(0, 10);
    // A unit is only bookable if it is free for every night of the stay, not
    // just the arrival day — the bot now picks both dates on a calendar.
    let until = q.get('check_out');
    if (!until) {
      const d = new Date(date);
      d.setDate(d.getDate() + 1);
      until = d.toISOString().slice(0, 10);
    }
    const rows = getDb().prepare(`
      SELECT ut.id, ut.name, c.type AS category_type,
             COUNT(u.id) AS units_total,
             SUM(CASE WHEN NOT EXISTS (
                   SELECT 1 FROM reservations r
                   WHERE r.unit_id = u.id
                     AND r.status NOT IN ('cancelled','no_show')
                     AND date(r.check_in) < date(?) AND date(?) < date(r.check_out)
                 ) THEN 1 ELSE 0 END) AS units_free
      FROM unit_types ut
      JOIN units u ON u.unit_type_id = ut.id AND COALESCE(u.is_active, 1) = 1
      LEFT JOIN categories c ON c.id = ut.category_id
      GROUP BY ut.id
      HAVING units_free > 0
      ORDER BY ut.name
    `).all(until, date) as any[];
    return NextResponse.json({ date, checkIn: date, checkOut: until, unitTypes: rows });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── POST /create ────────────────────────────────────────────────────────────
// A booking made at the desk. Created tentative + unpaid on purpose: money is a
// separate step (POST /payment), so a receptionist interrupted mid-flow leaves a
// held unit rather than a booking claiming to be paid.
//
// source is 'telegram', not a widget value — this is a human making a booking,
// and the unpaid-expiry job in /api/cron/expire-unpaid must not sweep it away.
export async function createBooking(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const {
      unit_type_id, check_in, check_out, nights = 1, adults = 2, children = 0,
      electricity = false, guest_name, phone, email, total_price, recorded_by,
      camping_items = [], pets = 0,
    } = body;

    if (!unit_type_id || !check_in) return fail('unit_type_id and check_in are required');
    if (!guest_name || !String(guest_name).trim()) return fail('guest_name is required');

    // Either end of the stay can be given: the bot's calendar picks two dates,
    // the older night-count flow picks one and a number.
    let checkOut = check_out;
    let n: number;
    if (checkOut) {
      n = Math.round(
        (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${check_in}T00:00:00Z`)) / 86_400_000,
      );
      if (!Number.isFinite(n) || n < 1) return fail('Виїзд має бути пізніше за заїзд');
    } else {
      n = Math.max(1, Math.floor(Number(nights) || 1));
      const out = new Date(check_in);
      out.setDate(out.getDate() + n);
      checkOut = out.toISOString().slice(0, 10);
    }

    const db = getDb();

    // First unit of that type with nothing overlapping. Booking a specific unit
    // rather than a type keeps this consistent with the rest of the PMS, which
    // has no concept of an unassigned reservation.
    const unit = db.prepare(`
      SELECT u.id, u.code, u.name, u.property_id
      FROM units u
      WHERE u.unit_type_id = ? AND COALESCE(u.is_active, 1) = 1
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.unit_id = u.id
            AND r.status NOT IN ('cancelled', 'no_show')
            AND date(r.check_in) < date(?) AND date(?) < date(r.check_out)
        )
      ORDER BY u.sort_order, u.code LIMIT 1
    `).get(unit_type_id, checkOut, check_in) as any;
    if (!unit) return fail('Немає вільних юнітів цього типу на ці дати', 409);

    const org = db.prepare('SELECT organization_id FROM properties WHERE id = ?').get(unit.property_id) as any;
    const orgId = org?.organization_id;
    if (!orgId) return fail('Не знайдено організацію для юніта', 500);

    const raw = String(guest_name).trim().split(/\s+/);
    const firstName = raw[0];
    const lastName = raw.slice(1).join(' ') || '—';

    const { findOrCreateGuest } = await import('@/modules/guests/data/guest-dedup.repo');
    const guest = findOrCreateGuest({
      organizationId: orgId, firstName, lastName,
      email: email || null, phone: phone || null,
    });

    let price = Number(total_price);
    if (!Number.isFinite(price) || price < 0) {
      try {
        const q = calculateQuote(unit_type_id, check_in, checkOut, Number(adults) || 1, Number(children) || 0);
        price = Number((q as any)?.total) || 0;
      } catch { price = 0; }
    }

    // Split the same way the widget stores it: what they sleep in goes to
    // camping_tent_type, what they drove in on to camping_vehicle_type. The
    // reception screens read those two columns, so writing one combined blob
    // would show up nowhere.
    const codes: string[] = Array.isArray(camping_items) ? camping_items.map(String) : [];
    const TENTS = new Set(['small_tent', 'large_tent']);
    const tents = codes.filter((c) => TENTS.has(c)).join(',') || null;
    const vehicles = codes.filter((c) => !TENTS.has(c)).join(',') || null;
    const petCount = Math.max(0, Math.floor(Number(pets) || 0));

    const id = `r_tg_${Date.now()}`;
    db.prepare(`
      INSERT INTO reservations (
        id, property_id, unit_id, guest_id, check_in, check_out, nights,
        adults, children, status, payment_status, source, total_price, currency,
        camping_electricity, camping_tent_type, camping_vehicle_type, camping_pets, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'tentative', 'unpaid', 'telegram', ?, 'CZK', ?, ?, ?, ?, ?)
    `).run(
      id, unit.property_id, unit.id, guest.id, check_in, checkOut, n,
      Math.max(1, Math.floor(Number(adults) || 1)), Math.max(0, Math.floor(Number(children) || 0)),
      price, electricity ? 1 : 0, tents, vehicles, petCount ? String(petCount) : null,
      `створено в Telegram${recorded_by ? ` (${recorded_by})` : ''}`,
    );

    const created = db.prepare(`${CARD_SQL} WHERE r.id = ?`).get(id) as any;
    return NextResponse.json({ ok: true, booking: card(created) }, { status: 201 });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}

// ── POST /camping-quote ─────────────────────────────────────────────────────
// The camping price is not a room rate. It is the sum of what the guest brought
// (tent, car, caravan…), who is staying, electricity, animals, the tourist tax
// per adult per night, and the season each night falls in — plus a one-off
// motorhome service. Quoting it with calculateQuote, as this bridge did at
// first, returns a room-type figure with none of that in it.
//
// Same function the widget uses, now that it lives in the pricing module rather
// than the browser bundle, so the two cannot drift apart.
export async function campingQuote(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const {
      items = [], adults = 2, children = 0,
      electricity = false, pets = 0, motorhome_service = false,
      check_in, check_out, nights,
    } = body;
    if (!check_in) return fail('check_in is required');

    let checkOut = check_out;
    if (!checkOut) {
      const n = Math.max(1, Math.floor(Number(nights) || 1));
      const d = new Date(check_in);
      d.setDate(d.getDate() + n);
      checkOut = d.toISOString().slice(0, 10);
    }

    const prices = getDb()
      .prepare('SELECT * FROM widget_price_list ORDER BY category, sort_order')
      .all() as any[];

    const quote = calcCampingBreakdown(
      items, Number(adults) || 0, Number(children) || 0,
      !!electricity, Number(pets) || 0, !!motorhome_service,
      check_in, checkOut, prices as any,
    );

    const orgFx = getDb().prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
    return NextResponse.json({
      ok: true, checkIn: check_in, checkOut, ...quote,
      // The bot prints euros on the guest receipt; it must use this number and
      // not one of its own, or the counter quotes one rate and the till records
      // another.
      eurRate: orgFx ? getCzkPerEur(getDb(), orgFx.id) : null,
      items: CAMPING_ITEMS.map((i) => {
        const r = prices.find((p) => p.item_code === i.code && p.is_active);
        return { ...i, rate: r?.rate_standard ?? null, selected: items.includes(i.code) };
      }).filter((i) => i.rate !== null && i.code !== 'svc_test_stone'),
    });
  } catch (e: any) {
    return fail(publicMessage(e), 500);
  }
}
