import { NextResponse } from 'next/server';
import { pollReservations } from '@channels';

const CRON_SECRET = process.env.CRON_SECRET || '';

// POST /api/channels/reservations/poll — Booking.com polling, triggered by cron
export async function POST(request: Request) {
  if (CRON_SECRET) {
    const secret = request.headers.get('x-cron-secret')
      || new URL(request.url).searchParams.get('secret');
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return pollReservations();
}
