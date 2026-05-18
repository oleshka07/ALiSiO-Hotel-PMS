const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/page.tsx';
let content = fs.readFileSync(file, 'utf8');

let newContent = content
  .replace(/\bfetchGiftCards\b/g, 'fetchGiftCards')
  .replace(/\bgift_cards\b/g, 'giftCards')
  .replace(/\bsetActivateGiftCard\b/g, 'setActiveCard')
  .replace(/\bactivateGiftCard\b/g, 'activeCard')
  .replace(/GiftCardsTab/g, 'GiftCardsTab');

if (content !== newContent) {
  fs.writeFileSync(file, newContent, 'utf8');
  console.log('Updated:', file);
}
