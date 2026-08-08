/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function getAlerts() {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    // Auto-archive: confirmed bookings with check_in > 7 days ago → no_show
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const archiveCutoff = sevenDaysAgo.toISOString().split('T')[0];

    const archived = db.prepare(`
      UPDATE reservations
      SET status = 'no_show', updated_at = datetime('now')
      WHERE check_in < ? AND status = 'confirmed'
    `).run(archiveCutoff);

    const alerts: { type: string; severity: 'warning' | 'danger' | 'info'; message: string; bookingId: string; guestName: string }[] = [];

    // Overdue arrivals: confirmed with check_in in the past, but within 7 days
    const overdueArrivals = db.prepare(`
      SELECT r.id, r.check_in, u.name as unit_name, g.first_name, g.last_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.check_in < ? AND r.check_in >= ? AND r.status = 'confirmed'
      ORDER BY r.check_in DESC
    `).all(today, archiveCutoff) as any[];

    for (const r of overdueArrivals) {
      alerts.push({
        type: 'overdue_arrival', severity: 'danger',
        message: `Прострочений заїзд ${r.check_in} — ${r.unit_name}`,
        bookingId: r.id, guestName: `${r.first_name} ${r.last_name}`,
      });
    }

    // Today's arrivals — unpaid or unregistered
    const todayArrivals = db.prepare(`
      SELECT r.id, r.payment_status, r.registration_status, r.total_price, g.first_name, g.last_name, u.name as unit_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.check_in = ? AND r.status IN ('confirmed', 'tentative')
    `).all(today) as any[];

    for (const r of todayArrivals) {
      const isFullyPaid = r.payment_status === 'paid' || r.payment_status === 'prepaid';
      if (!isFullyPaid) {
        if ((r.total_price || 0) === 0) {
          // Zero-price booking — requires admin confirmation (promo/barter/error)
          alerts.push({
            type: 'zero_price_arrival', severity: 'warning',
            message: `Сьогодні заїзд, ціна = 0 — потрібне підтвердження — ${r.unit_name}`,
            bookingId: r.id, guestName: `${r.first_name} ${r.last_name}`,
          });
        } else {
          // Regular unpaid booking
          alerts.push({
            type: 'unpaid_arrival', severity: 'warning',
            message: `Сьогодні заїзд, оплата не завершена — ${r.unit_name}`,
            bookingId: r.id, guestName: `${r.first_name} ${r.last_name}`,
          });
        }
      }
      if (r.registration_status !== 'registered') {
        alerts.push({
          type: 'unregistered_arrival', severity: 'warning',
          message: `Сьогодні заїзд, реєстрація не пройдена — ${r.unit_name}`,
          bookingId: r.id, guestName: `${r.first_name} ${r.last_name}`,
        });
      }
    }

    // Checked-in without registration
    const noRegCheckedIn = db.prepare(`
      SELECT r.id, g.first_name, g.last_name, u.name as unit_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.status = 'checked_in' AND (r.registration_status IS NULL OR r.registration_status = 'not_registered')
    `).all() as any[];

    for (const r of noRegCheckedIn) {
      alerts.push({
        type: 'checked_in_no_reg', severity: 'danger',
        message: `Заселений без реєстрації — ${r.unit_name}`,
        bookingId: r.id, guestName: `${r.first_name} ${r.last_name}`,
      });
    }

    // Today's departures still checked-in
    const todayDepartures = db.prepare(`
      SELECT r.id, g.first_name, g.last_name, u.name as unit_name
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.check_out = ? AND r.status = 'checked_in'
    `).all(today) as any[];

    for (const r of todayDepartures) {
      alerts.push({
        type: 'today_departure', severity: 'info',
        message: `Сьогодні виїзд — ${r.unit_name}`,
        bookingId: r.id, guestName: `${r.first_name} ${r.last_name}`,
      });
    }

    return NextResponse.json(alerts);
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

