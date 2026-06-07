// Simulates exactly what Next.js invoice-pdf.ts resolveFont does at runtime
// Run from project root: node scripts/verify-fonts.js
const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');

console.log('=== Runtime Font Resolution (simulating Next.js) ===');
console.log('process.cwd():', process.cwd());

const candidates = {
  regular: [
    path.join(process.cwd(), 'src', 'assets', 'fonts', 'DejaVuSans.ttf'),
    '/root/projects/alisio-pms/src/assets/fonts/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ],
  bold: [
    path.join(process.cwd(), 'src', 'assets', 'fonts', 'DejaVuSans-Bold.ttf'),
    '/root/projects/alisio-pms/src/assets/fonts/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ],
};

function resolveFont(name) {
  for (const p of candidates[name]) {
    if (fs.existsSync(p)) { console.log(`  ✓ ${name}: ${p}`); return p; }
    else { console.log(`  ✗ ${name}: ${p}`); }
  }
  return null;
}

const fontReg  = resolveFont('regular');
const fontBold = resolveFont('bold');

if (!fontReg) { console.error('\n❌ NO FONT FOUND - Czech chars will be garbled!'); process.exit(1); }

console.log('\n=== Generating real invoice PDF ===');
const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
doc.registerFont('Reg',  fontReg);
if (fontBold) doc.registerFont('Bold', fontBold);

const out = fs.createWriteStream('/tmp/verify-invoice.pdf');
doc.pipe(out);

// Header
doc.rect(0, 0, 595, 52).fill('#1a1d2e');
doc.font('Bold').fontSize(18).fillColor('#ffffff').text('Kemp Carlsbad s.r.o.', 40, 14, { width: 250, align: 'left' });
doc.font('Bold').fontSize(13).fillColor('#ffffff').text('FAKTURA č. 2026-099', 295, 11, { width: 260, align: 'right' });
doc.font('Reg').fontSize(9).fillColor('#6ee7b7').text('Variabilní symbol: 2026099', 295, 30, { width: 260, align: 'right' });

// Content
doc.font('Reg').fontSize(9).fillColor('#374151');
doc.text('IČO: 23430567   DIČ: CZ23430567', 40, 70);
doc.text('Komerční banka — Označení dodávky', 40, 85);
doc.text('CELKEM K ÚHRADĚ: 1 050,00 Kč', 40, 100);
doc.text('Součet položek   Převzal   Vystavil', 40, 115);
doc.text('Nejsme plátci DPH — Záloha na ubytování', 40, 130);
doc.text('Krátkodobé ubytování, Forma úhrady: Příkazem', 40, 145);
doc.text('Datum splatnosti: 21.06.2026   Číslo účtu: 131-3569410227', 40, 160);
doc.text('Razítko: ________________   Podpis: ________________', 40, 180);

doc.end();
out.on('finish', () => {
  const size = fs.statSync('/tmp/verify-invoice.pdf').size;
  console.log('✅ PDF OK:', '/tmp/verify-invoice.pdf', '(' + size + ' bytes)');
  console.log('\nAll Czech characters should render correctly in this PDF.');
  console.log('Download with: scp root@46.225.132.220:/tmp/verify-invoice.pdf .');
});
out.on('error', e => { console.error('❌ PDF error:', e.message); process.exit(1); });
