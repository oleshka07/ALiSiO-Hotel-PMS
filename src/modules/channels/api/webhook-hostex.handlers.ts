import { NextRequest, NextResponse } from 'next/server';
import { syncSingleReservation, syncReservations } from '@/lib/hostex-sync';

const WEBHOOK_SECRET = process.env.HOSTEX_WEBHOOK_SECRET || '';

export async function hostexWebhook(request: NextRequest): Promise<NextResponse> {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const incomingToken = request.headers.get('Hostex-Webhook-Secret-Token') || '';
  if (WEBHOOK_SECRET && incomingToken !== WEBHOOK_SECRET) {
    console.warn('[Hostex Webhook] Rejected: invalid secret token');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const event = (payload.event as string) || '';
  const reservationCode = (payload.reservation_code as string) || '';

  console.log(`[Hostex Webhook] ${event} | code: ${reservationCode}`);

  if (event === 'reservation_created' || event === 'reservation_updated') {
    setImmediate(async () => {
      try {
        if (reservationCode) await syncSingleReservation(reservationCode);
        else await syncReservations();
      } catch (e: unknown) {
        console.error('[Hostex Webhook] Background error:', (e as Error).message);
      }
    });
  }

  return NextResponse.json({ ok: true, event, code: reservationCode });
}

export async function hostexWebhookInfo(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: '/api/webhooks/hostex',
    status: 'active',
    strategy: '?reservation_code= targeted fetch — bypasses 20-record cap',
    events: ['reservation_created', 'reservation_updated'],
    security: 'Hostex-Webhook-Secret-Token header',
  });
}
