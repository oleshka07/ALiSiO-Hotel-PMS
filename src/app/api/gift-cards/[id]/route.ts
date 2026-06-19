import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

// GET /api/gift-cards/[id]
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const gift_card = db.prepare(`
      SELECT v.*,
             r.check_in, r.check_out, r.unit_id,
             u.name as unit_name
      FROM gift_cards v
      LEFT JOIN reservations r ON v.reservation_id = r.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE v.id = ?
    `).get(id);
    if (!gift_card) return NextResponse.json({ error: 'GiftCard not found' }, { status: 404 });
    return NextResponse.json({ giftCard: gift_card });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/gift-cards/[id] — оновити поля ваучера
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const body = await req.json();

    const existing = db.prepare('SELECT id, status FROM gift_cards WHERE id = ?').get(id) as { id: string; status: string } | undefined;
    if (!existing) return NextResponse.json({ error: 'GiftCard not found' }, { status: 404 });

    // Дозволені поля для оновлення
    const allowed = [
      'status', 'recipient_name', 'recipient_email',
      'buyer_name', 'buyer_email', 'buyer_phone',
      'message', 'expires_at', 'notes', 'paid_at', 'config_json',
    ];

    const sets: string[] = [];
    const vals: (string | number | null)[] = [];

    for (const key of allowed) {
      if (key in body) {
        sets.push(`${key} = ?`);
        vals.push(key === 'config_json' ? JSON.stringify(body[key]) : (body[key] ?? null));
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    sets.push("updated_at = datetime('now')");
    vals.push(id);

    db.prepare(`UPDATE gift_cards SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

    const updated = db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(id);
    return NextResponse.json({ giftCard: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/gift-cards/[id] — м'яке видалення (→ cancelled)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { id } = await params;
    const existing = db.prepare('SELECT id, status FROM gift_cards WHERE id = ?').get(id) as { id: string; status: string } | undefined;
    if (!existing) return NextResponse.json({ error: 'GiftCard not found' }, { status: 404 });

    if (existing.status === 'activated') {
      return NextResponse.json({ error: 'Cannot cancel a activated giftCard' }, { status: 409 });
    }

    db.prepare(`
      UPDATE gift_cards SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
    `).run(id);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
