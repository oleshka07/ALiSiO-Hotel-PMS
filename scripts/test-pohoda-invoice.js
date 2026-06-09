/**
 * Test the dynamic POHODA invoice generator
 * Tests: 1) simple invoice, 2) invoice with buyer + long description
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
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) { console.log(`font (${name}): ${p}`); return p; }
  }
  return null;
}

const FONT_REG  = resolveFont('regular');
const FONT_BOLD = resolveFont('bold');
if (!FONT_REG || !FONT_BOLD) { console.error('❌ Fonts missing!'); process.exit(1); }

// ─── Exact reference geometry ────────────────────────────────────────────────
const PW = 595.28, PH = 841.89, ML = 28, MR = 28, CR = PW - MR;
const DIV_X = 316, GAP = 10;
const COL_LX = ML + 6, COL_LW = DIV_X - ML - 8;
const COL_RX = DIV_X + GAP, COL_RW = CR - COL_RX;
const BLUE='#1565c0', BLACK='#1a1a1a', DGRAY='#555555', LGRAY='#888888';
const BORDER='#aaaaaa', TBLBG='#f0f0f0', ROWBDR='#dddddd';

const SUPPLIER = {
  name:'Kemp Carlsbad s.r.o.', street:'Chebská 38/5', city:'360 06 Karlovy Vary',
  ico:'23430567', dic:'CZ23430567', phone:'723565616', email:'kemp-carlsbad@email.cz',
  court:'Krajského soudu v Plzni, oddíl C 46931',
};
const BANK = { name:'Komerční banka', account:'131-3569410227', code:'0100',
  iban:'CZ7001000001313569410227', bic:'KOMBCZPP' };

function fmtMoney(n) {
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  const num = new Intl.NumberFormat('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2}).format(abs);
  return sign + num;
}

function textHeight(doc, text, width, fontSize) {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.52)));
  const lines = text.split('\n').reduce((a,l)=>a+Math.max(1,Math.ceil(l.length/charsPerLine)),0);
  return lines * fontSize * 1.35;
}

function buildInvoice(outFile, data) {
  const doc = new PDFDocument({ size:[PW,PH], margins:{top:0,bottom:0,left:0,right:0} });
  doc.registerFont('Reg',  FONT_REG);
  doc.registerFont('Bold', FONT_BOLD);
  const out = fs.createWriteStream(outFile);
  doc.pipe(out);

  const R  = sz => { doc.font('Reg');  doc.fontSize(sz); return doc; };
  const B  = sz => { doc.font('Bold'); doc.fontSize(sz); return doc; };
  const hl = (y, c=BORDER, w=0.5) => doc.moveTo(ML,y).lineTo(CR,y).lineWidth(w).strokeColor(c).stroke();

  const currency = data.currency || 'CZK';
  const payMethod = data.paymentMethod || 'Příkazem';
  const varSymbol = data.invoiceNumber.replace(/-/g,'');
  const items = data.items?.length ? data.items : [{description:data.description,quantity:1,total:data.amount}];

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  }
  function dateBox(x,y,w,h,val,sz) {
    doc.rect(x-1,y-2,w,h+2).lineWidth(0.5).strokeColor(BORDER).stroke();
    B(sz).fillColor(BLACK).text(val,x+1,y,{width:w-4,align:'right',lineBreak:false});
  }

  // 1. HEADER
  B(13).fillColor(BLACK).text(SUPPLIER.name, ML, 28, {lineBreak:false});
  B(13).fillColor(BLUE).text('FAKTURA č. '+data.invoiceNumber, ML, 28, {width:CR-ML,align:'right',lineBreak:false});
  hl(48);

  // 2. MAIN BLOCK
  const MB_Y = 50;
  const lTopLines = [
    {t:'Dodavatel:',sz:8,c:LGRAY,bold:false,gap:10},
    {t:SUPPLIER.name,sz:10.5,c:BLACK,bold:true,gap:12},
    {t:SUPPLIER.street,sz:9.5,c:BLACK,bold:false,gap:11},
    {t:SUPPLIER.city,sz:9.5,c:BLACK,bold:false,gap:17},
    {t:'IČ: '+SUPPLIER.ico,sz:9.5,c:BLUE,bold:false,gap:11},
    {t:'DIČ: '+SUPPLIER.dic,sz:9.5,c:BLUE,bold:false,gap:11},
    {t:'Mobil: '+SUPPLIER.phone,sz:9.5,c:BLACK,bold:false,gap:11},
    {t:'E-mail: '+SUPPLIER.email,sz:9.5,c:BLACK,bold:false,gap:0},
  ];
  const lTopH = 8 + lTopLines.reduce((s,l)=>s+l.gap,0);

  const rOdbH = (() => {
    let h=12;
    if (data.buyer?.dic) h+=11;
    if (data.buyer?.name) h+=13;
    if (data.buyer?.address) h+=11;
    if (data.buyer?.city) h+=11;
    if (!data.buyer?.name) h+=11;
    return h;
  })();
  const rTopH = 3*13 + 8 + rOdbH + 8;
  const H1 = Math.max(lTopH,rTopH) + 12;
  const H2 = 66;
  const MB_H = H1+H2, MB_BOT = MB_Y+MB_H, DIV_H1 = MB_Y+H1;

  doc.rect(ML,MB_Y,CR-ML,MB_H).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.moveTo(DIV_X,MB_Y).lineTo(DIV_X,MB_BOT).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.moveTo(ML,DIV_H1).lineTo(CR,DIV_H1).lineWidth(0.5).strokeColor(BORDER).stroke();

  // Dodavatel content
  { let y=MB_Y+5;
    for (const line of lTopLines) {
      (line.bold?B:R)(line.sz).fillColor(line.c).text(line.t,COL_LX,y,{lineBreak:false});
      y+=line.gap;
    }
  }

  // Variabilní + Odběratel
  { let y=MB_Y+5;
    R(9).fillColor(DGRAY).text('Variabilní symbol:',COL_RX,y,{lineBreak:false});
    R(9).fillColor(BLACK).text(varSymbol,COL_RX,y,{width:COL_RW,align:'right',lineBreak:false}); y+=13;
    R(9).fillColor(DGRAY).text('Konstantní symbol:',COL_RX,y,{lineBreak:false});
    R(9).fillColor(BLACK).text('0308',COL_RX,y,{width:COL_RW,align:'right',lineBreak:false}); y+=13;
    R(9).fillColor(DGRAY).text('Objednávka č.:',COL_RX,y,{lineBreak:false});
    R(9).fillColor(LGRAY).text('ze dne:',COL_RX+100,y,{lineBreak:false}); y+=13+5;
    const odbBoxH=rOdbH+8;
    doc.rect(COL_RX-4,y-4,COL_RW+4,odbBoxH).lineWidth(0.5).strokeColor(BORDER).stroke();
    R(8).fillColor(LGRAY).text('Odběratel:',COL_RX,y,{lineBreak:false});
    if (data.buyer?.ico) { R(8).fillColor(DGRAY).text('IČ:',COL_RX+80,y,{lineBreak:false}); R(9).fillColor(BLACK).text(data.buyer.ico,COL_RX,y,{width:COL_RW,align:'right',lineBreak:false}); }
    y+=12;
    if (data.buyer?.dic) { R(8).fillColor(DGRAY).text('DIČ:',COL_RX,y,{lineBreak:false}); R(9).fillColor(BLACK).text(data.buyer.dic,COL_RX,y,{width:COL_RW,align:'right',lineBreak:false}); y+=11; }
    if (data.buyer?.name) { B(10).fillColor(BLACK).text(data.buyer.name,COL_RX+10,y,{lineBreak:false}); y+=13; }
    else { R(9).fillColor(LGRAY).text('—',COL_RX,y,{lineBreak:false}); y+=11; }
    if (data.buyer?.address) { R(9.5).fillColor(BLACK).text(data.buyer.address,COL_RX+10,y,{lineBreak:false}); y+=11; }
    if (data.buyer?.city)    { R(9.5).fillColor(BLACK).text(data.buyer.city,COL_RX+10,y,{lineBreak:false}); }
  }

  // Bank
  { let y=DIV_H1+5; const bValX=COL_LX+55;
    R(8).fillColor(LGRAY).text('Banka:',COL_LX,y,{lineBreak:false});
    B(10.5).fillColor(BLACK).text(BANK.name,bValX,y,{lineBreak:false}); y+=14;
    R(8).fillColor(LGRAY).text('SWIFT:',COL_LX,y,{lineBreak:false});
    R(9).fillColor(BLACK).text(BANK.bic,bValX,y,{lineBreak:false}); y+=12;
    R(8).fillColor(LGRAY).text('IBAN:',COL_LX,y,{lineBreak:false});
    R(9).fillColor(BLACK).text(BANK.iban,bValX,y,{lineBreak:false}); y+=12;
    R(8).fillColor(LGRAY).text('Číslo účtu:',COL_LX,y,{lineBreak:false});
    R(9).fillColor(BLACK).text(BANK.account,bValX,y,{lineBreak:false});
    R(8).fillColor(LGRAY).text('Kód banky:',bValX+95,y,{lineBreak:false});
    R(9).fillColor(BLACK).text(BANK.code,bValX+160,y,{lineBreak:false});
  }

  // 3. DATES
  const S3_Y=MB_BOT+8, BOX_X=ML+170, BOX_W=82, BOX_H=14;
  let dy=S3_Y;
  R(9.5).fillColor(BLACK).text('Datum vystavení:',ML,dy,{lineBreak:false});
  dateBox(BOX_X,dy,BOX_W,BOX_H,fmtDate(data.issueDate),9.5); dy+=14;
  R(9.5).fillColor(BLACK).text('Datum splatnosti:',ML,dy,{lineBreak:false});
  dateBox(BOX_X,dy,BOX_W,BOX_H,fmtDate(data.dueDate||data.issueDate),9.5); dy+=15;
  R(9.5).fillColor(BLACK).text('Firma není plátce DPH.',ML,dy,{lineBreak:false}); dy+=14;
  R(9.5).fillColor(BLACK).text('Forma úhrady:',ML,dy,{lineBreak:false});
  B(9.5).fillColor(BLACK).text(payMethod,BOX_X-20,dy,{width:BOX_W+20,align:'right',lineBreak:false});
  R(8).fillColor(LGRAY).text('Konečný příjemce:',COL_RX,S3_Y,{lineBreak:false});
  const S3_BOT=dy+14; hl(S3_BOT);

  // 4. TABLE
  const TH=16, TBL_Y=S3_BOT+4;
  const TC={desc:{x:ML,w:273},qty:{x:310,w:52},price:{x:362,w:90},disc:{x:452,w:45},total:{x:497,w:CR-497}};
  doc.rect(ML,TBL_Y,CR-ML,TH).fill(TBLBG);
  doc.rect(ML,TBL_Y,CR-ML,TH).lineWidth(0.5).strokeColor(BORDER).stroke();
  for (const col of [TC.qty,TC.price,TC.disc,TC.total])
    doc.moveTo(col.x,TBL_Y).lineTo(col.x,TBL_Y+TH).lineWidth(0.3).strokeColor(BORDER).stroke();
  B(8.5).fillColor(DGRAY);
  doc.text('Označení dodávky',TC.desc.x+4,TBL_Y+4,{lineBreak:false});
  doc.text('Množství',TC.qty.x,TBL_Y+4,{width:TC.qty.w,align:'right',lineBreak:false});
  doc.text('J.cena',TC.price.x,TBL_Y+4,{width:TC.price.w,align:'right',lineBreak:false});
  doc.text('Sleva',TC.disc.x,TBL_Y+4,{width:TC.disc.w,align:'right',lineBreak:false});
  doc.text('Kč Celkem',TC.total.x,TBL_Y+4,{width:TC.total.w,align:'right',lineBreak:false});

  let rowY=TBL_Y+TH;
  const ROW_PAD=4, ROW_MIN_H=18;
  for (const item of items) {
    const descH=textHeight(doc,item.description,TC.desc.w-8,9.5);
    const rowH=Math.max(ROW_MIN_H,descH+ROW_PAD*2);
    doc.rect(ML,rowY,CR-ML,rowH).lineWidth(0.5).strokeColor(ROWBDR).stroke();
    for (const col of [TC.qty,TC.price,TC.disc,TC.total])
      doc.moveTo(col.x,rowY).lineTo(col.x,rowY+rowH).lineWidth(0.3).strokeColor(ROWBDR).stroke();
    const ty=rowY+ROW_PAD;
    R(9.5).fillColor(BLACK).text(item.description,TC.desc.x+4,ty,{width:TC.desc.w-8,lineBreak:true});
    R(9.5).fillColor(BLACK).text(String(item.quantity??1),TC.qty.x,ty,{width:TC.qty.w,align:'right',lineBreak:false});
    R(9.5).fillColor(BLACK).text(fmtMoney(item.unitPrice??item.total),TC.price.x,ty,{width:TC.price.w,align:'right',lineBreak:false});
    R(9.5).fillColor(LGRAY).text('—',TC.disc.x,ty,{width:TC.disc.w,align:'right',lineBreak:false});
    B(9.5).fillColor(BLACK).text(fmtMoney(item.total),TC.total.x,ty,{width:TC.total.w,align:'right',lineBreak:false});
    rowY+=rowH;
  }

  // 5. TOTALS
  const totalAmount=items.reduce((s,i)=>s+i.total,0);
  let totY=rowY+6;
  R(9.5).fillColor(DGRAY).text('Součet položek',ML,totY,{lineBreak:false});
  R(9.5).fillColor(BLACK).text(fmtMoney(totalAmount),TC.total.x,totY,{width:TC.total.w,align:'right',lineBreak:false}); totY+=14;
  doc.moveTo(TC.price.x,totY-2).lineTo(CR,totY-2).lineWidth(0.5).strokeColor(BORDER).stroke();
  B(11.5).fillColor(BLACK).text('CELKEM K ÚHRADĚ',ML,totY,{lineBreak:false});
  B(11.5).fillColor(BLACK).text(fmtMoney(totalAmount),TC.total.x,totY,{width:TC.total.w,align:'right',lineBreak:false}); totY+=20;
  hl(totY); totY+=10;

  // 6. FOOTER (flow)
  B(10.5).fillColor(BLUE).text('Nejsme plátci DPH',ML,totY,{lineBreak:false}); totY+=22;
  R(9.5).fillColor(BLACK).text('Vystavil:',ML,totY,{lineBreak:false});
  doc.moveTo(ML,totY+20).lineTo(ML+100,totY+20).lineWidth(0.5).strokeColor(BORDER).stroke();

  // 7. FIXED BOTTOM
  R(7.5).fillColor(LGRAY).text('Vedeno u '+SUPPLIER.court,ML,605,{width:CR-ML,lineBreak:false});
  R(7.5).fillColor(LGRAY).text('Dovolujeme si Vás upozornit, že v případě nedodržení data splatnosti uvedeného na faktuře Vám budeme účtovat úrok z prodlení v dohodnuté, resp. zákonné výši a smluvní pokutu (byla-li sjednána).',ML,618,{width:CR-ML});
  R(9).fillColor(BLACK);
  doc.text('Převzal:',ML+110,757,{lineBreak:false});
  doc.moveTo(ML+110,775).lineTo(ML+270,775).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.text('Razítko:',ML+340,757,{lineBreak:false});
  doc.moveTo(ML+340,775).lineTo(ML+500,775).lineWidth(0.5).strokeColor(BORDER).stroke();
  R(7).fillColor(LGRAY).text('ALiSiO PMS – Kemp Carlsbad s.r.o.',ML,PH-20,{width:CR-ML,align:'center',lineBreak:false});

  doc.end();
  return new Promise(resolve => out.on('finish', resolve));
}

async function main() {
  // Test 1: Simple invoice (no buyer)
  await buildInvoice('/tmp/pohoda-simple.pdf', {
    invoiceNumber: '2026-099',
    issueDate: '2026-06-08',
    dueDate:   '2026-06-22',
    description: 'místní poplatek z pobytu, bez DPH',
    amount: 1050,
    paymentMethod: 'Hotovost',
  });
  console.log('✅ /tmp/pohoda-simple.pdf');

  // Test 2: Invoice with buyer + long description
  await buildInvoice('/tmp/pohoda-buyer.pdf', {
    invoiceNumber: '2026-100',
    issueDate: '2026-06-08',
    dueDate:   '2026-06-22',
    description: 'Fakturujeme Vám krátkodobé ubytování v termínu 01.07.2026 - 14.07.2026, chata č. 3, celkem 14 nocí',
    amount: 437580,
    buyer: {
      name: 'PLAYCE s.r.o.',
      ico: '23630027',
      dic: 'CZ23630027',
      address: 'Míšeňská 69/6',
      city: '118 00 Praha',
    },
  });
  console.log('✅ /tmp/pohoda-buyer.pdf');

  // Test 3: Multiple items
  await buildInvoice('/tmp/pohoda-multi.pdf', {
    invoiceNumber: '2026-101',
    issueDate: '2026-06-08',
    dueDate:   '2026-06-22',
    description: '',
    amount: 5200,
    items: [
      { description: 'krátkodobé ubytování', quantity: 1, total: 4500 },
      { description: 'místní poplatek z pobytu', quantity: 7, unitPrice: 100, total: 700 },
    ],
  });
  console.log('✅ /tmp/pohoda-multi.pdf');
}

main().catch(e => { console.error(e); process.exit(1); });
