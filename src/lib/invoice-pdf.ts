/**
 * ALiSiO PMS — PDF Invoice Generator (PDFKit + DejaVu fonts)
 *
 * Generates a Czech-law-compliant Faktura in PDF format using PDFKit
 * with DejaVu Sans fonts for proper Czech diacritic support (á,č,ě,í,ř,š,ž,ý,ů,ú,ď,ť,ň).
 *
 * Layout matches POHODA-style invoice (Faktura_260100002.pdf reference).
 * Kemp Carlsbad s.r.o. is a NON-VAT payer (neplátce DPH).
 */
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// ─── Font resolution ─────────────────────────────────────────────────────────
// Look for bundled DejaVu fonts; fall back to system paths on Linux.
function resolveFont(name: 'regular' | 'bold'): string {
  const filename = name === 'bold' ? 'DejaVuSans-Bold.ttf' : 'DejaVuSans.ttf';
  const candidates = [
    // Bundled in project (committed to repo or placed on server)
    path.join(process.cwd(), 'src', 'assets', 'fonts', filename),
    // System paths (Ubuntu/Debian)
    path.join('/usr/share/fonts/truetype/dejavu', filename),
    path.join('/usr/share/fonts/dejavu', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // If no TTF found, return empty string — PDFKit will use built-in Helvetica
  console.warn(`[InvoicePDF] DejaVu font not found for ${name} — Czech chars may be garbled!`);
  return '';
}

const FONT_REG  = resolveFont('regular');
const FONT_BOLD = resolveFont('bold');

// ─── Constants ───────────────────────────────────────────────────────────────
const SUPPLIER = {
  name:   'Kemp Carlsbad s.r.o.',
  street: 'Chebská 38/5',
  city:   '360 06 Karlovy Vary',
  ico:    '23430567',
  dic:    'CZ23430567',
  phone:  '723565616',
  email:  'kemp-carlsbad@email.cz',
  court:  'Krajský soud v Plzni, oddíl C 46931',
};

const BANK = {
  name:    process.env.BANK_NAME    || 'Komerční banka',
  account: process.env.BANK_ACCOUNT || '131-3569410227',
  code:    process.env.BANK_CODE    || '0100',
  iban:    process.env.BANK_IBAN    || 'CZ7001000001313569410227',
  bic:     process.env.BANK_BIC     || 'KOMBCZPP',
};

export interface InvoicePdfInput {
  invoiceNumber:   string;
  issueDate:       string;   // YYYY-MM-DD
  dueDate?:        string;   // YYYY-MM-DD
  paymentMethod?:  string;
  description:     string;
  amount:          number;
  currency?:       string;
  buyer?: {
    name?:    string;
    ico?:     string;
    dic?:     string;
    address?: string;
    city?:    string;
    country?: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function fmtMoney(n: number, currency = 'CZK'): string {
  const num = new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return currency === 'CZK' ? `${num} Kč` : `${num} ${currency}`;
}

// ─── PDF builder ─────────────────────────────────────────────────────────────
export async function generateInvoicePdf(data: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const currency = data.currency || 'CZK';
    const varSymbol = data.invoiceNumber.replace(/-/g, '');
    const payMethod = data.paymentMethod || 'Příkazem';

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 36, left: 40, right: 40 },
      info: {
        Title:   `Faktura ${data.invoiceNumber}`,
        Author:  SUPPLIER.name,
        Subject: 'Faktura – Kemp Carlsbad s.r.o.',
      },
    });

    // Register fonts
    if (FONT_REG)  doc.registerFont('Regular', FONT_REG);
    if (FONT_BOLD) doc.registerFont('Bold',    FONT_BOLD);

    const R  = (s: string | number, size?: number) => {
      if (FONT_REG) doc.font('Regular');
      else          doc.font('Helvetica');
      if (size) doc.fontSize(size);
      return String(s);
    };
    const B = (s: string | number, size?: number) => {
      if (FONT_BOLD) doc.font('Bold');
      else           doc.font('Helvetica-Bold');
      if (size) doc.fontSize(size);
      return String(s);
    };

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;   // 595
    const PH = doc.page.height;  // 842
    const ML = doc.page.margins.left;   // 40
    const MR = doc.page.margins.right;  // 40
    const W  = PW - ML - MR;            // 515
    const colMid = ML + W / 2;          // 297.5

    // ═══════════════════════════════════════════════════════════════
    //  1. HEADER BAR
    // ═══════════════════════════════════════════════════════════════
    const HEADER_H = 52;
    doc.rect(0, 0, PW, HEADER_H).fill('#1a1d2e');

    // Company name
    if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
    doc.fontSize(18).fillColor('#ffffff')
       .text(SUPPLIER.name, ML, 14, { width: W * 0.5, align: 'left' });

    // FAKTURA label + number
    if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
    doc.fontSize(13).fillColor('#ffffff')
       .text(`FAKTURA č. ${data.invoiceNumber}`, ML + W * 0.5, 11, { width: W * 0.5, align: 'right' });

    // Variable symbol
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(9).fillColor('#6ee7b7')
       .text(`Variabilní symbol: ${varSymbol}`, ML + W * 0.5, 30, { width: W * 0.5, align: 'right' });

    // ═══════════════════════════════════════════════════════════════
    //  2. DODAVATEL / ODBĚRATEL SECTION
    // ═══════════════════════════════════════════════════════════════
    const SEC1_TOP  = HEADER_H + 10;
    const SEC1_H    = 110;
    const COL_L_W   = W * 0.5 - 5;
    const COL_R_X   = colMid + 5;
    const COL_R_W   = W * 0.5 - 5;

    // Dodavatel box
    doc.rect(ML, SEC1_TOP, COL_L_W, SEC1_H).stroke('#d1d5db');

    // Odběratel box
    doc.rect(COL_R_X, SEC1_TOP, COL_R_W, SEC1_H).stroke('#d1d5db');

    // Dodavatel content
    let y = SEC1_TOP + 5;
    const lx = ML + 6;
    doc.fillColor('#9ca3af');
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(7).text('Dodavatel:', lx, y);
    y += 11;

    if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
    doc.fontSize(9).fillColor('#111827').text(SUPPLIER.name, lx, y);
    y += 12;

    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(8.5).fillColor('#374151');
    for (const line of [
      SUPPLIER.street,
      SUPPLIER.city,
      `IČO: ${SUPPLIER.ico}`,
      `DIČ: ${SUPPLIER.dic}`,
      `Mobil: ${SUPPLIER.phone}`,
      `E-mail: ${SUPPLIER.email}`,
    ]) {
      doc.text(line, lx, y);
      y += 11;
    }

    // Odběratel content
    let ry = SEC1_TOP + 5;
    const rx = COL_R_X + 6;
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(7).fillColor('#9ca3af').text('Odběratel:', rx, ry);
    ry += 11;

    if (data.buyer?.name) {
      if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
      doc.fontSize(9).fillColor('#111827').text(data.buyer.name, rx, ry);
      ry += 12;
      if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
      doc.fontSize(8.5).fillColor('#374151');
      if (data.buyer.address) { doc.text(data.buyer.address, rx, ry); ry += 11; }
      if (data.buyer.city)    { doc.text(data.buyer.city,    rx, ry); ry += 11; }
      if (data.buyer.ico)     { doc.text(`IČO: ${data.buyer.ico}`, rx, ry); ry += 11; }
      if (data.buyer.dic)     { doc.text(`DIČ: ${data.buyer.dic}`, rx, ry); ry += 11; }
    } else {
      if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
      doc.fontSize(8.5).fillColor('#9ca3af').text('—', rx, ry);
    }

    // ═══════════════════════════════════════════════════════════════
    //  3. BANK + DATES SECTION
    // ═══════════════════════════════════════════════════════════════
    const SEC2_TOP = SEC1_TOP + SEC1_H + 6;
    const SEC2_H   = 68;

    // Bank box (left)
    doc.rect(ML, SEC2_TOP, COL_L_W, SEC2_H).stroke('#d1d5db');

    let by = SEC2_TOP + 5;
    const bx = ML + 6;
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(7).fillColor('#9ca3af').text('Banka:', bx, by);
    by += 10;

    if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
    doc.fontSize(8.5).fillColor('#111827').text(BANK.name, bx, by);
    by += 11;

    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(8).fillColor('#374151');
    doc.text(`Číslo účtu: ${BANK.account}   Kód banky: ${BANK.code}`, bx, by); by += 10;
    doc.text(`IBAN: ${BANK.iban}`, bx, by); by += 10;
    doc.text(`SWIFT/BIC: ${BANK.bic}`, bx, by); by += 11;
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(7.5).fillColor('#6b7280').text('Firma není plátce DPH.', bx, by);

    // Dates (right side — no box, just info with bold values)
    const dx = COL_R_X + 6;
    let   dy = SEC2_TOP + 5;
    const DATE_LABEL_W = 95;
    const DATE_VAL_X   = COL_R_X + DATE_LABEL_W + 4;

    const dateRows: [string, string][] = [
      ['Datum vystavení:',  fmtDate(data.issueDate)],
      ['Datum splatnosti:', fmtDate(data.dueDate || data.issueDate)],
      ['Forma úhrady:',     payMethod],
      ['Konst. symbol:',    '0308'],
    ];
    for (const [label, val] of dateRows) {
      if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
      doc.fontSize(8).fillColor('#6b7280').text(label, dx, dy, { width: DATE_LABEL_W });
      if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
      doc.fontSize(8.5).fillColor('#111827').text(val, DATE_VAL_X, dy);
      dy += 15;
    }

    // ═══════════════════════════════════════════════════════════════
    //  4. LINE ITEMS TABLE
    // ═══════════════════════════════════════════════════════════════
    const TABLE_TOP = SEC2_TOP + SEC2_H + 10;

    // Column positions
    const C = {
      desc:  { x: ML,          w: 240 },
      qty:   { x: ML + 240,    w: 36  },
      price: { x: ML + 276,    w: 80  },
      disc:  { x: ML + 356,    w: 60  },
      total: { x: ML + 416,    w: W - 376 },
    };

    // Table header bg
    doc.rect(ML, TABLE_TOP, W, 18).fill('#f3f4f6');
    doc.rect(ML, TABLE_TOP, W, 18).stroke('#d1d5db');

    if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
    doc.fontSize(7.5).fillColor('#6b7280');
    doc.text('Označení dodávky', C.desc.x + 4,  TABLE_TOP + 5);
    doc.text('Mn.',              C.qty.x + 4,   TABLE_TOP + 5);
    doc.text('J.cena',           C.price.x,     TABLE_TOP + 5, { width: C.price.w, align: 'right' });
    doc.text('Sleva Kč',         C.disc.x,      TABLE_TOP + 5, { width: C.disc.w,  align: 'right' });
    doc.text('Celkem',           C.total.x,     TABLE_TOP + 5, { width: C.total.w, align: 'right' });

    // Vertical separators in header
    for (const cx of [C.qty.x, C.price.x, C.disc.x, C.total.x]) {
      doc.moveTo(cx, TABLE_TOP).lineTo(cx, TABLE_TOP + 18).stroke('#d1d5db');
    }

    // Row
    const ROW_TOP = TABLE_TOP + 18;
    const ROW_H   = 20;
    doc.rect(ML, ROW_TOP, W, ROW_H).stroke('#e5e7eb');

    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(9).fillColor('#111827');
    doc.text(data.description, C.desc.x + 4, ROW_TOP + 5, { width: C.desc.w - 8 });
    doc.text('1', C.qty.x + 4, ROW_TOP + 5);

    if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
    doc.text(fmtMoney(data.amount, currency), C.price.x, ROW_TOP + 5, { width: C.price.w, align: 'right' });

    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fillColor('#9ca3af').text('—', C.disc.x, ROW_TOP + 5, { width: C.disc.w, align: 'right' });

    if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
    doc.fillColor('#111827').text(fmtMoney(data.amount, currency), C.total.x, ROW_TOP + 5, { width: C.total.w, align: 'right' });

    // Bottom border of rows area
    const AFTER_ROWS = ROW_TOP + ROW_H;
    doc.moveTo(ML, AFTER_ROWS).lineTo(ML + W, AFTER_ROWS).lineWidth(0.5).stroke('#d1d5db');

    // ═══════════════════════════════════════════════════════════════
    //  5. TOTALS
    // ═══════════════════════════════════════════════════════════════
    let totY = AFTER_ROWS + 8;
    const TOT_LABEL_X  = C.price.x;
    const TOT_LABEL_W  = C.price.w + C.disc.w;
    const TOT_VAL_X    = C.total.x;
    const TOT_VAL_W    = C.total.w;

    // Součet položek
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(8.5).fillColor('#6b7280')
       .text('Součet položek:', TOT_LABEL_X, totY, { width: TOT_LABEL_W, align: 'right' });
    doc.fillColor('#374151')
       .text(fmtMoney(data.amount, currency), TOT_VAL_X, totY, { width: TOT_VAL_W, align: 'right' });
    totY += 13;

    // Celkem sleva
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fillColor('#6b7280')
       .text('Celkem sleva:', TOT_LABEL_X, totY, { width: TOT_LABEL_W, align: 'right' });
    doc.fillColor('#9ca3af')
       .text('—', TOT_VAL_X, totY, { width: TOT_VAL_W, align: 'right' });
    totY += 4;

    // CELKEM K ÚHRADĚ — dark bar
    const TOTAL_BAR_H = 22;
    doc.rect(TOT_LABEL_X - 8, totY, W - (TOT_LABEL_X - ML) + 8, TOTAL_BAR_H).fill('#1a1d2e');

    if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
    doc.fontSize(10).fillColor('#ffffff')
       .text('CELKEM K ÚHRADĚ:', TOT_LABEL_X - 4, totY + 6, { width: TOT_LABEL_W + 4, align: 'right' });
    doc.fillColor('#6ee7b7').fontSize(11)
       .text(fmtMoney(data.amount, currency), TOT_VAL_X, totY + 5, { width: TOT_VAL_W, align: 'right' });

    totY += TOTAL_BAR_H + 14;

    // ═══════════════════════════════════════════════════════════════
    //  6. FOOTER
    // ═══════════════════════════════════════════════════════════════
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(8).fillColor('#6b7280')
       .text('Nejsme plátci DPH', ML, totY);
    totY += 13;

    doc.fontSize(7.5).fillColor('#9ca3af')
       .text(`Vedeno u ${SUPPLIER.court}`, ML, totY, { width: W });
    totY += 11;

    doc.text(
      'Dovolujeme si Vás upozornit, že v případě nedodržení data splatnosti Vám budeme účtovat ' +
      'úrok z prodlení v dohodnuté, resp. zákonné výši a smluvní pokutu (byla-li sjednána).',
      ML, totY, { width: W }
    );
    totY += 28;

    // Sign lines
    const signDefs = [
      { label: 'Vystavil:',  x: ML },
      { label: 'Razítko:',   x: ML + W / 2 - 50 },
      { label: 'Převzal:',   x: ML + W - 100 },
    ];
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(8).fillColor('#6b7280');
    for (const { label, x } of signDefs) {
      doc.text(label, x, totY);
      doc.moveTo(x, totY + 18).lineTo(x + 90, totY + 18)
         .lineWidth(0.5).stroke('#d1d5db');
    }

    // Bottom footer strip
    doc.rect(0, PH - 20, PW, 20).fill('#f9fafb');
    if (FONT_REG) doc.font('Regular'); else doc.font('Helvetica');
    doc.fontSize(6.5).fillColor('#9ca3af')
       .text(
         `${SUPPLIER.name}  ·  ${SUPPLIER.street}, ${SUPPLIER.city}  ·  IČO: ${SUPPLIER.ico}  ·  ${SUPPLIER.email}`,
         ML, PH - 13, { width: W, align: 'center' }
       );

    doc.end();
  });
}
