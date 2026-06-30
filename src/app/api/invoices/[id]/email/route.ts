/**
 * POST /api/invoices/[id]/email
 * Sends the invoice as HTML email to the guest (or provided override address).
 *
 * Body: { to?: string }   — optional email override
 *
 * Returns: { sent: true, to: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { renderInvoiceHtml, type InvoiceData } from '@/lib/invoice-template';
import { sendEmail } from '@/lib/email';
import { requirePermission } from '@core/security/route-guard';

export const POST = requirePermission('manage_documents', _POST);
async function _POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const db = getDb();

    // Fetch full invoice data (same query as getInvoiceHtml)
    const data = db.prepare(`
      SELECT
        i.id, i.invoice_number, i.issued_at, i.due_date,
        i.amount, i.currency, i.status, i.reservation_id,
        r.check_in, r.check_out, r.nights, r.adults, r.children,
        u.name as unit_name, u.code as unit_code,
        g.first_name as guest_first_name, g.last_name as guest_last_name,
        g.email as guest_email,
        COALESCE(NULLIF(g.address,''), rg.address) as guest_address,
        COALESCE(NULLIF(g.city,''),    rg.city)    as guest_city,
        COALESCE(NULLIF(g.country,''),rg.country)  as guest_country,
        r.invoice_company_name, r.invoice_company_ico, r.invoice_company_dic,
        r.invoice_company_address, r.invoice_company_city, r.invoice_company_country,
        r.invoice_company_email,
        p.method as payment_method, p.comment as payment_notes
      FROM invoices i
      LEFT JOIN reservations r ON i.reservation_id = r.id
      LEFT JOIN units u ON r.unit_id = u.id
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN (
        SELECT gr.reservation_id, rg2.address, rg2.city, rg2.country
        FROM guest_registrations gr
        JOIN guests rg2 ON gr.guest_id = rg2.id
        WHERE (rg2.address IS NOT NULL AND rg2.address != '')
           OR (rg2.city IS NOT NULL AND rg2.city != '')
        ORDER BY gr.registered_at ASC LIMIT 1
      ) rg ON rg.reservation_id = r.id
      LEFT JOIN fin_operations p
        ON p.reservation_id = r.id AND p.op_type = 'income' AND p.status = 'completed'
      WHERE i.id = ?
      ORDER BY p.paid_at DESC LIMIT 1
    `).get(id) as InvoiceData | undefined;

    if (!data || !data.invoice_number) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Determine recipient
    const recipientRaw: string | undefined =
      body?.to ||
      data.invoice_company_email ||
      data.guest_email ||
      undefined;

    if (!recipientRaw) {
      return NextResponse.json(
        { error: 'No email address available for this guest. Provide ?to=email in the request body.' },
        { status: 422 }
      );
    }
    const to = recipientRaw.trim();

    // Generate HTML
    const html = renderInvoiceHtml(data);

    const guestName = data.invoice_company_name
      || `${data.guest_first_name || ''} ${data.guest_last_name || ''}`.trim()
      || 'host';

    const subject = `Faktura ${data.invoice_number} — Kemp Carlsbad`;

    // Wrap in a clean email body
    const emailHtml = `
<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <div style="max-width:680px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
    <div style="background:#1a2234;color:#fff;padding:20px 28px;">
      <div style="font-size:18px;font-weight:700;">Kemp Carlsbad</div>
      <div style="font-size:13px;opacity:.7;margin-top:2px;">Chebská 38/5, Dvory, 360 06 Karlovy Vary</div>
    </div>
    <div style="padding:24px 28px;">
      <p style="margin:0 0 16px;font-size:15px;">Dobrý den, ${guestName},</p>
      <p style="margin:0 0 24px;color:#555;font-size:14px;">
        Zasíláme Vám fakturu <strong>${data.invoice_number}</strong> za ubytování v Kemp Carlsbad.
        Níže naleznete kompletní doklad.
      </p>
    </div>
    <div style="border-top:1px solid #eee;">
      ${html}
    </div>
    <div style="padding:16px 28px;background:#f9f9f9;font-size:12px;color:#888;border-top:1px solid #eee;">
      Tato zpráva byla vygenerována automaticky systémem ALiSiO PMS.<br/>
      V případě dotazů nás kontaktujte na kemp-carlsbad@email.cz
    </div>
  </div>
</body>
</html>`;

    await sendEmail({ to, subject, html: emailHtml });

    return NextResponse.json({ sent: true, to, invoice_number: data.invoice_number });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Invoice Email]', msg);
    return NextResponse.json({ error: 'Failed to send email', detail: msg }, { status: 500 });
  }
}
