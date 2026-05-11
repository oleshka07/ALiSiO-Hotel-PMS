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
    .replace(/\bpromoDiscount\b/g, 'offerDiscount')
    .replace(/\bpromoCode\b/g, 'couponCode')
    .replace(/\bshowPromo\b/g, 'showOffer')
    .replace(/\bpromoApplied\b/g, 'offerApplied')
    .replace(/\bpromoError\b/g, 'offerError')
    .replace(/\bapplyingPromo\b/g, 'applyingOffer')
    .replace(/\bhandleApplyPromo\b/g, 'handleApplyOffer')
    .replace(/\burlPromo\b/g, 'urlOffer')
    .replace(/\bsetPromoCode\b/g, 'setCouponCode')
    .replace(/\bsetShowPromo\b/g, 'setShowOffer')
    .replace(/\bsetPromoApplied\b/g, 'setOfferApplied')
    .replace(/\bsetPromoError\b/g, 'setOfferError')
    .replace(/\bsetApplyingPromo\b/g, 'setApplyingOffer')
    .replace(/\bpromoData\b/g, 'couponData')
    .replace(/\bpromoCountCb\b/g, 'couponCountCb')
    .replace(/'promocode'/g, "'couponcode'");
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Updated:', file);
  }
});
