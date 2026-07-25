import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Missing reservation ID' }, { status: 400, headers: CORS_HEADERS });
    }

    // First try to find it as a reservation
    let paymentStatus = null;
    const reservation = db.prepare('SELECT payment_status FROM reservations WHERE id = ?').get(id) as any;
    
    if (reservation) {
      paymentStatus = reservation.payment_status;
    } else {
      // Fallback: check if it's a draft ID and get the linked reservation
      const draft = db.prepare(`
        SELECT r.payment_status 
        FROM booking_drafts bd
        LEFT JOIN reservations r ON bd.reservation_id = r.id
        WHERE bd.id = ?
      `).get(id) as any;
      
      if (draft) {
        paymentStatus = draft.payment_status;
      }
    }

    if (!paymentStatus) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS_HEADERS });
    }

    return NextResponse.json({ status: paymentStatus }, { headers: CORS_HEADERS });
  } catch (err: any) {
    console.error('[BookingStatus] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
