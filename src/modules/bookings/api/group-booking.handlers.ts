/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function getGroupBooking(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    const group = db.prepare(`
      SELECT rg.*,
        g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
        b.name as building_name, b.code as building_code
      FROM reservation_groups rg
      JOIN guests g ON rg.guest_id = g.id
      LEFT JOIN buildings b ON rg.building_id = b.id
      WHERE rg.id = ?
    `).get(id);

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const rooms = db.prepare(`
      SELECT r.id, r.unit_id, r.adults, r.children, r.status, r.total_price,
        u.name as unit_name, u.code as unit_code,
        g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
        g.id as guest_id
      FROM reservations r
      JOIN units u ON r.unit_id = u.id
      JOIN guests g ON r.guest_id = g.id
      WHERE r.group_id = ?
      ORDER BY u.sort_order, u.code
    `).all(id);

    return NextResponse.json({ ...group as any, rooms });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function updateGroupBooking(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const existing = db.prepare('SELECT * FROM reservation_groups WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const allowed = ['total_price', 'status', 'payment_status', 'source', 'notes', 'check_in', 'check_out', 'nights'];
    const sets: string[] = [];
    const values: any[] = [];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(body[key]);
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE reservation_groups SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }

    if (body.first_name || body.last_name || body.guest_phone) {
      const guestUpdate: string[] = [];
      const guestValues: any[] = [];
      if (body.first_name !== undefined) { guestUpdate.push('first_name = ?'); guestValues.push(body.first_name); }
      if (body.last_name !== undefined) { guestUpdate.push('last_name = ?'); guestValues.push(body.last_name); }
      if (body.guest_phone !== undefined) { guestUpdate.push('phone = ?'); guestValues.push(body.guest_phone); }
      if (guestUpdate.length > 0) {
        guestValues.push(existing.guest_id);
        db.prepare(`UPDATE guests SET ${guestUpdate.join(', ')} WHERE id = ?`).run(...guestValues);
      }
    }

    if (body.status) {
      db.prepare('UPDATE reservations SET status = ? WHERE group_id = ?').run(body.status, id);
    }
    if (body.payment_status) {
      db.prepare('UPDATE reservations SET payment_status = ? WHERE group_id = ?').run(body.payment_status, id);
    }
    if (body.check_in) {
      db.prepare('UPDATE reservations SET check_in = ? WHERE group_id = ?').run(body.check_in, id);
    }
    if (body.check_out) {
      db.prepare('UPDATE reservations SET check_out = ? WHERE group_id = ?').run(body.check_out, id);
    }
    if (body.nights) {
      db.prepare('UPDATE reservations SET nights = ? WHERE group_id = ?').run(body.nights, id);
    }
    if (body.source) {
      db.prepare('UPDATE reservations SET source = ? WHERE group_id = ?').run(body.source, id);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function deleteGroupBooking(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    db.prepare('DELETE FROM reservations WHERE group_id = ?').run(id);
    db.prepare('DELETE FROM reservation_groups WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
