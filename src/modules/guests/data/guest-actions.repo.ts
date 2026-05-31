/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';

// ─── Feedback ─────────────────────────────────────────────────────────────────

export function getReservationIdByToken(token: string): string | null {
  const row = getDb().prepare('SELECT id FROM reservations WHERE guest_page_token = ?').get(token) as any;
  return row?.id ?? null;
}

export function saveFeedback(reservationId: string, feedback: string) {
  getDb().prepare(`
    INSERT INTO reservation_activity (id, reservation_id, type, description, created_by, created_at)
    VALUES (lower(hex(randomblob(16))), ?, 'guest_feedback', ?, 'guest', datetime('now'))
  `).run(reservationId, feedback.trim());
}

// ─── Service Orders ───────────────────────────────────────────────────────────

export function getReservationForServiceOrder(token: string) {
  return getDb().prepare('SELECT id, property_id FROM reservations WHERE guest_page_token = ?').get(token) as any;
}

export function orderServices(reservationId: string, services: { serviceId: string; quantity?: number; notes?: string }[]) {
  const db = getDb();
  const insertOrder = db.prepare('INSERT INTO service_orders (reservation_id, service_id, quantity, total_price, notes) VALUES (?, ?, ?, ?, ?)');

  db.transaction(() => {
    for (const svc of services) {
      if (!svc.serviceId) throw new Error('serviceId is required');
      const service = db.prepare('SELECT price FROM additional_services WHERE id = ?').get(svc.serviceId) as any;
      if (!service) throw new Error(`Service ${svc.serviceId} not found`);
      const qty = svc.quantity || 1;
      insertOrder.run(reservationId, svc.serviceId, qty, service.price * qty, svc.notes ?? null);
    }
  })();

  return db.prepare(`
    SELECT so.*, ads.name as service_name, ads.icon as service_icon
    FROM service_orders so
    JOIN additional_services ads ON so.service_id = ads.id
    WHERE so.reservation_id = ?
    ORDER BY so.created_at
  `).all(reservationId);
}

// ─── Pay (service order + Teya) ───────────────────────────────────────────────

export function getReservationForPay(token: string) {
  return getDb().prepare(`
    SELECT r.id, r.property_id, r.check_in, r.check_out,
           r.is_multi_room, r.multi_room_marker,
           g.first_name, g.last_name, u.name as unit_name
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    JOIN units u ON r.unit_id = u.id
    WHERE r.guest_page_token = ?
      AND r.status IN ('confirmed', 'checked_in')
      AND r.payment_status IN ('paid','prepaid','partial')
  `).get(token) as any;
}

export function getServiceForProperty(serviceId: string, propertyId: string) {
  return getDb().prepare('SELECT * FROM additional_services WHERE id = ? AND property_id = ? AND is_active = 1').get(serviceId, propertyId) as any;
}

export function createPendingServiceOrder(
  reservationId: string,
  serviceId: string,
  quantity: number,
  totalPrice: number,
  serviceDate?: string | null,
  notesJson?: string | null,
): string {
  const result = getDb().prepare(`
    INSERT INTO service_orders (reservation_id, service_id, quantity, total_price, status, payment_status, service_date, notes)
    VALUES (?, ?, ?, ?, 'pending', 'pending', ?, ?)
    RETURNING id
  `).get(reservationId, serviceId, quantity, totalPrice, serviceDate || null, notesJson || null) as any;
  return result?.id;
}

// Create one booking_service_orders row per (menu item × selected day).
// Used for breakfast cart-bundle payments — the cart line carries an
// array of menu items + dates; backend fans them out to per-row records
// so the dashboard groups breakfasts on the morning they are delivered.
export function createPendingBreakfastBundle(
  reservationId: string,
  menuItems: Array<{ menuItemId: string; quantity: number; price: number }>,
  serviceDates: string[],
): string[] {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO booking_service_orders
      (reservation_id, service_id, menu_item_id, quantity, service_date, unit_price, total_price, status, payment_status)
    VALUES (?, 'svc_breakfast', ?, ?, ?, ?, ?, 'pending', 'pending')
    RETURNING id
  `);
  const ids: string[] = [];
  for (const date of serviceDates) {
    for (const it of menuItems) {
      const row = insert.get(
        reservationId, it.menuItemId, it.quantity, date,
        it.price, it.price * it.quantity,
      ) as any;
      if (row?.id) ids.push(row.id);
    }
  }
  return ids;
}

export function updateBookingServiceOrderPaymentId(orderId: string, paymentId: string) {
  getDb().prepare('UPDATE booking_service_orders SET payment_id = ? WHERE id = ?').run(paymentId, orderId);
}

export function updateOrderPaymentId(orderId: string, paymentId: string) {
  getDb().prepare('UPDATE service_orders SET payment_id = ? WHERE id = ?').run(paymentId, orderId);
}

export function markOrderPaymentFailed(orderId: string) {
  getDb().prepare("UPDATE service_orders SET payment_status = 'failed' WHERE id = ?").run(orderId);
}

// ─── Cart Events ──────────────────────────────────────────────────────────────

export interface CartEventInput {
  reservationId?: string | null;
  guestToken: string;
  serviceId?: string | null;
  eventType: 'add' | 'remove' | 'pay_now' | 'checkout' | 'abandon';
  quantity?: number;
  phase?: string | null;
  cartTotal?: number | null;
  itemsJson?: string | null;
}

export function logCartEvent(data: CartEventInput): string {
  const result = getDb().prepare(`
    INSERT INTO cart_events
      (reservation_id, guest_token, service_id, event_type, quantity, phase, cart_total, items_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `).get(
    data.reservationId ?? null,
    data.guestToken,
    data.serviceId ?? null,
    data.eventType,
    data.quantity ?? 1,
    data.phase ?? null,
    data.cartTotal ?? null,
    data.itemsJson ?? null,
  ) as any;
  return result?.id;
}

/** Find abandon events older than minMinutes that have NOT been notified yet,
 *  skipping cancelled/no_show reservations to avoid spamming guests unnecessarily */
export function getPendingAbandonNotifications(guestToken: string, minMinutes = 30) {
  return getDb().prepare(`
    SELECT ce.*, g.email as guest_email, g.first_name, g.last_name,
           r.check_in, r.check_out, u.name as unit_name
    FROM cart_events ce
    LEFT JOIN reservations r ON ce.reservation_id = r.id
    LEFT JOIN guests g ON r.guest_id = g.id
    LEFT JOIN units u ON r.unit_id = u.id
    WHERE ce.guest_token = ?
      AND ce.event_type = 'abandon'
      AND ce.abandon_notified_at IS NULL
      AND ce.created_at <= datetime('now', '-' || ? || ' minutes')
      AND (r.id IS NULL OR r.status NOT IN ('cancelled','no_show'))
    ORDER BY ce.created_at DESC
    LIMIT 1
  `).get(guestToken, minMinutes) as any;
}

export function markAbandonNotified(eventId: string) {
  getDb().prepare("UPDATE cart_events SET abandon_notified_at = datetime('now') WHERE id = ?").run(eventId);
}

/** Batch-fetch services by IDs for a given property */
export function getServicesForCart(serviceIds: string[], propertyId: string) {
  if (!serviceIds.length) return [];
  const placeholders = serviceIds.map(() => '?').join(',');
  return getDb().prepare(
    `SELECT id, name, name_en, price, currency, icon FROM additional_services
     WHERE id IN (${placeholders}) AND property_id = ? AND is_active = 1`
  ).all(...serviceIds, propertyId) as any[];
}
