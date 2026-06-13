/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import crypto from 'crypto';

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+');
}

function findDuplicate(db: any, data: {
  email?: string; phone?: string; whatsapp?: string;
  lastName?: string; externalBookingId?: string;
}): { type: 'lead' | 'guest' | 'reservation' | 'candidates'; data: any } | null {
  if (data.externalBookingId) {
    const res = db.prepare(`
      SELECT r.id as reservation_id, r.guest_id, g.first_name, g.last_name, g.email, g.phone
      FROM reservations r
      JOIN guests g ON g.id = r.guest_id
      WHERE r.external_uid = ? OR r.bcom_reservation_id = ?
    `).get(data.externalBookingId, data.externalBookingId);
    if (res) return { type: 'reservation', data: res };
  }

  if (data.email) {
    const lead = db.prepare('SELECT * FROM crm_leads WHERE email = ? COLLATE NOCASE').get(data.email);
    if (lead) return { type: 'lead', data: lead };
    const guest = db.prepare('SELECT * FROM guests WHERE email = ? COLLATE NOCASE').get(data.email);
    if (guest) return { type: 'guest', data: guest };
  }

  if (data.phone) {
    const norm = normalizePhone(data.phone);
    const lead = db.prepare(
      'SELECT * FROM crm_leads WHERE phone = ? OR whatsapp = ? OR phone = ? OR whatsapp = ?'
    ).get(norm, norm, data.phone, data.phone);
    if (lead) return { type: 'lead', data: lead };
    const guest = db.prepare('SELECT * FROM guests WHERE phone = ? OR phone = ?').get(norm, data.phone);
    if (guest) return { type: 'guest', data: guest };
  }

  if (data.whatsapp && data.whatsapp !== data.phone) {
    const norm = normalizePhone(data.whatsapp);
    const lead = db.prepare('SELECT * FROM crm_leads WHERE whatsapp = ? OR phone = ?').get(norm, norm);
    if (lead) return { type: 'lead', data: lead };
  }

  if (data.lastName) {
    const candidates = db.prepare(
      'SELECT * FROM guests WHERE last_name = ? COLLATE NOCASE'
    ).all(data.lastName);
    if (candidates.length > 0) return { type: 'candidates', data: candidates };
  }

  return null;
}

export async function listLeads(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search') || '';
    const stage = searchParams.get('stage') || '';
    const source = searchParams.get('source') || '';
    const priority = searchParams.get('priority') || '';
    const assigned = searchParams.get('assigned') || '';
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (search) {
      where += ` AND (
        l.first_name LIKE ? COLLATE NOCASE OR
        l.last_name LIKE ? COLLATE NOCASE OR
        l.email LIKE ? COLLATE NOCASE OR
        l.phone LIKE ? OR
        l.whatsapp LIKE ? OR
        l.external_booking_id LIKE ? OR
        (l.first_name || ' ' || COALESCE(l.last_name, '')) LIKE ? COLLATE NOCASE
      )`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s, s);
    }
    if (stage) { where += ' AND l.stage = ?'; params.push(stage); }
    if (source) { where += ' AND l.source = ?'; params.push(source); }
    if (priority) { where += ' AND l.priority = ?'; params.push(priority); }
    if (assigned) { where += ' AND l.assigned_to = ?'; params.push(assigned); }

    const leads = db.prepare(`
      SELECT
        l.*,
        ch.name as channel_name,
        ch.channel_type,
        u.full_name as assigned_name,
        g.first_name as guest_first_name,
        g.last_name as guest_last_name,
        r.status as reservation_status,
        r.payment_status,
        r.total_price as reservation_total,
        (SELECT COUNT(*) FROM crm_conversations WHERE lead_id = l.id) as conversation_count,
        (SELECT COUNT(*) FROM crm_messages m
         JOIN crm_conversations c ON c.id = m.conversation_id
         WHERE c.lead_id = l.id) as message_count
      FROM crm_leads l
      LEFT JOIN crm_channels ch ON ch.id = l.channel_id
      LEFT JOIN app_users u ON u.id = l.assigned_to
      LEFT JOIN guests g ON g.id = l.guest_id
      LEFT JOIN reservations r ON r.id = l.reservation_id
      ${where}
      ORDER BY l.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM crm_leads l ${where}
    `).get(...params) as { count: number };

    return NextResponse.json({ leads, total: total.count, limit, offset });
  } catch (error: any) {
    console.error('[CRM Leads GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export function executeCreateLead(db: any, body: any) {
  const {
    firstName, lastName, email, phone, whatsapp,
    source = 'manual', channelId, externalBookingId,
    checkInDate, checkOutDate, adults, children,
    unitTypePreference, estimatedValue,
    campingChildrenJson, campingVehicleType, campingTentType,
    campingElectricity, campingPetsJson,
    priority = 'normal', assignedTo, notes, tags,
    skipDedup = false,
  } = body;

  if (!firstName) {
    throw new Error("Ім'я обов'язкове");
  }

  if (!skipDedup) {
    const dup = findDuplicate(db, { email, phone, whatsapp, lastName, externalBookingId });
    if (dup) {
      const error: any = new Error('Duplicate found');
      error.isDuplicate = true;
      error.duplicateType = dup.type;
      error.duplicateData = dup.data;
      throw error;
    }
  }

  const org = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
  if (!org) throw new Error('Organization not found');

  const id = crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(`
    INSERT INTO crm_leads (
      id, organization_id, first_name, last_name, email, phone, whatsapp,
      source, channel_id, external_booking_id,
      stage, priority, assigned_to,
      check_in_date, check_out_date, adults, children,
      unit_type_preference, estimated_value,
      camping_children_json, camping_vehicle_type, camping_tent_type,
      camping_electricity, camping_pets_json,
      notes, tags, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      'new', ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?
    )
  `).run(
    id, org.id, firstName, lastName || null, email || null, phone || null, whatsapp || null,
    source, channelId || null, externalBookingId || null,
    priority, assignedTo || null,
    checkInDate || null, checkOutDate || null, adults || 0, children || 0,
    unitTypePreference || null, estimatedValue || 0,
    campingChildrenJson || null, campingVehicleType || null, campingTentType || null,
    campingElectricity || 0, campingPetsJson || null,
    notes || null, tags || null, now, now
  );

  const histId = crypto.randomBytes(8).toString('hex');
  db.prepare(`
    INSERT INTO crm_stage_history (id, lead_id, from_stage, to_stage, trigger, notes, created_at)
    VALUES (?, ?, NULL, 'new', 'manual', 'Лід створено', ?)
  `).run(histId, id, now);

  const convId = crypto.randomBytes(8).toString('hex');
  db.prepare(`
    INSERT INTO crm_conversations (id, lead_id, subject, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(convId, id, `${firstName} ${lastName || ''} — ${source}`.trim(), now, now);

  const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(id);
  return { lead, conversationId: convId };
}

export async function createLead(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    
    const result = executeCreateLead(db, body);
    return NextResponse.json(result.lead, { status: 201 });
  } catch (error: any) {
    if (error.isDuplicate) {
      return NextResponse.json({
        duplicate: true,
        duplicateType: error.duplicateType,
        duplicateData: error.duplicateData,
        message: error.duplicateType === 'lead'
          ? `Лід вже існує: ${error.duplicateData.first_name} ${error.duplicateData.last_name || ''}`
          : error.duplicateType === 'guest'
          ? `Гість знайдений: ${error.duplicateData.first_name} ${error.duplicateData.last_name || ''}`
          : error.duplicateType === 'reservation'
          ? `Бронювання знайдено: ${error.duplicateData.first_name} ${error.duplicateData.last_name || ''}`
          : `Знайдено ${error.duplicateData.length} можливих збігів за прізвищем`,
      }, { status: 409 });
    }
    if (error.message === "Ім'я обов'язкове") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[CRM Leads POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
