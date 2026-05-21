import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { sendAbandonedCartEmail } from '@/modules/bookings/data/send-abandoned-cart-email';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
