/**
 * CRM Lead → Booking Conversion Handler
 *
 * Converts a CRM lead into one or two reservations (camping = 2 BR spots, 1 name)
 * and creates a Teya deposit payment link with 24h expiry.
 *
 * Deposit = 30% of total price (fixed business rule).
 * After payment → Teya webhook auto-confirms the reservations.
 *
 * Body:
 * {
 *   totalPrice: number,              // CZK
 *   spots?: 1 | 2,                   // number of BR camping spots (default 2)
 *   unitIds?: string[],              // override — if not given, auto-select free BR units
 *   campingVehicleType?: string,     // motorhome|caravan|car_tent|van
 *   campingTentType?: string,        // big|small|none
 *   campingElectricity?: boolean,
 *   campingPets?: string,
 *   campingNotes?: string,
 *   sendTelegram?: boolean,          // default true
 * }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateGuestToken } from '@core/db';
import { createPaymentSession } from '@payments';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

const PMS_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://alisio.swipescape.eu';
const DEPOSIT_PERCENT = 30;

export async function convertLeadToBooking(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: leadId } = await params;

  try {
    const db = getDb();
    const body = await request.json();

    const {
      totalPrice,
      spots = 2,
      unitIds,
      campingVehicleType,
      campingTentType,
      campingElectricity = false,
      campingPets,
      campingNotes,
      sendTelegram = true,
    } = body;

    if (!totalPrice || totalPrice <= 0) {
      return NextResponse.json({ error: 'totalPrice is required and must be > 0' }, { status: 400 });
    }

    // 1. Load lead
    const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId) as any;
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const { first_name, last_name, email, phone, check_in_date, check_out_date, adults, children } = lead;
    if (!check_in_date || !check_out_date) {
      return NextResponse.json({ error: 'Lead missing check_in_date / check_out_date' }, { status: 422 });
    }

    const nights = Math.max(1, Math.round(
      (new Date(check_out_date).getTime() - new Date(check_in_date).getTime()) / (1000 * 60 * 60 * 24)
    ));

    // 2. Find or create guest
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    let guestId: string;
    if (email) {
      const existing = db.prepare('SELECT id FROM guests WHERE email = ? AND organization_id = ?').get(email, org.id) as any;
      if (existing) {
        guestId = existing.id;
        db.prepare('UPDATE guests SET first_name = ?, last_name = ?, phone = COALESCE(?, phone), updated_at = datetime(\'now\') WHERE id = ?')
          .run(first_name, last_name, phone || null, guestId);
      } else {
        guestId = `g_${Date.now()}`;
        db.prepare('INSERT INTO guests (id, organization_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)')
          .run(guestId, org.id, first_name, last_name, email || null, phone || null);
      }
    } else {
      guestId = `g_${Date.now()}`;
      db.prepare('INSERT INTO guests (id, organization_id, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)')
        .run(guestId, org.id, first_name, last_name, phone || null);
    }

    // 3. Auto-select free BR units if not specified
    let selectedUnitIds: string[] = [];

    if (unitIds && unitIds.length > 0) {
      selectedUnitIds = unitIds.slice(0, spots);
    } else {
      const allBR = db.prepare(`
        SELECT u.id FROM units u
        JOIN categories c ON u.category_id = c.id
        WHERE u.code LIKE 'BR%' AND c.type = 'camping'
        ORDER BY u.code ASC
      `).all() as any[];

      for (const unit of allBR) {
        if (selectedUnitIds.length >= spots) break;
        const overlap = db.prepare(`
          SELECT 1 FROM reservations
          WHERE unit_id = ? AND status NOT IN ('cancelled', 'no_show')
            AND check_in < ? AND check_out > ?
          LIMIT 1
        `).get(unit.id, check_out_date, check_in_date);
        if (!overlap) selectedUnitIds.push(unit.id);
      }
    }

    if (selectedUnitIds.length < spots) {
      return NextResponse.json({
        error: `Not enough free BR units for ${check_in_date} – ${check_out_date}. Found: ${selectedUnitIds.length}, needed: ${spots}`
      }, { status: 409 });
    }

    // 4. Create reservations (one per spot, same guest, linked by group_lead_id)
    const pricePerUnit = Math.round(totalPrice / spots);
    const depositAmount = Math.round(totalPrice * DEPOSIT_PERCENT / 100);
    const reservationIds: string[] = [];
    const tokens: string[] = [];

    for (let i = 0; i < selectedUnitIds.length; i++) {
      const unitId = selectedUnitIds[i];
      const unit = db.prepare('SELECT property_id FROM units WHERE id = ?').get(unitId) as any;
      const resId = `r_${Date.now()}_${i}`;
      const token = generateGuestToken();

      db.prepare(`
        INSERT INTO reservations (
          id, property_id, unit_id, guest_id, check_in, check_out, nights,
          adults, children, status, payment_status, source, total_price,
          guest_page_token, internal_notes,
          camping_vehicle_type, camping_tent_type, camping_electricity, camping_pets, camping_notes,
          deposit_amount, deposit_status, group_lead_id
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, 'pending', 'unpaid', 'direct', ?,
          ?, ?,
          ?, ?, ?, ?, ?,
          ?, 'none', ?
        )
      `).run(
        resId, unit.property_id, unitId, guestId, check_in_date, check_out_date, nights,
        adults || 2, children || 0, pricePerUnit,
        token, campingNotes || null,
        campingVehicleType || null, campingTentType || null, campingElectricity ? 1 : 0,
        campingPets || null, campingNotes || null,
        depositAmount, leadId,
      );

      reservationIds.push(resId);
      tokens.push(token);
    }

    // 5. Link CRM lead → reservation
    db.prepare(`
      UPDATE crm_leads SET reservation_id = ?, guest_id = ?, stage = 'negotiation',
        estimated_value = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(reservationIds[0], guestId, totalPrice, leadId);

    // 6. Create Teya deposit checkout session with 24h expiry
    const expires24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const guestName = `${first_name} ${last_name}`.trim();
    const baseUrl = PMS_BASE_URL;
    const successUrl = `${baseUrl}/guest/${tokens[0]}?payment=success&type=deposit`;
    const cancelUrl = `${baseUrl}/guest/${tokens[0]}?payment=cancel`;

    const unitCodes = selectedUnitIds.map(uid => {
      const u = db.prepare('SELECT code FROM units WHERE id = ?').get(uid) as any;
      return u?.code || uid;
    }).join(' + ');

    let depositSessionUrl: string | null = null;
    let depositSessionId: string | null = null;

    try {
      const session = await createPaymentSession({
        kind: 'booking_deposit',
        amount: depositAmount,
        currency: 'CZK',
        description: `Záloha 30% — ${guestName} · ${unitCodes} · ${check_in_date} – ${check_out_date}`,
        lineItems: [{ description: `Záloha za pobyt (${check_in_date} – ${check_out_date})`, quantity: 1, unitPriceMajor: depositAmount }],
        metadata: {
          lead_id: leadId,
          reservation_ids: reservationIds.join(','),
          guest_name: guestName,
          source: 'crm_deposit',
          deposit_percent: String(DEPOSIT_PERCENT),
        },
        successUrl,
        cancelUrl,
        expiresAt: expires24h,
      });

      depositSessionId = session.sessionId;
      depositSessionUrl = session.sessionUrl || null;

      for (const resId of reservationIds) {
        db.prepare(`
          UPDATE reservations SET
            deposit_session_id = ?, deposit_session_url = ?, deposit_session_expires_at = ?,
            deposit_status = 'pending', updated_at = datetime('now')
          WHERE id = ?
        `).run(depositSessionId, depositSessionUrl, expires24h, resId);
      }
    } catch (teyaErr: any) {
      console.error('[CRM Booking] Teya error (non-fatal):', teyaErr.message);
    }

    // 7. Send Telegram notification
    if (sendTelegram) {
      const expiresLabel = new Date(expires24h).toLocaleString('uk-UA', {
        timeZone: 'Europe/Prague', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const lines = [
        `✅ <b>Бронювання створено · 🖥️ CRM</b>`,
        ``,
        `👤 ${esc(guestName)}`,
        `📍 ${esc(unitCodes)} · ${spots} місця`,
        `📅 ${check_in_date} — ${check_out_date} (${nights} ночей)`,
        `👥 ${adults || 2} дорослих`,
        campingVehicleType ? `🚐 ${esc(campingVehicleType)}` : null,
        campingElectricity ? `⚡ Електрика: так` : null,
        ``,
        `💰 <b>Повна вартість: ${totalPrice.toLocaleString()} CZK</b>`,
        `💳 <b>Передплата ${DEPOSIT_PERCENT}%: ${depositAmount.toLocaleString()} CZK</b>`,
        ``,
        depositSessionUrl
          ? `🔗 Посилання для оплати (до ${expiresLabel}):\n${depositSessionUrl}`
          : `⚠️ Teya недоступна — відправте посилання вручну.`,
      ].filter(Boolean).join('\n');

      await sendTelegramMessage(lines).catch(() => {});
    }

    return NextResponse.json({
      ok: true, leadId, reservationIds, guestId, tokens,
      depositAmount, unitCodes, depositSessionId, depositSessionUrl, nights,
    }, { status: 201 });

  } catch (err: any) {
    console.error('[CRM create-booking] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
