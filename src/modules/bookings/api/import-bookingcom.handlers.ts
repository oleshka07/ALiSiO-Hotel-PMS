/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';
import { getEurCzkRate } from '@/lib/hostex';
import { getDb, generateGuestToken } from '@core/db';
import {
  parseBookingComExcel,
  normalizeName,
  parseCapacityFromUnitTypeName,
  type BookingComRow,
} from '../domain/booking-com-excel';
import {
  findResortPropertyId,
  findUnitTypeByName,
  findFreeResortUnit,
  findFreeResortUnitByCapacity,
  findReservationByBcomId,
  findOrCreateGuestForImport,
  insertImportedReservation,
  cancelReservation,
  findPoolUnit,
} from '../data/import.repo';

export interface PlannedUnit {
  unitId: string;
  unitName: string;
  capacity: number;        // capacity used to find this unit
  unitTypeId: string;
  buildingCode: string | null;   // 'F' (preferred), 'D' (fallback), null
}

export interface PreviewRow extends BookingComRow {
  matchedUnitType: { id: string; name: string; code: string } | null;
  freeUnitId: string | null;       // first unit (kept for backwards compat / display)
  freeUnitName: string | null;
  plannedUnits: PlannedUnit[];     // one entry per room in the group
  existing: { id: string; status: string } | null;
  action: 'create' | 'cancel' | 'skip-already' | 'skip-cancelled-not-found' | 'skip-no-unit-type' | 'skip-no-free-unit';
  warnings: string[];
}

export interface PreviewResponse {
  rows: PreviewRow[];
  parseErrors: { rowIndex: number; field: string; reason: string }[];
  totalRowsInFile: number;
  mode: 'draft' | 'auto';
  summary: {
    create: number;
    cancel: number;
    skipAlready: number;
    skipNoUnitType: number;
    skipNoFreeUnit: number;
    skipCancelledNotFound: number;
  };
  resortPropertyResolved: boolean;
}

async function requireBookingsPermission(): Promise<NextResponse | null> {
  const store = await cookies();
  const sessionId = store.get('session_id')?.value;
  const user = await getSessionUser(sessionId);
  if (!user) {
    return NextResponse.json({ error: 'Не авторизовано' }, { status: 401 });
  }
  if (!hasPermission(user.permissions, 'manage_bookings')) {
    return NextResponse.json(
      { error: 'Недостатньо прав. Потрібен дозвіл: manage_bookings' },
      { status: 403 },
    );
  }
  return null;
}

interface ClaimedSlot {
  unitId: string;
  checkIn: string;
  checkOut: string;
}

/**
 * Returns the unit ids from `claimedSlots` whose dates overlap [checkIn, checkOut).
 * Used during preview so two rows in the same import don't both claim the
 * same unit on the same date range — the DB query won't see those "virtual"
 * reservations until confirm runs.
 */
function overlappingClaimedUnits(claimedSlots: ClaimedSlot[], checkIn: string, checkOut: string): string[] {
  return claimedSlots
    .filter((s) => s.checkIn < checkOut && s.checkOut > checkIn)
    .map((s) => s.unitId);
}

function planRow(
  row: BookingComRow,
  claimedSlots: ClaimedSlot[] = [],
  mode: 'draft' | 'auto' = 'auto',
): Pick<PreviewRow, 'matchedUnitType' | 'freeUnitId' | 'freeUnitName' | 'plannedUnits' | 'existing' | 'action' | 'warnings'> {
  const warnings: string[] = [];
  const existing = findReservationByBcomId(row.bookNumber);
  const isCancelInExcel = row.status === 'cancelled_by_guest' || row.status === 'cancelled';

  if (isCancelInExcel) {
    if (existing && existing.status !== 'cancelled') {
      return { matchedUnitType: null, freeUnitId: null, freeUnitName: null, plannedUnits: [], existing, action: 'cancel', warnings };
    }
    return {
      matchedUnitType: null,
      freeUnitId: null,
      freeUnitName: null,
      plannedUnits: [],
      existing,
      action: existing ? 'skip-already' : 'skip-cancelled-not-found',
      warnings,
    };
  }

  if (existing) {
    // In draft mode: if the existing record is still a draft, delete it
    // so we can re-create with corrected per-room guest counts.
    // This allows re-importing the same Excel file to fix broken drafts.
    if (mode === 'draft' && existing.status === 'draft') {
      const db = getDb();
      // Delete children first (sub-bookings and child reservations)
      const children = db.prepare('SELECT id FROM reservations WHERE parent_id = ?').all(existing.id);
      for (const child of children) {
        db.prepare('DELETE FROM reservation_sub_bookings WHERE child_reservation_id = ?').run((child as any).id);
        db.prepare('DELETE FROM reservations WHERE id = ?').run((child as any).id);
      }
      // Delete orphan drafts with same bcom_reservation_id (independent draft cards)
      db.prepare("DELETE FROM reservations WHERE bcom_reservation_id = ? AND status = 'draft' AND id != ?").run(row.bookNumber, existing.id);
      // Delete master sub-booking links and the master itself
      db.prepare('DELETE FROM reservation_sub_bookings WHERE reservation_id = ?').run(existing.id);
      db.prepare('DELETE FROM reservations WHERE id = ?').run(existing.id);
      warnings.push(`Попередній draft #${row.bookNumber} видалено — створюється заново з правильною кількістю гостей`);
      // Fall through to create new draft below
    } else {
      return { matchedUnitType: null, freeUnitId: null, freeUnitName: null, plannedUnits: [], existing, action: 'skip-already', warnings };
    }
  }

  // Draft mode: skip room matching entirely — everything goes to pool unit.
  if (mode === 'draft') {
    const pool = findPoolUnit();
    if (!pool) {
      warnings.push('Pool unit (Чорновик F) не знайдено в БД');
      return { matchedUnitType: null, freeUnitId: null, freeUnitName: null, plannedUnits: [], existing: null, action: 'skip-no-unit-type', warnings };
    }
    // Determine room count from multiple sources:
    // 1. unitTypes split by comma (e.g. "Triple Room, Triple Room, Triple Room" = 3)
    // 2. row.rooms from Excel 'Rooms' column
    // 3. Fallback to 1
    const typeCapacities: number[] = (row.unitTypes.length > 0 ? row.unitTypes : [row.unitTypeRaw])
      .map((t) => parseCapacityFromUnitTypeName(t))
      .filter((n): n is number => n != null);
    // If unitTypes gave us multiple entries, that's the real room count
    const requestedCount = Math.max(1, row.unitTypes.length > 1 ? row.unitTypes.length : (row.rooms || 1));
    const totalGuests = row.persons || row.adults || 1;
    console.log(`[Draft Import] ${row.guestName}: rooms=${row.rooms}, unitTypes=${JSON.stringify(row.unitTypes)}, typeCapacities=${JSON.stringify(typeCapacities)}, requestedCount=${requestedCount}, totalGuests=${totalGuests}`);

    const units: PlannedUnit[] = [];
    for (let i = 0; i < requestedCount; i++) {
      // Per-room capacity: use parsed type capacity if available, otherwise divide total by rooms
      const perRoom = typeCapacities.length > 0
        ? typeCapacities[i % typeCapacities.length]
        : Math.ceil(totalGuests / requestedCount);
      units.push({
        unitId: pool.id, unitName: pool.name,
        capacity: perRoom,
        unitTypeId: pool.unit_type_id, buildingCode: pool.building_code,
      });
    }
    return {
      matchedUnitType: { id: pool.unit_type_id, name: 'Чорновик F', code: 'F-POOL' },
      freeUnitId: pool.id,
      freeUnitName: pool.name,
      plannedUnits: units,
      existing: null,
      action: 'create',
      warnings,
    };
  }

  // Resolve a list of capacities the booking needs. Booking sells by guest
  // count ("Triple Room" = 3, "Quadruple Room" = 4). When rooms > 1 with a
  // single type, repeat the same capacity. When the type list itself spans
  // multiple types ("Triple Room, Quadruple Room"), round-robin through the
  // listed types until we have `rooms` capacities.
  const requestedCount = Math.max(1, row.rooms || 1);
  const typeCapacities: number[] = (row.unitTypes.length > 0 ? row.unitTypes : [row.unitTypeRaw])
    .map((t) => parseCapacityFromUnitTypeName(t))
    .filter((n): n is number => n != null);

  let perRoomCapacity: number[] = [];
  if (typeCapacities.length > 0) {
    for (let i = 0; i < requestedCount; i++) {
      perRoomCapacity.push(typeCapacities[i % typeCapacities.length]);
    }
  }

  const plannedUnits: PlannedUnit[] = [];
  // usedUnitIds combines:
  //   - units already claimed by EARLIER rows in this preview run (overlap on dates);
  //   - units claimed by THIS row's own earlier multi-room iterations.
  // Both must be excluded so the DB-level "free unit" query doesn't pick a
  // unit we have virtually reserved seconds ago in the same import batch.
  const usedUnitIds: string[] = overlappingClaimedUnits(claimedSlots, row.checkIn, row.checkOut);

  if (perRoomCapacity.length > 0) {
    for (const cap of perRoomCapacity) {
      const free = findFreeResortUnitByCapacity(cap, row.checkIn, row.checkOut, usedUnitIds);
      if (!free) break; // can't fill all rooms — fall through to single-type fallback
      plannedUnits.push({
        unitId: free.id, unitName: free.name, capacity: cap,
        unitTypeId: free.unit_type_id, buildingCode: free.building_code,
      });
      usedUnitIds.push(free.id);
    }
  }

  // Fallback to legacy name match for the primary type when capacity didn't
  // give us anything (rare — exotic type names).
  if (plannedUnits.length === 0) {
    const primaryType = row.unitTypes[0] || row.unitTypeRaw;
    const matched = primaryType ? findUnitTypeByName(primaryType) : null;
    if (matched) {
      const free = findFreeResortUnit(matched.id, row.checkIn, row.checkOut);
      // Honour cross-row claims here too, even though findFreeResortUnit
      // currently doesn't accept excludeUnitIds — skip if the only candidate
      // was already claimed.
      if (free && !usedUnitIds.includes(free.id)) {
        plannedUnits.push({
          unitId: free.id, unitName: free.name, capacity: row.persons || 1,
          unitTypeId: free.unit_type_id, buildingCode: free.building_code,
        });
      }
    }
  }

  if (plannedUnits.length === 0) {
    warnings.push(`Тип юніту "${row.unitTypeRaw}" не зматчено за місткістю в категорії resort`);
    return { matchedUnitType: null, freeUnitId: null, freeUnitName: null, plannedUnits: [], existing: null, action: 'skip-no-unit-type', warnings };
  }

  if (plannedUnits.length < requestedCount) {
    warnings.push(`Booking просив ${requestedCount} кімнат(и); знайдено вільних ${plannedUnits.length}. Решту вписуй вручну (можливий овербукінг).`);
  }

  if (plannedUnits.length > 1) {
    const codes = plannedUnits.map((p) => p.unitName).join(', ');
    warnings.push(`Бронювання на ${plannedUnits.length} кімнат: ${codes}. Створяться суб-бронювання (master + ${plannedUnits.length - 1} child).`);
  }

  // Highlight any unit that fell out of building F (the preferred resort
  // building). The user wants to know when F is full and we had to spill
  // into D / other buildings.
  const nonFUnits = plannedUnits.filter((u) => u.buildingCode !== 'F');
  if (nonFUnits.length > 0) {
    const detail = nonFUnits
      .map((u) => `${u.unitName}${u.buildingCode ? ` (${u.buildingCode})` : ''}`)
      .join(', ');
    warnings.push(`Будівлю F заповнено на ці дати — ${nonFUnits.length === plannedUnits.length ? 'усі' : 'частина'} кімнат(и) поза F: ${detail}.`);
  }

  // matchedUnitType / freeUnitId reflect the FIRST unit for backwards-compat
  // with the existing UI columns; the full list lives in plannedUnits.
  const first = plannedUnits[0];
  return {
    matchedUnitType: { id: first.unitTypeId, name: `${first.capacity}-місна`, code: '' },
    freeUnitId: first.unitId,
    freeUnitName: first.unitName,
    plannedUnits,
    existing: null,
    action: 'create',
    warnings,
  };
}

export async function previewBookingComImport(request: NextRequest): Promise<NextResponse> {
  const guard = await requireBookingsPermission();
  if (guard) return guard;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Файл не передано' }, { status: 400 });
    }

    const arrayBuffer = await (file as File).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`[Import Booking.com] File received: ${(file as File).name}, size=${buffer.length} bytes`);

    const parsed = parseBookingComExcel(buffer);
    const mode = (formData.get('mode') || 'draft') as 'draft' | 'auto';

    console.log(`[Import Booking.com] Parsed: ${parsed.rows.length} rows, ${parsed.errors.length} errors, totalInFile=${parsed.totalRowsInFile}`);
    if (parsed.errors.length > 0) {
      console.log('[Import Booking.com] Parse errors:', JSON.stringify(parsed.errors.slice(0, 5)));
    }
    if (parsed.rows.length > 0) {
      const sample = parsed.rows[0];
      console.log(`[Import Booking.com] Sample row: book=${sample.bookNumber}, guest=${sample.guestName}, in=${sample.checkIn}, out=${sample.checkOut}, price=${sample.priceMajor} ${sample.currency}, unit=${sample.unitTypeRaw}`);
    }

    if (parsed.errors.length > 0 && parsed.errors[0].field === 'headers') {
      const detail = parsed.errors[0];
      console.error('[Import Booking.com] Header mismatch! Missing:', detail.reason, 'Available columns:', detail.raw);
      return NextResponse.json(
        { error: `Невідомий формат Excel — ${detail.reason}`, detail },
        { status: 422 },
      );
    }

    const propertyId = findResortPropertyId();

    // Walk rows in order, accumulating the units we have already promised to
    // earlier rows. This makes the preview's per-row plan internally consistent:
    // F1 won't appear under three different guests with the same dates.
    const claimedSlots: ClaimedSlot[] = [];
    const rows: PreviewRow[] = [];
    for (const r of parsed.rows) {
      const planned = planRow(r, claimedSlots, mode);
      rows.push({ ...r, ...planned });
      if (planned.action === 'create') {
        for (const u of planned.plannedUnits) {
          claimedSlots.push({ unitId: u.unitId, checkIn: r.checkIn, checkOut: r.checkOut });
        }
      }
    }

    const summary = {
      create: rows.filter((r) => r.action === 'create').length,
      cancel: rows.filter((r) => r.action === 'cancel').length,
      skipAlready: rows.filter((r) => r.action === 'skip-already').length,
      skipNoUnitType: rows.filter((r) => r.action === 'skip-no-unit-type').length,
      skipNoFreeUnit: rows.filter((r) => r.action === 'skip-no-free-unit').length,
      skipCancelledNotFound: rows.filter((r) => r.action === 'skip-cancelled-not-found').length,
    };

    const response: PreviewResponse = {
      rows,
      parseErrors: parsed.errors.map((e) => ({ rowIndex: e.rowIndex, field: e.field, reason: e.reason })),
      totalRowsInFile: parsed.totalRowsInFile,
      mode,
      summary,
      resortPropertyResolved: !!propertyId,
    };
    return NextResponse.json(response);
  } catch (e: any) {
    console.error('[Import Booking.com] FATAL preview error:', e?.message);
    console.error('[Import Booking.com] Stack:', e?.stack);
    return NextResponse.json(
      { error: `Помилка парсингу: ${e?.message || 'невідома помилка'}`, stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined },
      { status: 500 },
    );
  }
}

export interface ConfirmRequest {
  rows: BookingComRow[];
}

export interface ConfirmResponse {
  created: number;
  cancelled: number;
  skipped: number;
  failed: number;
  details: Array<{
    bookNumber: string;
    action: string;
    reservationId?: string;
    error?: string;
  }>;
}

export async function confirmBookingComImport(request: NextRequest): Promise<NextResponse> {
  const guard = await requireBookingsPermission();
  if (guard) return guard;

  try {
    const body = await request.json() as ConfirmRequest;
    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: 'rows is required' }, { status: 400 });
    }
    const mode = (body as any).mode === 'auto' ? 'auto' : 'draft';

    const propertyId = findResortPropertyId();
    if (!propertyId) {
      return NextResponse.json({ error: 'Resort property не знайдено' }, { status: 422 });
    }

    // Fetch the daily ČNB EUR→CZK rate once per import. Same source Hostex
    // sync uses, so EUR Booking.com rows land in DB with the same conversion
    // logic (total_price in CZK, total_rate_eur preserved, currency='CZK').
    const eurToCzk = await getEurCzkRate();

    let created = 0;
    let cancelled = 0;
    let skipped = 0;
    let failed = 0;
    const details: ConfirmResponse['details'] = [];

    // Mirror the preview accumulator so confirm picks the same units as
    // preview did. Each successful create extends the claimedSlots list.
    // (Defence in depth — even though insertImportedReservation immediately
    // commits to DB and subsequent SQL queries see the new rows, this keeps
    // the picker deterministic if any step ever runs in a transaction.)
    const claimedSlots: ClaimedSlot[] = [];

    for (const row of body.rows) {
      try {
        const plan = planRow(row, claimedSlots, mode);

        if (plan.action === 'create') {
          if (plan.plannedUnits.length === 0) {
            skipped++;
            details.push({ bookNumber: row.bookNumber, action: 'skip', error: 'no free unit could be resolved' });
            continue;
          }
          const { firstName, lastName } = normalizeName(row.bookedBy || row.guestName);
          const guestId = findOrCreateGuestForImport({
            firstName,
            lastName,
            country: row.bookerCountry,
            phone: row.phone,
            address: row.address,
          });
          const baseNotes = [
            `Booking.com #${row.bookNumber}`,
            row.remarks ? `Remarks: ${row.remarks}` : '',
            row.children > 0 && row.childrenAges ? `Children ages: ${row.childrenAges}` : '',
            row.bookedAt ? `Booked at: ${row.bookedAt}` : '',
            row.travelPurpose ? `Purpose: ${row.travelPurpose}` : '',
          ].filter(Boolean);

          // Currency handling mirrors Hostex sync: Booking sells in EUR for our
          // listings, but the PMS reports in CZK by default. Convert once per
          // row using the daily ČNB rate, then store both:
          //   total_price = CZK converted, currency = 'CZK'
          //   total_rate_eur = original EUR (preserved for audit + investor metrics)
          const isEurRow = (row.currency || '').toUpperCase() === 'EUR';
          const isMultiRoom = plan.plannedUnits.length > 1;
          const roomCount = plan.plannedUnits.length;

          // Per-room guest distribution: divide TOTAL adults/children by rooms
          const perRoomAdults = isMultiRoom ? Math.ceil(row.adults / roomCount) : row.adults;
          const perRoomChildren = isMultiRoom ? Math.ceil(row.children / roomCount) : row.children;

          let masterResId: string | null = null;

          // DRAFT MODE: create N independent draft records (no parent_id).
          // Each card appears separately in the Чорновик strip for drag-and-drop.
          if (mode === 'draft') {
            for (let i = 0; i < roomCount; i++) {
              const unit = plan.plannedUnits[i];
              const draftNotes = [
                ...baseNotes,
                isMultiRoom ? `Кімната ${i + 1} з ${roomCount}` : '',
              ].filter(Boolean).join('\n');

              const draftResId = insertImportedReservation({
                propertyId,
                unitId: unit.unitId,
                guestId,
                checkIn: row.checkIn,
                checkOut: row.checkOut,
                nights: row.duration || 1,
                adults: unit.capacity,
                children: isMultiRoom ? Math.ceil(row.children / roomCount) : row.children,
                totalPrice: i === 0 ? (isEurRow ? +(row.priceMajor * eurToCzk).toFixed(2) : row.priceMajor) : 0,
                currency: isEurRow ? 'CZK' : (row.currency || 'CZK'),
                bcomReservationId: row.bookNumber,
                commissionAmount: i === 0 ? (isEurRow ? +(row.commissionMajor * eurToCzk).toFixed(2) : row.commissionMajor) : 0,
                notes: draftNotes,
                totalRateEur: i === 0 ? (isEurRow ? row.priceMajor : null) : null,
                commissionEur: i === 0 ? (isEurRow ? row.commissionMajor : null) : null,
                status: 'draft',
              });
              created++;
              details.push({ bookNumber: row.bookNumber, action: 'create', reservationId: draftResId });
              claimedSlots.push({ unitId: unit.unitId, checkIn: row.checkIn, checkOut: row.checkOut });
            }
          } else {
            // CONFIRM MODE: master + children pattern (grouped booking)
            for (let i = 0; i < roomCount; i++) {
              const unit = plan.plannedUnits[i];
              const isFirst = i === 0;

              if (isFirst) {
                // Master reservation: gets the FULL price
                const totalPriceCzk = isEurRow ? +(row.priceMajor * eurToCzk).toFixed(2) : row.priceMajor;
                const commissionCzk = isEurRow ? +(row.commissionMajor * eurToCzk).toFixed(2) : row.commissionMajor;
                const totalRateEur = isEurRow ? row.priceMajor : null;
                const commissionEur = isEurRow ? row.commissionMajor : null;
                const storedCurrency = isEurRow ? 'CZK' : (row.currency || 'CZK');

                const notes = [
                  ...baseNotes,
                  isMultiRoom ? `Групове бронювання: ${roomCount} кімнат` : '',
                  isEurRow ? `Конвертовано з EUR за курсом ${eurToCzk.toFixed(3)} (ČNB)` : '',
                ].filter(Boolean).join('\n');

                masterResId = insertImportedReservation({
                  propertyId,
                  unitId: unit.unitId,
                  guestId,
                  checkIn: row.checkIn,
                  checkOut: row.checkOut,
                  nights: row.duration || 1,
                  adults: perRoomAdults,
                  children: perRoomChildren,
                  totalPrice: totalPriceCzk,
                  currency: storedCurrency,
                  bcomReservationId: row.bookNumber,
                  commissionAmount: commissionCzk,
                  notes,
                  totalRateEur,
                  commissionEur,
                  status: 'confirmed',
                });
                created++;
                details.push({ bookNumber: row.bookNumber, action: 'create', reservationId: masterResId });
                claimedSlots.push({ unitId: unit.unitId, checkIn: row.checkIn, checkOut: row.checkOut });
              } else {
                // Child reservation linked to master via parent_id
                const db = getDb();
                const childResId = `bcom_xls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_c${i}`;
                const childToken = generateGuestToken();

                db.prepare(`
                  INSERT INTO reservations (
                    id, property_id, unit_id, guest_id, parent_id,
                    check_in, check_out, nights, adults, children,
                    status, payment_status, source, total_price, currency,
                    external_uid, bcom_reservation_id,
                    commission_amount, notes, guest_page_token
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'booking_com', 0, ?, ?, ?, 0, ?, ?)
                `).run(
                  childResId, propertyId, unit.unitId, guestId, masterResId,
                  row.checkIn, row.checkOut, row.duration || 1,
                  unit.capacity, 0,
                  'confirmed',
                  row.currency || 'CZK',
                  row.bookNumber, row.bookNumber,
                  `Sub-booking: Кімната ${i + 1} з ${roomCount} (${unit.unitName})\nBooking.com #${row.bookNumber}`,
                  childToken
                );

                // Create sub-booking link
                const subId = `sub_bcom_${Date.now()}_${i}`;
                db.prepare(`
                  INSERT INTO reservation_sub_bookings (
                    id, reservation_id, child_reservation_id, label,
                    adults, children, infants, subtotal, notes, sort_order
                  ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
                `).run(
                  subId, masterResId, childResId,
                  `Кімната ${i + 1} (${unit.unitName})`,
                  unit.capacity, 0,
                  `Booking.com #${row.bookNumber}`, i
                );

                created++;
                details.push({ bookNumber: row.bookNumber, action: 'create', reservationId: childResId });
                claimedSlots.push({ unitId: unit.unitId, checkIn: row.checkIn, checkOut: row.checkOut });
              }
            }
          }
        } else if (plan.action === 'cancel' && plan.existing) {
          cancelReservation(plan.existing.id);
          cancelled++;
          details.push({ bookNumber: row.bookNumber, action: 'cancel', reservationId: plan.existing.id });
        } else {
          skipped++;
          details.push({ bookNumber: row.bookNumber, action: plan.action });
        }
      } catch (e: any) {
        failed++;
        details.push({ bookNumber: row.bookNumber, action: 'failed', error: e?.message || String(e) });
        console.error(`[Import Booking.com] row ${row.bookNumber} failed:`, e?.message);
      }
    }

    try {
      const lines = [
        '📥 <b>Імпорт Booking.com завершено</b>',
        '',
        `✅ Створено: ${created}`,
        cancelled > 0 ? `❌ Скасовано: ${cancelled}` : '',
        skipped > 0 ? `⏭ Пропущено: ${skipped}` : '',
        failed > 0 ? `⚠️ Помилок: ${failed}` : '',
      ].filter(Boolean).join('\n');
      sendTelegramMessage(lines).catch(() => {});
    } catch { /* non-critical */ }

    const response: ConfirmResponse = { created, cancelled, skipped, failed, details };
    return NextResponse.json(response);
  } catch (e: any) {
    console.error('[Import Booking.com] confirm error:', e?.message, e?.stack);
    return NextResponse.json({ error: 'Помилка імпорту', detail: e?.message }, { status: 500 });
  }
}
