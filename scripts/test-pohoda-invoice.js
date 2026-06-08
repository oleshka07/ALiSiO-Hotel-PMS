/**
 * Test the POHODA-exact invoice PDF generator
 * Run: node scripts/test-pohoda-invoice.js
 */
const PDFDocument = require('pdfkit');
const path        = require('path');
const fs          = require('fs');

// ─── Font resolution ────────────────────────────────────────────────────────
function resolveFont(name) {
  const filename = name === 'bold' ? 'DejaVuSans-Bold.ttf' : 'DejaVuSans.ttf';
  const candidates = [
    path.join(process.cwd(), 'src', 'assets', 'fonts', filename),
    '/usr/share/fonts/truetype/dejavu/' + filename,
    '/root/projects/alisio-pms/src/assets/fonts/' + filename,
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) { console.log(`font (${name}): ${p}`); return p; }
  }
  return null;
}

const FONT_REG  = resolveFont('regular');
const FONT_BOLD = resolveFont('bold');
if (!FONT_REG) { console.error('NO FONT!'); process.exit(1); }

// ─── Page geometry ──────────────────────────────────────────────────────────
const PW=595.28, PH=841.89, ML=28, MR=28, CW=PW-ML-MR;
const COL_L_W=288, COL_GAP=10, COL_R_X=ML+COL_L_W+COL_GAP, COL_R_W=PW-MR-COL_R_X;
const C_BLUE='#1565c0', C_BLACK='#1a1a1a', C_GRAY='#666666', C_LGRAY='#999999';
const C_BORDER='#aaaaaa', C_TBLHDR='#efefef';

const SUPPLIER = {
  name:'Kemp Carlsbad s.r.o.', street:'Chebská 38/5', city:'360 06 Karlovy Vary',
  ico:'23430567', dic:'CZ23430567', phone:'723565616', email:'kemp-carlsbad@email.cz',
  court:'Krajského soudu v Plzni, oddíl C 46931',
};
const BANK = {
  name:'Komerční banka', account:'131-3569410227', code:'0100',
  iban:'CZ7001000001313569410227', bic:'KOMBCZPP',
};

const doc = new PDFDocument({ size:[PW,PH], margins:{top:0,bottom:0,left:0,right:0} });
doc.registerFont('Reg', FONT_REG);
if (FONT_BOLD) doc.registerFont('Bold', FONT_BOLD);

const out = fs.createWriteStream('/tmp/pohoda-test.pdf');
doc.pipe(out);

const reg  = sz => { doc.font('Reg');  doc.fontSize(sz); return doc; };
const bold = sz => { doc.font('Bold'); doc.fontSize(sz); return doc; };

// 1. HEADER
const HDR_Y = 25;
bold(13).fillColor(C_BLACK).text('Kemp Carlsbad s.r.o.', ML, HDR_Y, { lineBreak: false });
bold(13).fillColor(C_BLUE).text('FAKTURA č. 2026-099', ML, HDR_Y, { align:'right', width:CW, lineBreak:false });
doc.moveTo(ML, 47).lineTo(PW-MR, 47).lineWidth(0.5).strokeColor(C_BORDER).stroke();

// 2. DODAVATEL box (left)
const S1_Y=50, S1_H=125;
doc.rect(ML, S1_Y, COL_L_W, S1_H).lineWidth(0.5).strokeColor(C_BORDER).stroke();
let lx=ML+6, ly=S1_Y+5;
reg(8).fillColor(C_LGRAY).text('Dodavatel:', lx, ly, {lineBreak:false}); ly+=12;
bold(10).fillColor(C_BLACK).text(SUPPLIER.name, lx, ly, {lineBreak:false}); ly+=13;
reg(9.5).fillColor(C_BLACK).text(SUPPLIER.street, lx, ly, {lineBreak:false}); ly+=12;
reg(9.5).text(SUPPLIER.city, lx, ly, {lineBreak:false}); ly+=18;
reg(9).fillColor(C_BLUE).text('IČ: '+SUPPLIER.ico, lx, ly, {lineBreak:false}); ly+=12;
reg(9).fillColor(C_BLUE).text('DIČ: '+SUPPLIER.dic, lx, ly, {lineBreak:false}); ly+=12;
reg(9).fillColor(C_BLACK).text('Mobil: '+SUPPLIER.phone, lx, ly, {lineBreak:false}); ly+=12;
reg(9).fillColor(C_BLACK).text('E-mail: '+SUPPLIER.email, lx, ly, {lineBreak:false});

// Right column — Variabilní etc.
let ry = S1_Y+5, rx = COL_R_X, rw = COL_R_W;
reg(9).fillColor(C_GRAY).text('Variabilní symbol:', rx, ry, {lineBreak:false});
bold(9).fillColor(C_BLACK).text('2026099', rx, ry, {width:rw, align:'right', lineBreak:false}); ry+=13;
reg(9).fillColor(C_GRAY).text('Konstantní symbol:', rx, ry, {lineBreak:false});
bold(9).fillColor(C_BLACK).text('0308', rx, ry, {width:rw, align:'right', lineBreak:false}); ry+=13;
reg(9).fillColor(C_GRAY).text('Objednávka č.:', rx, ry, {lineBreak:false});
reg(9).fillColor(C_LGRAY).text('ze dne:', rx+100, ry, {lineBreak:false}); ry+=18;
const ODB_H = S1_H - (ry-S1_Y) + 4;
doc.rect(rx, ry-4, rw, ODB_H).lineWidth(0.5).strokeColor(C_BORDER).stroke();
reg(8).fillColor(C_LGRAY).text('Odběratel:', rx+4, ry, {lineBreak:false});
reg(8).fillColor(C_GRAY).text('IČ:', rx+100, ry, {lineBreak:false});
reg(9).fillColor(C_BLACK).text('23630027', rx+4, ry, {width:rw-4, align:'right', lineBreak:false}); ry+=12;
bold(10).fillColor(C_BLACK).text('PLAYCE s.r.o.', rx+14, ry, {lineBreak:false}); ry+=13;
reg(9.5).fillColor(C_BLACK).text('Míšeňská 69/6', rx+14, ry, {lineBreak:false}); ry+=12;
reg(9.5).fillColor(C_BLACK).text('118 00 Praha', rx+14, ry, {lineBreak:false});

const S1_BOTTOM = S1_Y + S1_H;
doc.moveTo(ML, S1_BOTTOM).lineTo(PW-MR, S1_BOTTOM).lineWidth(0.5).strokeColor(C_BORDER).stroke();

// 3. BANK box
const S2_Y=S1_BOTTOM+5, S2_H=60;
doc.rect(ML, S2_Y, COL_L_W, S2_H).lineWidth(0.5).strokeColor(C_BORDER).stroke();
let by=S2_Y+5; const bx=ML+6, bValX=ML+60;
reg(8).fillColor(C_LGRAY).text('Banka:', bx, by, {lineBreak:false});
bold(10).fillColor(C_BLACK).text(BANK.name, bValX, by, {lineBreak:false}); by+=13;
reg(8).fillColor(C_LGRAY).text('SWIFT/BIC:', bx, by, {lineBreak:false});
reg(9).fillColor(C_BLACK).text(BANK.bic, bValX, by, {lineBreak:false}); by+=12;
reg(8).fillColor(C_LGRAY).text('IBAN:', bx, by, {lineBreak:false});
reg(9).fillColor(C_BLACK).text(BANK.iban, bValX, by, {lineBreak:false}); by+=12;
reg(8).fillColor(C_LGRAY).text('Číslo účtu:', bx, by, {lineBreak:false});
reg(9).fillColor(C_BLACK).text(BANK.account, bValX, by, {lineBreak:false});
reg(8).fillColor(C_LGRAY).text('Kód banky:', bValX+90, by, {lineBreak:false});
reg(9).fillColor(C_BLACK).text(BANK.code, bValX+155, by, {lineBreak:false});
reg(8).fillColor(C_LGRAY).text('Konečný příjemce:', COL_R_X, S2_Y+5, {lineBreak:false});
const S2_BOTTOM = S2_Y+S2_H;
doc.moveTo(ML, S2_BOTTOM).lineTo(PW-MR, S2_BOTTOM).lineWidth(0.5).strokeColor(C_BORDER).stroke();

// 4. DATES
const S3_Y=S2_BOTTOM+10, DATE_VAL_X=ML+210, DATE_VAL_W=85;
let dy=S3_Y;
reg(9.5).fillColor(C_BLACK).text('Datum vystavení:', ML, dy, {lineBreak:false});
doc.rect(DATE_VAL_X-2, dy-2, DATE_VAL_W, 14).lineWidth(0.5).strokeColor(C_BORDER).stroke();
bold(9.5).fillColor(C_BLACK).text('08.06.2026', DATE_VAL_X, dy, {width:DATE_VAL_W-4, align:'right', lineBreak:false}); dy+=14;
reg(9.5).fillColor(C_BLACK).text('Datum splatnosti:', ML, dy, {lineBreak:false});
doc.rect(DATE_VAL_X-2, dy-2, DATE_VAL_W, 14).lineWidth(0.5).strokeColor(C_BORDER).stroke();
bold(9.5).fillColor(C_BLACK).text('22.06.2026', DATE_VAL_X, dy, {width:DATE_VAL_W-4, align:'right', lineBreak:false}); dy+=16;
reg(9.5).fillColor(C_BLACK).text('Firma není plátce DPH.', ML, dy, {lineBreak:false}); dy+=16;
reg(9.5).fillColor(C_BLACK).text('Forma úhrady:', ML, dy, {lineBreak:false});
bold(9.5).fillColor(C_BLACK).text('Příkazem', ML, dy, {width:DATE_VAL_X+DATE_VAL_W-ML, align:'right', lineBreak:false});
const S3_BOTTOM=dy+18;
doc.moveTo(ML, S3_BOTTOM).lineTo(PW-MR, S3_BOTTOM).lineWidth(0.5).strokeColor(C_BORDER).stroke();

// 5. TABLE
const TBL_Y=S3_BOTTOM+5, TBL_H=18;
const TC = { desc:{x:ML,w:270}, qty:{x:305,w:50}, price:{x:358,w:90}, disc:{x:450,w:50}, total:{x:500,w:PW-MR-500} };
doc.rect(ML, TBL_Y, CW, TBL_H).fill(C_TBLHDR);
doc.rect(ML, TBL_Y, CW, TBL_H).lineWidth(0.5).strokeColor(C_BORDER).stroke();
for (const cx of [TC.qty.x, TC.price.x, TC.disc.x, TC.total.x]) {
  doc.moveTo(cx,TBL_Y).lineTo(cx,TBL_Y+TBL_H).lineWidth(0.3).strokeColor(C_BORDER).stroke();
}
bold(8.5).fillColor(C_GRAY);
doc.text('Označení dodávky', TC.desc.x+4, TBL_Y+5, {lineBreak:false});
doc.text('Množství', TC.qty.x, TBL_Y+5, {width:TC.qty.w, align:'right', lineBreak:false});
doc.text('J.cena', TC.price.x, TBL_Y+5, {width:TC.price.w, align:'right', lineBreak:false});
doc.text('Sleva', TC.disc.x, TBL_Y+5, {width:TC.disc.w, align:'right', lineBreak:false});
doc.text('Kč Celkem', TC.total.x, TBL_Y+5, {width:TC.total.w, align:'right', lineBreak:false});

const ROW_Y=TBL_Y+TBL_H, ROW_H=18;
doc.rect(ML, ROW_Y, CW, ROW_H).lineWidth(0.5).strokeColor('#dddddd').stroke();
for (const cx of [TC.qty.x, TC.price.x, TC.disc.x, TC.total.x]) {
  doc.moveTo(cx,ROW_Y).lineTo(cx,ROW_Y+ROW_H).lineWidth(0.3).strokeColor('#dddddd').stroke();
}
reg(9.5).fillColor(C_BLACK).text('krátkodobé ubytování', TC.desc.x+4, ROW_Y+4, {width:TC.desc.w-8, lineBreak:false});
reg(9.5).text('1', TC.qty.x, ROW_Y+4, {width:TC.qty.w, align:'right', lineBreak:false});
bold(9.5).text('1 050,00', TC.price.x, ROW_Y+4, {width:TC.price.w, align:'right', lineBreak:false});
reg(9.5).fillColor(C_LGRAY).text('—', TC.disc.x, ROW_Y+4, {width:TC.disc.w, align:'right', lineBreak:false});
bold(9.5).fillColor(C_BLACK).text('1 050,00', TC.total.x, ROW_Y+4, {width:TC.total.w, align:'right', lineBreak:false});

// 6. TOTALS
const TOT_Y=ROW_Y+ROW_H+8;
reg(9).fillColor(C_GRAY).text('Součet položek', ML, TOT_Y, {lineBreak:false});
reg(9).fillColor(C_BLACK).text('1 050,00', TC.total.x, TOT_Y, {width:TC.total.w, align:'right', lineBreak:false});
const CELKEM_Y=TOT_Y+24;
doc.moveTo(TC.price.x, CELKEM_Y-4).lineTo(PW-MR, CELKEM_Y-4).lineWidth(0.5).strokeColor(C_BORDER).stroke();
bold(11).fillColor(C_BLACK).text('CELKEM K ÚHRADĚ', ML, CELKEM_Y, {lineBreak:false});
bold(11).fillColor(C_BLACK).text('1 050,00', TC.total.x, CELKEM_Y, {width:TC.total.w, align:'right', lineBreak:false});
const FOOTER_TOP=CELKEM_Y+20;
doc.moveTo(ML, FOOTER_TOP).lineTo(PW-MR, FOOTER_TOP).lineWidth(0.5).strokeColor(C_BORDER).stroke();

// 7. FOOTER
let fy=FOOTER_TOP+10;
bold(10).fillColor(C_BLUE).text('Nejsme plátci DPH', ML, fy, {lineBreak:false}); fy+=22;
reg(9.5).fillColor(C_BLACK).text('Vystavil:', ML, fy, {lineBreak:false});
doc.moveTo(ML, fy+20).lineTo(ML+100, fy+20).lineWidth(0.5).strokeColor(C_BORDER).stroke();

// Legal
reg(7.5).fillColor(C_GRAY).text('Vedeno u '+SUPPLIER.court, ML, 605, {width:CW, lineBreak:false});
reg(7.5).fillColor(C_GRAY).text(
  'Dovolujeme si Vás upozornit, že v případě nedodržení data splatnosti uvedeného na faktuře '+
  'Vám budeme účtovat úrok z prodlení v dohodnuté, resp. zákonné výši a smluvní pokutu (byla-li sjednána).',
  ML, 619, {width:CW}
);
// Signature
reg(9).fillColor(C_BLACK).text('Převzal:', ML+110, 757, {lineBreak:false});
doc.moveTo(ML+110, 775).lineTo(ML+250, 775).lineWidth(0.5).strokeColor(C_BORDER).stroke();
doc.text('Razítko:', ML+330, 757, {lineBreak:false});
doc.moveTo(ML+330, 775).lineTo(ML+470, 775).lineWidth(0.5).strokeColor(C_BORDER).stroke();

doc.end();
out.on('finish', () => {
  const sz = fs.statSync('/tmp/pohoda-test.pdf').size;
  console.log(`\n✅ POHODA PDF: /tmp/pohoda-test.pdf (${sz} bytes)`);
});
out.on('error', e => { console.error('ERROR:', e.message); process.exit(1); });
