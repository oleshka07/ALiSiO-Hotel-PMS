/**
 * POST /api/invoices/custom
 *
 * Creates a standalone (non-reservation) invoice, stores it in the DB,
 * and returns the PDF as a downloadable binary — plus optionally sends it
 * to a recipient email.
 *
 * Body (JSON):
 *   description   string   - line item text (required)
 *   amount        number   - total amount (required)
 *   currency?     string   - default 'CZK'
 *   dueDate?      string   - YYYY-MM-DD (default: today + 14 days)
 *   paymentMethod? string  - 'Příkazem' | 'Hotovost' | 'Kartou'
 *   buyerName?    string
 *   buyerIco?     string
 *   buyerDic?     string
 *   buyerAddress? string
 *   buyerCity?    string
 *   buyerCountry? string
 *   emailTo?      string   - if set, sends the PDF by email
 *   action?       'pdf' | 'save'  - 'pdf' = just download, 'save' = save + return JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { requirePermission } from '@core/security/route-guard';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import { generateIsdocXml }   from '@/lib/isdoc';
import { sendEmail }           from '@/lib/email';
import { renderInvoiceHtml }   from '@/lib/invoice-template';

// Re-use the same number-generator logic as reservaton invoices
function getNextInvoiceNumber(db: ReturnType<typeof getDb>): string {
  const year   = new Date().getFullYear();
  const prefix = `${year}-`;
  const last   = db.prepare(
    'SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1'
  ).get(`${prefix}%`) as { invoice_number: string } | undefined;
  let next = 1;
  if (last) {
    const parts = last.invoice_number.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(3, '0')}`;
}

export const POST = requirePermission('manage_documents', _POST);
async function _POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body  = await req.json();
    const {
      description, amount, currency = 'CZK',
      dueDate, paymentMethod,
      buyerName, buyerIco, buyerDic, buyerAddress, buyerCity, buyerCountry,
      emailTo,
      action = 'pdf',
      items: rawItems,
    } = body;

    // Support multi-item invoices
    interface RawItem { description: string; amount: number; }
    const itemList: RawItem[] | undefined = Array.isArray(rawItems) && rawItems.length > 0
      ? rawItems.filter((i: RawItem) => i.description?.trim() && i.amount > 0)
      : undefined;

    const totalAmount: number = itemList
      ? itemList.reduce((s: number, i: RawItem) => s + i.amount, 0)
      : (typeof amount === 'number' ? amount : parseFloat(amount));

    const primaryDesc: string = itemList
      ? itemList.map((i: RawItem) => i.description).join('; ')
      : (description || '');

    if (!primaryDesc?.trim()) {
      return NextResponse.json({ error: 'description required' }, { status: 400 });
    }
    if (!totalAmount || totalAmount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    const db      = getDb();
    const today   = new Date().toISOString().slice(0, 10);
    const due     = dueDate || (() => {
      const d = new Date(); d.setDate(d.getDate() + 14);
      return d.toISOString().slice(0, 10);
    })();

    const invoiceId     = `inv_custom_${Date.now()}`;
    const invoiceNumber = getNextInvoiceNumber(db);

    // Persist to invoices table (requires migration that makes reservation_id nullable)
    db.prepare(`
      INSERT INTO invoices
        (id, reservation_id, invoice_number, issued_at, due_date, amount, currency, status,
         is_custom, custom_buyer_name, custom_buyer_ico, custom_buyer_dic,
         custom_buyer_address, custom_buyer_city, custom_buyer_country,
         custom_description, custom_email)
      VALUES (?, NULL, ?, ?, ?, ?, ?, 'issued',
              1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceId, invoiceNumber, today, due, totalAmount, currency,
      buyerName    || null,
      buyerIco     || null,
      buyerDic     || null,
      buyerAddress || null,
      buyerCity    || null,
      buyerCountry || null,
      primaryDesc,
      emailTo      || null,
    );

    console.log(`[CustomInvoice] Created ${invoiceNumber} (${invoiceId}) amount=${totalAmount} ${currency} items=${itemList?.length ?? 1}`);

    // Generate PDF
    const buyer = buyerName?.trim() ? {
      name:    buyerName,
      ico:     buyerIco     || undefined,
      dic:     buyerDic     || undefined,
      address: buyerAddress || undefined,
      city:    buyerCity    || undefined,
      country: buyerCountry || undefined,
    } : undefined;

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber,
      issueDate:     today,
      dueDate:       due,
      paymentMethod: paymentMethod || 'Příkazem',
      description:   primaryDesc,
      amount:        totalAmount,
      currency,
      buyer,
      items: itemList?.map((i: { description: string; amount: number }) => ({
        description: i.description,
        quantity:    1,
        unitPrice:   i.amount,
        total:       i.amount,
      })),
    });

    // Optionally send email
    if (emailTo?.trim()) {
      try {
        // Also generate HTML for email body (readable in email clients)
        const fakeData = {
          id: invoiceId, invoice_number: invoiceNumber,
          issued_at: today, due_date: due,
          amount, currency, status: 'issued',
          reservation_id: null,
          check_in: null, check_out: null, nights: null, adults: null, children: null,
          unit_name: null,
          guest_first_name: buyerName?.split(' ')[0] || null,
          guest_last_name:  buyerName?.split(' ').slice(1).join(' ') || null,
          guest_email:      emailTo,
          payment_method:   paymentMethod || 'bank_transfer',
          invoice_company_name:    buyerName || null,
          invoice_company_ico:     buyerIco  || null,
          invoice_company_dic:     buyerDic  || null,
          invoice_company_address: buyerAddress || null,
          invoice_company_city:    buyerCity    || null,
          invoice_company_country: buyerCountry || null,
          invoice_company_email:   emailTo,
        };
        const html = renderInvoiceHtml(fakeData);

        await sendEmail({
          to:      emailTo.trim(),
          subject: `Faktura ${invoiceNumber} – Kemp Carlsbad s.r.o.`,
          html,
          attachments: [{
            filename:    `faktura-${invoiceNumber}.pdf`,
            content:     pdfBuffer,
            contentType: 'application/pdf',
          }],
        });
        console.log(`[CustomInvoice] Sent ${invoiceNumber} to ${emailTo}`);
      } catch (mailErr) {
        console.error('[CustomInvoice] Email send failed:', mailErr);
        // Don't fail the whole request — PDF still created + saved
      }
    }

    if (action === 'save') {
      // Return JSON with invoice metadata (caller will redirect to PDF download)
      return NextResponse.json({
        invoiceId,
        invoiceNumber,
        downloadUrl: `/api/invoices/${invoiceId}/pdf`,
      });
    }

    // Default: stream the PDF directly
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="faktura-${invoiceNumber}.pdf"`,
        'X-Invoice-Id':        invoiceId,
        'X-Invoice-Number':    invoiceNumber,
        'Cache-Control':       'no-store',
      },
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[CustomInvoice] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
