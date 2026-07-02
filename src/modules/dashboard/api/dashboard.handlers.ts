/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function getDashboard() {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const arrivals = db.prepare(
      "SELECT COUNT(*) as cnt FROM reservations WHERE check_in = ? AND status IN ('confirmed', 'tentative')"
    ).get(today) as any;

    const departures = db.prepare(
      "SELECT COUNT(*) as cnt FROM reservations WHERE check_out = ? AND status IN ('checked_in')"
    ).get(today) as any;

    const totalUnits = db.prepare('SELECT COUNT(*) as cnt FROM units WHERE is_active = 1 AND is_pool = 0').get() as any;

    const occupied = db.prepare(
      "SELECT COUNT(DISTINCT r.unit_id) as cnt FROM reservations r JOIN units u ON u.id = r.unit_id WHERE r.check_in <= ? AND r.check_out > ? AND r.status IN ('checked_in', 'confirmed') AND u.is_pool = 0"
    ).get(today, today) as any;

    const totalCount = totalUnits?.cnt || 0;
    const occupiedCount = occupied?.cnt || 0;
    const occupancyRate = totalCount > 0 ? Math.round((occupiedCount / totalCount) * 100) : 0;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const future = futureDate.toISOString().split('T')[0];

    const upcomingArrivals = db.prepare(`
      SELECT r.id, r.check_in, r.check_out, r.nights, r.adults, r.children, r.status,
        g.first_name, g.last_name,
        u.name as unit_name, u.code as unit_code
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.check_in BETWEEN ? AND ? AND r.status IN ('confirmed', 'tentative')
      ORDER BY r.check_in
      LIMIT 10
    `).all(today, future) || [];

    const todayDepartures = db.prepare(`
      SELECT r.id, r.check_out, r.status,
        g.first_name, g.last_name,
        u.name as unit_name, u.code as unit_code, u.cleaning_status
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.check_out = ? AND r.status IN ('checked_in', 'confirmed')
      ORDER BY u.name
    `).all(today) || [];

    return NextResponse.json({
      arrivalsToday: arrivals?.cnt || 0,
      departuresToday: departures?.cnt || 0,
      occupancyRate,
      freeUnits: totalCount - occupiedCount,
      totalUnits: totalCount,
      upcomingArrivals,
      todayDepartures,
    });
  } catch (error: any) {
    console.error('GET /api/dashboard error:', error?.message || error);
    return NextResponse.json({
      arrivalsToday: 0, departuresToday: 0, occupancyRate: 0,
      freeUnits: 0, totalUnits: 0, upcomingArrivals: [], todayDepartures: [],
      error: error?.message || 'Failed to fetch dashboard stats',
    });
  }
}
