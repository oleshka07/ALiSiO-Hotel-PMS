/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/accounting/invoice-batch/zip
 *
 * Generates a ZIP archive containing all requested invoices in either
 * ISDOC (XML) or PDF format — no external dependencies, pure Node.js.
 *
 * Request body (JSON):
 *   { invoice_ids: string[], format: 'isdoc' | 'pdf', channel: string }
 *
 * Response:
 *   application/zip  →  {date}_{channel}_{format}.zip
 *   e.g.  2026-06-15_teya_isdoc.zip
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { generateIsdocXml } from '@/lib/isdoc';
import { requireOwner } from '@core/security/route-guard';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import { convertToCzkAuto, foreignNote } from '@/lib/fx';
import { showBuyerName, dueDateFor } from '@/lib/invoice-rules';

// ─── Pure-JS ZIP builder (STORE method — no compression, no deps) ─────────────
// Implements PKZIP 2.0 local file headers + central directory + EOCD.

function crc32(data: Uint8Array): number {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (const b of data) crc = t[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function u16le(v: number): Uint8Array {
  return new Uint8Array([v & 0xFF, (v >> 8) & 0xFF]);
}
function u32le(v: number): Uint8Array {
  return new Uint8Array([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF]);
}
function cat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

function buildZip(files: Array<{ name: string; data: Uint8Array }>): Buffer {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const localOffsets: number[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const size = f.data.length;
    const crc  = crc32(f.data);
    localOffsets.push(offset);

    const lh = cat([
      new Uint8Array([0x50, 0x4B, 0x03, 0x04]), // Local file header signature
      u16le(20),   // version needed (2.0)
      u16le(0),    // general purpose bit flag
      u16le(0),    // compression method: STORE
      u16le(0),    // last mod file time
      u16le(0),    // last mod file date
      u32le(crc),
      u32le(size), // compressed size
      u32le(size), // uncompressed size
      u16le(name.length),
      u16le(0),    // extra field length
      name,
      f.data,
    ]);
    localParts.push(lh);
    offset += lh.length;

    centralParts.push(cat([
      new Uint8Array([0x50, 0x4B, 0x01, 0x02]), // Central directory signature
      u16le(20),   // version made by
      u16le(20),   // version needed
      u16le(0),    // flags
      u16le(0),    // compression: STORE
      u16le(0),    // mod time
      u16le(0),    // mod date
      u32le(crc),
      u32le(size),
      u32le(size),
      u16le(name.length),
      u16le(0),    // extra
      u16le(0),    // file comment length
      u16le(0),    // disk number start
      u16le(0),    // internal file attributes
      u32le(0),    // external file attributes
      u32le(localOffsets[localOffsets.length - 1]),
      name,
    ]));
  }

  const centralDir  = cat(centralParts);
  const centralOff  = offset;

  const eocd = cat([
    new Uint8Array([0x50, 0x4B, 0x05, 0x06]), // End of central directory signature
    u16le(0),    // disk number
    u16le(0),    // disk with start of CD
    u16le(files.length),
    u16le(files.length),
    u32le(centralDir.length),
    u32le(centralOff),
    u16le(0),    // comment length
  ]);

  return Buffer.from(cat([...localParts, centralDir, eocd]));
}

// ─── Shared DB query helpers ──────────────────────────────────────────────────

function getInvoiceForIsdoc(db: any, id: string) {
  return db.prepare(`
    SELECT
      i.id, i.invoice_number, i.issued_at, i.due_date,
      i.amount, i.currency, i.status, i.reservation_id,
      i.custom_buyer_name, i.custom_buyer_ico, i.custom_buyer_dic,
      i.custom_buyer_address, i.custom_buyer_city, i.custom_buyer_country,
      i.custom_description, i.is_custom, i.is_credit_note, i.notes,
      r.check_in, r.check_out, r.nights, r.adults, r.children,
      u.name as unit_name, u.code as unit_code,
      g.first_name as guest_first_name, g.last_name as guest_last_name,
      g.email as guest_email,
      r.invoice_company_name, r.invoice_company_ico, r.invoice_company_dic,
      r.invoice_company_address, r.invoice_company_city, r.invoice_company_country,
      r.invoice_company_email,
      p.method as payment_method, p.paid_at as payment_date
    FROM invoices i
    LEFT JOIN reservations r ON i.reservation_id = r.id
    LEFT JOIN units u ON r.unit_id = u.id
    LEFT JOIN guests g ON r.guest_id = g.id
    LEFT JOIN fin_operations p
      ON p.reservation_id = r.id AND p.op_type = 'income' AND p.status = 'completed'
    WHERE i.id = ?
    ORDER BY p.paid_at DESC LIMIT 1
  `).get(id);
}

function getInvoiceForPdf(db: any, id: string) {
  return db.prepare(`
    SELECT
      i.id, i.invoice_number, i.issued_at, i.due_date,
      i.amount, i.currency, i.is_custom, i.is_credit_note, i.notes,
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
    LEFT JOIN reservations r ON i.reservation_id = r.id
    LEFT JOIN units u ON r.unit_id = u.id
    LEFT JOIN guests g ON r.guest_id = g.id
    LEFT JOIN fin_operations p
      ON p.reservation_id = r.id AND p.op_type = 'income' AND p.status = 'completed'
    WHERE i.id = ?
    ORDER BY p.paid_at DESC LIMIT 1
  `).get(id);
}

// ─── ISDOC generation (reused from /api/invoices/[id]/isdoc) ─────────────────

async function buildIsdocBytes(db: any, row: any): Promise<Uint8Array> {
  // Real document date + CZK conversion + issue+14 dates + 9900 buyer rule —
  // identical to /api/invoices/[id]/isdoc so single and ZIP output match.
  const documentDate = (row.check_in || row.payment_date || row.issued_at || '').slice(0, 10);
  const conv = await convertToCzkAuto(db, row.amount || 0, row.currency || 'CZK', documentDate);
  const czkAmount = conv.converted ? conv.amountCzk : (row.amount || 0);

  const hasCompany = !!(row.custom_buyer_name || row.invoice_company_name)?.trim();
  let buyer = hasCompany ? {
    name:    (row.custom_buyer_name || row.invoice_company_name) as string,
    ico:     (row.custom_buyer_ico  || row.invoice_company_ico)  as string | undefined,
    dic:     (row.custom_buyer_dic  || row.invoice_company_dic)  as string | undefined,
    street:  (row.custom_buyer_address || row.invoice_company_address) as string | undefined,
    city:    (row.custom_buyer_city    || row.invoice_company_city)    as string | undefined,
    country: (row.custom_buyer_country || row.invoice_company_country) as string | undefined,
  } : undefined;
  if (!buyer && showBuyerName(czkAmount, false)) {
    const gname = `${row.guest_first_name || ''} ${row.guest_last_name || ''}`.trim();
    if (gname) buyer = { name: gname, ico: undefined, dic: undefined, street: undefined, city: undefined, country: undefined };
  }
  // Below-threshold anonymisation even when the batch stored a name.
  if (buyer && !hasCompany && !showBuyerName(czkAmount, false)) buyer = undefined;

  let desc = (row.custom_description as string | null) || '';
  if (!desc) {
    desc = 'Ubytování';
    if (row.unit_name) desc += ` — ${row.unit_name}`;
    if (row.check_in && row.check_out) {
      const fmt = (d: string) =>
        new Date(d).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
      desc += ` (${fmt(row.check_in)} – ${fmt(row.check_out)})`;
    }
  }

  const isCreditNote = row.is_credit_note === 1;
  const originalDocRef = isCreditNote && row.notes
    ? (row.notes as string).replace(/^[^:]+:/, '')
    : undefined;
  const issueDate = documentDate || (row.issued_at || new Date().toISOString()).slice(0, 10);

  const xml = generateIsdocXml({
    invoiceNumber:  row.invoice_number,
    issueDate,
    taxPointDate:   dueDateFor(issueDate),
    description:    desc,
    amount:         czkAmount,
    currency:       conv.converted ? 'CZK' : (row.currency || 'CZK'),
    buyer,
    paymentMethod:  row.payment_method || undefined,
    paymentDueDate: dueDateFor(issueDate),
    documentType:   isCreditNote ? 2 : 1,
    originalDocRef,
    foreignNote:    conv.converted ? foreignNote(conv) : undefined,
  });
  return new TextEncoder().encode(xml);
}

// ─── PDF generation (reused from /api/invoices/[id]/pdf) ─────────────────────

async function buildPdfBytes(db: any, row: any): Promise<Uint8Array> {
  const documentDate = ((row.check_in as string | null) || (row.payment_date as string | null) || (row.issued_at as string | null) || '').slice(0, 10);
  const conv = await convertToCzkAuto(db, (row.amount as number) || 0, (row.currency as string) || 'CZK', documentDate);
  const czkAmount = conv.converted ? conv.amountCzk : ((row.amount as number) || 0);

  const companyName = (row.custom_buyer_name || row.invoice_company_name) as string | null;
  let buyer = companyName?.trim() ? {
    name:    companyName,
    ico:     (row.custom_buyer_ico  || row.invoice_company_ico)  as string | undefined,
    dic:     (row.custom_buyer_dic  || row.invoice_company_dic)  as string | undefined,
    address: (row.custom_buyer_address || row.invoice_company_address) as string | undefined,
    city:    (row.custom_buyer_city    || row.invoice_company_city)    as string | undefined,
    country: (row.custom_buyer_country || row.invoice_company_country) as string | undefined,
  } : undefined;
  if (buyer && !companyName?.trim()) buyer = undefined; // never reached, kept for parity
  if (!buyer && showBuyerName(czkAmount, false)) {
    const gname = `${row.guest_first_name || ''} ${row.guest_last_name || ''}`.trim();
    if (gname) buyer = { name: gname, ico: undefined, dic: undefined, address: undefined, city: undefined, country: undefined };
  }
  if (buyer && !companyName?.trim() && !showBuyerName(czkAmount, false)) buyer = undefined;

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

  const isCreditNote = row.is_credit_note === 1;
  const issueDate = documentDate || (row.issued_at as string).slice(0, 10);

  const buf = await generateInvoicePdf({
    invoiceNumber:  row.invoice_number as string,
    issueDate,
    dueDate:        dueDateFor(issueDate),
    paymentMethod:  (row.payment_method as string | null) || 'Příkazem',
    description,
    amount:         czkAmount,
    currency:       conv.converted ? 'CZK' : ((row.currency as string) || 'CZK'),
    buyer,
    isCreditNote,
    foreignNote:    conv.converted ? foreignNote(conv) : undefined,
  });
  return new Uint8Array(buf);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const POST = requireOwner(_POST);
async function _POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as {
      invoice_ids?: string[];
      format?: string;
      channel?: string;
    };

    const ids     = Array.isArray(body.invoice_ids) ? body.invoice_ids : [];
    const format  = (body.format  || 'isdoc').toLowerCase() as 'isdoc' | 'pdf';
    const channel = (body.channel || 'batch').toLowerCase();

    if (ids.length === 0) {
      return NextResponse.json({ error: 'invoice_ids is required and must be non-empty' }, { status: 400 });
    }
    if (!['isdoc', 'pdf'].includes(format)) {
      return NextResponse.json({ error: 'format must be "isdoc" or "pdf"' }, { status: 400 });
    }

    const db = getDb();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const zipName = `${today}_${channel}_${format}.zip`;
    const ext = format === 'isdoc' ? '.isdoc' : '.pdf';

    const files: Array<{ name: string; data: Uint8Array }> = [];
    const errors: string[] = [];

    for (const id of ids) {
      try {
        if (format === 'isdoc') {
          const row = getInvoiceForIsdoc(db, id) as any;
          if (!row || !row.invoice_number) { errors.push(`${id}: not found`); continue; }
          const data = await buildIsdocBytes(db, row);
          files.push({ name: `faktura-${row.invoice_number}${ext}`, data });
        } else {
          const row = getInvoiceForPdf(db, id) as any;
          if (!row || !row.invoice_number) { errors.push(`${id}: not found`); continue; }
          const data = await buildPdfBytes(db, row);
          files.push({ name: `faktura-${row.invoice_number}${ext}`, data });
        }
      } catch (err: any) {
        errors.push(`${id}: ${err?.message || 'error'}`);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files could be generated', details: errors },
        { status: 400 }
      );
    }

    const zipBuffer = buildZip(files);

    return new NextResponse(zipBuffer as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"`,
        'Content-Length':      String(zipBuffer.length),
        'Cache-Control':       'no-store',
        'X-Files-Count':       String(files.length),
        'X-Errors-Count':      String(errors.length),
      },
    });
  } catch (e: any) {
    console.error('[BatchZip] error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
