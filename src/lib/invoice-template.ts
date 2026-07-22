/**
 * ALiSiO PMS — Invoice HTML Template
 *
 * Generates a Czech-law compliant Faktura (invoice).
 * Kemp Carlsbad s.r.o. is a NON-VAT payer (neplátce DPH),
 * so no DPH breakdown is required.
 *
 * Legal basis: § 26–29 Zákona č. 235/2004 Sb. (invoice requirements for non-VAT entities)
 * Also respects Zákon č. 563/1991 Sb. (Zákon o účetnictví)
 */

import { showBuyerName, dueDateFor } from './invoice-rules';

// Inline type — avoids cross-module coupling for a pure template helper.
// Many fields are nullable because the SQL uses LEFT JOIN on units/guests,
// so a deleted unit or guest produces a row with nulls instead of dropping it.
export interface InvoiceData {
  id: string;
  invoice_number: string | null;
  issued_at: string | null;
  due_date: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  reservation_id: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  adults: number | null;
  children: number | null;
  unit_name: string | null;
  unit_code?: string | null;
  guest_first_name: string | null;
  guest_last_name: string | null;
  guest_email?: string | null;
  guest_address?: string | null;
  guest_city?: string | null;
  guest_country?: string | null;
  payment_method?: string | null;
  payment_notes?: string | null;
  payment_date?: string | null;
  /** Real document date (check-in → payment → creation), used instead of issued_at. */
  document_date?: string | null;
  /** Secondary foreign-currency line when the payable total was converted to CZK. */
  foreign_note?: string | null;
  // Optional invoice-to-company override. When invoice_company_name is non-empty,
  // the Odberatel block renders these fields instead of the personal guest data.
  invoice_company_name?: string | null;
  invoice_company_ico?: string | null;
  invoice_company_dic?: string | null;
  invoice_company_address?: string | null;
  invoice_company_city?: string | null;
  invoice_company_country?: string | null;
  invoice_company_email?: string | null;
}

const SUPPLIER = {
  name: 'Kemp Carlsbad s.r.o.',
  street: 'Chebská 38/5',
  city: 'Dvory',
  zip: '360 06',
  region: 'Karlovy Vary',
  country: 'Česká republika',
  ico: '234 30 567',
  dic: null as string | null, // neplátce DPH
  email: 'kemp-carlsbad@email.cz',
  web: 'kemp-carlsbad.cz',
};

const PAYMENT_METHODS: Record<string, string> = {
  cash: 'Hotovost',
  card: 'Platební karta',
  bank_transfer: 'Bankovní převod',
  invoice: 'Faktura',
  online: 'Online platba',
  booking_platform: 'OTA platforma',
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(amount: number | null | undefined, currency = 'CZK'): string {
  const safe = typeof amount === 'number' && isFinite(amount) ? amount : 0;
  const safeCur = currency || 'CZK';
  try {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: safeCur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${safe.toFixed(2)} ${safeCur}`;
  }
}

function formatCountry(code: string | null | undefined): string {
  if (!code) return '';
  const countries: Record<string, string> = {
    CZ: 'Česká republika', SK: 'Slovensko', DE: 'Německo', AT: 'Rakousko',
    PL: 'Polsko', UA: 'Ukrajina', HU: 'Maďarsko', GB: 'Velká Británie',
    US: 'Spojené státy', FR: 'Francie', NL: 'Nizozemsko',
  };
  return countries[code.toUpperCase()] || code;
}

export function renderInvoiceHtml(data: InvoiceData): string {
  // Defensive: any of these can arrive as null from a LEFT JOIN with deleted
  // units/guests, or from legacy rows that pre-date a column being NOT NULL.
  const invoiceNumber = data.invoice_number || data.id || '—';
  const variableSymbol = invoiceNumber.replace(/-/g, '') || '0';
  const guestFirst = data.guest_first_name || '';
  const guestLast = data.guest_last_name || '';
  const guestName = `${guestFirst} ${guestLast}`.trim() || 'Host neznámý';
  const paymentMethod = PAYMENT_METHODS[data.payment_method || ''] || data.payment_method || 'Hotovost';
  const unitName = data.unit_name || 'Ubytovací jednotka';
  const unitLabel = `${unitName}${data.unit_code ? ` (${data.unit_code})` : ''}`;
  const accommodation = `Ubytování – ${unitLabel}`;
  const adults = data.adults ?? 0;
  const children = data.children ?? 0;
  const nights = data.nights ?? 0;

  const guestAddressLines: string[] = [];
  if (data.guest_address) guestAddressLines.push(data.guest_address);
  if (data.guest_city) guestAddressLines.push(data.guest_city);
  if (data.guest_country) guestAddressLines.push(formatCountry(data.guest_country));

  // Buyer (Odberatel) — when invoice_company_name is set, render company
  // identity per § 29 Zákona č. 235/2004 Sb. (IČO required, DIČ optional).
  // For personal guests (no company) we intentionally leave the Odběratel block
  // blank — Czech law does not require buyer identification for non-VAT entities
  // on invoices under 15 000 CZK, and the operator prefers anonymous invoices.
  const isCompanyInvoice = !!(data.invoice_company_name && data.invoice_company_name.trim());
  // data.amount is already the CZK payable at render time (handler converts EUR).
  const buyerRequired = showBuyerName(data.amount || 0, isCompanyInvoice);
  const buyerLabel = 'Odběratel';
  let buyerHtml: string;
  if (isCompanyInvoice) {
    const companyAddrLines: string[] = [];
    if (data.invoice_company_address) companyAddrLines.push(data.invoice_company_address);
    if (data.invoice_company_city) companyAddrLines.push(data.invoice_company_city);
    if (data.invoice_company_country) companyAddrLines.push(formatCountry(data.invoice_company_country));
    buyerHtml = [
      `<strong>${data.invoice_company_name}</strong>`,
      ...companyAddrLines,
      data.invoice_company_ico ? `IČO: ${data.invoice_company_ico}` : null,
      data.invoice_company_dic ? `DIČ: ${data.invoice_company_dic}` : null,
      data.invoice_company_email ? data.invoice_company_email : null,
    ].filter(Boolean).join('<br>');
  } else if (buyerRequired && (guestFirst || guestLast)) {
    // ≥ 9900 CZK — buyer (guest) name is mandatory
    buyerHtml = [`<strong>${guestName}</strong>`, ...guestAddressLines].filter(Boolean).join('<br>');
  } else {
    // Below threshold — anonymous invoice, no buyer name
    buyerHtml = `<span style="color:#9ca3af;font-style:italic;">—</span>`;
  }


  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Faktura ${data.invoice_number}</title>
  <style>
    /* ─── Base ──────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    body {
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      color: #1a1a2e;
      background: #f5f6fa;
      padding: 0;
    }

    .invoice-wrapper {
      max-width: 800px;
      margin: 32px auto;
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 32px rgba(0,0,0,0.10);
    }

    /* ─── Header ─────────────────────────────────────────────────── */
    .inv-header {
      background: linear-gradient(135deg, #1a1d2e 0%, #252842 100%);
      color: #fff;
      padding: 36px 40px 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
    }

    .inv-header .company-name {
      font-size: 18pt;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: #fff;
      margin-bottom: 4px;
    }

    .inv-header .company-meta {
      font-size: 9pt;
      color: rgba(255,255,255,0.65);
      line-height: 1.7;
    }

    .inv-header .doc-title {
      text-align: right;
    }

    .inv-header .doc-title h1 {
      font-size: 26pt;
      font-weight: 700;
      letter-spacing: 2px;
      color: #6ee7b7;
      line-height: 1;
      margin-bottom: 6px;
    }

    .inv-header .invoice-number {
      font-size: 14pt;
      font-weight: 600;
      color: rgba(255,255,255,0.9);
    }

    /* ─── Status badge ─────────────────────────────────────────────── */
    .status-bar {
      background: #f0fdf4;
      border-bottom: 1px solid #d1fae5;
      padding: 12px 40px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 9.5pt;
      color: #065f46;
      font-weight: 500;
    }

    .status-bar .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      display: inline-block;
    }

    /* ─── Body ───────────────────────────────────────────────────── */
    .inv-body {
      padding: 32px 40px;
    }

    /* ─── Meta grid ──────────────────────────────────────────────── */
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 28px;
    }

    .meta-block {}

    .meta-block .label {
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #6b7280;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .meta-block .value {
      font-size: 10.5pt;
      color: #1a1a2e;
      line-height: 1.55;
    }

    .meta-block .value strong {
      font-weight: 600;
    }

    /* ─── Dates row ──────────────────────────────────────────────── */
    .dates-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 28px;
    }

    .date-cell {
      padding: 12px 16px;
      border-right: 1px solid #e5e7eb;
    }

    .date-cell:last-child { border-right: none; }

    .date-cell .label {
      font-size: 7pt;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #9ca3af;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .date-cell .value {
      font-size: 10pt;
      font-weight: 600;
      color: #1a1a2e;
    }

    /* ─── Items table ────────────────────────────────────────────── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      border-radius: 8px;
      overflow: hidden;
    }

    .items-table thead tr {
      background: #f3f4f6;
    }

    .items-table th {
      padding: 10px 14px;
      text-align: left;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #6b7280;
      font-weight: 600;
      border-bottom: 2px solid #e5e7eb;
    }

    .items-table th:last-child,
    .items-table td:last-child {
      text-align: right;
    }

    .items-table tbody tr {
      border-bottom: 1px solid #f3f4f6;
    }

    .items-table tbody tr:last-child {
      border-bottom: none;
    }

    .items-table td {
      padding: 13px 14px;
      font-size: 10pt;
      color: #374151;
      vertical-align: top;
    }

    .items-table td .desc-main {
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 3px;
    }

    .items-table td .desc-sub {
      font-size: 8.5pt;
      color: #6b7280;
    }

    /* ─── Totals ─────────────────────────────────────────────────── */
    .totals-block {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 28px;
    }

    .totals-inner {
      min-width: 280px;
    }

    .total-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 0;
      color: #6b7280;
      font-size: 9.5pt;
    }

    .total-line.main {
      border-top: 2px solid #1a1d2e;
      margin-top: 8px;
      padding-top: 12px;
      font-size: 14pt;
      font-weight: 700;
      color: #1a1a2e;
    }

    .total-line.main .amount {
      color: #059669;
    }

    .no-vat-note {
      font-size: 8pt;
      color: #9ca3af;
      text-align: right;
      margin-top: 6px;
      font-style: italic;
    }

    /* ─── Payment info ───────────────────────────────────────────── */
    .payment-info {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 28px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .payment-info .pi-item .label {
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #9ca3af;
      font-weight: 600;
      margin-bottom: 3px;
    }

    .payment-info .pi-item .value {
      font-size: 10pt;
      font-weight: 500;
      color: #374151;
    }

    /* ─── Footer ─────────────────────────────────────────────────── */
    .inv-footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 20px 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
    }

    .inv-footer .legal-notice {
      font-size: 7.5pt;
      color: #9ca3af;
      line-height: 1.6;
      max-width: 420px;
    }

    .inv-footer .signature-block {
      text-align: right;
    }

    .inv-footer .signature-date {
      font-size: 8.5pt;
      color: #6b7280;
      margin-bottom: 40px;
    }

    .inv-footer .signature-line {
      width: 180px;
      border-top: 1px solid #6b7280;
      font-size: 7.5pt;
      color: #6b7280;
      padding-top: 4px;
      text-align: center;
      margin-left: auto;
    }

    /* ─── Print styles ───────────────────────────────────────────── */
    @media print {
      body {
        background: white;
        padding: 0;
        font-size: 10pt;
      }

      .invoice-wrapper {
        margin: 0;
        border-radius: 0;
        box-shadow: none;
        max-width: 100%;
      }

      .no-print {
        display: none !important;
      }

      @page {
        size: A4;
        margin: 12mm 15mm;
      }

      .inv-header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .status-bar {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>

  <!-- Print/Download toolbar (hidden in print) -->
  <div class="no-print" style="
    max-width: 800px; margin: 0 auto;
    display: flex; gap: 12px; justify-content: flex-end;
    padding: 16px 0 0;
  ">
    <button onclick="window.print()" style="
      background: #4f6ef7; color: #fff; border: none;
      padding: 9px 20px; border-radius: 8px; cursor: pointer;
      font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;
      font-family: inherit;
    ">⬇ Stáhnout PDF / Tisk</button>
    <button onclick="window.close()" style="
      background: #f3f4f6; color: #374151; border: none;
      padding: 9px 20px; border-radius: 8px; cursor: pointer;
      font-size: 13px; font-weight: 500;
      font-family: inherit;
    ">✕ Zavřít</button>
  </div>

  <div class="invoice-wrapper">

    <!-- ─── HEADER ─────────────────────────────────────────────── -->
    <div class="inv-header">
      <div class="supplier-block">
        <div class="company-name">${SUPPLIER.name}</div>
        <div class="company-meta">
          ${SUPPLIER.street}, ${SUPPLIER.zip} ${SUPPLIER.city}<br>
          IČO: ${SUPPLIER.ico} &nbsp;|&nbsp; Neplátce DPH<br>
          ${SUPPLIER.email} &nbsp;|&nbsp; ${SUPPLIER.web}
        </div>
      </div>
      <div class="doc-title">
        <h1>FAKTURA</h1>
        <div class="invoice-number">č. ${invoiceNumber}</div>
      </div>
    </div>

    <!-- ─── STATUS BAR ─────────────────────────────────────────── -->
    <div class="status-bar">
      <span class="dot"></span>
      Uhrazeno &nbsp;·&nbsp; ${paymentMethod}
      ${data.payment_notes ? `&nbsp;·&nbsp; ${data.payment_notes}` : ''}
    </div>

    <div class="inv-body">

      <!-- ─── PARTIES ─────────────────────────────────────────── -->
      <div class="meta-grid">
        <div class="meta-block">
          <div class="label">Dodavatel</div>
          <div class="value">
            <strong>${SUPPLIER.name}</strong><br>
            ${SUPPLIER.street}<br>
            ${SUPPLIER.zip} ${SUPPLIER.city}<br>
            ${SUPPLIER.country}<br>
            IČO: ${SUPPLIER.ico}
          </div>
        </div>
        <div class="meta-block">
          <div class="label">${buyerLabel}</div>
          <div class="value">${buyerHtml}</div>
        </div>
      </div>

      <!-- ─── DATES ────────────────────────────────────────────── -->
      <div class="dates-row">
        <div class="date-cell">
          <div class="label">Datum vystavení</div>
          <div class="value">${formatDate(data.document_date || data.issued_at)}</div>
        </div>
        <div class="date-cell">
          <div class="label">Datum uskuteč. plnění</div>
          <div class="value">${formatDate(dueDateFor(data.document_date || data.issued_at || ''))}</div>
        </div>
        <div class="date-cell">
          <div class="label">Datum splatnosti</div>
          <div class="value">${formatDate(dueDateFor(data.document_date || data.issued_at || ''))}</div>
        </div>
        <div class="date-cell">
          <div class="label">Forma úhrady</div>
          <div class="value">${paymentMethod}</div>
        </div>
      </div>

      <!-- ─── ITEMS TABLE ──────────────────────────────────────── -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width:45%">Popis</th>
            <th style="width:20%">Pobyt</th>
            <th style="width:15%">Počet nocí</th>
            <th style="width:20%">Celkem</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="desc-main">${accommodation}</div>
              <div class="desc-sub">
                ${adults} dospělý${adults > 1 ? 'ch' : ''}
                ${children > 0 ? `, ${children} dítě${children > 1 ? 't' : ''}` : ''}
              </div>
            </td>
            <td>
              ${formatDate(data.check_in)}<br>
              <span style="color:#6b7280; font-size:8.5pt">→ ${formatDate(data.check_out)}</span>
            </td>
            <td>${nights}</td>
            <td style="font-weight:600; color:#1a1a2e">${formatAmount(data.amount, data.currency as string)}</td>
          </tr>
        </tbody>
      </table>

      <!-- ─── TOTALS ────────────────────────────────────────────── -->
      <div class="totals-block">
        <div class="totals-inner">
          <div class="total-line main">
            <span>Celkem k úhradě</span>
            <span class="amount">${formatAmount(data.amount, data.currency as string)}</span>
          </div>
          ${data.foreign_note ? `<div class="no-vat-note" style="color:#6b7280">${data.foreign_note}</div>` : ''}
          <div class="no-vat-note">Fakturující subjekt není plátcem DPH.</div>
        </div>
      </div>

      <!-- ─── PAYMENT INFO ──────────────────────────────────────── -->
      <div class="payment-info">
        <div class="pi-item">
          <div class="label">Variabilní symbol</div>
          <div class="value">${variableSymbol}</div>
        </div>
        <div class="pi-item">
          <div class="label">Číslo rezervace</div>
          <div class="value">${data.reservation_id || '—'}</div>
        </div>
        <div class="pi-item">
          <div class="label">Forma úhrady</div>
          <div class="value">${paymentMethod}</div>
        </div>
        <div class="pi-item">
          <div class="label">Stav</div>
          <div class="value" style="color: #059669; font-weight: 600;">✓ Uhrazeno</div>
        </div>
      </div>

    </div><!-- /inv-body -->

    <!-- ─── FOOTER ────────────────────────────────────────────── -->
    <div class="inv-footer">
      <div class="legal-notice">
        Tato faktura slouží jako doklad o provedené platbě za ubytovací služby.
        Fakturující subjekt <strong>${SUPPLIER.name}</strong>, IČO ${SUPPLIER.ico}, není plátcem daně z přidané hodnoty
        dle § 6 zákona č. 235/2004 Sb.
      </div>
      <div class="signature-block">
        <div class="signature-date">V Karlových Varech dne ${formatDate(data.document_date || data.issued_at)}</div>
        <div class="signature-line">Vystavil / podpis dodavatele</div>
      </div>
    </div>

  </div><!-- /invoice-wrapper -->

</body>
</html>`;
}
