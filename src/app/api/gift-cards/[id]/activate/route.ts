import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

// POST /api/gift-cards/[id]/activate — погасити ваучер (прив'язати до бронювання)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const body = await req.json();
    const { reservation_id } = body;

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const gift_card = db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!gift_card) return NextResponse.json({ error: 'GiftCard not found' }, { status: 404 });

    // Перевірки
    if (gift_card.status === 'activated') {
      return NextResponse.json({ error: 'GiftCard already activated' }, { status: 409 });
    }
    if (gift_card.status === 'cancelled') {
      return NextResponse.json({ error: 'GiftCard is cancelled' }, { status: 409 });
    }
    if (gift_card.status === 'expired') {
      return NextResponse.json({ error: 'GiftCard has expired' }, { status: 409 });
    }
    if (gift_card.status === 'draft') {
      return NextResponse.json({ error: 'GiftCard is not yet active' }, { status: 409 });
    }

    // Перевірка що бронювання існує
    const reservation = db.prepare('SELECT id, unit_id, check_in FROM reservations WHERE id = ?').get(reservation_id);
    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    db.prepare(`
      UPDATE gift_cards
      SET status = 'activated',
          reservation_id = ?,
          activated_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(reservation_id, id);

    const updated = db.prepare(`
      SELECT v.*, r.check_in, r.check_out, u.name as unit_name
      FROM gift_cards v
      LEFT JOIN reservations r ON v.reservation_id = r.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE v.id = ?
    `).get(id);

    return NextResponse.json({ giftCard: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('POST /api/gift-cards/[id]/activate error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
