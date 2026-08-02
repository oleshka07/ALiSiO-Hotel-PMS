/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import type { RegisteredGuest } from '../domain/types';
import { findOrCreateGuest } from './guest-dedup.repo';
import crypto from 'crypto';

export function getReservationForRegistration(token: string) {
  return getDb().prepare(`
    SELECT r.id, r.guest_id as booking_guest_id, r.check_in, r.check_out, r.nights,
           r.adults, r.total_price, r.currency, r.source, r.status, r.payment_status,
           g.first_name as booking_first_name, g.last_name as booking_last_name,
           g.email as booking_email, g.phone as booking_phone,
           u.name as unit_name, ut.name as unit_type_name,
           p.organization_id, p.name as property_name
    FROM reservations r
    JOIN properties p ON r.property_id = p.id
    JOIN guests g ON r.guest_id = g.id
    JOIN units u ON r.unit_id = u.id
    JOIN unit_types ut ON u.unit_type_id = ut.id
    WHERE r.guest_page_token = ?
  `).get(token) as any;
}

/**
 * Bi-directional sync helper that guarantees 100% data parity between:
 *  1) `reservation_guests` (Guest Portal & Foreigners/Police Registry view)
 *  2) `guest_registrations` JOIN `guests` (PMS Admin Modal & Invoices view)
 *  3) `reservations.registration_status` and primary guest profile
 */
// This module rebuilds reservation_guests with DELETE-then-INSERT. Everything
// the operator or the Ubyport sender wrote onto the row — the police flag, its
// reference, a hidden entry, a manual fee exemption — lives ONLY on that row and
// is not derivable from guests/guest_registrations. Without carrying it across,
// every rebuild resets police_reported to 0 and the next morning run reports the
// whole season to the foreign police again. The row id is carried too, so any
// external system that remembers what it already sent keeps its references.
const REGISTRY_STATE = [
  'id', 'created_at', 'police_reported', 'police_reported_at', 'police_report_ref',
  'is_hidden', 'fee_exempt', 'fee_exempt_reason',
] as const;

function carryRegistryState(target: any, row: any) {
  if (!row) return;
  for (const f of REGISTRY_STATE) {
    if (row[f] !== undefined && row[f] !== null) target[f] = row[f];
  }
}

export function syncReservationGuestData(db: any, reservationId: string) {
  const res = db.prepare('SELECT id, adults, nights, guest_id FROM reservations WHERE id = ?').get(reservationId) as any;
  if (!res) return;

  const nights = res.nights || 0;
  const neededAdults = res.adults || 1;

  // 1. Fetch current rows from both tables
  const regGuests = db.prepare('SELECT * FROM reservation_guests WHERE reservation_id = ? ORDER BY created_at ASC').all(reservationId) as any[];
  const grGuests = db.prepare(`
    SELECT gr.id as gr_id, gr.is_primary, gr.purpose_of_stay as gr_purpose, gr.visa_number as gr_visa,
           g.id as guest_id, g.first_name, g.last_name, g.date_of_birth, g.country as nationality,
           g.document_type, g.document_number, g.address, g.email, g.phone
    FROM guest_registrations gr
    JOIN guests g ON gr.guest_id = g.id
    WHERE gr.reservation_id = ?
    ORDER BY gr.is_primary DESC, gr.created_at ASC
  `).all(reservationId) as any[];

  // 2. Merge into unified list
  const merged: any[] = [];
  const processedGuestIds = new Set<string>();

  // Process grGuests (PMS Admin entries)
  for (const gr of grGuests) {
    merged.push({
      guest_id: gr.guest_id,
      first_name: gr.first_name,
      last_name: gr.last_name,
      date_of_birth: gr.date_of_birth,
      nationality: gr.nationality,
      document_type: gr.document_type,
      document_number: gr.document_number,
      address: gr.address,
      email: gr.email,
      phone: gr.phone,
      purpose_of_stay: gr.gr_purpose || 'Tourism',
      visa_number: gr.gr_visa || null,
      is_primary: gr.is_primary ? 1 : 0,
    });
    if (gr.guest_id) processedGuestIds.add(gr.guest_id);
  }

  // Process regGuests (Guest Portal entries)
  for (const rg of regGuests) {
    let existingIndex = -1;
    if (rg.guest_id && processedGuestIds.has(rg.guest_id)) {
      existingIndex = merged.findIndex(m => m.guest_id === rg.guest_id);
    } else if (rg.document_number) {
      existingIndex = merged.findIndex(m => m.document_number && m.document_number.toLowerCase() === rg.document_number.toLowerCase());
    } else if (rg.first_name && rg.last_name) {
      existingIndex = merged.findIndex(m =>
        (m.first_name?.toLowerCase() === rg.first_name.toLowerCase() && m.last_name?.toLowerCase() === rg.last_name.toLowerCase()) ||
        (m.first_name?.toLowerCase() === rg.last_name.toLowerCase() && m.last_name?.toLowerCase() === rg.first_name.toLowerCase())
      );
    }

    if (existingIndex >= 0) {
      const m = merged[existingIndex];
      m.first_name = rg.first_name || m.first_name;
      m.last_name = rg.last_name || m.last_name;
      m.date_of_birth = rg.date_of_birth || m.date_of_birth;
      m.nationality = rg.nationality || m.nationality;
      m.document_type = rg.document_type || m.document_type;
      m.document_number = rg.document_number || m.document_number;
      m.address = rg.address || m.address;
      m.purpose_of_stay = rg.purpose_of_stay || m.purpose_of_stay;
      m.visa_number = rg.visa_number || m.visa_number;
      if (rg.guest_id) m.guest_id = rg.guest_id;
      carryRegistryState(m, rg);
    } else {
      const entry = {
        guest_id: rg.guest_id,
        first_name: rg.first_name,
        last_name: rg.last_name,
        date_of_birth: rg.date_of_birth,
        nationality: rg.nationality,
        document_type: rg.document_type,
        document_number: rg.document_number,
        address: rg.address,
        email: null,
        phone: null,
        purpose_of_stay: rg.purpose_of_stay || 'Tourism',
        visa_number: rg.visa_number || null,
        is_primary: merged.length === 0 ? 1 : 0,
      };
      carryRegistryState(entry, rg);
      merged.push(entry);
      if (rg.guest_id) processedGuestIds.add(rg.guest_id);
    }
  }

  const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
  const orgId = org?.id || 'org_alisio_001';

  // 3. Rewrite both tables in a single transaction
  db.transaction(() => {
    db.prepare('DELETE FROM reservation_guests WHERE reservation_id = ?').run(reservationId);
    db.prepare('DELETE FROM guest_registrations WHERE reservation_id = ?').run(reservationId);

    const insertRg = db.prepare(`
      INSERT INTO reservation_guests (
        id, created_at, reservation_id, first_name, last_name, date_of_birth, address,
        nationality, document_type, document_number, guest_id, fee_amount,
        fee_exempt, fee_exempt_reason, purpose_of_stay, visa_number,
        police_reported, police_reported_at, police_report_ref, is_hidden
      ) VALUES (COALESCE(?, lower(hex(randomblob(16)))), COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertGr = db.prepare(`
      INSERT INTO guest_registrations (
        id, reservation_id, guest_id, is_primary, reg_status, registered_at,
        purpose_of_stay, visa_number
      ) VALUES (?, ?, ?, ?, 'completed', datetime('now'), ?, ?)
    `);

    let isPrimary = 1;
    for (const item of merged) {
      if (!item.first_name || !item.last_name) continue;

      let feeExempt = 0;
      let feeAmount = nights * 20;
      let feeReason: string | null = null;
      if (item.date_of_birth) {
        const dob = new Date(item.date_of_birth);
        const ageDifMs = Date.now() - dob.getTime();
        const ageDate = new Date(ageDifMs);
        const age = Math.abs(ageDate.getUTCFullYear() - 1970);
        if (age < 18) {
          feeExempt = 1;
          feeAmount = 0;
          feeReason = 'Dítě do 18 let';
        }
      }
      // An exemption the operator granted by hand is not re-derivable from the
      // date of birth, so the age rule must not silently revoke it.
      if (!feeExempt && item.fee_exempt) {
        feeExempt = 1;
        feeAmount = 0;
        feeReason = item.fee_exempt_reason ?? null;
      }

      let guestId = item.guest_id;
      if (!guestId) {
        const dedupped = findOrCreateGuest({
          organizationId: orgId,
          firstName: item.first_name,
          lastName: item.last_name,
          email: item.email,
          phone: item.phone,
          dateOfBirth: item.date_of_birth,
          documentType: item.document_type,
          documentNumber: item.document_number,
          nationality: item.nationality,
          address: item.address,
        });
        guestId = dedupped.id;
      } else {
        db.prepare(`
          UPDATE guests
          SET first_name = ?, last_name = ?, date_of_birth = COALESCE(?, date_of_birth),
              document_type = COALESCE(?, document_type), document_number = COALESCE(?, document_number),
              country = COALESCE(?, country), address = COALESCE(?, address), updated_at = datetime('now')
          WHERE id = ?
        `).run(item.first_name, item.last_name, item.date_of_birth || null,
               item.document_type || null, item.document_number || null,
               item.nationality || null, item.address || null, guestId);
      }

      insertRg.run(
        item.id ?? null, item.created_at ?? null,
        reservationId, item.first_name, item.last_name, item.date_of_birth || null,
        item.address || null, item.nationality || null, item.document_type || null,
        item.document_number || null, guestId, feeAmount, feeExempt, feeReason,
        item.purpose_of_stay || 'Tourism', item.visa_number || null,
        item.police_reported ? 1 : 0, item.police_reported_at ?? null,
        item.police_report_ref ?? null, item.is_hidden ? 1 : 0,
      );

      if (guestId) {
        const grId = `gr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        insertGr.run(grId, reservationId, guestId, isPrimary, item.purpose_of_stay || 'Tourism', item.visa_number || null);
      }

      if (isPrimary && guestId) {
        db.prepare('UPDATE reservations SET guest_id = ? WHERE id = ?').run(guestId, reservationId);
      }

      isPrimary = 0;
    }

    const status = merged.length >= neededAdults ? 'registered' : 'not_registered';
    db.prepare('UPDATE reservations SET registration_status = ? WHERE id = ?').run(status, reservationId);
  })();
}

export function saveRegistrations(reservationId: string, organizationId: string, guests: RegisteredGuest[], clientIp?: string) {
  const db = getDb();

  // A re-submit must not look like a brand-new guest to the Ubyport sender:
  // keep the police flag, the report reference and the row id from the row this
  // one replaces. Matched on document number first, then on the name pair.
  const prior = db.prepare(
    'SELECT * FROM reservation_guests WHERE reservation_id = ?',
  ).all(reservationId) as any[];
  const priorOf = (g: RegisteredGuest) => prior.find((p) =>
    (g.documentNumber && p.document_number
      && String(p.document_number).toLowerCase() === String(g.documentNumber).toLowerCase())
    || (String(p.first_name || '').toLowerCase() === String(g.firstName || '').toLowerCase()
      && String(p.last_name || '').toLowerCase() === String(g.lastName || '').toLowerCase()));

  // Clear both tables for this reservation (idempotent re-submit)
  db.prepare('DELETE FROM reservation_guests WHERE reservation_id = ?').run(reservationId);
  db.prepare('DELETE FROM guest_registrations WHERE reservation_id = ?').run(reservationId);

  const insertRg = db.prepare(`
    INSERT INTO reservation_guests (id, created_at, reservation_id, first_name, last_name, date_of_birth, address, nationality, document_type, document_number, guest_id, fee_amount, fee_exempt, fee_exempt_reason, purpose_of_stay, visa_number, police_reported, police_reported_at, police_report_ref, is_hidden)
    VALUES (COALESCE(?, lower(hex(randomblob(16)))), COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    const reservation = db.prepare('SELECT adults, nights FROM reservations WHERE id = ?').get(reservationId) as any;
    const nights = reservation?.nights || 0;

    for (const guest of guests) {
      if (!guest.firstName || !guest.lastName) throw new Error('firstName and lastName are required');

      const dedupped = findOrCreateGuest({
        organizationId,
        firstName: guest.firstName,
        lastName: guest.lastName,
        dateOfBirth: guest.dateOfBirth,
        documentType: guest.documentType,
        documentNumber: guest.documentNumber,
        nationality: guest.nationality,
        address: guest.address,
      });

      const was = priorOf(guest);

      let feeExempt = 0;
      let feeAmount = nights * 20;
      let feeReason: string | null = null;
      if (guest.dateOfBirth) {
        const dob = new Date(guest.dateOfBirth);
        const ageDifMs = Date.now() - dob.getTime();
        const ageDate = new Date(ageDifMs);
        const age = Math.abs(ageDate.getUTCFullYear() - 1970);
        if (age < 18) {
          feeExempt = 1;
          feeAmount = 0;
          feeReason = 'Dítě do 18 let';
        }
      }
      if (!feeExempt && was?.fee_exempt) {
        feeExempt = 1;
        feeAmount = 0;
        feeReason = was.fee_exempt_reason ?? null;
      }

      insertRg.run(
        was?.id ?? null, was?.created_at ?? null,
        reservationId, guest.firstName, guest.lastName, guest.dateOfBirth ?? null,
        guest.address ?? null, guest.nationality ?? null, guest.documentType ?? null,
        guest.documentNumber ?? null, dedupped.id, feeAmount, feeExempt, feeReason,
        guest.purposeOfStay || 'Tourism', guest.visaNumber ?? null,
        was?.police_reported ? 1 : 0, was?.police_reported_at ?? null,
        was?.police_report_ref ?? null, was?.is_hidden ? 1 : 0,
      );
    }

    // Now run bi-directional sync to ensure guest_registrations, guests, and reservations are all aligned
    syncReservationGuestData(db, reservationId);
  })();

  return db.prepare('SELECT * FROM reservation_guests WHERE reservation_id = ? ORDER BY created_at').all(reservationId);
}

// ── GDPR Data Retention ───────────────────────────────────────────────────

export function anonymizeOldRegistrations(monthsToKeep = 6): number {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE guest_registrations
      SET 
        first_name = 'Anonymized',
        last_name = 'Anonymized',
        date_of_birth = NULL,
        document_number = NULL,
        document_type = NULL,
        nationality = NULL,
        address = NULL,
        email = NULL,
        phone = NULL
      WHERE id IN (
        SELECT gr.id
        FROM guest_registrations gr
        JOIN reservations r ON gr.reservation_id = r.id
        WHERE r.check_out < date('now', '-' || ? || ' months')
          AND gr.first_name != 'Anonymized'
      )
    `);
    
    const info = stmt.run(monthsToKeep);
    return info.changes;
  } catch (error) {
    console.error('Failed to anonymize old registrations:', error);
    return 0;
  }
}
