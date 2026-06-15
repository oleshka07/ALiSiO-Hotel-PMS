/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/accounting/invoice-batch
 *
 * Parses an Airbnb, Booking.com, or Teya CSV and creates invoices for each
 * valid row — WITHOUT creating any fin_operations entries.
 *
 * Returns the list of created/found invoices so the UI can offer PDF + ISDOC
 * download buttons per row.
 *
 * Deduplication: uses notes field as "source:source_ref" key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

// ─── CSV utilities ──────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { current += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseNum(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0;
}

function airbnbDate(s: string): string {
  if (!s) return '';
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0,10);
  return s;
}

const MONTH_MAP: Record<string,string> = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
};
function bookingDate(s: string): string {
  if (!s) return '';
  const m = s.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (m) return `${m[3]}-${MONTH_MAP[m[2]]??'01'}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0,10);
  return s;
}

// ─── Parsed row types ────────────────────────────────────────────────────────

export interface BatchRow {
  source: 'airbnb' | 'booking' | 'teya';
  source_ref: string;
  guest_name: string;
  listing: string;
  check_in: string;
  check_out: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  op_type: 'income' | 'expense';
}

// ─── Airbnb parser ───────────────────────────────────────────────────────────

function parseAirbnb(csv: string): BatchRow[] {
  const lines = csv.split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length < 2) return [];
  const hdrs = parseLine(lines[0]);
  const idx = (n: string) => hdrs.findIndex(h => h.replace(/^"|"$/g,'').trim() === n);

  const iDate      = idx('Дата');
  const iType      = idx('Тип');
  const iCode      = idx('Код підтвердження');
  const iDateStart = idx('Дата початку');
  const iDateEnd   = idx('Дата завершення');
  const iGuest     = idx('Гість');
  const iListing   = idx('Оголошення');
  const iCurrency  = idx('Валюта');
  const iAmount    = idx('Сума');
  const iGross     = idx('Валовий дохід');

  if (iDate === -1 || iType === -1 || iCode === -1) {
    throw new Error('Не розпізнано як Airbnb-виписку. Переконайтесь що файл завантажено з Airbnb (CSV → Виписка виплат).');
  }

  const rows: BatchRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseLine(line);
    const type = (cols[iType] ?? '').trim();
    if (type !== 'Бронювання' && type !== 'Компенсація') continue;

    const ref = (cols[iCode] ?? '').trim();
    if (!ref) continue;

    const amountRaw = parseNum(cols[iAmount] ?? '0');
    const grossRaw  = parseNum(cols[iGross]  ?? '0');
    const isExpense = type === 'Компенсація' && amountRaw < 0;
    const amount    = Math.abs(amountRaw);
    if (amount === 0) continue;

    const guestName = (cols[iGuest] ?? '').trim();
    const listing   = (cols[iListing] ?? '').trim();
    const checkIn   = airbnbDate(cols[iDateStart] ?? '');
    const checkOut  = airbnbDate(cols[iDateEnd]   ?? '');
    const gross     = Math.abs(grossRaw);

    const desc = `Airbnb: ${guestName}${checkIn ? ` — ${checkIn}` : ''}${checkOut ? ` – ${checkOut}` : ''}${listing ? ` — ${listing}` : ''}`;

    rows.push({
      source: 'airbnb',
      source_ref: ref,
      guest_name: guestName,
      listing,
      check_in: checkIn,
      check_out: checkOut,
      description: desc,
      amount: gross > 0 ? gross : amount,  // prefer gross for the invoice
      currency: (cols[iCurrency] ?? 'EUR').trim() || 'EUR',
      date: airbnbDate(cols[iDate] ?? ''),
      op_type: isExpense ? 'expense' : 'income',
    });
  }
  return rows;
}

// ─── Booking.com parser ──────────────────────────────────────────────────────

function parseBooking(csv: string): BatchRow[] {
  const lines = csv.split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length < 2) return [];
  const hdrs = parseLine(lines[0]);
  const idx = (n: string) => hdrs.findIndex(h => h.replace(/^"|"$/g,'').trim() === n);

  const iType       = idx('Type');
  const iBookingNum = idx('Booking number');
  const iCheckIn    = idx('Check-in');
  const iCheckout   = idx('Checkout');
  const iGuest      = idx('Guest name');
  const iStatus     = idx('Reservation status');
  const iCurrency   = idx('Currency');
  const iAmount     = idx('Amount');
  const iPayoutDate = idx('Payout date');

  if (iType === -1 || iBookingNum === -1 || iAmount === -1) {
    throw new Error('Не розпізнано як Booking.com виписку. Перевірте формат CSV.');
  }

  const rows: BatchRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseLine(line);
    const type = (cols[iType] ?? '').trim();
    if (type !== 'Reservation') continue;

    const ref = String(cols[iBookingNum] ?? '').trim();
    if (!ref) continue;

    const status = (cols[iStatus] ?? '').toLowerCase();
    if (status === 'cancelled' || status === 'no-show') continue;

    const amount = parseNum(cols[iAmount] ?? '0');
    if (amount <= 0) continue;

    const guestName = (cols[iGuest] ?? '').trim();
    const checkIn   = bookingDate(cols[iCheckIn]  ?? '');
    const checkOut  = bookingDate(cols[iCheckout] ?? '');
    const paidAt    = bookingDate(cols[iPayoutDate] ?? '');

    const desc = `Booking.com: ${guestName}${checkIn ? ` — ${checkIn}` : ''}${checkOut ? ` – ${checkOut}` : ''}`;

    rows.push({
      source: 'booking',
      source_ref: ref,
      guest_name: guestName,
      listing: '',
      check_in: checkIn,
      check_out: checkOut,
      description: desc,
      amount,
      currency: (cols[iCurrency] ?? 'EUR').trim() || 'EUR',
      date: paidAt,
      op_type: 'income',
    });
  }
  return rows;
}

// ─── Teya parser ─────────────────────────────────────────────────────────────

function parseTeya(csv: string): BatchRow[] {
  const lines = csv.split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length < 2) return [];
  const hdrs = parseLine(lines[0]);
  const idx = (n: string) => hdrs.findIndex(h => h.trim() === n);

  const iDate    = idx('Date');
  const iStore   = idx('Store name');
  const iContext = idx('Payment context');
  const iStatus  = idx('Status');
  const iType    = idx('Payment type');
  const iSales   = idx('Sales');
  const iDevId   = idx('Device ID');

  if (iDate === -1 || iSales === -1 || iStatus === -1) {
    throw new Error('Не розпізнано як Teya-виписку. Перевірте формат CSV (очікується: Date, Store name, Status, Sales…).');
  }

  const rows: BatchRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseLine(line);

    const status = (cols[iStatus] ?? '').trim().toUpperCase();
    const type   = (cols[iType]   ?? '').trim().toUpperCase();

    // Only SUCCEEDED payments (skip REVERSED, REFUND, etc.)
    if (status !== 'SUCCEEDED') continue;
    if (type === 'REFUND') continue;

    const sales = parseNum(cols[iSales] ?? '0');
    if (sales <= 0) continue;

    const date    = (cols[iDate]    ?? '').trim();
    const store   = (cols[iStore]   ?? '').trim();
    const context = (cols[iContext] ?? '').trim();
    const devId   = iDevId >= 0 ? (cols[iDevId] ?? '').trim() : '';

    // Use date+store+devId as source_ref for deduplication
    const ref = `teya_${date}_${devId || store}_${sales}`;
    const desc = `Teya: ${store}${context ? ` (${context})` : ''} — ${date}`;

    rows.push({
      source: 'teya',
      source_ref: ref,
      guest_name: store,
      listing: context,
      check_in: date,
      check_out: date,
      description: desc,
      amount: sales,
      currency: 'CZK',
      date,
      op_type: 'income',
    });
  }
  return rows;
}

// ─── Invoice number generator ─────────────────────────────────────────────────

function nextInvoiceNumber(db: any): string {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;
  const last = db.prepare(`
    SELECT invoice_number FROM invoices
    WHERE invoice_number LIKE ?
    ORDER BY invoice_number DESC LIMIT 1
  `).get(`${prefix}%`) as { invoice_number: string } | undefined;

  let n = 1;
  if (last) {
    const parts = last.invoice_number.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) n = num + 1;
  }
  return `${prefix}${String(n).padStart(3, '0')}`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export interface BatchInvoiceResult {
  source_ref: string;
  invoice_id: string;
  invoice_number: string;
  guest_name: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  created: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const form = await request.formData();
    const file    = form.get('file');
    const channel = (form.get('channel') as string ?? '').toLowerCase();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    if (!['airbnb', 'booking', 'teya'].includes(channel)) {
      return NextResponse.json({ error: 'channel must be airbnb|booking|teya' }, { status: 400 });
    }

    const text = await file.text();

    let rows: BatchRow[];
    if (channel === 'airbnb')  rows = parseAirbnb(text);
    else if (channel === 'booking') rows = parseBooking(text);
    else rows = parseTeya(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Жодного рядка не знайдено. Перевірте файл.' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const results: BatchInvoiceResult[] = [];

    const createInvoice = db.transaction((row: BatchRow) => {
      // Dedup: check if already exists via notes field
      const noteKey = `${row.source}:${row.source_ref}`;
      const existing = db.prepare(
        "SELECT id, invoice_number FROM invoices WHERE notes = ? AND status = 'issued' LIMIT 1"
      ).get(noteKey) as { id: string; invoice_number: string } | undefined;

      if (existing) {
        return { id: existing.id, number: existing.invoice_number, created: false };
      }

      const invId  = `inv_batch_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const invNum = nextInvoiceNumber(db);
      const due    = row.date > today ? row.date : today;

      db.prepare(`
        INSERT INTO invoices
          (id, invoice_number, issued_at, due_date, amount, currency, status, notes, is_custom,
           custom_buyer_name, custom_description)
        VALUES (?, ?, ?, ?, ?, ?, 'issued', ?, 1, ?, ?)
      `).run(
        invId, invNum, today, due,
        row.amount, row.currency,
        noteKey,
        row.guest_name || null,
        row.description,
      );

      return { id: invId, number: invNum, created: true };
    });

    for (const row of rows) {
      if (row.op_type !== 'income') continue; // skip expenses/refunds
      try {
        const { id, number, created } = createInvoice(row) as { id: string; number: string; created: boolean };
        results.push({
          source_ref:     row.source_ref,
          invoice_id:     id,
          invoice_number: number,
          guest_name:     row.guest_name,
          description:    row.description,
          amount:         row.amount,
          currency:       row.currency,
          date:           row.date,
          created,
        });
      } catch (e: any) {
        console.error('[BatchInvoices] row error:', e.message, row.source_ref);
      }
    }

    return NextResponse.json({
      ok: true,
      channel,
      total: results.length,
      created: results.filter(r => r.created).length,
      invoices: results,
    });
  } catch (e: any) {
    console.error('[BatchInvoices] error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
