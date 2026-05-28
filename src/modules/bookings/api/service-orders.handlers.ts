/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function listServiceOrders(req: NextRequest) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const period = url.searchParams.get('period') || 'day';

    try { db.prepare("ALTER TABLE booking_service_orders ADD COLUMN completed_at TEXT DEFAULT NULL").run(); } catch { /* exists */ }

    let dateFilter = '';
    if (period === 'day') {
      dateFilter = `AND bso.service_date = '${dateParam}'`;
    } else if (period === 'week') {
      dateFilter = `AND bso.service_date >= '${dateParam}' AND bso.service_date <= date('${dateParam}', '+7 days')`;
    }

    const widgetOrders = db.prepare(`
      SELECT
        bso.id, bso.reservation_id, bso.service_id, bso.quantity,
        bso.service_date, bso.options_json, bso.unit_price, bso.total_price,
        bso.status, bso.payment_status, bso.coupon_code, bso.created_at,
        bso.completed_at, bso.menu_item_id,
        ads.name as service_name, ads.name_en, ads.service_type,
        mi.name_en as menu_item_name,
        g.first_name, g.last_name,
        u.name as unit_name
      FROM booking_service_orders bso
      JOIN additional_services ads ON bso.service_id = ads.id
      LEFT JOIN menu_items mi ON bso.menu_item_id = mi.id
      LEFT JOIN reservations r ON bso.reservation_id = r.id
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE 1=1 ${dateFilter}
        AND bso.status != 'cancelled'
        AND bso.payment_status NOT IN ('failed', 'refunded')
      ORDER BY bso.service_date ASC, bso.created_at DESC
    `).all() as any[];

    const orders = widgetOrders.map(o => {
      let startHour = null, endHour = null;
      if (o.options_json) {
        try {
          const opts = JSON.parse(o.options_json);
          startHour = opts.startHour;
          endHour = opts.startHour + opts.hours;
        } catch { /* ignore */ }
      }
      return {
        id: o.id,
        source: 'widget',
        reservationId: o.reservation_id,
        serviceId: o.service_id,
        serviceName: o.name_en || o.service_name,
        serviceType: o.service_type,
        serviceDate: o.service_date,
        startHour,
        endHour,
        quantity: o.quantity,
        totalPrice: o.total_price,
        status: computeStatus(o),
        paymentStatus: o.payment_status,
        completedAt: o.completed_at,
        couponCode: o.coupon_code,
        menuItemName: o.menu_item_name || null,
        guestName: o.first_name ? `${o.first_name} ${o.last_name}` : null,
        unitName: o.unit_name,
        createdAt: o.created_at,
      };
    });

    let soDateFilter = '';
    if (period === 'day') {
      soDateFilter = `AND COALESCE(so.service_date, r.check_in) = '${dateParam}'`;
    } else if (period === 'week') {
      soDateFilter = `AND COALESCE(so.service_date, r.check_in) >= '${dateParam}' AND COALESCE(so.service_date, r.check_in) <= date('${dateParam}', '+7 days')`;
    }

    const guestOrders = db.prepare(`
      SELECT
        so.id, so.reservation_id, so.service_id, so.quantity,
        so.total_price, so.status, so.payment_status, so.created_at,
        so.service_date, so.notes,
        ads.name as service_name, ads.name_en, ads.service_type,
        g.first_name, g.last_name,
        u.name as unit_name,
        r.check_in
      FROM service_orders so
      JOIN additional_services ads ON so.service_id = ads.id
      JOIN reservations r ON so.reservation_id = r.id
      JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE 1=1 ${soDateFilter}
        AND so.status != 'cancelled'
        AND so.payment_status NOT IN ('failed', 'refunded')
      ORDER BY so.created_at DESC
      LIMIT 50
    `).all() as any[];

    const gOrders = guestOrders.map(o => {
      let startHour = null, endHour = null;
      let notesDate: string | null = null;
      let menuItemName: string | null = null;
      if (o.notes) {
        try {
          const n = JSON.parse(o.notes);
          // Slot services (sauna, tub): extract time info
          if (o.service_type === 'slot_booking') {
            if (n.startHour != null) { startHour = n.startHour; endHour = n.startHour + (n.hours || 1); }
            if (n.service_date) notesDate = n.service_date;
          }
          // Breakfast: extract menu item names
          if (n.type === 'breakfast' && n.menu_items && Array.isArray(n.menu_items)) {
            menuItemName = n.menu_items
              .filter((mi: any) => mi.quantity > 0)
              .map((mi: any) => `${mi.name || mi.menuItemId} ×${mi.quantity}`)
              .join(', ');
          }
        } catch { /* ignore */ }
      }
      return {
        id: o.id,
        source: 'guest_page',
        reservationId: o.reservation_id,
        serviceId: o.service_id,
        serviceName: o.name_en || o.service_name,
        serviceType: o.service_type,
        serviceDate: o.service_date || notesDate || o.check_in,
        startHour,
        endHour,
        quantity: o.quantity,
        totalPrice: o.total_price,
        status: computeStatus(o),
        paymentStatus: o.payment_status,
        completedAt: null,
        couponCode: null,
        menuItemName,
        guestName: `${o.first_name} ${o.last_name}`,
        unitName: o.unit_name,
        createdAt: o.created_at,
      };
    });

    return NextResponse.json({
      orders: [...orders, ...gOrders],
      total: orders.length + gOrders.length,
      date: dateParam,
      period,
    });

  } catch (error: any) {
    console.error('GET /api/service-orders error:', error?.message);
    return NextResponse.json({ error: 'Failed to load service orders' }, { status: 500 });
  }
}

export async function updateServiceOrder(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action required' }, { status: 400 });
    }

    const isBSO = db.prepare('SELECT id FROM booking_service_orders WHERE id = ?').get(id);
    const isSO = db.prepare('SELECT id FROM service_orders WHERE id = ?').get(id);

    if (!isBSO && !isSO) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    switch (action) {
      case 'complete': {
        if (isBSO) {
          db.prepare("UPDATE booking_service_orders SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(id);
        }
        if (isSO) {
          db.prepare("UPDATE service_orders SET status = 'completed' WHERE id = ?").run(id);
        }
        break;
      }
      case 'cancel': {
        if (isBSO) {
          db.prepare("UPDATE booking_service_orders SET status = 'cancelled', payment_status = 'cancelled' WHERE id = ?").run(id);
          db.prepare("UPDATE service_time_slots SET booked_count = MAX(0, booked_count - 1) WHERE id IN (SELECT time_slot_id FROM booking_service_orders WHERE id = ?)").run(id);
        }
        if (isSO) {
          db.prepare("UPDATE service_orders SET status = 'cancelled', payment_status = 'cancelled' WHERE id = ?").run(id);
        }
        break;
      }
      case 'reopen': {
        if (isBSO) {
          db.prepare("UPDATE booking_service_orders SET status = 'confirmed', completed_at = NULL WHERE id = ?").run(id);
        }
        if (isSO) {
          db.prepare("UPDATE service_orders SET status = 'confirmed' WHERE id = ?").run(id);
        }
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    console.log(`[Service Orders] ${action} order ${id}`);
    return NextResponse.json({ success: true, id, action });

  } catch (error: any) {
    console.error('PATCH /api/service-orders error:', error?.message);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

function computeStatus(order: any): string {
  if (order.completed_at || order.status === 'completed') return 'completed';
  if (order.status === 'cancelled' || order.payment_status === 'cancelled') return 'cancelled';
  if (order.payment_status === 'failed') return 'cancelled';
  if (order.payment_status === 'paid') return 'paid';
  if (order.payment_status === 'pending') return 'pending';
  if (order.status === 'confirmed') return 'confirmed';
  return 'pending';
}
