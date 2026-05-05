/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

export interface NotifyOptions {
  sourceLabel?: string;
  extraFooter?: string;
  emoji?: string;
}

function escHtml(s: unknown): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function notifyReservationCreated(reservationId: string, options: NotifyOptions = {}): void {
  try {
    const db = getDb();
    const r = db.prepare(`
      SELECT r.id, r.check_in, r.check_out, r.nights,
             r.adults, r.children,
             r.total_price, r.currency, r.status, r.payment_status, r.source,
             r.is_multi_room, r.multi_room_marker,
             g.first_name, g.last_name, g.email, g.phone,
             u.name AS unit_name, u.code AS unit_code,
             c.type AS category_type
      FROM reservations r
      LEFT JOIN guests g ON g.id = r.guest_id
      LEFT JOIN units u ON u.id = r.unit_id
      LEFT JOIN categories c ON c.id = u.category_id
      WHERE r.id = ?
    `).get(reservationId) as any;

    if (!r) {
      console.warn('[TG notify] reservation not found:', reservationId);
      return;
    }

    const guestName = [r.first_name, r.last_name].filter(Boolean).map(escHtml).join(' ') || 'Гість невідомий';
    const unit = r.unit_name
      ? `${escHtml(r.unit_name)}${r.unit_code ? ` (${escHtml(r.unit_code)})` : ''}`
      : 'Юніт не призначено';
    const sourceLabel = options.sourceLabel || r.source || '—';
    const emoji = options.emoji || '📥';

    const lines = [
      `${emoji} <b>Нове бронювання</b> · ${escHtml(sourceLabel)}`,
      ``,
      `👤 ${guestName}`,
      r.email ? `📧 ${escHtml(r.email)}` : '',
      r.phone ? `📞 ${escHtml(r.phone)}` : '',
      `🏠 ${unit}${r.category_type ? ` · ${escHtml(r.category_type)}` : ''}`,
      `📅 ${r.check_in} → ${r.check_out}${r.nights ? ` (${r.nights}н)` : ''}`,
      r.adults ? `👥 ${r.adults} дорослих${r.children ? ` + ${r.children} дітей` : ''}` : '',
      r.total_price ? `💰 ${r.total_price} ${r.currency || 'CZK'} · ${escHtml(r.payment_status || 'unpaid')}` : '',
      // Multi-cabin Booking.com group bookings need manual review — Hostex
      // collapses them into one reservation_code with the aggregated total.
      r.is_multi_room
        ? `\n⚠️ <b>MULTI-ROOM</b> — verify in Hostex (marker ${escHtml(r.multi_room_marker || '')}). Total may cover multiple cabins.`
        : '',
      `\n🔖 <code>${escHtml(r.id)}</code>`,
      options.extraFooter ? options.extraFooter : '',
    ].filter(Boolean).join('\n');

    sendTelegramMessage(lines).catch((e: any) =>
      console.error('[TG notify] send error:', e?.message || e),
    );
  } catch (e: any) {
    console.error('[TG notify] notifyReservationCreated error:', e?.message);
  }
}

export interface GroupNotifyArgs {
  reservationIds: string[];
  sourceLabel: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  currency: string;
  extraFooter?: string;
}

export function notifyGroupBookingCreated(args: GroupNotifyArgs): void {
  try {
    const db = getDb();
    const codes = args.reservationIds
      .map((id) => {
        const u = db.prepare(`
          SELECT u.code, u.name FROM reservations r
          LEFT JOIN units u ON u.id = r.unit_id
          WHERE r.id = ?
        `).get(id) as any;
        return u?.code || u?.name || '?';
      })
      .filter(Boolean);

    const lines = [
      `📥 <b>Нове групове бронювання</b> · ${escHtml(args.sourceLabel)}`,
      ``,
      `👤 ${escHtml(args.guestName)}`,
      `🏠 ${codes.length} юніт(и): ${escHtml(codes.join(' + '))}`,
      `📅 ${args.checkIn} → ${args.checkOut}`,
      `💰 ${args.totalPrice} ${args.currency || 'CZK'}`,
      args.extraFooter ? args.extraFooter : '',
    ].filter(Boolean).join('\n');

    sendTelegramMessage(lines).catch((e: any) =>
      console.error('[TG notify] group send error:', e?.message || e),
    );
  } catch (e: any) {
    console.error('[TG notify] notifyGroupBookingCreated error:', e?.message);
  }
}
