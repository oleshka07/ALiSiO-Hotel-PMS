import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export const dynamic = 'force-dynamic';

/**
 * Cancel website bookings that were never paid and whose arrival date has
 * already passed.
 *
 * A booking from the widget is created `tentative` + `unpaid` and stays that
 * way forever if nobody pays. Nothing expired them, so unpaid holds sat on real
 * units indefinitely — fifteen of them, on 31 515 CZK of inventory.
 *
 * The rule is the operator's: gone the day after the arrival date, if the guest
 * never checked in. Waiting until the day after — rather than a fixed number of
 * hours after booking — means a guest who pays cash at the door is never
 * cancelled out from under the receptionist.
 *
 * Deliberately conservative:
 *   - only `tentative`, only `unpaid` — anything paid, prepaid, confirmed or
 *     checked in is left alone
 *   - the reason is written into `notes` so a cancellation can always be told
 *     apart from one a human made
 *   - `dry=1` reports what would be cancelled and changes nothing
 */
/**
 * Everything under /api/cron/ is public at the proxy — the prefix is exempt
 * from the session gate on the understanding that each route carries its own
 * secret-header check. This one shipped without it, which left an endpoint
 * that CANCELS BOOKINGS reachable by anyone who knew the URL. Same shape as
 * the unauthenticated admin endpoints removed in #193.
 */
function authorizeCron(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET env variable is not configured on the server' },
      { status: 500 },
    );
  }
  const provided = request.headers.get('x-cron-secret') || '';
  if (provided !== expected) {
    return NextResponse.json({ error: 'invalid or missing X-Cron-Secret header' }, { status: 401 });
  }
  return null;
}

// Both verbs, so a POST — the form every other cron line in this project
// uses — does not silently return an empty 405 body.
export async function POST(request: Request) { return GET(request); }

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const url = new URL(request.url);
    const dry = url.searchParams.get('dry') === '1';

    const doomed = db.prepare(`
      SELECT r.id, r.check_in, r.total_price, r.currency, r.source,
             u.code AS unit_code,
             TRIM(COALESCE(g.first_name,'') || ' ' || COALESCE(g.last_name,'')) AS guest
      FROM reservations r
      LEFT JOIN units u ON u.id = r.unit_id
      LEFT JOIN guests g ON g.id = r.guest_id
      WHERE r.status = 'tentative'
        AND r.payment_status = 'unpaid'
        AND date(r.check_in) < date('now')
      ORDER BY r.check_in
    `).all() as any[];

    if (dry) {
      return NextResponse.json({
        ok: true, dry: true, wouldCancel: doomed.length, reservations: doomed,
      });
    }

    // One statement per row rather than a blanket UPDATE: the WHERE is repeated
    // so a booking paid between the SELECT and the write is not cancelled.
    const cancel = db.prepare(`
      UPDATE reservations
      SET status = 'cancelled',
          notes = TRIM(COALESCE(notes,'') || ' | auto-cancelled: неоплачене, заїзд ' || check_in || ' минув'),
          updated_at = datetime('now')
      WHERE id = ? AND status = 'tentative' AND payment_status = 'unpaid'
    `);

    let cancelled = 0;
    const tx = db.transaction(() => {
      for (const r of doomed) cancelled += cancel.run(r.id).changes;
    });
    tx();

    if (cancelled) {
      console.log(`[ExpireUnpaid] cancelled ${cancelled} unpaid bookings past their arrival date`);
    }
    return NextResponse.json({ ok: true, cancelled, found: doomed.length, reservations: doomed });
  } catch (error: any) {
    console.error('[ExpireUnpaid] Error:', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
