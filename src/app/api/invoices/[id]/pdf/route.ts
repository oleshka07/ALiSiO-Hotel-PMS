/**
 * GET /api/invoices/[id]/pdf
 * Downloads a PDF for any stored invoice (reservation-based or custom).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import { requirePermission } from '@core/security/route-guard';
import { convertToCzkAuto, foreignNote } from '@/lib/fx';
import { showBuyerName, dueDateFor } from '@/lib/invoice-rules';

export const GET = requirePermission('manage_documents', _GET);
async function _GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const db     = getDb();

    const row = db.prepare(`
      SELECT
        i.id, i.invoice_number, i.issued_at, i.due_date,
        i.amount, i.currency, i.is_custom,
        i.custom_buyer_name, i.custom_buyer_ico, i.custom_buyer_dic,
        i.custom_buyer_address, i.custom_buyer_city, i.custom_buyer_country,
        i.custom_description,
        r.check_in, r.check_out,
        u.name as unit_name,
        g.first_name as guest_first_name, g.last_name as guest_last_name,
        r.invoice_company_name, r.invoice_company_ico, r.invoice_company_dic,
        r.invoice_company_address, r.invoice_company_city, r.invoice_company_country,
        p.method as payment_method, p.paid_at as payment_date
      FROM invoices i
      LEFT JOIN reservations r  ON i.reservation_id = r.id
      LEFT JOIN units u         ON r.unit_id = u.id
      LEFT JOIN guests g        ON r.guest_id = g.id
      LEFT JOIN fin_operations p
        ON p.reservation_id = r.id AND p.op_type = 'income' AND p.status = 'completed'
      WHERE i.id = ?
      ORDER BY p.paid_at DESC LIMIT 1
    `).get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Build description
    let description = (row.custom_description as string | null) || '';
    if (!description) {
      description = 'Ubytování';
      if (row.unit_name) description += ` — ${row.unit_name}`;
      if (row.check_in && row.check_out) {
        const fmt = (d: string) =>
          new Date(d).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
        description += ` (${fmt(row.check_in as string)} – ${fmt(row.check_out as string)})`;
      }
    }

    // Real accounting date: check-in → payment → creation (never import date).
    const documentDate = ((row.check_in as string | null) || (row.payment_date as string | null) || (row.issued_at as string | null) || '').slice(0, 10);
    // Foreign-currency (OTA/EUR) → CZK at the rate effective on the document date.
    const conv = await convertToCzkAuto(db, (row.amount as number) || 0, (row.currency as string) || 'CZK', documentDate);
    const czkAmount = conv.converted ? conv.amountCzk : ((row.amount as number) || 0);

    // Build buyer — explicit company/custom always shown; a personal guest only
    // at/above the 9900 CZK threshold, otherwise the invoice stays anonymous.
    const companyName = (row.custom_buyer_name || row.invoice_company_name) as string | null;
    let buyer = companyName?.trim() ? {
      name:    companyName,
      ico:     (row.custom_buyer_ico  || row.invoice_company_ico)  as string | undefined,
      dic:     (row.custom_buyer_dic  || row.invoice_company_dic)  as string | undefined,
      address: (row.custom_buyer_address || row.invoice_company_address) as string | undefined,
      city:    (row.custom_buyer_city    || row.invoice_company_city)    as string | undefined,
      country: (row.custom_buyer_country || row.invoice_company_country) as string | undefined,
    } : undefined;
    if (!buyer && showBuyerName(czkAmount, false)) {
      const gname = `${row.guest_first_name || ''} ${row.guest_last_name || ''}`.trim();
      if (gname) buyer = { name: gname, ico: undefined, dic: undefined, address: undefined, city: undefined, country: undefined };
    }

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber:  row.invoice_number as string,
      issueDate:      documentDate || (row.issued_at as string).slice(0, 10),
      // Datum splatnosti = issue date + 14 days.
      dueDate:        dueDateFor(documentDate || (row.issued_at as string).slice(0, 10)),
      paymentMethod:  (row.payment_method as string | null) || 'Příkazem',
      description,
      amount:         conv.converted ? conv.amountCzk : (row.amount as number),
      currency:       conv.converted ? 'CZK' : ((row.currency as string) || 'CZK'),
      buyer,
      foreignNote:    conv.converted ? foreignNote(conv) : undefined,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="faktura-${row.invoice_number}.pdf"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
