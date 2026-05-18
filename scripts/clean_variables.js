const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('C:/Projects/web dev/ALiSiO-Hotel-PMS/src');
files.forEach((file) => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content
    // Replace GiftCardTemplate with GiftCardTemplate
    .replace(/GiftCardTemplate/g, 'GiftCardTemplate')
    // Replace GiftCard with GiftCard (but avoid matching 'GiftCards')
    .replace(/\bGiftCard\b/g, 'GiftCard')
    // Replace variable names
    .replace(/\bsetGiftCards\b/g, 'setGiftCards')
    .replace(/\bgift_cards\.map\b/g, 'giftCards.map')
    .replace(/\bgift_cards\.length\b/g, 'giftCards.length')
    .replace(/d\.gift_cards/g, 'd.giftCards')
    .replace(/const gift_cards/g, 'const giftCards')
    .replace(/let gift_cards/g, 'let giftCards')
    .replace(/setGiftCard\b/g, 'setGiftCard')
    .replace(/activateGiftCard/g, 'activeCard')
    .replace(/activateV\b/g, 'activeCard')
    .replace(/setActivateV\b/g, 'setActiveCard')
    .replace(/activateId\b/g, 'activationId')
    .replace(/setActivateId\b/g, 'setActivationId')
    .replace(/activateing\b/g, 'activating')
    .replace(/setActivateing\b/g, 'setActivating')
    .replace(/handleActivate\b/g, 'handleActivation')
    .replace(/VOUCHER_STATUS_CFG/g, 'GIFT_CARD_STATUS_CFG')
    .replace(/VOUCHER_STATUS/g, 'GIFT_CARD_STATUS')
    .replace(/gift_cardCountCb/g, 'giftCardCountCb')
    .replace(/activateResId/g, 'activationResId')
    .replace(/setActivateResId/g, 'setActivationResId');

  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Updated:', file);
  }
});
