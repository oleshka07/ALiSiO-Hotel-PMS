/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Booking confirmation email — fired once per reservation when payment lands
 * (Teya webhook or admin-PIN). Idempotency is the caller's job: only call
 * after a payment_status update where `.changes > 0` so we don't email twice.
 */
import { getDb } from '@core/db';
import { sendEmail } from '@/lib/email';

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('uk-UA', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { return iso; }
}

function fmtPrice(n: number, currency: string): string {
  return `${Math.round(n).toLocaleString('uk-UA')} ${currency}`;
}

export async function sendBookingConfirmationEmail(reservationId: string, origin?: string): Promise<boolean> {
  const db = getDb();

  const row = db.prepare(`
    SELECT r.id, r.check_in, r.check_out, r.nights, r.adults, r.children,
           r.total_price, r.currency, r.guest_page_token,
           g.first_name, g.last_name, g.email,
           u.name as unit_name
    FROM reservations r
    LEFT JOIN guests g ON r.guest_id = g.id
    LEFT JOIN units u ON r.unit_id = u.id
    WHERE r.id = ?
  `).get(reservationId) as any;

  if (!row) {
    console.warn(`[BookingEmail] Reservation ${reservationId} not found`);
    return false;
  }

  if (!row.email) {
    console.log(`[BookingEmail] No email on reservation ${reservationId} — skipping`);
    return false;
  }

  const guestName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Guest';
  const total = fmtPrice(row.total_price || 0, row.currency || 'CZK');
  const guestPageUrl = row.guest_page_token && origin
    ? `${origin}/guest/${row.guest_page_token}`
    : null;

  const subject = `Booking confirmed — Kemp Carlsbad #${row.id}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1a2e;max-width:560px;margin:0 auto;padding:24px;background:#f7f7f9;">
  <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
    <div style="font-size:28px;color:#2E6B4F;font-weight:700;margin-bottom:8px;">Kemp Carlsbad</div>
    <div style="font-size:14px;color:#666;margin-bottom:24px;">Booking confirmed</div>

    <p style="font-size:16px;margin:0 0 16px;">Hi ${guestName},</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px;">
      Thank you for your reservation. Your payment has been received and your booking is confirmed.
    </p>

    <div style="background:#f0f9f4;border:1px solid #d4e9da;border-radius:12px;padding:16px 18px;margin:20px 0;">
      <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Booking ID</div>
      <div style="font-size:20px;font-weight:700;color:#2E6B4F;margin-top:2px;">${row.id}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#666;">Accommodation</td><td style="text-align:right;font-weight:600;">${row.unit_name || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Check-in</td><td style="text-align:right;font-weight:600;">${fmtDate(row.check_in)}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Check-out</td><td style="text-align:right;font-weight:600;">${fmtDate(row.check_out)}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Nights</td><td style="text-align:right;font-weight:600;">${row.nights || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#666;">Guests</td><td style="text-align:right;font-weight:600;">${row.adults || 1}${row.children ? ` + ${row.children} child` : ''}</td></tr>
      <tr><td style="padding:12px 0 0;color:#2E6B4F;font-size:15px;"><strong>Paid</strong></td><td style="text-align:right;padding:12px 0 0;color:#2E6B4F;font-weight:700;font-size:15px;">${total}</td></tr>
    </table>

    ${guestPageUrl ? `
    <div style="margin-top:24px;text-align:center;">
      <a href="${guestPageUrl}" style="display:inline-block;background:#2E6B4F;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">Open guest page →</a>
      <div style="font-size:12px;color:#888;margin-top:8px;">Manage your stay, register guests, book extras</div>
    </div>` : ''}

    <hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px;">
    <div style="font-size:13px;color:#777;line-height:1.5;">
      Need help? WhatsApp <a href="https://wa.me/420723565616" style="color:#2E6B4F;">+420 723 565 616</a><br>
      Kemp Carlsbad s.r.o.
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail({ to: row.email, subject, html });
    console.log(`[BookingEmail] Sent confirmation to ${row.email} for reservation ${row.id}`);
    return true;
  } catch (err: any) {
    console.error(`[BookingEmail] Failed for ${row.id}:`, err.message);
    return false;
  }
}
