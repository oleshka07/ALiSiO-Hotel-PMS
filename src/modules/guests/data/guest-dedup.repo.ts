/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';

export interface GuestDedupArgs {
  organizationId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  // Optional fields filled in / updated when creating or matching:
  address?: string | null;
  city?: string | null;
  country?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
}

export interface GuestDedupResult {
  id: string;
  isNew: boolean;
  matchedBy: 'email' | 'phone' | 'name' | 'created';
}

/**
 * Unified guest dedup. Resolves a guest record using a priority chain:
 *
 *   1. email + organization_id              (highest signal — emails are unique-ish)
 *   2. phone + organization_id              (good signal when phone present)
 *   3. first_name + last_name (case-i.) + organization_id   (last resort)
 *
 * If none match, creates a new row. Optional fields fill in NULLs on the
 * existing row but never overwrite already-set data, so re-importing a guest
 * from a less-detailed source (e.g. Booking.com Excel without phone) cannot
 * wipe data set from a more detailed source (e.g. portal self-registration).
 *
 * Caller is responsible for providing a valid organizationId.
 */
export function findOrCreateGuest(args: GuestDedupArgs): GuestDedupResult {
  const db = getDb();
  const orgId = args.organizationId;
  const firstName = (args.firstName || '').trim();
  const lastName = (args.lastName || '').trim();
  const email = args.email ? args.email.trim() : null;
  const phone = args.phone ? args.phone.trim() : null;

  const looksLikeRealEmail = (e: string | null) => !!e && /@/.test(e);
  const looksLikePhone = (p: string | null) => !!p && p.replace(/\D/g, '').length >= 6;

  let existing: any = null;
  let matchedBy: GuestDedupResult['matchedBy'] = 'created';

  if (looksLikeRealEmail(email)) {
    existing = db.prepare(
      'SELECT id FROM guests WHERE LOWER(email) = LOWER(?) AND organization_id = ? LIMIT 1',
    ).get(email, orgId);
    if (existing) matchedBy = 'email';
  }

  if (!existing && looksLikePhone(phone)) {
    existing = db.prepare(
      'SELECT id FROM guests WHERE phone = ? AND organization_id = ? LIMIT 1',
    ).get(phone, orgId);
    if (existing) matchedBy = 'phone';
  }

  if (!existing && firstName && lastName) {
    existing = db.prepare(
      'SELECT id, first_name, last_name FROM guests WHERE organization_id = ? AND ((LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)) OR (LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?))) LIMIT 1',
    ).get(orgId, firstName, lastName, lastName, firstName) as any;
    if (existing) {
      matchedBy = 'name';
      // If first/last name were stored in reverse order (e.g. from OTA import), correct them now
      if (existing.first_name && existing.last_name && existing.first_name.toLowerCase() === lastName.toLowerCase() && existing.last_name.toLowerCase() === firstName.toLowerCase()) {
        db.prepare("UPDATE guests SET first_name = ?, last_name = ?, updated_at = datetime('now') WHERE id = ?").run(firstName, lastName, existing.id);
      }
    }
  }

  if (existing) {
    // Soft-merge: only fill columns that are currently empty.
    const updates: string[] = [];
    const values: any[] = [];
    const fillIfEmpty = (col: string, val: string | null | undefined) => {
      if (val == null || val === '') return;
      updates.push(`${col} = COALESCE(NULLIF(${col}, ''), ?)`);
      values.push(val);
    };
    fillIfEmpty('email', email);
    fillIfEmpty('phone', phone);
    fillIfEmpty('address', args.address);
    fillIfEmpty('city', args.city);
    fillIfEmpty('country', args.country);
    fillIfEmpty('nationality', args.nationality);
    fillIfEmpty('date_of_birth', args.dateOfBirth);
    fillIfEmpty('document_type', args.documentType);
    fillIfEmpty('document_number', args.documentNumber);
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(existing.id);
      db.prepare(`UPDATE guests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    return { id: existing.id, isNew: false, matchedBy };
  }

  // Create new
  const guestId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO guests (
      id, organization_id, first_name, last_name,
      email, phone, address, city, country, nationality,
      date_of_birth, document_type, document_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guestId, orgId, firstName, lastName,
    email || null, phone || null, args.address || null, args.city || null, args.country || null, args.nationality || null,
    args.dateOfBirth || null, args.documentType || null, args.documentNumber || null,
  );
  return { id: guestId, isNew: true, matchedBy: 'created' };
}
