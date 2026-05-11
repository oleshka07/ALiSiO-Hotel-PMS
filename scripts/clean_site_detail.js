const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/[siteId]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove import
content = content.replace(/import \{ SiteGiftCardsTab \} from '\.\/_components\/SiteGiftCardsTab';\r?\n/, '');

// 2. Remove count callback
content = content.replace(/\s*const giftCardCountCb = useRef\(setCount\('vouchers'\)\)\.current;\r?\n/, '\n');

// 3. Remove fetch
content = content.replace(/\s*fetch\(`\/api\/gift-cards\?site_id=\$\{siteId\}`\)\.then\(r => r\.json\(\)\)\.catch\(\(\) => null\),\r?\n/, '\n');

// 4. Remove promise handling line
content = content.replace(/\s*if \(voucherData\?\.vouchers\) giftCardCountCb\(voucherData\.giftCards\.length\);\r?\n/, '\n');

// 5. Update Promise.all signature (remove voucherData)
content = content.replace(/\]\)\.then\(\(\[couponData, voucherData, bundleData, ratePlanData\]\) => \{/, ']).then(([couponData, bundleData, ratePlanData]) => {');

// 6. Remove the tab render line
content = content.replace(/\s*\{activeTab === 'vouchers'    && <SiteGiftCardsTab siteId=\{siteId\} onCountChange=\{giftCardCountCb\} \/>\}\r?\n/, '\n');

fs.writeFileSync(file, content, 'utf8');
console.log('Cleaned up site detail page successfully.');
