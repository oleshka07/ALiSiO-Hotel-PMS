/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function getConversation(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const conversation = db.prepare(`
      SELECT c.*, l.first_name, l.last_name, l.email, l.phone, l.whatsapp,
        l.stage, l.source, l.priority, l.check_in_date, l.check_out_date,
        l.adults, l.children, l.estimated_value, l.currency, l.external_booking_id,
        l.camping_vehicle_type, l.camping_tent_type,
        g.country as guest_country,
        r.status as reservation_status, r.payment_status, r.total_price,
        r.external_uid, r.bcom_reservation_id
      FROM crm_conversations c
      JOIN crm_leads l ON l.id = c.lead_id
      LEFT JOIN guests g ON g.id = l.guest_id
      LEFT JOIN reservations r ON r.id = l.reservation_id
      WHERE c.id = ?
    `).get(id);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const messages = db.prepare(`
      SELECT m.*, u.full_name as staff_name
      FROM crm_messages m
      LEFT JOIN app_users u ON u.id = m.sender_id AND m.sender_type = 'staff'
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `).all(id);

    db.prepare(`
      UPDATE crm_messages SET read_at = datetime('now')
      WHERE conversation_id = ? AND direction = 'inbound' AND read_at IS NULL
    `).run(id);
    db.prepare(`UPDATE crm_conversations SET unread_count = 0 WHERE id = ?`).run(id);
    db.prepare(`
      UPDATE crm_leads SET unread_count = (
        SELECT COALESCE(SUM(c.unread_count), 0) FROM crm_conversations c WHERE c.lead_id = crm_leads.id
      ) WHERE id = (SELECT lead_id FROM crm_conversations WHERE id = ?)
    `).run(id);

    return NextResponse.json({ ...conversation as any, messages });
  } catch (error: any) {
    console.error('[CRM Conversation GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
