/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { syncLeadToGuest, findOrCreateGuestForLead } from '@/lib/sync/guest-lead-sync'; // TODO: replace with eventBus

export async function getLead(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const lead = db.prepare(`
      SELECT
        l.*,
        ch.name as channel_name,
        ch.channel_type,
        u.full_name as assigned_name,
        g.first_name as guest_first_name,
        g.last_name as guest_last_name,
        g.email as guest_email,
        g.phone as guest_phone,
        g.country as guest_country,
        g.document_type as guest_doc_type,
        g.document_number as guest_doc_number,
        r.id as res_id,
        r.status as reservation_status,
        r.payment_status,
        r.total_price as reservation_total,
        r.check_in as reservation_check_in,
        r.check_out as reservation_check_out,
        r.unit_id,
        r.external_uid,
        r.bcom_reservation_id,
        r.registration_status
      FROM crm_leads l
      LEFT JOIN crm_channels ch ON ch.id = l.channel_id
      LEFT JOIN app_users u ON u.id = l.assigned_to
      LEFT JOIN guests g ON g.id = l.guest_id
      LEFT JOIN reservations r ON r.id = l.reservation_id
      WHERE l.id = ?
    `).get(id);

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const conversations = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM crm_messages WHERE conversation_id = c.id) as message_count,
        (SELECT content FROM crm_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM crm_conversations c
      WHERE c.lead_id = ?
      ORDER BY c.updated_at DESC
    `).all(id);

    const stageHistory = db.prepare(`
      SELECT sh.*, u.full_name as changed_by_name
      FROM crm_stage_history sh
      LEFT JOIN app_users u ON u.id = sh.changed_by
      WHERE sh.lead_id = ?
      ORDER BY sh.created_at DESC
    `).all(id);

    return NextResponse.json({ ...lead as any, conversations, stageHistory });
  } catch (error: any) {
    console.error('[CRM Lead GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function updateLead(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const existing = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const allowedFields: Record<string, string> = {
      firstName: 'first_name', lastName: 'last_name',
      email: 'email', phone: 'phone', whatsapp: 'whatsapp',
      source: 'source', channelId: 'channel_id',
      externalBookingId: 'external_booking_id',
      priority: 'priority', assignedTo: 'assigned_to',
      guestId: 'guest_id', reservationId: 'reservation_id',
      guestPageToken: 'guest_page_token',
      checkInDate: 'check_in_date', checkOutDate: 'check_out_date',
      adults: 'adults', children: 'children',
      unitTypePreference: 'unit_type_preference',
      estimatedValue: 'estimated_value', currency: 'currency',
      campingChildrenJson: 'camping_children_json',
      campingVehicleType: 'camping_vehicle_type',
      campingTentType: 'camping_tent_type',
      campingElectricity: 'camping_electricity',
      campingPetsJson: 'camping_pets_json',
      tags: 'tags', notes: 'notes',
      country: 'country', nationality: 'nationality', language: 'language',
    };

    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    for (const [bodyKey, dbCol] of Object.entries(allowedFields)) {
      if (bodyKey in body) {
        sets.push(`${dbCol} = ?`);
        values.push(body[bodyKey] ?? null);
      }
    }

    values.push(id);
    db.prepare(`UPDATE crm_leads SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    try {
      if (!existing.guest_id) findOrCreateGuestForLead(id);
      else syncLeadToGuest(id);
    } catch (syncErr) {
      console.warn('[CRM Lead PATCH] Sync error (non-fatal):', syncErr);
    }

    const updated = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[CRM Lead PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteLead(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM crm_leads WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    db.transaction(() => {
      // Clear auto drafts and AI training data related to this lead's conversations
      db.prepare('DELETE FROM crm_auto_drafts WHERE lead_id = ?').run(id);
      db.prepare(`
        DELETE FROM crm_ai_training 
        WHERE conversation_id IN (SELECT id FROM crm_conversations WHERE lead_id = ?)
      `).run(id);

      // Delete messages belonging to conversations of this lead
      db.prepare(`
        DELETE FROM crm_messages 
        WHERE conversation_id IN (SELECT id FROM crm_conversations WHERE lead_id = ?)
      `).run(id);
      
      // Delete conversations
      db.prepare('DELETE FROM crm_conversations WHERE lead_id = ?').run(id);
      
      // Delete stage history
      db.prepare('DELETE FROM crm_stage_history WHERE lead_id = ?').run(id);
      
      // Finally, delete the lead
      db.prepare('DELETE FROM crm_leads WHERE id = ?').run(id);
    })();
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[CRM Lead DELETE]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
