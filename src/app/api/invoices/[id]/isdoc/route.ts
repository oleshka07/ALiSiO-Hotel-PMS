/**
 * GET /api/invoices/[id]/isdoc
 * Downloads ISDOC v6.0.2 XML for an existing invoice record.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { generateIsdocXml } from '@/lib/isdoc';
import type { InvoiceData } from '@/lib/invoice-template';
import { requirePermission } from '@core/security/route-guard';
import { convertToCzkAuto, foreignNote } from '@/lib/fx';
import { showBuyerName, dueDateFor } from '@/lib/invoice-rules';

export const GET = requirePermission('manage_documents', _GET);
async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const db = getDb();

    // Full invoice data (same query as getInvoiceHtml)
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
        p.method as payment_method, p.paid_at as payment_date
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

    // Real accounting date: check-in → payment → creation (never import date).
    const documentDate = (data.check_in || data.payment_date || data.issued_at || '').slice(0, 10);
    // Foreign-currency (OTA/EUR) → CZK at the rate effective on the document date.
    const conv = await convertToCzkAuto(db, data.amount || 0, data.currency || 'CZK', documentDate);
    const czkAmount = conv.converted ? conv.amountCzk : (data.amount || 0);

    // Buyer: explicit company always; personal guest only at/above 9900 CZK.
    const hasCompany = !!data.invoice_company_name?.trim();
    let buyer = hasCompany ? {
      name:    data.invoice_company_name as string,
      ico:     data.invoice_company_ico  || undefined,
      dic:     data.invoice_company_dic  || undefined,
      street:  data.invoice_company_address || undefined,
      city:    data.invoice_company_city    || undefined,
      country: data.invoice_company_country || undefined,
    } : undefined;
    if (!buyer && showBuyerName(czkAmount, false)) {
      const gname = `${data.guest_first_name || ''} ${data.guest_last_name || ''}`.trim();
      if (gname) buyer = { name: gname, ico: undefined, dic: undefined, street: data.guest_address || undefined, city: data.guest_city || undefined, country: data.guest_country || undefined };
    }

    // Description line
    let desc = 'Ubytování';
    if (data.unit_name) desc += ` — ${data.unit_name}`;
    if (data.check_in && data.check_out) {
      const fmt = (d: string) => new Date(d).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
      desc += ` (${fmt(data.check_in)} – ${fmt(data.check_out)})`;
    }

    const xml = generateIsdocXml({
      invoiceNumber:  data.invoice_number,
      issueDate:      documentDate || (data.issued_at || '').slice(0, 10),
      // DUZP + splatnost = issue date + 14 days (accounting requirement).
      taxPointDate:   dueDateFor(documentDate || (data.issued_at || '').slice(0, 10)),
      description:    desc,
      amount:         conv.converted ? conv.amountCzk : (data.amount || 0),
      currency:       conv.converted ? 'CZK' : (data.currency || 'CZK'),
      buyer,
      paymentMethod:  data.payment_method || undefined,
      paymentDueDate: dueDateFor(documentDate || (data.issued_at || '').slice(0, 10)),
      foreignNote:    conv.converted ? foreignNote(conv) : undefined,
    });

    const filename = `faktura-${data.invoice_number}.isdoc`;
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'ISDOC generation failed', detail: msg }, { status: 500 });
  }
}
