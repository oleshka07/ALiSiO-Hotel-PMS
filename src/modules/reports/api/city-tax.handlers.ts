/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function getCityTaxReport(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().substring(0, 7);

    const startDate = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const endDate = new Date(y, m, 1).toISOString().split('T')[0];

    const bookings = db.prepare(`
      SELECT
        r.id, r.check_in, r.check_out, r.nights, r.adults, r.children, r.status,
        r.source, r.total_price, r.city_tax_amount, r.city_tax_included, r.city_tax_paid,
        g.first_name, g.last_name,
        u.name as unit_name,
        c.type as category_type
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      WHERE r.status NOT IN ('cancelled', 'no_show')
        AND r.check_in < ? AND r.check_out > ?
      ORDER BY r.check_in
    `).all(endDate, startDate);

    const totalGuests = bookings.reduce((s: number, b: any) => s + (b.adults || 0), 0);
    const totalTaxAmount = bookings.reduce((s: number, b: any) => s + (b.city_tax_amount || 0), 0);
    const totalTaxPaid = bookings.filter((b: any) => b.city_tax_paid === 'paid').reduce((s: number, b: any) => s + (b.city_tax_amount || 0), 0);
    const totalTaxPending = bookings.filter((b: any) => b.city_tax_paid === 'pending').reduce((s: number, b: any) => s + (b.city_tax_amount || 0), 0);
    const totalTaxIncluded = bookings.filter((b: any) => b.city_tax_included).reduce((s: number, b: any) => s + (b.city_tax_amount || 0), 0);
    const totalTaxNotIncluded = totalTaxAmount - totalTaxIncluded;

    const bySource: Record<string, { count: number; amount: number; paid: number; pending: number }> = {};
    for (const b of bookings as any[]) {
      const src = b.source || 'direct';
      if (!bySource[src]) bySource[src] = { count: 0, amount: 0, paid: 0, pending: 0 };
      bySource[src].count++;
      bySource[src].amount += b.city_tax_amount || 0;
      if (b.city_tax_paid === 'paid') bySource[src].paid += b.city_tax_amount || 0;
      if (b.city_tax_paid === 'pending') bySource[src].pending += b.city_tax_amount || 0;
    }

    return NextResponse.json({
      month, totalBookings: bookings.length, totalGuests,
      totalTaxAmount, totalTaxPaid, totalTaxPending, totalTaxIncluded, totalTaxNotIncluded,
      bySource, bookings,
    });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
