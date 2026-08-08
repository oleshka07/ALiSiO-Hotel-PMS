/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+');
}

export async function checkDedup(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { email, phone, whatsapp, lastName, externalBookingId } = body;

    if (!email && !phone && !whatsapp && !lastName && !externalBookingId) {
      return NextResponse.json(
        { error: 'At least one search field is required' },
        { status: 400 }
      );
    }

    const matches: Array<{
      type: 'lead' | 'guest' | 'reservation';
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      matchedBy: string;
      stage?: string;
      source?: string;
      reservationId?: string;
      reservationStatus?: string;
    }> = [];

    const seenIds = new Set<string>();

    if (externalBookingId) {
      const rows = db.prepare(`
        SELECT r.id as reservation_id, r.status, r.guest_id, r.external_uid, r.bcom_reservation_id,
          g.id as gid, g.first_name, g.last_name, g.email, g.phone
        FROM reservations r
        JOIN guests g ON g.id = r.guest_id
        WHERE r.external_uid = ? OR r.bcom_reservation_id = ?
      `).all(externalBookingId, externalBookingId) as any[];

      for (const r of rows) {
        const key = `reservation-${r.reservation_id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          matches.push({
            type: 'reservation', id: r.reservation_id,
            name: `${r.first_name} ${r.last_name || ''}`.trim(),
            email: r.email, phone: r.phone,
            matchedBy: 'external_booking_id',
            reservationId: r.reservation_id, reservationStatus: r.status,
          });
        }
      }
    }

    if (email) {
      const leads = db.prepare(
        'SELECT id, first_name, last_name, email, phone, stage, source FROM crm_leads WHERE email = ? COLLATE NOCASE'
      ).all(email) as any[];

      for (const l of leads) {
        const key = `lead-${l.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          matches.push({ type: 'lead', id: l.id, name: `${l.first_name} ${l.last_name || ''}`.trim(), email: l.email, phone: l.phone, matchedBy: 'email', stage: l.stage, source: l.source });
        }
      }

      const guests = db.prepare(
        'SELECT id, first_name, last_name, email, phone FROM guests WHERE email = ? COLLATE NOCASE'
      ).all(email) as any[];

      for (const g of guests) {
        const key = `guest-${g.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          matches.push({ type: 'guest', id: g.id, name: `${g.first_name} ${g.last_name || ''}`.trim(), email: g.email, phone: g.phone, matchedBy: 'email' });
        }
      }
    }

    if (phone) {
      const norm = normalizePhone(phone);
      const leads = db.prepare(
        'SELECT id, first_name, last_name, email, phone, whatsapp, stage, source FROM crm_leads WHERE phone = ? OR whatsapp = ? OR phone = ? OR whatsapp = ?'
      ).all(norm, norm, phone, phone) as any[];

      for (const l of leads) {
        const key = `lead-${l.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          matches.push({ type: 'lead', id: l.id, name: `${l.first_name} ${l.last_name || ''}`.trim(), email: l.email, phone: l.phone || l.whatsapp, matchedBy: 'phone', stage: l.stage, source: l.source });
        }
      }

      const guests = db.prepare(
        'SELECT id, first_name, last_name, email, phone FROM guests WHERE phone = ? OR phone = ?'
      ).all(norm, phone) as any[];

      for (const g of guests) {
        const key = `guest-${g.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          matches.push({ type: 'guest', id: g.id, name: `${g.first_name} ${g.last_name || ''}`.trim(), email: g.email, phone: g.phone, matchedBy: 'phone' });
        }
      }
    }

    if (whatsapp && whatsapp !== phone) {
      const norm = normalizePhone(whatsapp);
      const leads = db.prepare(
        'SELECT id, first_name, last_name, email, phone, whatsapp, stage, source FROM crm_leads WHERE whatsapp = ? OR phone = ? OR whatsapp = ? OR phone = ?'
      ).all(norm, norm, whatsapp, whatsapp) as any[];

      for (const l of leads) {
        const key = `lead-${l.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          matches.push({ type: 'lead', id: l.id, name: `${l.first_name} ${l.last_name || ''}`.trim(), email: l.email, phone: l.phone || l.whatsapp, matchedBy: 'whatsapp', stage: l.stage, source: l.source });
        }
      }
    }

    if (lastName) {
      const leads = db.prepare(
        'SELECT id, first_name, last_name, email, phone, stage, source FROM crm_leads WHERE last_name = ? COLLATE NOCASE'
      ).all(lastName) as any[];

      for (const l of leads) {
        const key = `lead-${l.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          matches.push({ type: 'lead', id: l.id, name: `${l.first_name} ${l.last_name || ''}`.trim(), email: l.email, phone: l.phone, matchedBy: 'last_name', stage: l.stage, source: l.source });
        }
      }

      const guests = db.prepare(
        'SELECT id, first_name, last_name, email, phone FROM guests WHERE last_name = ? COLLATE NOCASE'
      ).all(lastName) as any[];

      for (const g of guests) {
        const key = `guest-${g.id}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          matches.push({ type: 'guest', id: g.id, name: `${g.first_name} ${g.last_name || ''}`.trim(), email: g.email, phone: g.phone, matchedBy: 'last_name' });
        }
      }
    }

    return NextResponse.json({ found: matches.length > 0, count: matches.length, matches });
  } catch (error: any) {
    console.error('[CRM Dedup POST]', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
