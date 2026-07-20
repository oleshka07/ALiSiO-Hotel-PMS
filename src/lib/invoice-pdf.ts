/**
 * ALiSiO PMS — PDF Invoice Generator
 *
 * Layout is pixel-matched to POHODA Faktura_260100002.pdf (reference).
 * Uses a FLOW-BASED approach — sections grow with content, no fixed Y coords
 * below the header block. Table rows are fully dynamic.
 *
 * Page: A4 (595.28 × 841.89 pts)
 * Kemp Carlsbad s.r.o. — neplátce DPH (0 % VAT)
 */
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// ─── Font resolution ─────────────────────────────────────────────────────────
function resolveFont(name: 'regular' | 'bold'): string {
  const filename = name === 'bold' ? 'DejaVuSans-Bold.ttf' : 'DejaVuSans.ttf';
  const candidates = [
    path.join(process.cwd(), 'src', 'assets', 'fonts', filename),
    path.join(__dirname, '..', '..', '..', '..', 'src', 'assets', 'fonts', filename),
    path.join('/usr/share/fonts/truetype/dejavu', filename),
    `/root/projects/alisio-pms/src/assets/fonts/${filename}`,
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        console.log(`[InvoicePDF] font (${name}): ${p}`);
        return p;
      }
    } catch { /* ignore */ }
  }
  console.warn(`[InvoicePDF] ⚠ Font not found for "${name}"`);
  return '';
}

const FONT_REG  = resolveFont('regular');
const FONT_BOLD = resolveFont('bold');

// ─── Page geometry ────────────────────────────────────────────────────────────
const PW = 595.28;  // A4 width
const PH = 841.89;  // A4 height
const ML = 28;       // left margin (matched to reference x=28.3)
const MR = 28;       // right margin
const CR = PW - MR; // content right edge = 567.28

// Column split (reference: right col starts at x=326)
const DIV_X  = 316;           // vertical divider x position
const GAP    = 10;            // gap between divider and content
const COL_LX = ML + 6;       // left col text start
const COL_LW = DIV_X - ML - 8; // left col text width
const COL_RX = DIV_X + GAP;  // right col text start (326)
const COL_RW = CR - COL_RX;  // right col text width (~241)

// Colors — matched from reference
const BLUE    = '#1565c0';  // FAKTURA heading, IČ/DIČ, Nejsme plátci
const BLACK   = '#1a1a1a';
const DGRAY   = '#555555';  // labels
const LGRAY   = '#888888';  // secondary labels
const BORDER  = '#aaaaaa';  // box borders & dividers
const TBLBG   = '#f0f0f0';  // table header bg
const ROWBDR  = '#dddddd';  // table row borders

// ─── Business data ────────────────────────────────────────────────────────────
const SUPPLIER = {
  name:   'Kemp Carlsbad s.r.o.',
  street: 'Chebská 38/5',
  city:   '360 06 Karlovy Vary',
  ico:    '23430567',
  dic:    '',            // neplátce DPH — IČO only, no VAT number
  phone:  '723565616',
  email:  'kemp-carlsbad@email.cz',
  court:  'Krajského soudu v Plzni, oddíl C 46931',
};

const BANK = {
  name:    process.env.BANK_NAME    || 'Komerční banka',
  account: process.env.BANK_ACCOUNT || '131-3569410227',
  code:    process.env.BANK_CODE    || '0100',
  iban:    process.env.BANK_IBAN    || 'CZ7001000001313569410227',
  bic:     process.env.BANK_BIC     || 'KOMBCZPP',
};

// ─── Public types ─────────────────────────────────────────────────────────────
export interface InvoiceItem {
  description: string;
  quantity?:   number;
  unitPrice?:  number;
  total:       number;
}

export interface InvoicePdfInput {
  invoiceNumber:  string;
  issueDate:      string;   // YYYY-MM-DD
  dueDate?:       string;   // YYYY-MM-DD
  paymentMethod?: string;
  description:    string;   // used as single item description if no items[]
  amount:         number;   // total amount (negative for credit notes)
  currency?:      string;
  items?:         InvoiceItem[];  // optional multi-item list
  /** True when this is a storno/credit note (REFUND transaction) */
  isCreditNote?:  boolean;
  /** Reference to the original transaction (shown in note/header for credit notes) */
  originalInvoiceRef?: string;
  /**
   * Secondary foreign-currency line (e.g. "Původní částka: 250,00 EUR · kurz
   * 25,300 CZK/EUR"). When set, amount/currency are already CZK and this is
   * printed under CELKEM K ÚHRADĚ as secondary info.
   */
  foreignNote?: string;
  buyer?: {
    name?:    string;
    ico?:     string;
    dic?:     string;
    address?: string;
    city?:    string;
    country?: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function fmtMoney(n: number, currency = 'CZK'): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const num = new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return currency === 'CZK' ? `${sign}${num}` : `${sign}${num} ${currency}`;
}

// Estimate text height for a given string in a given width at given font size
// PDFKit uses ~1.2× line-height factor
function textHeight(doc: PDFKit.PDFDocument, text: string, width: number, fontSize: number): number {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.52)));
  const lines = text.split('\n').reduce((acc, line) => {
    return acc + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
  return lines * fontSize * 1.35;
}

// ─── PDF builder ──────────────────────────────────────────────────────────────
export async function generateInvoicePdf(data: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const isCreditNote = data.isCreditNote === true;
    const currency     = data.currency     || 'CZK';
    const payMethod    = data.paymentMethod || 'Příkazem';
    const varSymbol    = data.invoiceNumber.replace(/-/g, '');
    const issueDateFmt = fmtDate(data.issueDate);
    const dueDateFmt   = fmtDate(data.dueDate || data.issueDate);

    // Build items list
    const items: InvoiceItem[] = data.items?.length
      ? data.items
      : [{ description: data.description, quantity: 1, total: data.amount }];

    const docTitle = isCreditNote ? `Storno faktura ${data.invoiceNumber}` : `Faktura ${data.invoiceNumber}`;

    const doc = new PDFDocument({
      size: [PW, PH],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      info: {
        Title:   docTitle,
        Author:  SUPPLIER.name,
        Creator: 'ALiSiO PMS',
        Subject: isCreditNote ? 'Storno faktura' : 'Faktura',
      },
    });

    if (FONT_REG)  doc.registerFont('Reg',  FONT_REG);
    if (FONT_BOLD) doc.registerFont('Bold', FONT_BOLD);

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const R = (sz: number) => {
      if (FONT_REG)  doc.font('Reg');  else doc.font('Helvetica');
      doc.fontSize(sz);
      return doc;
    };
    const B = (sz: number) => {
      if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold');
      doc.fontSize(sz);
      return doc;
    };

    // Draw a horizontal line spanning full content width
    const hline = (y: number, color = BORDER, w = 0.5) =>
      doc.moveTo(ML, y).lineTo(CR, y).lineWidth(w).strokeColor(color).stroke();

    // Draw a boxed value (bordered rect around date value)
    const dateBox = (x: number, y: number, w: number, h: number, val: string, sz: number) => {
      doc.rect(x - 1, y - 2, w, h + 2).lineWidth(0.5).strokeColor(BORDER).stroke();
      B(sz).fillColor(BLACK).text(val, x + 1, y, { width: w - 4, align: 'right', lineBreak: false });
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  1. HEADER
    //  reference: company name at y=29.5, FAKTURA at same y, h=13
    // ═══════════════════════════════════════════════════════════════════════
    const HDR_Y   = 28;
    const HDR_BOT = 48;

    B(13).fillColor(BLACK)
      .text(SUPPLIER.name, ML, HDR_Y, { lineBreak: false });

    // STORNO FAKTURA shown in red; regular FAKTURA in BLUE
    const headingColor = isCreditNote ? '#c62828' : BLUE;
    const headingText  = isCreditNote
      ? `STORNO FAKTURA č. ${data.invoiceNumber}`
      : `FAKTURA č. ${data.invoiceNumber}`;
    B(13).fillColor(headingColor)
      .text(headingText, ML, HDR_Y, {
        width: CR - ML, align: 'right', lineBreak: false,
      });

    hline(HDR_BOT);

    // ═══════════════════════════════════════════════════════════════════════
    //  2. MAIN BLOCK — single bordered rect with inner dividers
    //  Left: Dodavatel (top) + Banka (bottom)
    //  Right: Variabilní/Odběratel (top) + empty (bottom)
    //  reference: section 1 y=50–170, section 2 y=185–240
    // ═══════════════════════════════════════════════════════════════════════
    const MB_Y = HDR_BOT + 2;  // main block top

    // ── Left top: Dodavatel content ──────────────────────────────────────
    let lTopLines = [
      { text: 'Dodavatel:', size: 8,   color: LGRAY,  bold: false, gap: 10 },
      { text: SUPPLIER.name, size: 10.5, color: BLACK, bold: true,  gap: 12 },
      { text: SUPPLIER.street, size: 9.5, color: BLACK, bold: false, gap: 11 },
      { text: SUPPLIER.city,   size: 9.5, color: BLACK, bold: false, gap: 17 },
      { text: `IČ: ${SUPPLIER.ico}`,  size: 9.5, color: BLUE,  bold: false, gap: 11 },
      // neplátce DPH — show DIČ only if a real VAT number is configured
      ...(SUPPLIER.dic ? [{ text: `DIČ: ${SUPPLIER.dic}`, size: 9.5, color: BLUE, bold: false, gap: 11 }] : []),
      { text: `Mobil: ${SUPPLIER.phone}`, size: 9.5, color: BLACK, bold: false, gap: 11 },
      { text: `E-mail: ${SUPPLIER.email}`, size: 9.5, color: BLACK, bold: false, gap: 0 },
    ];
    let lTopH = 8 + lTopLines.reduce((s, l) => s + l.gap, 0);

    // ── Right top: Variabilní + Odběratel ────────────────────────────────
    const rTopFixed = 3 * 13; // 3 rows: Variabilní, Konstantní, Objednávka
    const rOdbH = (() => {
      let h = 12; // "Odběratel:" row
      if (data.buyer?.dic)     h += 11;
      if (data.buyer?.name) {
        // Dynamic: allow name to wrap within the right-column width
        const nameW = COL_RW - 14;
        h += Math.max(13, textHeight(doc, data.buyer.name, nameW, 10) + 4);
      }
      if (data.buyer?.address) h += 11;
      if (data.buyer?.city)    h += 11;
      if (!data.buyer?.name)   h += 11; // placeholder "—"
      return h;
    })();
    const rTopH = rTopFixed + 8 + rOdbH + 8; // gap above/below Odběratel box

    const H1 = Math.max(lTopH, rTopH) + 12; // top subsection height

    // ── Left bottom: Banka ───────────────────────────────────────────────
    const H2 = 66; // bank section: always fixed (4 lines)

    const MB_H    = H1 + H2;
    const MB_BOT  = MB_Y + MB_H;
    const DIV_H1  = MB_Y + H1; // y of horizontal inner divider

    // Draw outer border
    doc.rect(ML, MB_Y, CR - ML, MB_H)
       .lineWidth(0.5).strokeColor(BORDER).stroke();

    // Vertical inner divider
    doc.moveTo(DIV_X, MB_Y).lineTo(DIV_X, MB_BOT)
       .lineWidth(0.5).strokeColor(BORDER).stroke();

    // Horizontal inner divider
    doc.moveTo(ML, DIV_H1).lineTo(CR, DIV_H1)
       .lineWidth(0.5).strokeColor(BORDER).stroke();

    // ── Draw Dodavatel content (left top) ────────────────────────────────
    {
      let y = MB_Y + 5;
      for (const line of lTopLines) {
        const fn = line.bold ? B : R;
        fn(line.size).fillColor(line.color)
          .text(line.text, COL_LX, y, { lineBreak: false });
        y += line.gap;
      }
    }

    // ── Draw Variabilní + Odběratel (right top) ──────────────────────────
    {
      let y = MB_Y + 5;
      const rw = COL_RW;

      const rRows = [
        { label: 'Variabilní symbol:', val: varSymbol },
        { label: 'Konstantní symbol:', val: '0308' },
        { label: 'Objednávka č.:', val2: 'ze dne:' },
      ];

      for (const row of rRows) {
        R(9).fillColor(DGRAY).text(row.label, COL_RX, y, { lineBreak: false });
        if (row.val) {
          R(9).fillColor(BLACK).text(row.val, COL_RX, y, { width: rw, align: 'right', lineBreak: false });
        } else if (row.val2) {
          R(9).fillColor(LGRAY).text(row.val2, COL_RX + 100, y, { lineBreak: false });
        }
        y += 13;
      }

      y += 5; // gap before Odběratel box

      // Odběratel sub-box
      const odbBoxH = rOdbH + 8;
      doc.rect(COL_RX - 4, y - 4, rw + 4, odbBoxH)
         .lineWidth(0.5).strokeColor(BORDER).stroke();

      R(8).fillColor(LGRAY).text('Odběratel:', COL_RX, y, { lineBreak: false });

      if (data.buyer?.ico) {
        R(8).fillColor(DGRAY).text('IČ:', COL_RX + 80, y, { lineBreak: false });
        R(9).fillColor(BLACK).text(data.buyer.ico, COL_RX, y, { width: rw, align: 'right', lineBreak: false });
      }
      y += 12;

      if (data.buyer?.dic) {
        R(8).fillColor(DGRAY).text('DIČ:', COL_RX, y, { lineBreak: false });
        R(9).fillColor(BLACK).text(data.buyer.dic, COL_RX, y, { width: rw, align: 'right', lineBreak: false });
        y += 11;
      }

      if (data.buyer?.name) {
        const nameW = COL_RW - 14;
        const nameH = Math.max(13, textHeight(doc, data.buyer.name, nameW, 10) + 4);
        B(10).fillColor(BLACK).text(data.buyer.name, COL_RX + 10, y, { width: nameW, lineBreak: true });
        y += nameH;
        if (data.buyer.address) { R(9.5).fillColor(BLACK).text(data.buyer.address, COL_RX + 10, y, { width: nameW, lineBreak: false }); y += 11; }
        if (data.buyer.city)    { R(9.5).fillColor(BLACK).text(data.buyer.city,    COL_RX + 10, y, { width: nameW, lineBreak: false }); y += 11; }
      } else {
        R(9).fillColor(LGRAY).text('—', COL_RX, y, { lineBreak: false }); y += 11;
      }
    }

    // ── Draw Banka (left bottom) ──────────────────────────────────────────
    {
      let y = DIV_H1 + 5;
      const bValX = COL_LX + 55;

      R(8).fillColor(LGRAY).text('Banka:',     COL_LX, y, { lineBreak: false });
      B(10.5).fillColor(BLACK).text(BANK.name,  bValX, y, { lineBreak: false }); y += 14;

      R(8).fillColor(LGRAY).text('SWIFT:',     COL_LX, y, { lineBreak: false });
      R(9).fillColor(BLACK).text(BANK.bic,      bValX, y, { lineBreak: false }); y += 12;

      R(8).fillColor(LGRAY).text('IBAN:',      COL_LX, y, { lineBreak: false });
      R(9).fillColor(BLACK).text(BANK.iban,     bValX, y, { lineBreak: false }); y += 12;

      R(8).fillColor(LGRAY).text('Číslo účtu:', COL_LX, y, { lineBreak: false });
      R(9).fillColor(BLACK).text(BANK.account,  bValX, y, { lineBreak: false });
      R(8).fillColor(LGRAY).text('Kód banky:',  bValX + 95, y, { lineBreak: false });
      R(9).fillColor(BLACK).text(BANK.code,     bValX + 160, y, { lineBreak: false });
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  3. DATES SECTION
    //  reference: y=263–318 | date values at x=249.6, "Konečný příjemce:" right
    // ═══════════════════════════════════════════════════════════════════════
    const S3_Y    = MB_BOT + 8;
    const DATE_LW = 150;  // label width
    const BOX_X   = ML + DATE_LW + 20;  // date value box x (≈198)
    const BOX_W   = 82;   // date value box width
    const BOX_H   = 14;   // date value box height

    let dy = S3_Y;

    R(9.5).fillColor(BLACK).text('Datum vystavení:',  ML, dy, { lineBreak: false });
    dateBox(BOX_X, dy, BOX_W, BOX_H, issueDateFmt, 9.5); dy += 14;

    R(9.5).fillColor(BLACK).text('Datum splatnosti:', ML, dy, { lineBreak: false });
    dateBox(BOX_X, dy, BOX_W, BOX_H, dueDateFmt, 9.5); dy += 15;

    R(9.5).fillColor(BLACK).text('Firma není plátce DPH.', ML, dy, { lineBreak: false }); dy += 14;

    R(9.5).fillColor(BLACK).text('Forma úhrady:', ML, dy, { lineBreak: false });
    B(9.5).fillColor(BLACK).text(payMethod, BOX_X - 20, dy, {
      width: BOX_W + 20, align: 'right', lineBreak: false,
    });

    // "Konečný příjemce:" in right column of dates
    R(8).fillColor(LGRAY).text('Konečný příjemce:', COL_RX, S3_Y, { lineBreak: false });

    const S3_BOT = dy + 14;
    hline(S3_BOT);

    // ═══════════════════════════════════════════════════════════════════════
    //  4. TABLE — DYNAMIC
    //  reference col positions: desc x=42.5 | qty x=322.6 | price x=422.8 | sleva x=457.7 | total x=513+
    // ═══════════════════════════════════════════════════════════════════════
    const TH = 16;  // table header height
    const TBL_Y = S3_BOT + 4;

    // Column positions (matched to reference bbox analysis)
    const TC = {
      desc:  { x: ML,    w: 273 },
      qty:   { x: 310,   w: 52  },
      price: { x: 362,   w: 90  },
      disc:  { x: 452,   w: 45  },
      total: { x: 497,   w: CR - 497 },  // ends at 567
    };

    // Header row background
    doc.rect(ML, TBL_Y, CR - ML, TH).fill(TBLBG);
    // Header row border
    doc.rect(ML, TBL_Y, CR - ML, TH).lineWidth(0.5).strokeColor(BORDER).stroke();

    // Header vertical separators
    for (const col of [TC.qty, TC.price, TC.disc, TC.total]) {
      doc.moveTo(col.x, TBL_Y).lineTo(col.x, TBL_Y + TH)
         .lineWidth(0.3).strokeColor(BORDER).stroke();
    }

    // Header labels
    B(8.5).fillColor(DGRAY);
    doc.text('Označení dodávky',    TC.desc.x + 4, TBL_Y + 4,  { lineBreak: false });
    doc.text('Množství',            TC.qty.x,       TBL_Y + 4,  { width: TC.qty.w,   align: 'right', lineBreak: false });
    doc.text('J.cena',              TC.price.x,     TBL_Y + 4,  { width: TC.price.w, align: 'right', lineBreak: false });
    doc.text('Sleva',               TC.disc.x,      TBL_Y + 4,  { width: TC.disc.w,  align: 'right', lineBreak: false });
    doc.text('Kč Celkem',           TC.total.x,     TBL_Y + 4,  { width: TC.total.w, align: 'right', lineBreak: false });

    // ── Dynamic item rows ─────────────────────────────────────────────────
    let rowY = TBL_Y + TH;
    const ROW_PAD   = 4;    // vertical padding inside row
    const ROW_MIN_H = 18;   // minimum row height
    const DESC_FONT = 9.5;

    for (const item of items) {
      // Calculate row height based on description length
      const descH  = textHeight(doc, item.description, TC.desc.w - 8, DESC_FONT);
      const rowH   = Math.max(ROW_MIN_H, descH + ROW_PAD * 2);

      // Row border
      doc.rect(ML, rowY, CR - ML, rowH).lineWidth(0.5).strokeColor(ROWBDR).stroke();

      // Row vertical separators
      for (const col of [TC.qty, TC.price, TC.disc, TC.total]) {
        doc.moveTo(col.x, rowY).lineTo(col.x, rowY + rowH)
           .lineWidth(0.3).strokeColor(ROWBDR).stroke();
      }

      const textY = rowY + ROW_PAD;

      // Description (wraps if long)
      R(DESC_FONT).fillColor(BLACK)
        .text(item.description, TC.desc.x + 4, textY, {
          width:     TC.desc.w - 8,
          lineBreak: true,
        });

      const qty   = item.quantity  ?? 1;
      const price = item.unitPrice ?? item.total;

      R(DESC_FONT).fillColor(BLACK)
        .text(String(qty), TC.qty.x, textY, { width: TC.qty.w, align: 'right', lineBreak: false });
      R(DESC_FONT).fillColor(BLACK)
        .text(fmtMoney(price, currency), TC.price.x, textY, { width: TC.price.w, align: 'right', lineBreak: false });
      R(DESC_FONT).fillColor(LGRAY)
        .text('—', TC.disc.x, textY, { width: TC.disc.w, align: 'right', lineBreak: false });
      B(DESC_FONT).fillColor(BLACK)
        .text(fmtMoney(item.total, currency), TC.total.x, textY, { width: TC.total.w, align: 'right', lineBreak: false });

      rowY += rowH;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  5. TOTALS — flow below table rows
    //  reference: Součet at y=403, CELKEM at y=428 (bold larger)
    // ═══════════════════════════════════════════════════════════════════════
    const totalAmount = items.reduce((s, i) => s + i.total, 0);
    let totY = rowY + 6;

    R(9.5).fillColor(DGRAY)
      .text('Součet položek', ML, totY, { lineBreak: false });
    R(9.5).fillColor(BLACK)
      .text(fmtMoney(totalAmount, currency), TC.total.x, totY, { width: TC.total.w, align: 'right', lineBreak: false });
    totY += 14;

    // Separator before CELKEM
    doc.moveTo(TC.price.x, totY - 2).lineTo(CR, totY - 2)
       .lineWidth(0.5).strokeColor(BORDER).stroke();

    B(11.5).fillColor(BLACK)
      .text('CELKEM K ÚHRADĚ', ML, totY, { lineBreak: false });
    B(11.5).fillColor(BLACK)
      .text(fmtMoney(totalAmount, currency), TC.total.x, totY, { width: TC.total.w, align: 'right', lineBreak: false });
    totY += 20;

    // Secondary foreign-currency reference (e.g. original EUR amount + rate)
    if (data.foreignNote) {
      R(8).fillColor(LGRAY)
        .text(data.foreignNote, ML, totY, { width: CR - ML, align: 'right', lineBreak: false });
      totY += 14;
    }

    hline(totY, BORDER, 0.5);
    totY += 10;

    // ═══════════════════════════════════════════════════════════════════════
    //  6. FLOW FOOTER — immediately after totals
    //  reference: "Nejsme plátci DPH" at y=448, "Vystavil:" at y=473
    // ═══════════════════════════════════════════════════════════════════════
    B(10.5).fillColor(BLUE)
      .text('Nejsme plátci DPH', ML, totY, { lineBreak: false });
    totY += 22;

    R(9.5).fillColor(BLACK)
      .text('Vystavil:', ML, totY, { lineBreak: false });
    doc.moveTo(ML, totY + 20).lineTo(ML + 100, totY + 20)
       .lineWidth(0.5).strokeColor(BORDER).stroke();

    // ═══════════════════════════════════════════════════════════════════════
    //  7. FIXED BOTTOM — legal text + signatures
    //  reference: legal y=607, signatures y=759, footer y=774
    //  These are pinned from top (reference used fixed coords)
    // ═══════════════════════════════════════════════════════════════════════
    const LEGAL_Y = 605;
    const SIG_Y   = 757;

    R(7.5).fillColor(LGRAY)
      .text(`Vedeno u ${SUPPLIER.court}`, ML, LEGAL_Y, { width: CR - ML, lineBreak: false });

    R(7.5).fillColor(LGRAY).text(
      'Dovolujeme si Vás upozornit, že v případě nedodržení data splatnosti uvedeného na faktuře ' +
      'Vám budeme účtovat úrok z prodlení v dohodnuté, resp. zákonné výši a smluvní pokutu ' +
      '(byla-li sjednána).',
      ML, LEGAL_Y + 13, { width: CR - ML }
    );

    // Převzal / Razítko signature lines (matched to reference: y=759)
    R(9).fillColor(BLACK);
    doc.text('Převzal:', ML + 110, SIG_Y, { lineBreak: false });
    doc.moveTo(ML + 110, SIG_Y + 18).lineTo(ML + 270, SIG_Y + 18)
       .lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.text('Razítko:', ML + 340, SIG_Y, { lineBreak: false });
    doc.moveTo(ML + 340, SIG_Y + 18).lineTo(ML + 500, SIG_Y + 18)
       .lineWidth(0.5).strokeColor(BORDER).stroke();

    // Bottom attribution (reference y=774)
    R(7).fillColor(LGRAY)
      .text('ALiSiO PMS – Kemp Carlsbad s.r.o.', ML, PH - 20, { width: CR - ML, align: 'center', lineBreak: false });

    doc.end();
  });
}
