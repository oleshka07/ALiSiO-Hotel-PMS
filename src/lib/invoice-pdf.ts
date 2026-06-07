/**
 * ALiSiO PMS — PDF Invoice Generator (PDFKit)
 *
 * Generates a Czech-law-compliant Faktura in PDF format using PDFKit.
 * Layout matches Kemp Carlsbad's POHODA-style invoice template.
 * Kemp Carlsbad s.r.o. is a NON-VAT payer (neplátce DPH).
 */
import PDFDocument from 'pdfkit';

const SUPPLIER = {
  name:    'Kemp Carlsbad s.r.o.',
  street:  'Chebská 38/5',
  city:    '360 06 Karlovy Vary',
  ico:     '23430567',
  dic:     'CZ23430567',
  phone:   '723 565 616',
  email:   'kemp-carlsbad@email.cz',
  court:   'Krajský soud v Plzni, oddíl C 46931',
};

const BANK = {
  name:    process.env.BANK_NAME    || 'Komerční banka, a.s.',
  account: process.env.BANK_ACCOUNT || '131-3569410227',
  code:    process.env.BANK_CODE    || '0100',
  iban:    process.env.BANK_IBAN    || 'CZ7001000001313569410227',
  bic:     process.env.BANK_BIC     || 'KOMBCZPP',
};

export interface InvoicePdfInput {
  invoiceNumber:   string;
  issueDate:       string;   // YYYY-MM-DD
  dueDate?:        string;   // YYYY-MM-DD
  paymentMethod?:  string;   // 'Příkazem' | 'Hotovost' | 'Kartou'
  description:     string;   // main line item description
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

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function fmtMoney(n: number, currency = 'CZK'): string {
  try {
    return new Intl.NumberFormat('cs-CZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) + (currency === 'CZK' ? ' Kč' : ` ${currency}`);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Returns a Buffer containing the generated PDF */
export async function generateInvoicePdf(data: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size:    'A4',
      margins: { top: 36, bottom: 36, left: 50, right: 50 },
      info: {
        Title:   `Faktura ${data.invoiceNumber}`,
        Author:  SUPPLIER.name,
        Subject: 'Faktura – krátkodobé ubytování',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W  = doc.page.width  - doc.page.margins.left - doc.page.margins.right; // ~495
    const L  = doc.page.margins.left;   // 50
    const R  = doc.page.margins.right;  // 50
    const currency = data.currency || 'CZK';
    const variableSymbol = data.invoiceNumber.replace(/-/g, '');

    // ─── HEADER BAR ────────────────────────────────────────────────
    doc.rect(L - 10, 20, doc.page.width - 20, 50).fill('#1a1d2e');

    doc.fillColor('#fff')
       .font('Helvetica-Bold')
       .fontSize(18)
       .text(SUPPLIER.name, L, 32, { width: W / 2, align: 'left' });

    doc.fontSize(11)
       .text(`FAKTURA č. ${data.invoiceNumber}`, L + W / 2, 32, { width: W / 2, align: 'right' });

    doc.fillColor('#6ee7b7').fontSize(9)
       .text(`Variabilní symbol: ${variableSymbol}`, L + W / 2, 47, { width: W / 2, align: 'right' });

    // ─── TWO-COLUMN BLOCK (Dodavatel / Odběratel) ──────────────────
    const colW   = W / 2 - 10;
    const colR   = L + W / 2 + 10;
    let   rowY   = 82;

    // Dodavatel label
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7)
       .text('Dodavatel:', L, rowY);
    // Odběratel label
    doc.text('Odběratel:', colR, rowY);

    rowY += 11;
    // Dodavatel content
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
       .text(SUPPLIER.name, L, rowY);
    // Odběratel name
    if (data.buyer?.name) {
      doc.text(data.buyer.name, colR, rowY);
    }

    rowY += 13;
    doc.font('Helvetica').fontSize(8.5).fillColor('#374151');
    const supLines = [
      SUPPLIER.street,
      SUPPLIER.city,
      `IČO: ${SUPPLIER.ico}`,
      `DIČ: ${SUPPLIER.dic}`,
      `Mobil: ${SUPPLIER.phone}`,
      `E-mail: ${SUPPLIER.email}`,
    ];
    supLines.forEach(line => {
      doc.text(line, L, rowY);
      rowY += 11;
    });

    // Odběratel lines (right col)
    let buyerY = rowY - supLines.length * 11;
    if (data.buyer) {
      const buyerLines: string[] = [];
      if (data.buyer.address) buyerLines.push(data.buyer.address);
      if (data.buyer.city)    buyerLines.push(data.buyer.city);
      if (data.buyer.country) buyerLines.push(data.buyer.country);
      if (data.buyer.ico)     buyerLines.push(`IČO: ${data.buyer.ico}`);
      if (data.buyer.dic)     buyerLines.push(`DIČ: ${data.buyer.dic}`);
      buyerLines.forEach(line => {
        doc.fillColor('#374151').font('Helvetica').fontSize(8.5)
           .text(line, colR, buyerY);
        buyerY += 11;
      });
    } else {
      doc.fillColor('#9ca3af').font('Helvetica-Oblique').fontSize(8.5)
         .text('—', colR, buyerY);
    }

    // ─── BANK + DATES ──────────────────────────────────────────────
    const lineY = Math.max(rowY, buyerY) + 6;
    doc.moveTo(L, lineY).lineTo(L + W, lineY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

    const bankY = lineY + 8;
    // Bank block (left)
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7).text('Banka:', L, bankY);
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8.5)
       .text(BANK.name, L, bankY + 10);
    doc.font('Helvetica').fontSize(8).fillColor('#374151');
    doc.text(`Číslo účtu: ${BANK.account}   Kód banky: ${BANK.code}`, L, bankY + 22);
    doc.text(`IBAN: ${BANK.iban}`, L, bankY + 33);
    doc.text(`SWIFT/BIC: ${BANK.bic}`, L, bankY + 44);

    // Dates block (right)
    const datesX = colR;
    const dateFields: [string, string][] = [
      ['Datum vystavení:',  fmtDate(data.issueDate)],
      ['Datum splatnosti:', fmtDate(data.dueDate || data.issueDate)],
      ['Forma úhrady:',     data.paymentMethod || 'Příkazem'],
      ['Konst. symbol:',    '0308'],
    ];
    let df = bankY;
    dateFields.forEach(([label, val]) => {
      doc.fillColor('#6b7280').font('Helvetica').fontSize(7.5).text(label, datesX, df);
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8.5)
         .text(val, datesX + 90, df);
      df += 14;
    });

    // "Firma neni platce DPH"
    doc.fillColor('#6b7280').font('Helvetica-Oblique').fontSize(7.5)
       .text('Firma není plátce DPH.', L, bankY + 56);

    // ─── LINE ITEMS TABLE ──────────────────────────────────────────
    const tableTop = bankY + 72;
    const COL = {
      desc:  { x: L,          w: 240 },
      qty:   { x: L + 240,    w: 40  },
      price: { x: L + 280,    w: 85  },
      disc:  { x: L + 365,    w: 55  },
      total: { x: L + 420,    w: 75  },
    };

    // Table header bg
    doc.rect(L - 4, tableTop - 4, W + 8, 18).fill('#f3f4f6');
    doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(7.5);
    doc.text('Označení dodávky',     COL.desc.x,  tableTop);
    doc.text('Mn.',                  COL.qty.x,   tableTop);
    doc.text('J.cena',               COL.price.x, tableTop, { width: COL.price.w, align: 'right' });
    doc.text('Sleva Kč',             COL.disc.x,  tableTop, { width: COL.disc.w,  align: 'right' });
    doc.text('Celkem',               COL.total.x, tableTop, { width: COL.total.w, align: 'right' });

    // Main row
    const rowTop = tableTop + 20;
    doc.fillColor('#111827').font('Helvetica').fontSize(9);
    doc.text(data.description, COL.desc.x, rowTop, { width: COL.desc.w });
    doc.text('1',              COL.qty.x,  rowTop);
    doc.font('Helvetica-Bold')
       .text(fmtMoney(data.amount, currency), COL.price.x, rowTop, { width: COL.price.w, align: 'right' });
    doc.font('Helvetica')
       .text('—',             COL.disc.x,  rowTop, { width: COL.disc.w,  align: 'right' });
    doc.font('Helvetica-Bold')
       .text(fmtMoney(data.amount, currency), COL.total.x, rowTop, { width: COL.total.w, align: 'right' });

    // Divider after rows
    const afterRows = rowTop + 22;
    doc.moveTo(L, afterRows).lineTo(L + W, afterRows).strokeColor('#d1d5db').lineWidth(0.5).stroke();

    // ─── TOTALS ────────────────────────────────────────────────────
    let totY = afterRows + 8;
    const totLabelX = COL.price.x;
    const totValX   = COL.total.x;
    const totW      = COL.total.w;

    const totals: [string, string, boolean][] = [
      ['Součet položek:',   fmtMoney(data.amount, currency),  false],
      ['Celkem sleva:',     '—',                               false],
    ];
    totals.forEach(([lbl, val, bold]) => {
      doc.fillColor('#6b7280').font('Helvetica').fontSize(8).text(lbl, totLabelX, totY, { width: 130, align: 'right' });
      doc.fillColor('#374151').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
         .text(val, totValX, totY, { width: totW, align: 'right' });
      totY += 13;
    });

    // CELKEM K UHRADE — big total
    totY += 4;
    doc.rect(totLabelX - 6, totY - 4, W - (totLabelX - L) + 6, 24).fill('#1a1d2e');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
       .text('CELKEM K ÚHRADĚ:', totLabelX, totY, { width: 130, align: 'right' });
    doc.fillColor('#6ee7b7').fontSize(11)
       .text(fmtMoney(data.amount, currency), totValX, totY, { width: totW, align: 'right' });

    totY += 30;

    // ─── FOOTER ────────────────────────────────────────────────────
    doc.fillColor('#9ca3af').font('Helvetica-Oblique').fontSize(8)
       .text('Nejsme plátci DPH', L, totY);

    totY += 14;
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7.5)
       .text(
         `Vedeno u ${SUPPLIER.court}`,
         L, totY, { width: W }
       );

    totY += 12;
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7.5)
       .text(
         'Dovolujeme si Vás upozornit, že v případě nedodržení data splatnosti Vám budeme účtovat úrok z prodlení ' +
         'v dohodnuté, resp. zákonné výši a smluvní pokutu (byla-li sjednána).',
         L, totY, { width: W }
       );

    totY += 30;
    // Sign fields
    const signFields = [
      { label: 'Vystavil:', x: L         },
      { label: 'Razítko:',  x: L + W/2 - 60 },
      { label: 'Převzal:',  x: L + W - 100  },
    ];
    signFields.forEach(f => {
      doc.fillColor('#9ca3af').font('Helvetica').fontSize(7.5)
         .text(f.label, f.x, totY);
      doc.moveTo(f.x, totY + 22).lineTo(f.x + 90, totY + 22)
         .strokeColor('#d1d5db').lineWidth(0.5).stroke();
    });

    // Page bottom strip
    const pageH = doc.page.height;
    doc.rect(0, pageH - 22, doc.page.width, 22).fill('#f9fafb');
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(6.5)
       .text(
         `${SUPPLIER.name}  ·  ${SUPPLIER.street}, ${SUPPLIER.city}  ·  IČO: ${SUPPLIER.ico}  ·  ${SUPPLIER.email}`,
         L, pageH - 14, { width: W, align: 'center' }
       );

    doc.end();
  });
}
