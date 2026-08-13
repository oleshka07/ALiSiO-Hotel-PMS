import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { sendAbandonedCartEmail } from '@/modules/bookings/data/send-abandoned-cart-email';
import { publicMessage } from '@core/security/public-error';

export const dynamic = 'force-dynamic';

/**
 * Everything under /api/cron/ is exempt from the session gate in proxy.ts on
 * the understanding that each route carries its own secret-header check.
 * These routes never had one.
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

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const db = getDb();
    
    // PROD MODE: Check for carts created more than 30 minutes ago
    const abandonedReservations = db.prepare(`
      SELECT id 
      FROM reservations 
      WHERE status = 'tentative' 
        AND payment_status = 'unpaid' 
        AND created_at < datetime('now', '-30 minute') 
        AND created_at > datetime('now', '-120 minute')
        AND ifnull(internal_notes, '') NOT LIKE '%[ABANDONED_CART_SENT]%'
    `).all() as { id: string }[];

    if (!abandonedReservations.length) {
      return NextResponse.json({ ok: true, processed: 0, message: 'No abandoned carts found' });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    let processed = 0;

    for (const res of abandonedReservations) {
      const sent = await sendAbandonedCartEmail(res.id, origin);
      if (sent) {
        // Mark as sent
        db.prepare(`
          UPDATE reservations 
          SET internal_notes = ifnull(internal_notes, '') || '\n[ABANDONED_CART_SENT]'
          WHERE id = ?
        `).run(res.id);
        processed++;
      }
    }

    return NextResponse.json({ ok: true, processed, totalFound: abandonedReservations.length });
  } catch (error: any) {
    console.error('[CronAbandonedCarts] Error:', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
