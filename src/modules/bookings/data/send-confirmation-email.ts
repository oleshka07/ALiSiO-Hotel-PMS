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
    SELECT r.id, r.unit_id, r.check_in, r.check_out, r.nights, r.adults, r.children,
           r.total_price, r.currency, r.guest_page_token, r.payment_status,
           g.first_name, g.last_name, g.email,
           u.name as unit_name, u.thank_you_url,
           p.name as property_name, p.phone as property_phone
    FROM reservations r
    LEFT JOIN guests g ON r.guest_id = g.id
    LEFT JOIN units u ON r.unit_id = u.id
    LEFT JOIN properties p ON r.property_id = p.id
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
  let guestPageUrl = null;
  if (row.guest_page_token) {
    const baseUrl = process.env.NEXT_PUBLIC_ALISIO_URL || 'https://alisio.swipescape.eu';
    guestPageUrl = `${baseUrl}/guest/${row.guest_page_token}`;
  }

  let widgetConfig: any = {};
  if (row.unit_id) {
    try {
      const siteRow = db.prepare(`
        SELECT bs.widget_config FROM site_listings sl
        JOIN booking_sites bs ON sl.site_id = bs.id
        WHERE sl.unit_id = ? AND sl.is_active = 1
        LIMIT 1
      `).get(row.unit_id) as any;
      if (siteRow?.widget_config) {
        widgetConfig = JSON.parse(siteRow.widget_config);
      }
    } catch (e: any) {
      console.error('[BookingEmail] Failed to fetch site widget_config:', e.message);
    }
  }

  const propertyName = row.property_name || 'ALiSiO';
  const propertyPhone = row.property_phone || '';
  const isPaid = row.payment_status === 'paid' || row.payment_status === 'prepaid';

  const replaceDict: Record<string, string> = {
    propertyName,
    bookingId: row.id,
    guestName,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    checkIn: fmtDate(row.check_in),
    checkOut: fmtDate(row.check_out),
    nights: String(row.nights || 1),
    totalPrice: total,
    unitName: row.unit_name || '—'
  };

  const replacePlaceholders = (tpl: string, dict: Record<string, string>) => {
    let str = tpl;
    for (const [k, v] of Object.entries(dict)) {
      str = str.split(`{${k}}`).join(v);
    }
    return str;
  };

  const defaultSubject = isPaid 
    ? `Booking confirmed — ${propertyName} #${row.id}`
    : `Action required: Complete your booking at ${propertyName}`;

  const rawSubject = isPaid
    ? (widgetConfig.email_confirmed_subject || defaultSubject)
    : (widgetConfig.email_unpaid_subject || defaultSubject);

  const subject = replacePlaceholders(rawSubject, replaceDict);
  
  const rawBody = isPaid
    ? widgetConfig.email_confirmed_body
    : widgetConfig.email_unpaid_body;
  const customMessage = rawBody ? replacePlaceholders(rawBody, replaceDict) : null;

  const totalLabel = isPaid ? 'Paid' : 'Total';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1a2e;max-width:560px;margin:0 auto;padding:24px;background:#f7f7f9;">
  <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
    <div style="font-size:28px;color:#2E6B4F;font-weight:700;margin-bottom:8px;">${propertyName}</div>
    <div style="font-size:14px;color:#666;margin-bottom:24px;">${isPaid ? 'Booking confirmed' : 'Booking registered'}</div>

    <p style="font-size:16px;margin:0 0 16px;">Hi ${guestName}!</p>
    
    ${customMessage ? `
      <div style="font-size:15px;line-height:1.6;margin:0 0 24px;color:#444;white-space:pre-wrap;">${customMessage}</div>
    ` : `
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#444;">
        Thank you for choosing ${propertyName}. We built this place so you could come here to exhale — nature, silence, a hot tub under the stars. There is no need to rush here. Only to rest.
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 24px;color:#444;font-weight:600;">
        ${isPaid 
          ? 'Your booking is fully confirmed and your payment has been received.' 
          : 'Your booking is registered. To secure your dates, please complete your payment.'}
      </p>
    `}

    ${guestPageUrl ? `
    <div style="margin-bottom:24px;">
      <a href="${guestPageUrl}" style="display:inline-block;background:#2E6B4F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;box-shadow:0 2px 4px rgba(46,107,79,0.2);">
        ${isPaid ? 'Open guest page →' : 'Go to payment →'}
      </a>
    </div>` : ''}

    <p style="font-size:14px;line-height:1.6;margin:0 0 24px;color:#555;">
      ${isPaid 
        ? "On your personal page, you'll find photos of the cabin, what's inside, how to get here, and places to visit nearby." 
        : "After payment, your personal page will open — there you'll find photos of the cabin, what's inside, how to get here, and places to visit nearby."}
    </p>

    <p style="font-size:15px;line-height:1.6;margin:0 0 32px;color:#444;">
      See you soon,<br>
      Oleg Stepeniev 🌿
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
      <tr><td style="padding:12px 0 0;color:#2E6B4F;font-size:15px;"><strong>${totalLabel}</strong></td><td style="text-align:right;padding:12px 0 0;color:#2E6B4F;font-weight:700;font-size:15px;">${total}</td></tr>
    </table>

    <hr style="border:none;border-top:1px solid #eee;margin:28px 0 16px;">
    <div style="font-size:13px;color:#777;line-height:1.5;">
      ${propertyPhone ? `Need help? WhatsApp <a href="https://wa.me/${propertyPhone.replace(/[^0-9]/g, '')}" style="color:#2E6B4F;">${propertyPhone}</a><br>` : ''}
      ${propertyName}
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
