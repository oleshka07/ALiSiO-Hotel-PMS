/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import type { CreateGuestInput } from '../domain/types';

export function listGuests(filters: { search?: string; country?: string } = {}, page: number = 1, limit: number = 50) {
  const db = getDb();
  let where = 'WHERE 1=1';
  const params: string[] = [];

  if (filters.search) {
    where += ` AND (g.first_name LIKE ? OR g.last_name LIKE ? OR (g.first_name || ' ' || g.last_name) LIKE ? OR g.email LIKE ? OR g.phone LIKE ?)`;
    const like = `%${filters.search}%`;
    params.push(like, like, like, like, like);
  }
  if (filters.country) {
    where += ' AND g.country = ?';
    params.push(filters.country);
  }

  const countQuery = `SELECT COUNT(*) as total FROM guests g ${where}`;
  const totalRow = db.prepare(countQuery).get(...params) as { total: number };
  const total = totalRow.total;

  const offset = (page - 1) * limit;

  let query = `
    SELECT
      g.*,
      (SELECT COUNT(*) FROM reservations r WHERE r.guest_id = g.id) as total_stays,
      (SELECT SUM(r.total_price) FROM reservations r WHERE r.guest_id = g.id) as total_revenue,
      (SELECT MAX(r.check_in) FROM reservations r WHERE r.guest_id = g.id) as last_check_in,
      (SELECT r.status FROM reservations r WHERE r.guest_id = g.id ORDER BY r.check_in DESC LIMIT 1) as last_booking_status
    FROM guests g
    ${where}
    ORDER BY g.last_name, g.first_name
    LIMIT ? OFFSET ?
  `;
  params.push(limit.toString(), offset.toString());
  const data = db.prepare(query).all(...params);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

export function getGuestWithReservations(id: string) {
  const db = getDb();
  const guest = db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM reservations r WHERE r.guest_id = g.id) as total_stays,
      (SELECT SUM(r.total_price) FROM reservations r WHERE r.guest_id = g.id) as total_revenue
    FROM guests g WHERE g.id = ?
  `).get(id);

  if (!guest) return null;

  const reservations = db.prepare(`
    SELECT r.id, r.check_in, r.check_out, r.nights, r.adults, r.children,
      r.status, r.payment_status, r.source, r.total_price, r.currency,
      u.name as unit_name, u.code as unit_code,
      c.name as category_name, c.type as category_type
    FROM reservations r
    JOIN units u ON r.unit_id = u.id
    JOIN categories c ON u.category_id = c.id
    WHERE r.guest_id = ?
    ORDER BY r.check_in DESC
  `).all(id);

  return { ...(guest as object), reservations };
}

export function createGuest(input: CreateGuestInput): string {
  const db = getDb();
  const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string };
  const guestId = `g_${Date.now()}`;

  db.prepare(`
    INSERT INTO guests (id, organization_id, first_name, last_name, email, phone, country, city, address, document_type, document_number, date_of_birth, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guestId, org.id, input.firstName, input.lastName,
    input.email ?? null, input.phone ?? null, input.country ?? null,
    input.city ?? null, input.address ?? null,
    input.documentType ?? null, input.documentNumber ?? null,
    input.dateOfBirth ?? null, input.notes ?? null,
  );

  return guestId;
}

export function updateGuest(id: string, body: Record<string, any>): boolean {
  const db = getDb();
  const fieldMap: Record<string, string> = {
    firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone',
    country: 'country', city: 'city', address: 'address',
    documentType: 'document_type', documentNumber: 'document_number',
    dateOfBirth: 'date_of_birth', whatsapp: 'whatsapp', language: 'language', notes: 'notes',
  };

  const sets: string[] = [];
  const values: (string | null)[] = [];

  for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
    if (body[jsKey] !== undefined) {
      sets.push(`${dbCol} = ?`);
      values.push(body[jsKey] || null);
    }
  }

  if (sets.length === 0) return false;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE guests SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return true;
}

export function deleteGuest(id: string): { ok: boolean; error?: string } {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as cnt FROM reservations WHERE guest_id = ?').get(id) as { cnt: number };
  if (count.cnt > 0) {
    return { ok: false, error: `Неможливо видалити гостя — є ${count.cnt} пов'язаних бронювань. Спочатку видаліть або перепризначте бронювання.` };
  }
  db.prepare('DELETE FROM guests WHERE id = ?').run(id);
  return { ok: true };
}
