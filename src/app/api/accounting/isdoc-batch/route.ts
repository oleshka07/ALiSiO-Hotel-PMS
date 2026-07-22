/**
 * GET /api/accounting/isdoc-batch?month=YYYY-MM
 *
 * Downloads a ZIP archive containing ISDOC files for all invoiced transactions
 * in the given month.
 *
 * Includes:
 *  1. All `invoices` records with issued_at in the month (reservation-based)
 *  2. All `fin_operations` with source IN ('airbnb','booking_com') and paid_at in
 *     the month that do NOT already have a matching invoice — as standalone ISDOCs.
 *
 * Returns: ZIP with Content-Disposition: attachment; filename="isdoc-YYYY-MM.zip"
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { generateIsdocXml } from '@/lib/isdoc';
import { requireOwner } from '@core/security/route-guard';
import type { InvoiceData } from '@/lib/invoice-template';
import { convertToCzkAuto, foreignNote } from '@/lib/fx';
import { showBuyerName, dueDateFor } from '@/lib/invoice-rules';
import JSZip from 'jszip';

// ─── Helper: build description from invoice or fin_op data ───────────────────

function buildDescription(data: {
  unit_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  comment?: string | null;
  source?: string | null;
}): string {
  if (data.unit_name && data.check_in && data.check_out) {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `Ubytování — ${data.unit_name} (${fmt(data.check_in)} – ${fmt(data.check_out)})`;
  }
  if (data.comment) return data.comment.slice(0, 100);
  if (data.source) return `Ubytování — ${data.source}`;
  return 'Ubytování';
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const GET = requireOwner(_GET);
async function _GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    // Monthly accountant export includes only confirmed invoices (Teya/cash/OTA
    // statement). Pass ?include_unconfirmed=1 to also export un-reconciled ones.
    const includeUnconfirmed = searchParams.get('include_unconfirmed') === '1';
    const confirmedFilter = includeUnconfirmed ? '' : 'AND i.confirmed = 1';

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
    }

    const db = getDb();
    const zip = new JSZip();
    let count = 0;
    const usedNames = new Set<string>();

    // Unique filename helper
    const filename = (num: string, suffix = '') => {
      const base = `faktura-${num.replace(/-/g, '')}${suffix}.isdoc`;
      if (!usedNames.has(base)) { usedNames.add(base); return base; }
      let i = 2;
      while (usedNames.has(`faktura-${num.replace(/-/g, '')}${suffix}-${i}.isdoc`)) i++;
      const name = `faktura-${num.replace(/-/g, '')}${suffix}-${i}.isdoc`;
      usedNames.add(name);
      return name;
    };

    // ── 1. Reservation-based invoices ────────────────────────────────
    const invoices = db.prepare(`
      SELECT
        i.id, i.invoice_number, i.issued_at, i.due_date, i.amount, i.currency,
        r.check_in, r.check_out, r.nights, r.adults, r.children,
        u.name as unit_name, u.code as unit_code,
        g.first_name as guest_first_name, g.last_name as guest_last_name,
        g.email as guest_email,
        COALESCE(NULLIF(g.address,''), '') as guest_address,
        COALESCE(NULLIF(g.city,''),    '') as guest_city,
        COALESCE(NULLIF(g.country,''),'') as guest_country,
        r.invoice_company_name, r.invoice_company_ico, r.invoice_company_dic,
        r.invoice_company_address, r.invoice_company_city, r.invoice_company_country,
        p.method as payment_method, p.paid_at as payment_date
      FROM invoices i
      LEFT JOIN reservations r ON i.reservation_id = r.id
      LEFT JOIN units u ON r.unit_id = u.id
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN fin_operations p
        ON p.reservation_id = r.id AND p.op_type = 'income' AND p.status = 'completed'
      WHERE i.status = 'issued'
        AND strftime('%Y-%m', i.issued_at) = ?
        ${confirmedFilter}
      ORDER BY i.invoice_number ASC
    `).all(month) as (InvoiceData & { payment_method?: string })[];

    for (const inv of invoices) {
      if (!inv.invoice_number) continue;

      const documentDate = (inv.check_in || inv.payment_date || inv.issued_at || '').slice(0, 10);
      const conv = await convertToCzkAuto(db, inv.amount || 0, inv.currency || 'CZK', documentDate);
      const czkAmount = conv.converted ? conv.amountCzk : (inv.amount || 0);

      // Buyer: explicit company always; personal guest only at/above 9900 CZK.
      const hasCompany = !!(inv.invoice_company_name && inv.invoice_company_name.trim());
      const guestName = `${inv.guest_first_name || ''} ${inv.guest_last_name || ''}`.trim();
      const buyerName = hasCompany
        ? (inv.invoice_company_name as string)
        : (showBuyerName(czkAmount, false) && guestName ? guestName : undefined);
      const buyer = buyerName ? {
        name:    buyerName,
        ico:     inv.invoice_company_ico    || undefined,
        dic:     inv.invoice_company_dic    || undefined,
        street:  inv.invoice_company_address || inv.guest_address || undefined,
        city:    inv.invoice_company_city    || inv.guest_city    || undefined,
        country: inv.invoice_company_country || inv.guest_country || undefined,
      } : undefined;

      const xml = generateIsdocXml({
        invoiceNumber:  inv.invoice_number,
        issueDate:      documentDate || (inv.issued_at || '').slice(0, 10),
        taxPointDate:   dueDateFor(documentDate || (inv.issued_at || '').slice(0, 10)),
        description:    buildDescription(inv as { unit_name?: string | null; check_in?: string | null; check_out?: string | null; comment?: string | null; source?: string | null }),
        amount:         conv.converted ? conv.amountCzk : (inv.amount || 0),
        currency:       conv.converted ? 'CZK' : (inv.currency || 'CZK'),
        buyer,
        paymentMethod:  inv.payment_method || undefined,
        paymentDueDate: dueDateFor(documentDate || (inv.issued_at || '').slice(0, 10)),
        foreignNote:    conv.converted ? foreignNote(conv) : undefined,
      });

      zip.file(filename(inv.invoice_number), xml);
      count++;
    }

    // ── 2. OTA operations without invoice (standalone ISDOCs) ────────
    const otaOps = db.prepare(`
      SELECT
        fo.id as op_id, fo.source_ref, fo.source, fo.paid_at,
        fo.amount, fo.currency, fo.comment, fo.method
      FROM fin_operations fo
      WHERE fo.op_type = 'income'
        AND fo.status = 'completed'
        AND fo.source IN ('airbnb', 'booking_com')
        AND strftime('%Y-%m', fo.paid_at) = ?
        AND NOT EXISTS (
          SELECT 1 FROM invoices i
          JOIN reservations r ON i.reservation_id = r.id
          WHERE r.id IN (
            SELECT reservation_id FROM fin_operations
            WHERE source = fo.source AND source_ref = fo.source_ref
          )
          AND i.status = 'issued'
        )
      ORDER BY fo.paid_at ASC
    `).all(month) as {
      op_id: string; source_ref: string; source: string; paid_at: string;
      amount: number; currency: string; comment: string | null; method: string | null;
    }[];

    // Sequential counter for OTA invoices (standalone, not in invoices table)
    let otaSeq = count + 1;
    for (const op of otaOps) {
      const seqStr = String(otaSeq).padStart(3, '0');
      const virtualNumber = `OTA-${month.replace('-', '')}-${seqStr}`;
      const sourceLabel = op.source === 'airbnb' ? 'Airbnb' : 'Booking.com';

      // Try to extract guest name from comment
      let guestName: string | undefined;
      if (op.comment) {
        const m = op.comment.match(/^(?:Airbnb|Booking\.com):\s*([^\d,]+?)(?:\s+\d{4}-|,|$)/);
        if (m?.[1]?.trim()) guestName = m[1].trim();
      }

      const documentDate = (op.paid_at || '').slice(0, 10);
      const conv = await convertToCzkAuto(db, op.amount || 0, op.currency || 'EUR', documentDate);
      const czkAmount = conv.converted ? conv.amountCzk : (op.amount || 0);

      const xml = generateIsdocXml({
        invoiceNumber:  virtualNumber,
        issueDate:      documentDate,
        taxPointDate:   dueDateFor(documentDate),
        paymentDueDate: dueDateFor(documentDate),
        description:    op.comment || `Ubytování — ${sourceLabel} (${op.source_ref})`,
        amount:         conv.converted ? conv.amountCzk : (op.amount || 0),
        currency:       conv.converted ? 'CZK' : (op.currency || 'EUR'),
        buyer:          (showBuyerName(czkAmount, false) && guestName) ? { name: guestName } : undefined,
        paymentMethod:  op.method || 'booking_platform',
        note:           `OTA platba přes ${sourceLabel}. Ref: ${op.source_ref}`,
        foreignNote:    conv.converted ? foreignNote(conv) : undefined,
      });

      zip.file(filename(virtualNumber, `-${op.source_ref.slice(0, 8)}`), xml);
      count++;
      otaSeq++;
    }

    if (count === 0) {
      return NextResponse.json(
        { error: `No invoiced transactions found for ${month}` },
        { status: 404 }
      );
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    // Next.js NextResponse needs BodyInit (Uint8Array), not Node.js Buffer
    const zipBody = new Uint8Array(zipBuffer);

    return new NextResponse(zipBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="isdoc-${month}.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ISDOC Batch]', msg);
    return NextResponse.json({ error: 'ISDOC batch failed', detail: msg }, { status: 500 });
  }
}
