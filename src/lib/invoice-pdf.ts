/**
 * ALiSiO PMS — PDF Invoice Generator (PDFKit)
 *
 * Layout is pixel-perfect matched to POHODA "Faktura_260100002.pdf".
 * Coordinates derived from pdftotext -bbox analysis of the reference file.
 * Page: A4 (595.28 × 841.89 pts).
 *
 * Kemp Carlsbad s.r.o. — neplátce DPH (0 % VAT).
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
    try { if (fs.existsSync(p)) { console.log(`[InvoicePDF] font (${name}): ${p}`); return p; } }
    catch { /* ignore */ }
  }
  console.warn(`[InvoicePDF] ⚠ Font not found for "${name}"`);
  return '';
}

const FONT_REG  = resolveFont('regular');
const FONT_BOLD = resolveFont('bold');

// ─── Page geometry (from bbox analysis of reference PDF) ─────────────────────
const PW = 595.28;          // A4 width
const PH = 841.89;          // A4 height
const ML = 28;              // left margin
const MR = 28;              // right margin (content ends at 567.28)
const CW = PW - ML - MR;   // content width = 539.28

// Column layout (matches reference: right col starts at x=326)
const COL_L_W  = 288;                // Dodavatel box width
const COL_GAP  = 10;
const COL_R_X  = ML + COL_L_W + COL_GAP;  // = 326
const COL_R_W  = PW - MR - COL_R_X;       // = 241.28

// Colors
const C_BLUE   = '#1565c0';   // FAKTURA heading, IČ/DIČ, Nejsme plátci
const C_BLACK  = '#1a1a1a';   // main text
const C_GRAY   = '#666666';   // labels
const C_LGRAY  = '#999999';   // light labels
const C_BORDER = '#aaaaaa';   // box borders
const C_TBLHDR = '#efefef';   // table header background

// ─── Business constants ───────────────────────────────────────────────────────
const SUPPLIER = {
  name:   'Kemp Carlsbad s.r.o.',
  street: 'Chebská 38/5',
  city:   '360 06 Karlovy Vary',
  ico:    '23430567',
  dic:    'CZ23430567',
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

// ─── Public interface ─────────────────────────────────────────────────────────
export interface InvoicePdfInput {
  invoiceNumber:  string;
  issueDate:      string;    // YYYY-MM-DD
  dueDate?:       string;    // YYYY-MM-DD
  paymentMethod?: string;
  description:    string;
  amount:         number;
  currency?:      string;
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
  const formatted = new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  const sign = n < 0 ? '-' : '';
  return currency === 'CZK' ? `${sign}${formatted}` : `${sign}${formatted} ${currency}`;
}

// ─── PDF builder ──────────────────────────────────────────────────────────────
export async function generateInvoicePdf(data: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const currency    = data.currency    || 'CZK';
    const payMethod   = data.paymentMethod || 'Příkazem';
    const varSymbol   = data.invoiceNumber.replace(/-/g, '');
    const issueDateFmt = fmtDate(data.issueDate);
    const dueDateFmt   = fmtDate(data.dueDate || data.issueDate);

    const doc = new PDFDocument({
      size: [PW, PH],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      info: {
        Title:   `Faktura ${data.invoiceNumber}`,
        Author:  SUPPLIER.name,
        Creator: 'ALiSiO PMS',
        Subject: 'Faktura – daňový doklad',
      },
    });

    if (FONT_REG)  doc.registerFont('Reg',  FONT_REG);
    if (FONT_BOLD) doc.registerFont('Bold', FONT_BOLD);

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Shorthand setters (return doc for chaining)
    const reg  = (sz: number) => { if (FONT_REG)  doc.font('Reg');  else doc.font('Helvetica');      doc.fontSize(sz); return doc; };
    const bold = (sz: number) => { if (FONT_BOLD) doc.font('Bold'); else doc.font('Helvetica-Bold'); doc.fontSize(sz); return doc; };

    // ═══════════════════════════════════════════════════════════════════════
    //  1. HEADER  (y ≈ 25–46)
    // ═══════════════════════════════════════════════════════════════════════
    const HDR_Y = 25;

    // Company name — left, 13 pt bold black
    bold(13).fillColor(C_BLACK)
      .text(SUPPLIER.name, ML, HDR_Y, { lineBreak: false });

    // FAKTURA label — right, 13 pt bold blue
    const invLabel = `FAKTURA č. ${data.invoiceNumber}`;
    bold(13).fillColor(C_BLUE)
      .text(invLabel, ML, HDR_Y, { align: 'right', width: CW, lineBreak: false });

    // Horizontal rule under header
    const HDR_LINE_Y = 47;
    doc.moveTo(ML, HDR_LINE_Y).lineTo(PW - MR, HDR_LINE_Y)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    // ═══════════════════════════════════════════════════════════════════════
    //  2. DODAVATEL (left box) + VARIABILNÍ / ODBĚRATEL (right)
    //     Reference: y=50–170
    // ═══════════════════════════════════════════════════════════════════════
    const S1_Y     = 50;
    const S1_H     = 125;   // box height

    // Left bordered box — Dodavatel
    doc.rect(ML, S1_Y, COL_L_W, S1_H)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    let lx = ML + 6;
    let ly = S1_Y + 5;

    reg(8).fillColor(C_LGRAY).text('Dodavatel:', lx, ly, { lineBreak: false });
    ly += 12;

    bold(10).fillColor(C_BLACK).text(SUPPLIER.name, lx, ly, { lineBreak: false });
    ly += 13;

    reg(9.5).fillColor(C_BLACK)
      .text(SUPPLIER.street, lx, ly, { lineBreak: false }); ly += 12;
    reg(9.5).text(SUPPLIER.city,   lx, ly, { lineBreak: false }); ly += 18;

    // IČ / DIČ in blue
    reg(9).fillColor(C_BLUE)
      .text(`IČ: ${SUPPLIER.ico}`,  lx, ly, { lineBreak: false }); ly += 12;
    reg(9).fillColor(C_BLUE)
      .text(`DIČ: ${SUPPLIER.dic}`, lx, ly, { lineBreak: false }); ly += 12;

    reg(9).fillColor(C_BLACK)
      .text(`Mobil: ${SUPPLIER.phone}`, lx, ly, { lineBreak: false }); ly += 12;
    reg(9).fillColor(C_BLACK)
      .text(`E-mail: ${SUPPLIER.email}`, lx, ly, { lineBreak: false });

    // Right column — Variabilní symbol, Konstantní symbol, Objednávka
    const rx = COL_R_X;
    const rw = COL_R_W;
    const VAL_RIGHT = PW - MR;   // right edge for right-aligned values

    let ry = S1_Y + 5;

    reg(9).fillColor(C_GRAY).text('Variabilní symbol:', rx, ry, { lineBreak: false });
    bold(9).fillColor(C_BLACK)
      .text(varSymbol, rx, ry, { width: rw, align: 'right', lineBreak: false });
    ry += 13;

    reg(9).fillColor(C_GRAY).text('Konstantní symbol:', rx, ry, { lineBreak: false });
    bold(9).fillColor(C_BLACK)
      .text('0308', rx, ry, { width: rw, align: 'right', lineBreak: false });
    ry += 13;

    reg(9).fillColor(C_GRAY).text('Objednávka č.:', rx, ry, { lineBreak: false });
    reg(9).fillColor(C_LGRAY).text('ze dne:', rx + 100, ry, { lineBreak: false });
    ry += 18;

    // Odběratel sub-box (within right column)
    const ODB_Y = S1_Y + ry - S1_Y - 5;
    const ODB_H = S1_H - (ry - S1_Y) + 4;

    doc.rect(rx, ry - 4, rw, ODB_H)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    reg(8).fillColor(C_LGRAY).text('Odběratel:', rx + 4, ry, { lineBreak: false });

    if (data.buyer?.ico) {
      reg(8).fillColor(C_GRAY).text('IČ:', rx + 100, ry, { lineBreak: false });
      reg(9).fillColor(C_BLACK)
        .text(data.buyer.ico, rx + 4, ry, { width: rw - 4, align: 'right', lineBreak: false });
    }
    ry += 12;

    if (data.buyer?.dic) {
      reg(8).fillColor(C_GRAY).text('DIČ:', rx + 4, ry, { lineBreak: false });
      reg(9).fillColor(C_BLACK)
        .text(data.buyer.dic, rx + 4, ry, { width: rw - 4, align: 'right', lineBreak: false });
      ry += 12;
    }
    if (data.buyer?.name) {
      bold(10).fillColor(C_BLACK).text(data.buyer.name, rx + 14, ry, { lineBreak: false }); ry += 13;
      if (data.buyer.address) { reg(9.5).fillColor(C_BLACK).text(data.buyer.address, rx + 14, ry, { lineBreak: false }); ry += 12; }
      if (data.buyer.city)    { reg(9.5).fillColor(C_BLACK).text(data.buyer.city,    rx + 14, ry, { lineBreak: false }); ry += 12; }
    }

    // Horizontal rule after section 1
    const S1_BOTTOM = S1_Y + S1_H;
    doc.moveTo(ML, S1_BOTTOM).lineTo(PW - MR, S1_BOTTOM)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    // ═══════════════════════════════════════════════════════════════════════
    //  3. BANK (left box) + KONEČNÝ PŘÍJEMCE (right)
    //     Reference: y=185–243
    // ═══════════════════════════════════════════════════════════════════════
    const S2_Y = S1_BOTTOM + 5;
    const S2_H = 60;

    doc.rect(ML, S2_Y, COL_L_W, S2_H)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    const bx = ML + 6;
    let   by = S2_Y + 5;
    const bValX = ML + 60;   // value column start (matching reference ~x=98)

    reg(8).fillColor(C_LGRAY).text('Banka:',      bx, by, { lineBreak: false });
    bold(10).fillColor(C_BLACK).text(BANK.name,   bValX, by, { lineBreak: false }); by += 13;

    reg(8).fillColor(C_LGRAY).text('SWIFT/BIC:',  bx, by, { lineBreak: false });
    reg(9).fillColor(C_BLACK).text(BANK.bic,      bValX, by, { lineBreak: false }); by += 12;

    reg(8).fillColor(C_LGRAY).text('IBAN:',       bx, by, { lineBreak: false });
    reg(9).fillColor(C_BLACK).text(BANK.iban,     bValX, by, { lineBreak: false }); by += 12;

    reg(8).fillColor(C_LGRAY).text('Číslo účtu:', bx, by, { lineBreak: false });
    reg(9).fillColor(C_BLACK).text(BANK.account,  bValX, by, { lineBreak: false });
    reg(8).fillColor(C_LGRAY).text('Kód banky:',  bValX + 90, by, { lineBreak: false });
    reg(9).fillColor(C_BLACK).text(BANK.code,     bValX + 155, by, { lineBreak: false });

    // Right column — Konečný příjemce
    reg(8).fillColor(C_LGRAY).text('Konečný příjemce:', COL_R_X, S2_Y + 5, { lineBreak: false });

    // Horizontal rule after section 2
    const S2_BOTTOM = S2_Y + S2_H;
    doc.moveTo(ML, S2_BOTTOM).lineTo(PW - MR, S2_BOTTOM)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    // ═══════════════════════════════════════════════════════════════════════
    //  4. DATES + FORMA ÚHRADY
    //     Reference: y=263–318
    // ═══════════════════════════════════════════════════════════════════════
    const S3_Y   = S2_BOTTOM + 10;
    const LBL_W  = 110;               // label column width
    const VAL_X  = ML + LBL_W + 10;  // value x ≈ 148 (reference: 249 but left of mid)
    // In reference the date values are at x=249.6 — about mid-page
    const DATE_VAL_X = ML + 210;     // date value start (matches reference ~249)
    const DATE_VAL_W = 85;           // width of date box

    let dy = S3_Y;

    // Datum vystavení
    reg(9.5).fillColor(C_BLACK).text('Datum vystavení:', ML, dy, { lineBreak: false });
    // Boxed date value
    doc.rect(DATE_VAL_X - 2, dy - 2, DATE_VAL_W, 14)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();
    bold(9.5).fillColor(C_BLACK)
      .text(issueDateFmt, DATE_VAL_X, dy, { width: DATE_VAL_W - 4, align: 'right', lineBreak: false });
    dy += 14;

    // Datum splatnosti
    reg(9.5).fillColor(C_BLACK).text('Datum splatnosti:', ML, dy, { lineBreak: false });
    doc.rect(DATE_VAL_X - 2, dy - 2, DATE_VAL_W, 14)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();
    bold(9.5).fillColor(C_BLACK)
      .text(dueDateFmt, DATE_VAL_X, dy, { width: DATE_VAL_W - 4, align: 'right', lineBreak: false });
    dy += 16;

    // Firma není plátce DPH
    reg(9.5).fillColor(C_BLACK).text('Firma není plátce DPH.', ML, dy, { lineBreak: false });
    dy += 16;

    // Forma úhrady
    reg(9.5).fillColor(C_BLACK).text('Forma úhrady:', ML, dy, { lineBreak: false });
    bold(9.5).fillColor(C_BLACK)
      .text(payMethod, ML, dy, { width: DATE_VAL_X + DATE_VAL_W - ML, align: 'right', lineBreak: false });

    // Horizontal rule after dates
    const S3_BOTTOM = dy + 18;
    doc.moveTo(ML, S3_BOTTOM).lineTo(PW - MR, S3_BOTTOM)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    // ═══════════════════════════════════════════════════════════════════════
    //  5. TABLE
    //     Reference header: y=327.6
    //     Columns: desc x=42.5 | qty x=322.6 | J.cena x=422.8 | Sleva x=457.7 | Kč Celkem x=513-540
    // ═══════════════════════════════════════════════════════════════════════
    const TBL_Y = S3_BOTTOM + 5;
    const TBL_H = 18;   // header row height

    // Column x positions (absolute, matching reference)
    const TC = {
      desc:  { x: ML,    w: 270 },          // x=28, ends ~298
      qty:   { x: 305,   w: 50  },          // x=305, ends ~355 (ref: 322)
      price: { x: 358,   w: 90  },          // x=358, ends ~448 (ref: 422)
      disc:  { x: 450,   w: 50  },          // x=450, ends ~500 (ref: 457)
      total: { x: 500,   w: PW - MR - 500 },// x=500, ends ~567 (ref: 513–540)
    };

    // Header background
    doc.rect(ML, TBL_Y, CW, TBL_H).fill(C_TBLHDR);
    // Header border
    doc.rect(ML, TBL_Y, CW, TBL_H).lineWidth(0.5).strokeColor(C_BORDER).stroke();

    // Vertical separators in header
    for (const cx of [TC.qty.x, TC.price.x, TC.disc.x, TC.total.x]) {
      doc.moveTo(cx, TBL_Y).lineTo(cx, TBL_Y + TBL_H)
         .lineWidth(0.3).strokeColor(C_BORDER).stroke();
    }

    // Header labels
    bold(8.5).fillColor(C_GRAY);
    doc.text('Označení dodávky', TC.desc.x + 4,  TBL_Y + 5, { lineBreak: false });
    doc.text('Množství',         TC.qty.x,        TBL_Y + 5, { width: TC.qty.w,   align: 'right', lineBreak: false });
    doc.text('J.cena',           TC.price.x,      TBL_Y + 5, { width: TC.price.w, align: 'right', lineBreak: false });
    doc.text('Sleva',            TC.disc.x,       TBL_Y + 5, { width: TC.disc.w,  align: 'right', lineBreak: false });
    bold(8.5).fillColor(C_GRAY)
      .text('Kč Celkem',         TC.total.x,      TBL_Y + 5, { width: TC.total.w, align: 'right', lineBreak: false });

    // Data row
    const ROW_Y = TBL_Y + TBL_H;
    const ROW_H = 18;

    doc.rect(ML, ROW_Y, CW, ROW_H).lineWidth(0.5).strokeColor('#dddddd').stroke();

    // Vertical separators in data row
    for (const cx of [TC.qty.x, TC.price.x, TC.disc.x, TC.total.x]) {
      doc.moveTo(cx, ROW_Y).lineTo(cx, ROW_Y + ROW_H)
         .lineWidth(0.3).strokeColor('#dddddd').stroke();
    }

    reg(9.5).fillColor(C_BLACK)
      .text(data.description, TC.desc.x + 4, ROW_Y + 4, { width: TC.desc.w - 8, lineBreak: false });
    reg(9.5).fillColor(C_BLACK)
      .text('1', TC.qty.x, ROW_Y + 4, { width: TC.qty.w, align: 'right', lineBreak: false });
    bold(9.5).fillColor(C_BLACK)
      .text(fmtMoney(data.amount, currency), TC.price.x, ROW_Y + 4, { width: TC.price.w, align: 'right', lineBreak: false });
    reg(9.5).fillColor(C_LGRAY)
      .text('—', TC.disc.x, ROW_Y + 4, { width: TC.disc.w, align: 'right', lineBreak: false });
    bold(9.5).fillColor(C_BLACK)
      .text(fmtMoney(data.amount, currency), TC.total.x, ROW_Y + 4, { width: TC.total.w, align: 'right', lineBreak: false });

    // ═══════════════════════════════════════════════════════════════════════
    //  6. TOTALS
    //     Reference: Součet položek y=403, CELKEM y=428
    //     Amounts right-align to ~x=540 (with right edge at 567)
    // ═══════════════════════════════════════════════════════════════════════
    const TOT_Y      = ROW_Y + ROW_H + 8;
    const TOT_LBL_X  = ML;              // label starts at left margin
    const TOT_AMT_X  = TC.total.x;      // amount column
    const TOT_AMT_W  = TC.total.w;

    // Součet položek
    reg(9).fillColor(C_GRAY).text('Součet položek', TOT_LBL_X, TOT_Y, { lineBreak: false });
    reg(9).fillColor(C_BLACK)
      .text(fmtMoney(data.amount, currency), TOT_AMT_X, TOT_Y, { width: TOT_AMT_W, align: 'right', lineBreak: false });

    // Separator line
    const CELKEM_Y = TOT_Y + 24;
    doc.moveTo(TC.price.x, CELKEM_Y - 4).lineTo(PW - MR, CELKEM_Y - 4)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    // CELKEM K ÚHRADĚ — bold, larger
    bold(11).fillColor(C_BLACK)
      .text('CELKEM K ÚHRADĚ', TOT_LBL_X, CELKEM_Y, { lineBreak: false });
    bold(11).fillColor(C_BLACK)
      .text(fmtMoney(data.amount, currency), TOT_AMT_X, CELKEM_Y, { width: TOT_AMT_W, align: 'right', lineBreak: false });

    // Separator line after CELKEM
    const FOOTER_TOP = CELKEM_Y + 20;
    doc.moveTo(ML, FOOTER_TOP).lineTo(PW - MR, FOOTER_TOP)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    // ═══════════════════════════════════════════════════════════════════════
    //  7. FOOTER — "Nejsme plátci DPH" + Vystavil
    // ═══════════════════════════════════════════════════════════════════════
    let fy = FOOTER_TOP + 10;

    bold(10).fillColor(C_BLUE)
      .text('Nejsme plátci DPH', ML, fy, { lineBreak: false });
    fy += 22;

    reg(9.5).fillColor(C_BLACK)
      .text('Vystavil:', ML, fy, { lineBreak: false });
    // Signature line
    doc.moveTo(ML, fy + 20).lineTo(ML + 100, fy + 20)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    // ═══════════════════════════════════════════════════════════════════════
    //  8. LEGAL NOTICE + SIGNATURE BLOCK (bottom)
    //     Reference: legal text y=607, Převzal/Razítko y=759
    // ═══════════════════════════════════════════════════════════════════════
    const LEGAL_Y = 605;

    reg(7.5).fillColor(C_GRAY)
      .text(`Vedeno u ${SUPPLIER.court}`, ML, LEGAL_Y, { width: CW, lineBreak: false });

    reg(7.5).fillColor(C_GRAY).text(
      'Dovolujeme si Vás upozornit, že v případě nedodržení data splatnosti uvedeného na faktuře ' +
      'Vám budeme účtovat úrok z prodlení v dohodnuté, resp. zákonné výši a smluvní pokutu (byla-li sjednána).',
      ML, LEGAL_Y + 14, { width: CW }
    );

    // Signature block (Převzal / Razítko)
    const SIG_Y = 757;
    reg(9).fillColor(C_BLACK);

    doc.text('Převzal:', ML + 110, SIG_Y, { lineBreak: false });
    doc.moveTo(ML + 110, SIG_Y + 18).lineTo(ML + 250, SIG_Y + 18)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    doc.text('Razítko:', ML + 330, SIG_Y, { lineBreak: false });
    doc.moveTo(ML + 330, SIG_Y + 18).lineTo(ML + 470, SIG_Y + 18)
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();

    // Bottom note
    reg(7).fillColor(C_LGRAY)
      .text('ALiSiO PMS — Kemp Carlsbad s.r.o.', ML, PH - 20, { width: CW, align: 'center', lineBreak: false });

    doc.end();
  });
}
