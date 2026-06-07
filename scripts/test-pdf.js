/**
 * Quick test: generate a small test PDF using DejaVu fonts
 * and verify Czech characters render correctly.
 * Run: node scripts/test-pdf.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts');
const fontReg  = path.join(FONT_DIR, 'DejaVuSans.ttf');
const fontBold = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

console.log('Regular font exists:', fs.existsSync(fontReg), fontReg);
console.log('Bold    font exists:', fs.existsSync(fontBold), fontBold);

const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
const out = fs.createWriteStream('/tmp/test-invoice.pdf');
doc.pipe(out);

doc.registerFont('Reg',  fontReg);
doc.registerFont('Bold', fontBold);

doc.font('Bold').fontSize(20).fillColor('#1a1d2e')
   .text('Kemp Carlsbad s.r.o.', 40, 40);
doc.font('Reg').fontSize(12).fillColor('#374151')
   .text('IČO: 23430567  DIČ: CZ23430567', 40, 70)
   .text('Komerční banka  Označení dodávky', 40, 88)
   .text('CELKEM K ÚHRADĚ: 1 050,00 Kč', 40, 106)
   .text('Součet položek, Převzal, Vystavil', 40, 124)
   .text('Nejsme plátci DPH — Záloha na ubytování', 40, 142)
   .text('Krátkodobé ubytování, Forma úhrady: Příkazem', 40, 160);

doc.end();
out.on('finish', () => {
  const size = fs.statSync('/tmp/test-invoice.pdf').size;
  console.log('\n✅ PDF generated: /tmp/test-invoice.pdf (' + size + ' bytes)');
  console.log('To verify: scp root@server:/tmp/test-invoice.pdf .');
});
out.on('error', e => console.error('❌ Error:', e.message));
