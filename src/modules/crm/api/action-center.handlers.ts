/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function getActionCenter(_request: NextRequest) {
  try {
    const db = getDb();

    // 1. Needs Reply — last message was inbound, unanswered
    const needsReply = db.prepare(`
      SELECT l.*,
        m.content as last_message, m.created_at as last_message_at,
        (SELECT COUNT(*) FROM crm_messages m2
         JOIN crm_conversations c2 ON c2.id = m2.conversation_id
         WHERE c2.lead_id = l.id AND m2.read_at IS NULL AND m2.direction = 'inbound') as unread_count
      FROM crm_leads l
      JOIN crm_conversations c ON c.lead_id = l.id
      JOIN crm_messages m ON m.conversation_id = c.id
      WHERE m.direction = 'inbound'
        AND m.id = (
          SELECT m3.id FROM crm_messages m3
          WHERE m3.conversation_id = c.id
          ORDER BY m3.created_at DESC LIMIT 1
        )
        AND l.stage NOT IN ('lost', 'spam', 'booked', 'check_in', 'in_stay', 'check_out', 'post_stay')
      ORDER BY m.created_at ASC
      LIMIT 20
    `).all();

    // 2. Pending Drafts — AI drafts waiting for approval
    // crm_ai_training may not have a proper pending status field yet;
    // return empty array as a safe fallback
    let pendingDrafts: any[] = [];
    try {
      pendingDrafts = db.prepare(`
        SELECT t.*, l.first_name, l.last_name, l.stage, l.id as lead_id
        FROM crm_ai_training t
        JOIN crm_conversations c ON c.id = t.conversation_id
        JOIN crm_leads l ON l.id = c.lead_id
        WHERE t.was_approved = 0 AND t.was_edited = 0
        ORDER BY t.created_at DESC
        LIMIT 20
      `).all();
    } catch {
      // table or columns may not exist yet — keep empty
      pendingDrafts = [];
    }

    // 3. Check-ins Today / Tomorrow
    const checkInsToday = db.prepare(`
      SELECT * FROM crm_leads
      WHERE check_in_date IN (date('now'), date('now', '+1 day'))
        AND stage IN ('booked', 'pre_stay', 'deposit_paid')
      ORDER BY check_in_date ASC
    `).all();

    // 4. Awaiting Payment
    const awaitingPayment = db.prepare(`
      SELECT * FROM crm_leads
      WHERE stage IN ('quote_sent', 'negotiation')
      ORDER BY updated_at DESC
      LIMIT 20
    `).all();

    // 5. Post-Stay
    const postStay = db.prepare(`
      SELECT * FROM crm_leads
      WHERE stage IN ('check_out', 'post_stay')
      ORDER BY updated_at DESC
      LIMIT 10
    `).all();

    // KPI summary
    const totalLeads = (db.prepare(
      `SELECT COUNT(*) as count FROM crm_leads`
    ).get() as any).count;

    const unansweredCount = needsReply.length;

    const activeBookings = (db.prepare(
      `SELECT COUNT(*) as count FROM crm_leads WHERE stage IN ('booked', 'in_stay')`
    ).get() as any).count;

    const totalValue = (db.prepare(
      `SELECT COALESCE(SUM(estimated_value), 0) as total FROM crm_leads WHERE stage NOT IN ('lost', 'spam')`
    ).get() as any).total;

    return NextResponse.json({
      queues: {
        needsReply,
        pendingDrafts,
        checkInsToday,
        awaitingPayment,
        postStay,
      },
      kpi: {
        totalLeads,
        unansweredCount,
        activeBookings,
        totalValue,
      },
    });
  } catch (error: any) {
    console.error('[CRM ActionCenter GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
