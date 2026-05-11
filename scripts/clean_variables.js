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
    // Replace VoucherTemplate with GiftCardTemplate
    .replace(/VoucherTemplate/g, 'GiftCardTemplate')
    // Replace Voucher with GiftCard (but avoid matching 'Vouchers')
    .replace(/\bVoucher\b/g, 'GiftCard')
    // Replace variable names
    .replace(/\bsetVouchers\b/g, 'setGiftCards')
    .replace(/\bvouchers\.map\b/g, 'giftCards.map')
    .replace(/\bvouchers\.length\b/g, 'giftCards.length')
    .replace(/d\.vouchers/g, 'd.giftCards')
    .replace(/const vouchers/g, 'const giftCards')
    .replace(/let vouchers/g, 'let giftCards')
    .replace(/setVoucher\b/g, 'setGiftCard')
    .replace(/redeemVoucher/g, 'activeCard')
    .replace(/redeemV\b/g, 'activeCard')
    .replace(/setRedeemV\b/g, 'setActiveCard')
    .replace(/redeemId\b/g, 'activationId')
    .replace(/setRedeemId\b/g, 'setActivationId')
    .replace(/redeeming\b/g, 'activating')
    .replace(/setRedeeming\b/g, 'setActivating')
    .replace(/handleRedeem\b/g, 'handleActivation')
    .replace(/VOUCHER_STATUS_CFG/g, 'GIFT_CARD_STATUS_CFG')
    .replace(/VOUCHER_STATUS/g, 'GIFT_CARD_STATUS')
    .replace(/voucherCountCb/g, 'giftCardCountCb')
    .replace(/redeemResId/g, 'activationResId')
    .replace(/setRedeemResId/g, 'setActivationResId');

  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Updated:', file);
  }
});
