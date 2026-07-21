import { NextRequest, NextResponse } from 'next/server';
import * as portalRepo from '@/modules/guests/data/guest-portal.repo';
import { sendEmail } from '@/lib/email';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const OPTIONS = () =>
  new NextResponse(null, { status: 204, headers: CORS });

/**
 * POST /api/guest/[token]/send-links
 * Sends the guest portal link to the guest's email on file.
 * Called by the Kemp Carlsbad frontend "Vymazat data a odeslat e-mailem" button.
 */
export const POST = async (
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  try {
    const { token } = await params;

    const reservation = portalRepo.getReservationByToken(token);
    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404, headers: CORS });
    }

    const guestEmail: string | null = reservation.guest_email || reservation.email || null;
    if (!guestEmail) {
      return NextResponse.json(
        { error: 'No email on file for this booking' },
        { status: 422, headers: CORS },
      );
    }

    const guestName = [reservation.first_name, reservation.last_name].filter(Boolean).join(' ') || 'Host';
    const portalUrl = `https://alisio.swipescape.eu/guest/${token}`;
    const kempCabinetUrl = `https://www.kemp-carlsbad.cz/my-bookings`;
    const kempRegUrl    = `https://www.kemp-carlsbad.cz/registration?token=${token}`;
    const checkIn  = reservation.check_in  || '';
    const checkOut = reservation.check_out || '';
    const unitName = reservation.unit_type_name || reservation.property_name || 'Kemp Carlsbad';
    const totalPrice = reservation.total_price ? `${Number(reservation.total_price).toLocaleString('cs')} Kč` : null;
    const isPaid = ['paid', 'prepaid'].includes(reservation.payment_status || '');

    const html = `
<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><title>Vaše rezervace</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1a6b3c;padding:28px 32px;text-align:center;">
            <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">🏕️ Kemp Carlsbad</p>
            <p style="margin:6px 0 0;color:#a8e6c3;font-size:14px;">${isPaid ? '✅ Rezervace potvrzena' : '📋 Rezervace zaregistrována'}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="color:#333;font-size:15px;margin:0 0 16px;">Dobrý den, <strong>${guestName}</strong>,</p>
            <p style="color:#555;font-size:14px;margin:0 0 16px;">
              ${isPaid
                ? 'Vaše rezervace je potvrzena a platba přijata. Těšíme se na vás!'
                : 'Vaše rezervace je zaregistrována. Platbu prosím proveďte na recepci při příjezdu.'}
            </p>
            ${totalPrice ? `<p style="color:#1a6b3c;font-size:15px;font-weight:700;margin:0 0 20px;">💰 Celkem: ${totalPrice} ${isPaid ? '(zaplaceno)' : '(platba na místě)'}</p>` : ''}

            <!-- Booking info box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fdf9;border:1px solid #d1f5e0;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 6px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Ubytování</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#1a1a1a;">${unitName}</p>
                  ${checkIn ? `<p style="margin:6px 0 0;font-size:13px;color:#555;">📅 ${checkIn} – ${checkOut}</p>` : ''}
                  ${totalPrice ? `<p style="margin:8px 0 0;font-size:13px;color:#1a6b3c;font-weight:600;">💰 ${totalPrice} ${isPaid ? '· zaplaceno' : '· platba na recepci'}</p>` : ''}
                </td>
              </tr>
            </table>

            <!-- Primary CTA: ALiSiO Guest Portal -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td align="center">
                  <a href="${portalUrl}"
                     style="display:inline-block;background:#1a6b3c;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;">
                    🏠 Otevřít stránku hosta →
                  </a>
                </td>
              </tr>
            </table>

          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;text-align:center;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              Kemp Carlsbad · kemp-carlsbad@email.cz · kv.kemp-carlsbad.cz
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

    const subject = isPaid
      ? `✅ Rezervace potvrzena — Kemp Carlsbad – ${unitName}`
      : `📋 Rezervace zaregistrována — Kemp Carlsbad – ${unitName}`;

    await sendEmail({
      to: guestEmail,
      subject,
      html,
    });

    return NextResponse.json({ ok: true, sentTo: guestEmail }, { headers: CORS });

  } catch (err: any) {
    console.error('[send-links] error:', err?.message || err);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500, headers: CORS },
    );
  }
};
