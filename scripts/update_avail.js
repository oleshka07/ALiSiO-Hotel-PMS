const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/modules/bookings/api/widget-availability.handlers.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace the rate plan loading logic
const newRatePlanLogic = `
    let activeRatePlan: any = null;
    let activeBundle: any = null;

    // Load active rate plan or default
    if (ratePlanId) {
      activeRatePlan = db.prepare('SELECT * FROM rate_plans WHERE id = ? OR code = ?').get(ratePlanId, ratePlanId);
    } else {
      activeRatePlan = db.prepare('SELECT * FROM rate_plans WHERE is_default = 1 LIMIT 1').get();
    }

    if (bundleId) {
      activeBundle = db.prepare('SELECT * FROM voucher_bundles WHERE id = ? OR promo_code = ?').get(bundleId, bundleId);
    }
`;

content = content.replace(
  /    let activeRatePlan: any = null;\n    let activeBundle: any = null;\n\n    if \(ratePlanId\) \{\n      activeRatePlan = db\.prepare\('SELECT \* FROM rate_plans WHERE id = \? OR code = \?'\)\.get\(ratePlanId, ratePlanId\);\n    \}\n    if \(bundleId\) \{\n      activeBundle = db\.prepare\('SELECT \* FROM voucher_bundles WHERE id = \? OR promo_code = \?'\)\.get\(bundleId, bundleId\);\n    \}/g,
  newRatePlanLogic
);

fs.writeFileSync(file, content, 'utf8');
console.log('Updated rate plan loading');
