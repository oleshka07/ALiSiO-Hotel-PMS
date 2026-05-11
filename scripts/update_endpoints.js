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
    .replace(/\/api\/vouchers\/automate/g, '/api/gift-cards/workflow')
    .replace(/\/api\/vouchers/g, '/api/gift-cards')
    .replace(/\/api\/promo-codes/g, '/api/coupons')
    .replace(/\/api\/voucher-bundles/g, '/api/package-offers');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Updated:', file);
  }
});
