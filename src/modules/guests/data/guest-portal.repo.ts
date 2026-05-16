/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';

export function getReservationByToken(token: string) {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      r.id, r.check_in, r.check_out, r.nights, r.adults, r.children, r.infants,
      r.status, r.payment_status, r.total_price, r.currency, r.notes, r.source,
      r.guest_page_expires_at, r.property_id,
      g.id as guest_id, g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
      u.id as unit_id, u.name as unit_name, u.code as unit_code, u.beds,
      c.id as category_id, c.name as category_name, c.type as category_type, c.icon as category_icon, c.color as category_color,
      ut.id as unit_type_id, ut.name as unit_type_name, ut.code as unit_type_code,
      ut.max_adults, ut.max_children, ut.max_occupancy, ut.base_occupancy,
      ut.beds_single, ut.beds_double, ut.beds_sofa, ut.extra_bed_available, ut.description as unit_type_description,
      b.id as building_id, b.name as building_name, b.code as building_code,
      p.name as property_name, p.address as property_address, p.city as property_city,
      p.country as property_country, p.phone as property_phone, p.email as property_email,
      p.check_in_time, p.check_out_time
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    JOIN units u ON r.unit_id = u.id
    JOIN categories c ON u.category_id = c.id
    JOIN unit_types ut ON u.unit_type_id = ut.id
    LEFT JOIN buildings b ON u.building_id = b.id
    JOIN properties p ON r.property_id = p.id
    WHERE r.guest_page_token = ?
  `).get(token) as any;

  // Diagnostic: when the full JOIN returns nothing, separate "token doesn't
  // exist" from "token exists but a referenced row is missing/broken" — the
  // latter looks identical to the user (Booking not found) without logs.
  if (!row) {
    const bareRow = db.prepare(
      'SELECT id, guest_id, unit_id, property_id FROM reservations WHERE guest_page_token = ?'
    ).get(token) as any;
    if (bareRow) {
      console.error(
        `[GuestPortal] Reservation ${bareRow.id} exists for token ${token.slice(0, 6)}… but ` +
        `the JOIN returned nothing — check guest(${bareRow.guest_id}), unit(${bareRow.unit_id}), ` +
        `property(${bareRow.property_id}) and the unit's category/unit_type rows.`
      );
    }
  }
  return row;
}

// Cheap existence check: used by the portal handler to distinguish
// "this token has never been issued" from "the token maps to a reservation
// whose related rows are broken (data integrity issue)".
export function getReservationStubByToken(token: string) {
  return getDb().prepare(
    'SELECT id, guest_id, unit_id, property_id FROM reservations WHERE guest_page_token = ?'
  ).get(token) as { id: string; guest_id: string; unit_id: string; property_id: string } | undefined;
}

export function getUnitTypesForRebooking() {
  return getDb().prepare(`
    SELECT ut.id, ut.name, ut.code, ut.description, ut.max_adults, ut.max_children, ut.base_occupancy,
           c.name as category_name, c.type as category_type, c.icon as category_icon
    FROM unit_types ut
    JOIN categories c ON ut.category_id = c.id
    ORDER BY c.type, ut.sort_order
  `).all();
}

export function getRegisteredGuests(reservationId: string) {
  return getDb().prepare('SELECT * FROM reservation_guests WHERE reservation_id = ? ORDER BY created_at').all(reservationId);
}

export function getPaymentsSummary(reservationId: string) {
  // Post PR #6: sum from fin_operations. Income = paid, refund-expense = refunded.
  return getDb().prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN op_type = 'income' THEN amount ELSE 0 END), 0) as total_paid,
      COALESCE(SUM(CASE WHEN op_type = 'expense' AND payment_subtype = 'refund' THEN amount ELSE 0 END), 0) as total_refunded
    FROM fin_operations
    WHERE reservation_id = ? AND status = 'completed'
  `).get(reservationId) as any;
}

export function getUnitTypePhotos(unitTypeId: string) {
  return getDb().prepare('SELECT * FROM unit_type_photos WHERE unit_type_id = ? ORDER BY sort_order').all(unitTypeId);
}

export function getPropertyPhotos(propertyId: string) {
  return getDb().prepare('SELECT * FROM property_photos WHERE property_id = ? ORDER BY sort_order').all(propertyId);
}

export function getAvailableServices(propertyId: string, categoryType: string) {
  return getDb().prepare(
    "SELECT * FROM additional_services WHERE property_id = ? AND is_active = 1 AND (available_for = 'all' OR available_for = ?) ORDER BY sort_order"
  ).all(propertyId, categoryType);
}

export function getOrderedServices(reservationId: string) {
  return getDb().prepare(`
    SELECT so.id, so.service_id, so.quantity, so.total_price, so.status,
           so.payment_status, so.service_date, so.created_at,
           ads.name as service_name, ads.name_en, ads.icon as service_icon,
           ads.currency
    FROM service_orders so
    JOIN additional_services ads ON so.service_id = ads.id
    WHERE so.reservation_id = ?
    ORDER BY so.created_at DESC
  `).all(reservationId);
}

export function getGuestPageConfig(unitTypeId: string, propertyId: string, unitId?: string) {
  const db = getDb();
  const unitTypeConfig = db.prepare('SELECT * FROM guest_page_config WHERE unit_type_id = ?').get(unitTypeId) as any || null;

  // Per-unit overrides (lock_code, entry_photo_url)
  let unitOverrides: any = null;
  if (unitId) {
    try {
      unitOverrides = db.prepare('SELECT lock_code, entry_photo_url FROM units WHERE id = ?').get(unitId) as any;
    } catch { /* columns may not exist yet */ }
  }

  let propertyConfig: any = null;
  try {
    propertyConfig = db.prepare('SELECT * FROM property_guest_config WHERE property_id = ?').get(propertyId) as any || null;
  } catch { /* table may not exist yet */ }

  const merged = !propertyConfig ? { ...unitTypeConfig } : {
    ...unitTypeConfig,
    wifi_network: unitTypeConfig?.wifi_network || propertyConfig.wifi_network,
    wifi_password: unitTypeConfig?.wifi_password || propertyConfig.wifi_password,
    restaurant_name: propertyConfig.restaurant_name,
    restaurant_hours: propertyConfig.restaurant_hours,
    restaurant_menu_url: propertyConfig.restaurant_menu_url,
    rules: propertyConfig.rules,
    useful_info: propertyConfig.useful_info,
    faq_items: propertyConfig.faq_items,
    maps_url: unitTypeConfig?.maps_url || propertyConfig.maps_url,
    territory_map_url: unitTypeConfig?.territory_map_url || propertyConfig.territory_map_url,
    pets_policy: unitTypeConfig?.pets_policy || propertyConfig.pets_policy || 'welcome',
    parking_info: propertyConfig.parking_info,
    parking_photo_url: propertyConfig.parking_photo_url,
    video_guide_url: propertyConfig.video_guide_url,
    emergency_phone: propertyConfig.emergency_phone,
    weather_lat: propertyConfig.weather_lat,
    weather_lon: propertyConfig.weather_lon,
    amenities: unitTypeConfig?.amenities,
    check_in_instructions: unitTypeConfig?.check_in_instructions,
    lock_code: unitTypeConfig?.lock_code,
    entry_photo_url: unitTypeConfig?.entry_photo_url,
  };

  // Per-unit override: if unit has its own lock_code or entry_photo_url, use it
  if (unitOverrides?.lock_code) merged.lock_code = unitOverrides.lock_code;
  if (unitOverrides?.entry_photo_url) merged.entry_photo_url = unitOverrides.entry_photo_url;

  return merged;
}
