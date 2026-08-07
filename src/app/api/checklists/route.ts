import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET() {
  try {
    const db = getDb();
    const todayISO = new Date().toISOString().split('T')[0];

    // 1. Check if sauna service/booking is active today
    // The table is `reservations`; `bookings` has never existed in this schema,
    // so this route answered 500 on every call and the mobile checklist screen
    // was always empty. Guest names live on `guests`, not on the reservation —
    // and only the row count is used below, so they are not selected.
    const saunaBookings = db.prepare(`
      SELECT r.id
      FROM reservations r
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE (LOWER(u.name) LIKE '%сауна%' OR LOWER(r.notes) LIKE '%сауна%' OR LOWER(r.notes) LIKE '%sauna%')
        AND r.status NOT IN ('cancelled', 'checked_out')
        AND r.check_in <= ? AND r.check_out >= ?
    `).all(todayISO, todayISO) as any[];

    const hasSaunaToday = saunaBookings.length > 0;

    // 2. Get dirty units for cleaner assignment
    const dirtyUnits = db.prepare(`
      SELECT id, code, name, cleaning_status, building_id
      FROM units
      WHERE cleaning_status = 'dirty' OR cleaning_status = 'in_progress'
      ORDER BY code ASC
    `).all() as any[];

    // 3. Construct response checklists payload
    const checklists = [
      ...(hasSaunaToday ? [{
        id: 'sauna-check-today',
        title: '🧖 Обов\'язкова перевірка Сауни',
        subtitle: `Заброньовано сауну сьогодні (${saunaBookings.length} бр.)`,
        role: 'admin',
        is_sauna: true,
        items: [
          { id: 's1', text: 'Перевірка нагріву та температури парилки', done: false },
          { id: 's2', text: 'Запас сухих рушників та простирадл', done: false },
          { id: 's3', text: 'Чистота душевих кабін та чану', done: false },
          { id: 's4', text: 'Чайні набори, посуд та питна вода', done: false },
          { id: 's5', text: 'Перевірка систем вентиляції та освітлення', done: false },
        ]
      }] : []),
      {
        id: 'fd-bathrooms-check',
        title: '🚻 Щоденний обхід санвузлів (Будинки F / D)',
        subtitle: 'Інспекція загальних зон та санвузлів',
        role: 'admin',
        is_sauna: false,
        items: [
          { id: 'fd1', text: 'Санвузол Будинок F — рідке мило, папір, дезінфекція', done: false },
          { id: 'fd2', text: 'Санвузол Будинок D — рідке мило, папір, дезінфекція', done: false },
          { id: 'fd3', text: 'Прибирання підлоги та спорожнення кошиків сміття', done: false },
        ]
      }
    ];

    return NextResponse.json({
      success: true,
      hasSaunaToday,
      saunaBookingsCount: saunaBookings.length,
      dirtyUnitsCount: dirtyUnits.length,
      dirtyUnits,
      checklists,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
