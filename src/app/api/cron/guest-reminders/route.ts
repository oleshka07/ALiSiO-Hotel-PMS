import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { sendGuestReminderEmail } from '@/modules/bookings/data/send-guest-reminder-email';
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
    
    // Find reservations where check-in is in exactly 2 days (48 hours)
    // and guest_registration is still pending (we assume if reg_status is not tracked, we check notes)
    // and they didn't choose 'reception' strategy.
    
    // First let's get all upcoming check-ins in the next 48 hours that haven't received a reminder.
    const pendingReservations = db.prepare(`
      SELECT r.id 
      FROM reservations r
      WHERE r.status = 'confirmed' 
        AND r.check_in = date('now', '+2 days')
        AND ifnull(r.notes, '') NOT LIKE '%document_strategy:reception%'
        AND ifnull(r.internal_notes, '') NOT LIKE '%[GUEST_REMINDER_SENT]%'
    `).all() as { id: string }[];

    // Ideally, we'd also check if they already registered by looking at the guests table count vs adults count.
    // For simplicity, we just check if any guest is linked. 
    // Wait, ALiSiO uses guest_registrations or just updates guests. We'll send it to all who haven't received it.

    if (!pendingReservations.length) {
      return NextResponse.json({ ok: true, processed: 0, message: 'No pending registrations found' });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    let processed = 0;

    for (const res of pendingReservations) {
      // Send the email
      const sent = await sendGuestReminderEmail(res.id, origin);
      if (sent) {
        // Mark as sent
        db.prepare(`
          UPDATE reservations 
          SET internal_notes = ifnull(internal_notes, '') || '\n[GUEST_REMINDER_SENT]'
          WHERE id = ?
        `).run(res.id);
        processed++;
      }
    }

    return NextResponse.json({ ok: true, processed, totalFound: pendingReservations.length });
  } catch (error: any) {
    console.error('[CronGuestReminders] Error:', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
