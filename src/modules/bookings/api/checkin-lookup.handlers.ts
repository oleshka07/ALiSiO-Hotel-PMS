/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Find my booking — the QR self check-in entry point.
 *
 * A guest standing at the gate types their phone number and surname, and gets
 * back the link to their own guest page. That is a lookup into personal data by
 * a public, unauthenticated endpoint, so the shape of it matters more than the
 * code:
 *
 *   - The search window is arrivals within a day of today. The guest is
 *     physically here; a booking for next month is not what they are asking
 *     about. It also shrinks the searchable set from the whole database to the
 *     handful of people arriving, which is what makes guessing phone numbers
 *     pointless — you would have to guess the number of someone arriving today.
 *   - Phone AND surname must both match. A phone alone is guessable; a phone
 *     plus the right surname is not.
 *   - The response carries the token and nothing else. No name, no dates, no
 *     amount. A caller who guesses right gets in; a caller who guesses wrong
 *     learns nothing, including whether the number exists at all.
 *   - Wrong guesses are counted per IP. Ten in fifteen minutes and that address
 *     is done, the same brake the reception PIN uses.
 */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function findMyBookingOptions() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 10;
const attempts = new Map<string, { count: number; first: number }>();

function blocked(key: string): boolean {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) return false;
  return rec.count >= LIMIT;
}

function recordMiss(key: string): void {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) attempts.set(key, { count: 1, first: now });
  else rec.count++;
  if (attempts.size > 5000) attempts.clear();
}

function clientKey(req: Request): string {
  const h = req.headers;
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

/** Compare on digits only: +420 777 123 456, 777123456 and 00420777123456 are one number. */
const digits = (s: string) => String(s || '').replace(/\D/g, '');

export async function findMyBooking(req: Request) {
  try {
    const body = await req.json();
    const phone = digits(body.phone);
    const surname = String(body.surname || '').trim().toLowerCase();

    // Same answer for a malformed request as for a wrong one — an error that
    // distinguishes them is a way to probe.
    const notFound = NextResponse.json({ found: false }, { status: 200, headers: CORS });
    if (phone.length < 6 || surname.length < 2) return notFound;

    const key = clientKey(req);
    if (blocked(key)) {
      return NextResponse.json(
        { error: 'Забагато спроб. Спробуйте за 15 хвилин або зверніться до адміністратора.', code: 'THROTTLED' },
        { status: 429, headers: CORS },
      );
    }

    const rows = getDb().prepare(`
      SELECT r.id, r.guest_page_token, g.phone, g.last_name, g.first_name
      FROM reservations r
      JOIN guests g ON g.id = r.guest_id
      WHERE r.status NOT IN ('cancelled', 'no_show')
        AND date(r.check_in) BETWEEN date('now', '-1 day') AND date('now', '+1 day')
    `).all() as any[];

    // The last six digits, so a number stored with a country code still matches
    // one typed without it.
    const tail = phone.slice(-6);
    const hit = rows.find((r) => {
      const stored = digits(r.phone);
      if (!stored || stored.slice(-6) !== tail) return false;
      const last = String(r.last_name || '').trim().toLowerCase();
      const first = String(r.first_name || '').trim().toLowerCase();
      // Either name half counts: bookings arrive from channels with the two
      // swapped often enough that insisting on the surname would turn away
      // guests who are standing at the desk.
      return last === surname || first === surname;
    });

    if (!hit) { recordMiss(key); return notFound; }
    if (!hit.guest_page_token) {
      return NextResponse.json(
        { found: true, token: null, code: 'NO_PAGE' },
        { status: 200, headers: CORS },
      );
    }
    return NextResponse.json({ found: true, token: hit.guest_page_token }, { status: 200, headers: CORS });
  } catch (error: any) {
    console.error('[checkin/find] error:', error?.message);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500, headers: CORS });
  }
}
