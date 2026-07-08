/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as actionsRepo from '../data/guest-actions.repo';
import { createPaymentSession, resolveCredentialsForReservation } from '@payments';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

// ─── Types ─────────────────────────────────────────────────────────────────
interface CartItemInput {
  serviceId: string;
  quantity?: number;
  serviceDates?: string[]; // for breakfast-type services
  // Slot service extras (sauna/tub via widget cart):
  hours?: number;
  startHour?: number;
  slotDate?: string;
  addonBrooms?: number;
  addonBroomPrice?: number;
  // Breakfast bundle (widget cart):
  breakfastMenuItems?: Array<{ menuItemId: string; quantity: number; price?: number; name?: string }>;
  // Pre-computed total from client (used as a sanity check)
  lineTotal?: number;
}

// ─── Single service pay (legacy) ───────────────────────────────────────────
async function handleSinglePay(
  token: string,
  serviceId: string,
  quantity: number,
  serviceDates?: string[],
): Promise<NextResponse> {
  const reservation = actionsRepo.getReservationForPay(token);
  if (!reservation) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const service = actionsRepo.getServiceForProperty(serviceId, reservation.property_id);
  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });

  // Determine service dates: use provided dates, or check-in date as fallback
  const dates = (serviceDates && serviceDates.length > 0)
    ? serviceDates
    : [reservation.check_in];

  // W5: Validate that service dates fall within the stay window
  if (reservation.check_in && reservation.check_out && serviceDates && serviceDates.length > 0) {
    const ci = new Date(reservation.check_in + 'T00:00:00');
    const co = new Date(reservation.check_out + 'T00:00:00');
    for (const d of serviceDates) {
      const dt = new Date(d + 'T00:00:00');
      // Allow from day after check-in through check-out (breakfast morning)
      if (dt < ci || dt > co) {
        return NextResponse.json(
          { error: `Date ${d} is outside your stay (${reservation.check_in} — ${reservation.check_out})` },
          { status: 400 },
        );
      }
    }
  }

  const effectiveQty = Math.max(quantity, dates.length);
  const totalPrice = service.price * effectiveQty;
  const serviceName = service.name_en || service.name;
  const guestName = `${reservation.first_name} ${reservation.last_name}`;

  // Create one order per date (for breakfast) or a single order
  const orderIds: string[] = [];
  if (dates.length > 1) {
    for (const date of dates) {
      const oid = actionsRepo.createPendingServiceOrder(reservation.id, serviceId, 1, service.price, date);
      if (!oid) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
      orderIds.push(oid);
    }
  } else {
    const oid = actionsRepo.createPendingServiceOrder(reservation.id, serviceId, effectiveQty, totalPrice, dates[0]);
    if (!oid) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    orderIds.push(oid);
  }

  console.log(`[Guest Pay] Orders: ${orderIds.join(',')} | ${serviceName} | dates: ${dates.join(',')} | ${guestName}`);

  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const datesLabel = dates.length > 1 ? `\n📅 Дати: ${dates.join(', ')}` : `\n📅 Дата: ${dates[0]}`;
  sendTelegramMessage([
    `🛒 <b>Замовлення · 📱 Гостьова</b>`, ``,
    `👤 ${escHtml(guestName)}`, `🏠 ${escHtml(reservation.unit_name)}`,
    `📅 ${reservation.check_in} — ${reservation.check_out}`,
    reservation.is_multi_room
      ? `\n⚠️ <b>MULTI-ROOM</b> — guest's booking spans multiple cabins; unit shown is one of them.`
      : '', ``,
    `✨ ${escHtml(serviceName)} × ${effectiveQty} — ${totalPrice} ${service.currency || 'CZK'}${datesLabel}`,
    `💳 Створено замовлення · очікує оплати`,
    ``, `🔖 <code>${escHtml(reservation.id)}</code>`,
  ].filter(Boolean).join('\n')).catch((e) => console.error('[Guest Pay] TG error:', e.message));

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://alisio.swipescape.eu';
    const siteCredentials = resolveCredentialsForReservation(reservation.id);
    const session = await createPaymentSession({
      kind: 'service_standalone',
      amount: totalPrice,
      currency: service.currency || 'CZK',
      description: `${serviceName} × ${effectiveQty} — ${guestName}`,
      lineItems: [{ description: serviceName, quantity: effectiveQty, unitPriceMajor: service.price }],
      metadata: { order_ids: orderIds.join(','), reservation_id: reservation.id, service_id: serviceId, source: 'guest_page' },
      credentials: siteCredentials,
      successUrl: `${baseUrl}/api/booking/payment-return?status=success&reservation_id=${encodeURIComponent(reservation.id)}&return=${encodeURIComponent(`/guest/${token}`)}`,
      cancelUrl: `${baseUrl}/api/booking/payment-return?status=cancel&reservation_id=${encodeURIComponent(reservation.id)}&return=${encodeURIComponent(`/guest/${token}`)}`,
    });
    for (const oid of orderIds) actionsRepo.updateOrderPaymentId(oid, session.sessionId);
    console.log(`[Guest Pay] Teya session created: ${session.sessionId}`);
    return NextResponse.json({ success: true, orderIds, session_url: session.sessionUrl, session_id: session.sessionId });
  } catch (teyaError: any) {
    console.error('[Guest Pay] Teya error:', teyaError.message);
    for (const oid of orderIds) actionsRepo.markOrderPaymentFailed(oid);
    sendTelegramMessage(
      `⚠️ <b>Помилка оплати</b>\n\n👤 ${escHtml(guestName)}\n✨ ${escHtml(serviceName)} × ${effectiveQty}\n` +
      `❌ Teya: ${escHtml(teyaError.message?.substring(0, 100))}\n\nЗамовлення створено, але оплата не вдалася.`,
    ).catch(() => {});
    return NextResponse.json({ error: 'Payment system temporarily unavailable. Please try again later.', orderIds }, { status: 503 });
  }
}

// ─── Cart bulk pay ────────────────────────────────────────────────────────────
async function handleCartPay(token: string, items: CartItemInput[]): Promise<NextResponse> {
  const reservation = actionsRepo.getReservationForPay(token);
  if (!reservation) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const serviceIds = [...new Set(items.map((i) => i.serviceId))];
  const services = actionsRepo.getServicesForCart(serviceIds, reservation.property_id);
  const svcMap = new Map(services.map((s: any) => [s.id, s]));

  type ResolvedSimple = {
    kind: 'simple'; svc: any; quantity: number; lineTotal: number; serviceDates?: string[];
  };
  type ResolvedSlot = {
    kind: 'slot'; svc: any; lineTotal: number; hours: number; startHour: number;
    date: string; brooms: number; broomPrice: number;
  };
  type ResolvedBreakfast = {
    kind: 'breakfast'; svc: any; lineTotal: number;
    menuItems: Array<{ menuItemId: string; quantity: number; price: number; name?: string }>;
    serviceDates: string[];
  };
  type Resolved = ResolvedSimple | ResolvedSlot | ResolvedBreakfast;
  const resolvedItems: Resolved[] = [];

  for (const item of items) {
    const svc = svcMap.get(item.serviceId);
    if (!svc) return NextResponse.json({ error: `Service not found: ${item.serviceId}` }, { status: 404 });

    // Slot service line (sauna/tub from widget cart). Carries hours,
    // startHour, single date, and an optional broom add-on for sauna.
    if (typeof item.hours === 'number' && item.hours > 0) {
      const hours = Math.max(1, item.hours);
      const startHour = typeof item.startHour === 'number' ? item.startHour : 14;
      const date = item.slotDate || item.serviceDates?.[0] || reservation.check_in;
      const brooms = Math.max(0, item.addonBrooms || 0);
      const broomPrice = brooms > 0 ? Math.max(0, item.addonBroomPrice || 0) : 0;
      const lineTotal = svc.price * hours + brooms * broomPrice;
      resolvedItems.push({ kind: 'slot', svc, lineTotal, hours, startHour, date, brooms, broomPrice });
      continue;
    }

    // Breakfast bundle line: list of menu items × selected dates. Backend
    // recomputes per-item prices from menu_items table for safety.
    if (item.breakfastMenuItems && item.breakfastMenuItems.length > 0) {
      const dates = item.serviceDates && item.serviceDates.length > 0
        ? item.serviceDates
        : [reservation.check_in];
      const dailyTotal = item.breakfastMenuItems.reduce(
        (s, m) => s + (Number(m.price) || 0) * (Number(m.quantity) || 0), 0,
      );
      const lineTotal = dailyTotal * dates.length;
      resolvedItems.push({
        kind: 'breakfast', svc, lineTotal,
        menuItems: item.breakfastMenuItems.map((m) => ({
          menuItemId: m.menuItemId,
          quantity: Math.max(1, m.quantity || 1),
          price: Number(m.price) || 0,
          name: m.name,
        })),
        serviceDates: dates,
      });
      continue;
    }

    // Legacy simple line (e.g. BBQ, late checkout, single-day breakfast
    // via the simple modal): one row, quantity stretches with serviceDates.
    const qty = Math.max(1, item.quantity || 1);
    const serviceDates = item.serviceDates && item.serviceDates.length > 0 ? item.serviceDates : undefined;
    const effectiveQty = serviceDates ? Math.max(qty, serviceDates.length) : qty;
    resolvedItems.push({ kind: 'simple', svc, quantity: effectiveQty, lineTotal: svc.price * effectiveQty, serviceDates });
  }

  const grandTotal = resolvedItems.reduce((s, i) => s + i.lineTotal, 0);
  const guestName = `${reservation.first_name} ${reservation.last_name}`;
  const currency = resolvedItems[0]?.svc?.currency || 'CZK';
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const orderIds: string[] = [];
  // Track BSO-style order ids (breakfast bundle) separately because they
  // live in a different table and need a different payment_id update path.
  const bsoOrderIds: string[] = [];

  for (const r of resolvedItems) {
    if (r.kind === 'simple') {
      const dates = (r.serviceDates && r.serviceDates.length > 0) ? r.serviceDates : null;
      if (dates && dates.length > 1) {
        for (const date of dates) {
          const oid = actionsRepo.createPendingServiceOrder(reservation.id, r.svc.id, 1, r.svc.price, date);
          if (!oid) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
          orderIds.push(oid);
        }
      } else {
        const oid = actionsRepo.createPendingServiceOrder(reservation.id, r.svc.id, r.quantity, r.lineTotal, dates?.[0] || reservation.check_in);
        if (!oid) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
        orderIds.push(oid);
      }
    } else if (r.kind === 'slot') {
      // Persist slot details inside notes JSON so the operator and the
      // payment-return webhook both have everything to confirm the BSO.
      const notes = JSON.stringify({
        service_date: r.date,
        startHour: r.startHour,
        hours: r.hours,
        addons: r.brooms > 0 ? [{ id: 'addon_broom', quantity: r.brooms, price: r.broomPrice }] : [],
        unit_price: r.svc.price,
        source: 'guest_cart',
      });
      const oid = actionsRepo.createPendingServiceOrder(reservation.id, r.svc.id, r.hours, r.lineTotal, r.date, notes);
      if (!oid) return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
      orderIds.push(oid);
    } else if (r.kind === 'breakfast') {
      const ids = actionsRepo.createPendingBreakfastBundle(reservation.id, r.menuItems, r.serviceDates);
      if (ids.length === 0) return NextResponse.json({ error: 'Failed to create breakfast orders' }, { status: 500 });
      bsoOrderIds.push(...ids);
    }
  }

  console.log(`[Cart Pay] ${resolvedItems.length} items | ${grandTotal} ${currency} | ${guestName}`);

  // Build human-readable lines for TG and Teya line_items, branched by kind.
  const tgLines = resolvedItems.map((r) => {
    const name = r.svc.name_en || r.svc.name;
    if (r.kind === 'slot') {
      const broomTag = r.brooms > 0 ? ` + 🌿×${r.brooms}` : '';
      return `  • ${escHtml(name)} — ${r.hours}h @ ${String(r.startHour).padStart(2,'0')}:00${broomTag} — ${r.lineTotal} ${currency}`;
    }
    if (r.kind === 'breakfast') {
      const totalQty = r.menuItems.reduce((s, m) => s + m.quantity, 0);
      return `  • ${escHtml(name)} — ${totalQty} dish × ${r.serviceDates.length} day — ${r.lineTotal} ${currency}`;
    }
    return `  • ${escHtml(name)} ×${r.quantity} — ${r.lineTotal} ${currency}`;
  });

  sendTelegramMessage([
    `🛒 <b>Кошик · 📱 Гостьова</b>`, ``,
    `👤 ${escHtml(guestName)}`, `🏠 ${escHtml(reservation.unit_name)}`,
    `📅 ${reservation.check_in} — ${reservation.check_out}`,
    reservation.is_multi_room
      ? `\n⚠️ <b>MULTI-ROOM</b> — guest's booking spans multiple cabins; unit shown is one of them.`
      : '', ``,
    ...tgLines, ``,
    `💰 Total: ${grandTotal} ${currency}`, `💳 Створено замовлення · очікує оплати`,
    ``, `🔖 <code>${escHtml(reservation.id)}</code>`,
  ].filter(Boolean).join('\n')).catch((e) => console.error('[Cart Pay] TG error:', e.message));

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://alisio.swipescape.eu';
    const siteCredentials = resolveCredentialsForReservation(reservation.id);
    const session = await createPaymentSession({
      kind: 'service_cart',
      amount: grandTotal,
      currency,
      description: `Kemp Carlsbad — Cart (${resolvedItems.length} ${resolvedItems.length === 1 ? 'item' : 'items'}) — ${guestName}`,
      lineItems: resolvedItems.map((r) => {
        const name = r.svc.name_en || r.svc.name;
        if (r.kind === 'slot') {
          return { description: `${name} (${r.hours}h)`, quantity: 1, unitPriceMajor: r.lineTotal };
        }
        if (r.kind === 'breakfast') {
          return { description: `${name} bundle`, quantity: 1, unitPriceMajor: r.lineTotal };
        }
        return { description: name, quantity: r.quantity, unitPriceMajor: r.svc.price };
      }),
      metadata: {
        order_ids: orderIds.join(','),
        ...(bsoOrderIds.length > 0 && { bso_order_ids: bsoOrderIds.join(',') }),
        reservation_id: reservation.id,
        source: 'guest_cart',
      },
      credentials: siteCredentials,
      successUrl: `${baseUrl}/api/booking/payment-return?status=success&reservation_id=${encodeURIComponent(reservation.id)}&return=${encodeURIComponent(`/guest/${token}`)}`,
      cancelUrl: `${baseUrl}/api/booking/payment-return?status=cancel&reservation_id=${encodeURIComponent(reservation.id)}&return=${encodeURIComponent(`/guest/${token}`)}`,
    });
    for (const orderId of orderIds) actionsRepo.updateOrderPaymentId(orderId, session.sessionId);
    for (const bsoId of bsoOrderIds) actionsRepo.updateBookingServiceOrderPaymentId(bsoId, session.sessionId);
    console.log(`[Cart Pay] Teya session: ${session.sessionId}`);
    return NextResponse.json({ success: true, orderIds, session_url: session.sessionUrl, session_id: session.sessionId });
  } catch (teyaError: any) {
    console.error('[Cart Pay] Teya error:', teyaError.message);
    for (const orderId of orderIds) actionsRepo.markOrderPaymentFailed(orderId);
    // Best-effort cleanup of breakfast bundle BSOs — leave them as 'pending'
    // on failure; they will be visible in the orphan tools if needed.
    return NextResponse.json({ error: 'Payment system temporarily unavailable. Please try again later.' }, { status: 503 });
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function payForService(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const body = await request.json();

    // Cart bulk pay: { items: [...] }
    if (Array.isArray(body.items) && body.items.length > 0) {
      return handleCartPay(token, body.items);
    }

    // Single pay (backward compat): { serviceId, quantity, serviceDates }
    const { serviceId, quantity = 1, serviceDates } = body;
    if (!serviceId) return NextResponse.json({ error: 'serviceId or items is required' }, { status: 400 });
    return handleSinglePay(token, serviceId, quantity, serviceDates);
  } catch (error: any) {
    console.error('POST /api/guest/[token]/pay error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to create payment' }, { status: 500 });
  }
}
