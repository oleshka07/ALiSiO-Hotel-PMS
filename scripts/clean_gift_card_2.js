const fs = require('fs');

const filePaths = [
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/api/booking/activate/route.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/api/gift-cards/[id]/activate/route.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/api/gift-cards/[id]/route.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/api/gift-cards/route.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/api/package-offers/[id]/route.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/api/widget-activate.handlers.ts',
  'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/[siteId]/_components/SiteHelpers.tsx'
];

filePaths.forEach((file) => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content
    .replace(/\bGiftCard\b/g, 'GiftCard')
    .replace(/\bgift_card\b/g, 'giftCard')
    .replace(/\bGiftCards\b/g, 'GiftCards');
  
  // Undo DB column replacements just in case
  newContent = newContent.replace(/giftCard_bundles/g, 'gift_card_bundles');
  newContent = newContent.replace(/giftCard_automation_rules/g, 'gift_card_automation_rules');
  newContent = newContent.replace(/giftCard_rule_id/g, 'gift_card_rule_id');
  newContent = newContent.replace(/giftCard = db\.prepare/g, 'gift_card = db.prepare');
  
  // Specific fix for sql queries:
  newContent = newContent.replace(/FROM giftCards/g, 'FROM gift_cards');
  newContent = newContent.replace(/INTO giftCards/g, 'INTO gift_cards');
  newContent = newContent.replace(/UPDATE giftCards/g, 'UPDATE gift_cards');
  newContent = newContent.replace(/JOIN giftCards/g, 'JOIN gift_cards');

  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Updated gift_card in:', file);
  }
});
