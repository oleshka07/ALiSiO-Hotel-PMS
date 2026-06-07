const path = require('path');
const fs = require('fs');
const cwd = process.cwd();
const fontReg  = path.join(cwd, 'src', 'assets', 'fonts', 'DejaVuSans.ttf');
const fontBold = path.join(cwd, 'src', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
const sysFontReg  = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const sysFontBold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

console.log('=== Font Resolution Check ===');
console.log('CWD:', cwd);
console.log('[project] Regular:', fontReg, '-> exists:', fs.existsSync(fontReg));
console.log('[project] Bold:   ', fontBold, '-> exists:', fs.existsSync(fontBold));
console.log('[system]  Regular:', sysFontReg, '-> exists:', fs.existsSync(sysFontReg));
console.log('[system]  Bold:   ', sysFontBold, '-> exists:', fs.existsSync(sysFontBold));

// Also generate a test PDF
const PDFDocument = require('pdfkit');
const resolvedReg  = fs.existsSync(fontReg)  ? fontReg  : (fs.existsSync(sysFontReg)  ? sysFontReg  : null);
const resolvedBold = fs.existsSync(fontBold) ? fontBold : (fs.existsSync(sysFontBold) ? sysFontBold : null);
console.log('\nResolved regular:', resolvedReg);
console.log('Resolved bold:   ', resolvedBold);

if (!resolvedReg) { console.error('NO FONT FOUND!'); process.exit(1); }

const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
const out = fs.createWriteStream('/tmp/font-test.pdf');
doc.pipe(out);
doc.registerFont('Reg',  resolvedReg);
if (resolvedBold) doc.registerFont('Bold', resolvedBold);

doc.font('Bold').fontSize(20).fillColor('#1a1d2e').text('Kemp Carlsbad s.r.o.', 40, 40);
doc.font('Reg').fontSize(12).fillColor('#374151')
   .text('IČO: 23430567  DIČ: CZ23430567', 40, 70)
   .text('Komerční banka — Označení dodávky', 40, 88)
   .text('CELKEM K ÚHRADĚ: 1 050,00 Kč', 40, 106)
   .text('Součet položek, Převzal, Vystavil', 40, 124)
   .text('Nejsme plátci DPH — Záloha na ubytování', 40, 142)
   .text('Krátkodobé ubytování, Forma úhrady: Příkazem', 40, 160)
   .text('Datum splatnosti: 21.06.2026', 40, 178);
doc.end();
out.on('finish', () => { console.log('\nPDF OK:', '/tmp/font-test.pdf', fs.statSync('/tmp/font-test.pdf').size, 'bytes'); });
out.on('error', e => { console.error('PDF ERROR:', e.message); process.exit(1); });
