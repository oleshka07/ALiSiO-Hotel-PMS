/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OTA Payout Import Handler
 *
 * Parses Airbnb and Booking.com financial statement CSVs and imports them as
 * fin_operations (income) so they appear in the Reconciliation Journal.
 *
 * Deduplication: source='airbnb' / 'booking_com' + source_ref = confirmation code / booking number.
 * Consecutive uploads of overlapping CSV periods are safe — already-imported rows are skipped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@core/db';
import { getSessionUser } from '@/lib/auth';
import { createOperationInTx } from './operations.handlers';

// ─────────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** MM/DD/YYYY → YYYY-MM-DD (Airbnb format) */
function parseAirbnbDate(s: string): string {
  if (!s) return '';
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/** "4 Jun 2026" → "2026-06-04" (Booking.com format) */
function parseBookingDate(s: string): string {
  if (!s) return '';
  const m = s.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${MONTH_MAP[m[2]] ?? '01'}-${m[1].padStart(2, '0')}`;
}

/** Handles both "251.22" and European "46,08" (comma decimal) */
function parseAmount(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/\s/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type OtaSource = 'airbnb' | 'booking_com';

export interface OtaPreviewRow {
  source: OtaSource;
  source_ref: string;
  type: string;
  guest_name: string;
  listing: string;
  check_in: string;
  check_out: string;
  nights: number;
  currency: string;
  /** Net amount host receives (after OTA commission) */
  amount: number;
  /** Gross amount guest paid (Airbnb: Валовий дохід; Booking: same as amount) */
  gross_amount: number;
  paid_at: string;
  op_type: 'income' | 'expense';
  action: 'create' | 'skip_duplicate';
  existing_operation_id?: string;
}

export interface OtaImportPreview {
  source: OtaSource;
  filename: string;
  total_rows: number;
  rows: OtaPreviewRow[];
  summary: {
    create: number;
    skip_duplicate: number;
    income_total: number;
    expense_total: number;
    currency: string;
  };
}

export interface OtaImportResult {
  created: number;
  skipped: number;
  errors: number;
  errorDetails: string[];
}

// ─────────────────────────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────────────────────────

function parseAirbnbCsv(content: string, db: any): OtaPreviewRow[] {
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const idx = (name: string) => headers.findIndex(h => h.replace(/^"|"$/g, '').trim() === name);

  const iDate      = idx('Дата');
  const iType      = idx('Тип');
  const iCode      = idx('Код підтвердження');
  const iDateStart = idx('Дата початку');
  const iDateEnd   = idx('Дата завершення');
  const iNights    = idx('Кількість ночей');
  const iGuest     = idx('Гість');
  const iListing   = idx('Оголошення');
  const iCurrency  = idx('Валюта');
  const iAmount    = idx('Сума');
  const iGross     = idx('Валовий дохід');

  // Column validation
  if (iDate === -1 || iType === -1 || iCode === -1) {
    throw new Error('Не вдалося розпізнати файл як Airbnb-виписку. Перевірте, чи це правильний CSV з Airbnb.');
  }

  const rows: OtaPreviewRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);

    const type = (cols[iType] ?? '').trim();
    // Import: Бронювання (booking) and Компенсація (adjustment/refund); skip Payout rows
    if (type !== 'Бронювання' && type !== 'Компенсація') continue;

    const confirmCode = (cols[iCode] ?? '').trim();
    if (!confirmCode) continue;

    const amountRaw = parseAmount(cols[iAmount] ?? '0');
    const grossRaw  = parseAmount(cols[iGross]  ?? '0');
    const isExpense = type === 'Компенсація' && amountRaw < 0;
    const amount    = Math.abs(amountRaw);
    if (amount === 0) continue;

    const existing = db.prepare(
      `SELECT id FROM fin_operations WHERE source = 'airbnb' AND source_ref = ? LIMIT 1`
    ).get(confirmCode) as { id: string } | undefined;

    rows.push({
      source:       'airbnb',
      source_ref:   confirmCode,
      type,
      guest_name:   (cols[iGuest]    ?? '').trim(),
      listing:      (cols[iListing]  ?? '').trim(),
      check_in:     parseAirbnbDate(cols[iDateStart] ?? ''),
      check_out:    parseAirbnbDate(cols[iDateEnd]   ?? ''),
      nights:       parseInt(cols[iNights] ?? '0') || 0,
      currency:     (cols[iCurrency] ?? 'EUR').trim() || 'EUR',
      amount,
      gross_amount: Math.abs(grossRaw),
      paid_at:      parseAirbnbDate(cols[iDate] ?? ''),
      op_type:      isExpense ? 'expense' : 'income',
      action:       existing ? 'skip_duplicate' : 'create',
      existing_operation_id: existing?.id,
    });
  }

  return rows;
}

function parseBookingPayoutCsv(content: string, db: any): OtaPreviewRow[] {
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const idx = (name: string) => headers.findIndex(h => h.replace(/^"|"$/g, '').trim() === name);

  const iType        = idx('Type');
  const iBookingNum  = idx('Booking number');
  const iCheckIn     = idx('Check-in');
  const iCheckout    = idx('Checkout');
  const iGuest       = idx('Guest name');
  const iStatus      = idx('Reservation status');
  const iCurrency    = idx('Currency');
  const iAmount      = idx('Amount');
  const iPayoutDate  = idx('Payout date');

  if (iType === -1 || iBookingNum === -1 || iAmount === -1) {
    throw new Error('Не вдалося розпізнати файл як Booking.com виписку. Перевірте формат CSV.');
  }

  const rows: OtaPreviewRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);

    const type = (cols[iType] ?? '').trim();
    if (type !== 'Reservation') continue;

    const bookingNum = String(cols[iBookingNum] ?? '').trim();
    if (!bookingNum) continue;

    const status = (cols[iStatus] ?? '').toLowerCase();
    if (status === 'cancelled' || status === 'no-show') continue;

    const amount = parseAmount(cols[iAmount] ?? '0');
    if (amount <= 0) continue;

    const existing = db.prepare(
      `SELECT id FROM fin_operations WHERE source = 'booking_com' AND source_ref = ? LIMIT 1`
    ).get(bookingNum) as { id: string } | undefined;

    rows.push({
      source:       'booking_com',
      source_ref:   bookingNum,
      type:         'Reservation',
      guest_name:   (cols[iGuest] ?? '').trim(),
      listing:      '',
      check_in:     parseBookingDate(cols[iCheckIn]  ?? ''),
      check_out:    parseBookingDate(cols[iCheckout] ?? ''),
      nights:       0,
      currency:     (cols[iCurrency] ?? 'EUR').trim() || 'EUR',
      amount,
      gross_amount: amount,
      paid_at:      parseBookingDate(cols[iPayoutDate] ?? ''),
      op_type:      'income',
      action:       existing ? 'skip_duplicate' : 'create',
      existing_operation_id: existing?.id,
    });
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────
// Account resolver — OTA-aware
// ─────────────────────────────────────────────────────────────────

/**
 * Resolve the best account_to_id for an OTA income operation.
 * Priority:
 *  1. Named OTA clearing account matching the source (e.g. "Airbnb (EUR)")
 *  2. Any active account with the right currency (bank → cash → clearing)
 */
function resolveAccountForOta(db: any, orgId: string, source: OtaSource, currency: string): string | null {
  // 1. Try the well-known OTA clearing account IDs first
  const knownIds: Record<string, string> = {
    'airbnb_EUR':      'acct_clr_airbnb__eur_',
    'airbnb_CZK':      'acct_clr_airbnb__eur_',   // fallback: airbnb always EUR
    'booking_com_EUR': 'acct_clr_booking_com__eur_',
    'booking_com_CZK': 'acct_clr_booking_com__czk_',
  };
  const knownId = knownIds[`${source}_${currency}`];
  if (knownId) {
    const row = db.prepare(
      'SELECT id FROM finance_accounts WHERE id = ? AND is_active = 1 LIMIT 1'
    ).get(knownId) as { id: string } | undefined;
    if (row) return row.id;
  }

  // 2. Find by name pattern matching OTA source
  const nameLike = source === 'airbnb' ? '%Airbnb%' : '%Booking%';
  const byName = db.prepare(`
    SELECT id FROM finance_accounts
    WHERE organization_id = ? AND currency = ? AND is_active = 1
      AND (name LIKE ? OR type = 'clearing')
    ORDER BY (name LIKE ?) DESC, (type = 'bank') DESC, sort_order ASC
    LIMIT 1
  `).get(orgId, currency, nameLike, nameLike) as { id: string } | undefined;
  if (byName) return byName.id;

  // 3. Any active account with the right currency (any type)
  const fallback = db.prepare(`
    SELECT id FROM finance_accounts
    WHERE organization_id = ? AND currency = ? AND is_active = 1
    ORDER BY (type = 'bank') DESC, (type = 'cash') DESC, sort_order ASC, created_at ASC
    LIMIT 1
  `).get(orgId, currency) as { id: string } | undefined;
  return fallback?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Auto-detect source from file content
// ─────────────────────────────────────────────────────────────────

function detectSource(content: string, hint: string | null): OtaSource {
  if (hint === 'airbnb' || hint === 'booking_com') return hint as OtaSource;
  // Booking.com files always have "Booking number" in the header
  if (content.includes('Booking number') && content.includes('Payout ID')) return 'booking_com';
  // Airbnb files have Ukrainian headers
  if (content.includes('Код підтвердження') || content.includes('Валовий дохід')) return 'airbnb';
  // Fallback: try Booking.com if Type/Amount columns present
  if (content.includes('Payout date')) return 'booking_com';
  return 'airbnb';
}

// ─────────────────────────────────────────────────────────────────
// Preview handler — POST /api/imports/ota/preview
// ─────────────────────────────────────────────────────────────────

export async function previewOtaImport(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgRow = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
    if (!orgRow) return NextResponse.json({ error: 'No organization found' }, { status: 500 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Файл не завантажено' }, { status: 400 });

    const content = await file.text();
    const source = detectSource(content, formData.get('source') as string | null);

    let rows: OtaPreviewRow[];
    try {
      rows = source === 'airbnb'
        ? parseAirbnbCsv(content, db)
        : parseBookingPayoutCsv(content, db);
    } catch (parseErr: any) {
      return NextResponse.json({ error: parseErr.message }, { status: 422 });
    }

    const toCreate = rows.filter(r => r.action === 'create');
    const currencies = [...new Set(rows.map(r => r.currency))];

    const preview: OtaImportPreview = {
      source,
      filename: file.name,
      total_rows: rows.length,
      rows,
      summary: {
        create:          toCreate.length,
        skip_duplicate:  rows.filter(r => r.action === 'skip_duplicate').length,
        income_total:    toCreate.filter(r => r.op_type === 'income').reduce((s, r) => s + r.amount, 0),
        expense_total:   toCreate.filter(r => r.op_type === 'expense').reduce((s, r) => s + r.amount, 0),
        currency:        currencies[0] ?? 'EUR',
      },
    };

    return NextResponse.json(preview);
  } catch (e: any) {
    console.error('[OTA Import Preview]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────
// Confirm handler — POST /api/imports/ota/confirm
// ─────────────────────────────────────────────────────────────────

export async function confirmOtaImport(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgRow = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
    if (!orgRow) return NextResponse.json({ error: 'No organization found' }, { status: 500 });
    const orgId = orgRow.id;

    const store = await cookies();
    const sessionId = store.get('session_id')?.value;
    const user = await getSessionUser(sessionId);
    const actor = user ? { id: user.id, name: user.full_name } : null;

    const body = await request.json() as {
      rows: OtaPreviewRow[];
      /** Optional EUR→CZK rate override; required when finance_exchange_rates has no EUR entry */
      fx_rate?: number;
    };

    const rowsToCreate = (body.rows ?? []).filter(r => r.action === 'create');

    let created = 0;
    let skipped = 0;
    let errors  = 0;
    const errorDetails: string[] = [];

    for (const row of rowsToCreate) {
      // Re-check duplicate (safe for concurrent uploads)
      const dup = db.prepare(
        `SELECT id FROM fin_operations WHERE source = ? AND source_ref = ? LIMIT 1`
      ).get(row.source, row.source_ref) as { id: string } | undefined;

      if (dup) { skipped++; continue; }

      const accountId = resolveAccountForOta(db, orgId, row.source, row.currency);
      if (!accountId) {
        errors++;
        errorDetails.push(`Немає рахунку у валюті ${row.currency} для ${row.source} (${row.source_ref}). Перевір /finance/settings → Рахунки.`);
        continue;
      }

      const sourceLabel = row.source === 'airbnb' ? 'Airbnb' : 'Booking.com';
      const datePart = row.check_in
        ? ` ${row.check_in}${row.check_out ? '–' + row.check_out : ''}`
        : '';
      const listingPart = row.listing ? ` – ${row.listing}` : '';
      const comment = `${sourceLabel}: ${row.guest_name}${datePart}${listingPart}`;

      const paidAt = row.paid_at || new Date().toISOString().substring(0, 10);

      // Update matching fin_channel_receivables if present (mark as in_statement for reconciliation & invoice)
      const chSource = row.source === 'airbnb' ? 'airbnb' : 'booking';
      const updatedReceivable = db.prepare(`
        UPDATE fin_channel_receivables
        SET status = 'in_statement',
            actual_net = ?,
            statement_payout_date = ?,
            updated_at = datetime('now')
        WHERE organization_id = ?
          AND external_reservation_id = ?
          AND channel_source = ?
      `).run(row.amount, row.paid_at || new Date().toISOString().substring(0, 10), orgId, row.source_ref, chSource);

      if (updatedReceivable.changes > 0) {
        created++;
      } else {
        // Record in fin_statement_uploads tracking if no direct receivable matched
        skipped++;
      }
    }

    const result: OtaImportResult = { created, skipped, errors, errorDetails };
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[OTA Import Confirm]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
