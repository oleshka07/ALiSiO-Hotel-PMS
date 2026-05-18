const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/[siteId]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove import
content = content.replace(/import \{ SiteGiftCardsTab \} from '\.\/_components\/SiteGiftCardsTab';\r?\n/, '');

// 2. Remove count callback
content = content.replace(/\s*const giftCardCountCb = useRef\(setCount\('gift_cards'\)\)\.current;\r?\n/, '\n');

// 3. Remove fetch
content = content.replace(/\s*fetch\(`\/api\/gift-cards\?site_id=\$\{siteId\}`\)\.then\(r => r\.json\(\)\)\.catch\(\(\) => null\),\r?\n/, '\n');

// 4. Remove promise handling line
content = content.replace(/\s*if \(gift_cardData\?\.gift_cards\) giftCardCountCb\(gift_cardData\.giftCards\.length\);\r?\n/, '\n');

// 5. Update Promise.all signature (remove gift_cardData)
content = content.replace(/\]\)\.then\(\(\[couponData, gift_cardData, bundleData, ratePlanData\]\) => \{/, ']).then(([couponData, bundleData, ratePlanData]) => {');

// 6. Remove the tab render line
content = content.replace(/\s*\{activeTab === 'gift_cards'    && <SiteGiftCardsTab siteId=\{siteId\} onCountChange=\{giftCardCountCb\} \/>\}\r?\n/, '\n');

fs.writeFileSync(file, content, 'utf8');
console.log('Cleaned up site detail page successfully.');
