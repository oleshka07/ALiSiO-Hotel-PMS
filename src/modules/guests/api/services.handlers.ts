/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as actionsRepo from '../data/guest-actions.repo';
// TODO: replace with @channels eventBus event when channels module is migrated
import { checkRateLimit } from '@/lib/rate-limit';
import { publicMessage } from '@core/security/public-error';

export async function orderServices(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const body = await request.json();

    const reservation = actionsRepo.getReservationForServiceOrder(token);
    if (!reservation) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

    const rl = checkRateLimit(token, 'service_order', 5, 10);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a few minutes.' }, { status: 429 });
    }

    const { services } = body;
    if (!services || !Array.isArray(services) || services.length === 0) {
      return NextResponse.json({ error: 'At least one service is required' }, { status: 400 });
    }

    const orderedServices = actionsRepo.orderServices(reservation.id, services);
    return NextResponse.json({ success: true, orderedServices });
  } catch (error: any) {
    console.error('POST /api/guest/[token]/services error:', error?.message || error);
    return NextResponse.json({ error: publicMessage(error, 'Failed to order services') }, { status: 500 });
  }
}
