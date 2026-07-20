/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ALiSiO PMS — Invoice Handlers (Finance Module)
 *
 * Generates and serves Faktury (invoices) for paid reservations.
 * Kemp Carlsbad s.r.o. is NOT a VAT payer (neplátce DPH),
 * so these are regular Faktury, not Daňové doklady.
 *
 * Auto-trigger: called from payments.handlers.ts and reservation.handlers.ts
 * when reservation.payment_status transitions to 'paid'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { renderInvoiceHtml, type InvoiceData } from '@/lib/invoice-template';
import { convertToCzkAuto, foreignNote } from '@/lib/fx';
import { allocateInvoiceNumber, isInvoiceLocked } from '@/lib/invoice-numbering';

/**
 * Real accounting date for a document: check-in (stay) → payment date → creation.
 * Never the statement-import date. Returns YYYY-MM-DD.
 */
export function resolveDocumentDate(row: {
  check_in?: string | null; payment_date?: string | null; issued_at?: string | null;
}): string {
  const pick = row.check_in || row.payment_date || row.issued_at || '';
  return pick.slice(0, 10);
}

// ─── Core Business Logic ─────────────────────────────────────────────────────

/**
 * Create an invoice record for a reservation.
 * Idempotent — if invoice already exists for this reservation, returns existing id.
 */
export function generateInvoiceForReservation(
  reservationId: string,
  opts: { confirmed?: boolean; source?: string } = {},
): string | null {
  try {
    const db = getDb();
    const confirmed = opts.confirmed ? 1 : 0;
    const confirmationSource = opts.source || (opts.confirmed ? 'confirmed' : 'manual');

    // Idempotency check — skip if invoice already exists (not cancelled). If it
    // exists but was unconfirmed and this call carries a confirmation (Teya/cash),
    // upgrade it to confirmed.
    const existing = db.prepare(
      "SELECT id, confirmed FROM invoices WHERE reservation_id = ? AND status != 'cancelled'"
    ).get(reservationId) as { id: string; confirmed: number } | undefined;

    if (existing) {
      if (confirmed && !existing.confirmed) {
        db.prepare("UPDATE invoices SET confirmed = 1, confirmation_source = ? WHERE id = ?")
          .run(confirmationSource, existing.id);
      }
      return existing.id;
    }

    // Fetch reservation basic data
    const res = db.prepare(`
      SELECT total_price, currency, check_out
      FROM reservations
      WHERE id = ?
    `).get(reservationId) as { total_price: number; currency: string; check_out: string } | undefined;

    if (!res) return null;

    const invoiceId = `inv_${Date.now()}`;
    const today = new Date().toISOString().split('T')[0];
    // Direct-booking invoices use the HOUSE series (plain YYYY-NNN), allocated atomically.
    const { invoiceNumber } = allocateInvoiceNumber(db, 'house', new Date().getFullYear());
    // Due date: check-out date (service rendered on departure)
    const dueDate = res.check_out > today ? res.check_out : today;
    const period = (res.check_out || today).slice(0, 7);

    db.prepare(`
      INSERT INTO invoices (id, reservation_id, invoice_number, issued_at, due_date, amount, currency, status, series, period, confirmed, confirmation_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', 'HOUSE', ?, ?, ?)
    `).run(invoiceId, reservationId, invoiceNumber, today, dueDate, res.total_price, res.currency || 'CZK', period, confirmed, confirmationSource);

    console.log(`[Invoices] Created ${invoiceNumber} for reservation ${reservationId}`);
    return invoiceId;
  } catch (e: any) {
    console.error('[Invoices] Error generating invoice:', e.message);
    return null;
  }
}

/**
 * Cancel an existing invoice and generate a fresh one for the same reservation.
 * The old invoice is soft-deleted (status → 'cancelled'), not removed from DB.
 */
export function reissueInvoiceForReservation(reservationId: string): string | null {
  try {
    const db = getDb();
    // A locked (filed) invoice cannot be cancelled/renumbered — it must be
    // corrected with a storno (credit note) instead.
    const current = db.prepare(
      "SELECT id FROM invoices WHERE reservation_id = ? AND status != 'cancelled'"
    ).get(reservationId) as { id: string } | undefined;
    if (current && isInvoiceLocked(db, current.id)) {
      throw new Error('Invoice period is locked — use a storno (credit note) to correct it.');
    }
    // Cancel all existing non-cancelled invoices for this reservation
    db.prepare(
      "UPDATE invoices SET status = 'cancelled' WHERE reservation_id = ? AND status != 'cancelled'"
    ).run(reservationId);
    // Force-create a new invoice (existing check now passes since all are cancelled)
    return generateInvoiceForReservation(reservationId);
  } catch (e: any) {
    console.error('[Invoices] reissue error:', e.message);
    return null;
  }
}

// ─── API Handlers ─────────────────────────────────────────────────────────────

/**
 * GET /api/invoices — list all invoices
 */
export async function listInvoices(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        i.id, i.invoice_number, i.issued_at, i.due_date,
        i.amount, i.currency, i.status, i.reservation_id,
        g.first_name as guest_first_name, g.last_name as guest_last_name,
        u.name as unit_name
      FROM invoices i
      JOIN reservations r ON i.reservation_id = r.id
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      ORDER BY i.issued_at DESC, i.invoice_number DESC
      LIMIT 200
    `).all();
    return NextResponse.json(rows);
  } catch (e: any) {
    console.error('[Invoices] listInvoices error:', e.message);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

/**
 * GET /api/invoices/[id] — render invoice as HTML (for browser view/print/PDF)
 * ?format=download — serve as attachment
 */
export async function getInvoiceHtml(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const asDownload = searchParams.get('format') === 'download';

    // LEFT JOIN units/guests so a deleted unit or guest doesn't drop the entire
    // row and turn into a misleading 404. The template tolerates null fields.
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
        p.method as payment_method, p.comment as payment_notes, p.paid_at as payment_date
      FROM invoices i
      JOIN reservations r ON i.reservation_id = r.id
      LEFT JOIN units u ON r.unit_id = u.id
      LEFT JOIN guests g ON r.guest_id = g.id
      LEFT JOIN (
        SELECT gr.reservation_id,
               rg2.address, rg2.city, rg2.country
        FROM guest_registrations gr
        JOIN guests rg2 ON gr.guest_id = rg2.id
        WHERE (rg2.address IS NOT NULL AND rg2.address != '')
           OR (rg2.city IS NOT NULL AND rg2.city != '')
        ORDER BY gr.registered_at ASC
        LIMIT 1
      ) rg ON rg.reservation_id = r.id
      LEFT JOIN fin_operations p
        ON p.reservation_id = r.id
        AND p.op_type = 'income'
        AND p.status = 'completed'
      WHERE i.id = ?
      ORDER BY p.paid_at DESC
      LIMIT 1
    `).get(id) as InvoiceData | undefined;

    if (!data) {
      console.error('[Invoices] getInvoiceHtml: no row for invoice id', id);
      return NextResponse.json({ error: 'Invoice not found', invoice_id: id }, { status: 404 });
    }

    // Real accounting date + CZK conversion for foreign-currency (OTA) invoices.
    data.document_date = resolveDocumentDate(data);
    const conv = await convertToCzkAuto(db, data.amount || 0, data.currency || 'CZK', data.document_date);
    if (conv.converted) {
      data.amount = conv.amountCzk;
      data.currency = 'CZK';
      data.foreign_note = foreignNote(conv);
    }

    const html = renderInvoiceHtml(data);

    if (asDownload) {
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="faktura-${data.invoice_number}.html"`,
        },
      });
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('[Invoices] getInvoiceHtml error:', msg, e?.stack);
    return NextResponse.json(
      { error: 'Failed to render invoice', detail: msg },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bookings/[id]/invoice
 * Returns the current (issued) invoice for a reservation, or null.
 */
export async function getInvoiceByReservation(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await params;
    const row = db.prepare(`
      SELECT id, invoice_number, issued_at, amount, currency, status
      FROM invoices
      WHERE reservation_id = ? AND status = 'issued'
      ORDER BY issued_at DESC
      LIMIT 1
    `).get(id) as { id: string; invoice_number: string; issued_at: string; amount: number; currency: string; status: string } | undefined;
    return NextResponse.json(row ?? null);
  } catch (e: any) {
    console.error('[Invoices] getInvoiceByReservation error:', e.message);
    return NextResponse.json(null);
  }
}

/**
 * POST /api/bookings/[id]/invoice/reissue
 * Cancels the current invoice and generates a new one with fresh data.
 */
export async function reissueInvoiceHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const newInvoiceId = reissueInvoiceForReservation(id);
    if (!newInvoiceId) {
      return NextResponse.json({ error: 'Failed to reissue invoice' }, { status: 500 });
    }
    const db = getDb();
    const invoice = db.prepare(
      'SELECT id, invoice_number, issued_at, amount, currency FROM invoices WHERE id = ?'
    ).get(newInvoiceId) as { id: string; invoice_number: string; issued_at: string; amount: number; currency: string };
    return NextResponse.json({ success: true, invoice });
  } catch (e: any) {
    console.error('[Invoices] reissueInvoiceHandler error:', e.message);
    return NextResponse.json({ error: 'Reissue failed' }, { status: 500 });
  }
}
