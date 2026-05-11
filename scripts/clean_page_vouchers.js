const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/page.tsx';
let content = fs.readFileSync(file, 'utf8');

let newContent = content
  .replace(/\bfetchVouchers\b/g, 'fetchGiftCards')
  .replace(/\bvouchers\b/g, 'giftCards')
  .replace(/\bsetRedeemVoucher\b/g, 'setActiveCard')
  .replace(/\bredeemVoucher\b/g, 'activeCard')
  .replace(/VouchersTab/g, 'GiftCardsTab');

if (content !== newContent) {
  fs.writeFileSync(file, newContent, 'utf8');
  console.log('Updated:', file);
}
