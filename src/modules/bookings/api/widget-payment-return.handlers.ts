/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot'; // TODO: replace with eventBus
import { sendBookingConfirmationEmail } from '../data/send-confirmation-email';

export async function handlePaymentReturn(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id') || '';
  const status = url.searchParams.get('status') || 'unknown';
  const returnPath = url.searchParams.get('return') || '/';

  console.log(`[Payment Return] session=${sessionId}, status=${status}, return=${returnPath}`);

  const db = getDb();

  if (status === 'success') {
    try {
      const bsoResult = db.prepare(`
        UPDATE booking_service_orders
        SET payment_status = 'paid'
        WHERE payment_id = ? AND payment_status IN ('pending', 'none')
      `).run(sessionId);

      const soResult = db.prepare(`
        UPDATE service_orders
        SET payment_status = 'paid', status = 'confirmed'
        WHERE payment_id = ? AND payment_status IN ('pending', 'none')
      `).run(sessionId);

      // reservation_id can come from URL query param OR embedded in return path
      const returnUrlObj = new URL(returnPath, url.origin);
      const reservationId = url.searchParams.get('reservation_id')
        || url.searchParams.get('res_id')
        || returnUrlObj.searchParams.get('res_id')
        || returnUrlObj.searchParams.get('reservation_id')
        || returnUrlObj.searchParams.get('success');

      let resResult = { changes: 0 };
      if (reservationId) {
        // Update tentative → confirmed+paid, OR confirmed → paid (for direct booking payments)
        resResult = db.prepare(`
          UPDATE reservations
          SET payment_status = 'paid', updated_at = datetime('now')
          WHERE id = ? AND payment_status IN ('unpaid', 'payment_requested', 'prepaid')
        `).run(reservationId);

        // Also update tentative status to confirmed
        db.prepare(`
          UPDATE reservations SET status = 'confirmed', updated_at = datetime('now')
          WHERE id = ? AND status = 'tentative'
        `).run(reservationId);

        // PMS state already updated above (reservations.payment_status='paid').
        // No fin_operation is created here — Teya widget money sits on the
        // Teya merchant account and lands in the ledger only when the bank
        // statement arrives. TG notify the operator for visibility.
        // Always update service orders — idempotent on already-paid rows
        try {
          db.prepare(`
            UPDATE service_orders SET payment_status = 'paid', status = 'confirmed'
            WHERE reservation_id = ? AND payment_status IN ('pending', 'unpaid', 'none')
              AND (payment_id = ? OR payment_id = 'pending_teya' OR payment_id IS NULL)
          `).run(reservationId, sessionId);
        } catch { /* table may not exist */ }
        try {
          db.prepare(`
            UPDATE booking_service_orders SET payment_status = 'paid', status = 'confirmed'
            WHERE reservation_id = ? AND payment_status IN ('pending', 'unpaid', 'none')
              AND (payment_id = ? OR payment_id = 'pending_teya' OR payment_id IS NULL)
          `).run(reservationId, sessionId);
        } catch { /* table may not exist */ }

        // Mark the booking_draft as paid so the log table stays in sync
        try {
          db.prepare(`UPDATE booking_drafts SET status = 'paid' WHERE reservation_id = ?`).run(reservationId);
        } catch { /* table may not exist */ }

        // TG notification (only when this handler actually changed the status)
        if (resResult.changes > 0) {
          try {
            const res = db.prepare('SELECT r.total_price, r.currency, u.name as unit_name FROM reservations r LEFT JOIN units u ON r.unit_id = u.id WHERE r.id = ?').get(reservationId) as any;
            if (res) {
              const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
              
              let draftInfo: any = null;
              try {
                draftInfo = db.prepare('SELECT guest_name, guest_phone, check_in, check_out, utm_params FROM booking_drafts WHERE reservation_id = ?').get(reservationId) as any;
              } catch {}
              
              let utmBlock = '';
              if (draftInfo?.utm_params) {
                try {
                  const utm = JSON.parse(draftInfo.utm_params);
                  if (Object.keys(utm).length > 0) {
                    utmBlock = `\n🎯 <b>UTM мітки:</b>\n<pre>${Object.entries(utm).map(([k, v]) => `${k}=${v}`).join('\n')}</pre>`;
                  }
                } catch {}
              }

              const msgLines = [
                `💳 <b>Оплата бронювання підтверджена</b>`,
                ``,
              ];
              
              if (draftInfo?.guest_name) msgLines.push(`👤 <b>Гість:</b> ${esc(draftInfo.guest_name)}`);
              if (draftInfo?.guest_phone) msgLines.push(`📞 <b>Телефон:</b> ${esc(draftInfo.guest_phone)}`);
              if (res.unit_name) msgLines.push(`🏠 <b>Тип:</b> ${esc(res.unit_name)}`);
              if (draftInfo?.check_in) msgLines.push(`📅 <b>Терміни:</b> ${draftInfo.check_in} → ${draftInfo.check_out}`);
              
              msgLines.push(`💰 <b>Сума:</b> ${res.total_price} ${res.currency || 'CZK'} — ✅ Оплачено (Teya)`);
              msgLines.push(`📋 <b>Reservation:</b> <code>${reservationId}</code>`);
              if (utmBlock) msgLines.push(utmBlock);

              const rowButtons = [{ text: '📋 CRM', url: `https://alisio.swipescape.eu/crm/inbox?id=${reservationId}` }];

              sendTelegramMessage(msgLines.join('\n'), [rowButtons] as any).catch(() => {});
            }
          } catch (e: any) { console.error('[Payment Return] Booking TG notify error:', e.message); }
        }

        // Confirmation email — send unconditionally when reservationId is present.
        // This handles the race condition where Teya webhook updates payment_status
        // BEFORE this redirect fires, causing resResult.changes = 0 and the email
        // being silently dropped. We await it so the lambda stays alive until sent.
        console.log(`[Payment Return] Sending confirmation email for reservation ${reservationId}`);
        try {
          await sendBookingConfirmationEmail(reservationId, url.origin);
        } catch (e: any) {
          console.error('[Payment Return] Email send error:', e?.message);
        }
      }

      db.prepare(`
        UPDATE service_time_slots
        SET booking_session_id = NULL, notes = 'paid'
        WHERE booking_session_id = ?
      `).run(sessionId);

      console.log(`[Payment Return] Confirmed:`, {
        bsoOrders: bsoResult.changes,
        serviceOrders: soResult.changes,
        reservations: resResult.changes,
      });

      // Service-order payment fin_operation creation removed. PMS-side
      // status is already updated (booking_service_orders.payment_status,
      // service_orders.payment_status). Real income lands when the bank
      // statement (Teya weekly sweep) is imported via /finance/bank inbox.

      if (bsoResult.changes > 0 || soResult.changes > 0) {
        try {
          const order = db.prepare(`
            SELECT bso.total_price, bso.service_date, bso.options_json, bso.service_id,
                   ads.name as service_name, ads.name_en,
                   g.first_name, g.last_name,
                   u.name as unit_name
            FROM booking_service_orders bso
            JOIN additional_services ads ON bso.service_id = ads.id
            LEFT JOIN reservations r ON bso.reservation_id = r.id
            LEFT JOIN guests g ON r.guest_id = g.id
            LEFT JOIN units u ON r.unit_id = u.id
            WHERE bso.payment_id = ?
            UNION ALL
            SELECT so.total_price, NULL, NULL, so.service_id,
                   ads2.name, ads2.name_en,
                   g2.first_name, g2.last_name,
                   u2.name
            FROM service_orders so
            JOIN additional_services ads2 ON so.service_id = ads2.id
            JOIN reservations r2 ON so.reservation_id = r2.id
            JOIN guests g2 ON r2.guest_id = g2.id
            JOIN units u2 ON r2.unit_id = u2.id
            WHERE so.payment_id = ?
            LIMIT 1
          `).get(sessionId, sessionId) as any;

          if (order) {
            const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
            let timeInfo = '';
            if (order.options_json) {
              try {
                const opts = JSON.parse(order.options_json);
                timeInfo = `\n⏰ ${order.service_date} ${opts.startHour}:00–${opts.startHour + opts.hours}:00`;
              } catch { /* ignore */ }
            }
            const guestName = order.first_name ? `${esc(order.first_name)} ${esc(order.last_name)}` : 'Зовнішній клієнт';
            const text = [
              `💳 <b>Оплата підтверджена</b>`,
              ``,
              `👤 ${guestName}`,
              order.unit_name ? `🏠 ${esc(order.unit_name)}` : '',
              `✨ ${esc(order.name_en || order.service_name)}${timeInfo}`,
              `💰 ${order.total_price} CZK — ✅ Оплачено`,
            ].filter(Boolean).join('\n');
            sendTelegramMessage(text).catch(() => {});
          }
        } catch { /* non-critical */ }
      }

    } catch (err: any) {
      console.error('[Payment Return] Error:', err.message);
    }

  } else if (status === 'cancel' && sessionId) {
    try {
      const released = db.prepare(`
        UPDATE service_time_slots
        SET booked_count = MAX(0, booked_count - 1), booking_session_id = NULL
        WHERE booking_session_id = ?
      `).run(sessionId);

      db.prepare(`
        UPDATE booking_service_orders
        SET payment_status = 'cancelled'
        WHERE payment_id = ? AND payment_status = 'pending'
      `).run(sessionId);

      db.prepare(`
        UPDATE service_orders
        SET payment_status = 'cancelled'
        WHERE payment_id = ? AND payment_status = 'pending'
      `).run(sessionId);

      console.log(`[Payment Return] Cancelled, slots released:`, released.changes);

      try {
        const order = db.prepare(`
          SELECT ads.name_en, ads.name as service_name, bso.service_date, bso.total_price, bso.options_json,
                 g.first_name, g.last_name
          FROM booking_service_orders bso
          JOIN additional_services ads ON bso.service_id = ads.id
          LEFT JOIN reservations r ON bso.reservation_id = r.id
          LEFT JOIN guests g ON r.guest_id = g.id
          WHERE bso.payment_id = ?
          LIMIT 1
        `).get(sessionId) as any;
        if (order) {
          const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
          const guestName = order.first_name ? `${esc(order.first_name)} ${esc(order.last_name)}` : 'Клієнт';
          const text = [
            `❌ <b>Оплату скасовано</b>`,
            ``,
            `👤 ${guestName}`,
            `✨ ${esc(order.name_en || order.service_name)}`,
            `💰 ${order.total_price} CZK`,
          ].join('\n');
          sendTelegramMessage(text).catch(() => {});
        }
      } catch { /* non-critical */ }
    } catch (err: any) {
      console.error('[Payment Return] Cancel error:', err.message);
    }
  }

  const separator = returnPath.includes('?') ? '&' : '?';
  const redirectUrl = `${returnPath}${separator}payment_status=${status}&session_id=${sessionId}`;

  // If redirectUrl is already absolute (cross-domain return, e.g. kv.kemp-carlsbad.cz),
  // new URL(absoluteUrl, base) ignores the base and returns the absolute URL — correct.
  // If it's a relative path, url.origin is used as base — also correct.
  let finalRedirectUrl: URL;
  try {
    finalRedirectUrl = new URL(redirectUrl);
  } catch {
    // Relative path — resolve against the PMS origin
    finalRedirectUrl = new URL(redirectUrl, url.origin);
  }

  console.log(`[Payment Return] Redirecting → ${finalRedirectUrl.toString()}`);
  return NextResponse.redirect(finalRedirectUrl);
}
