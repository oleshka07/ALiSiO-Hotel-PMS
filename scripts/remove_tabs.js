const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove GiftCardsTab and Types
const giftCardStart = content.indexOf('/* ───── GiftCard Types ───── */');
const mainPageStart = content.indexOf('/* ───── Main Page ───── */');
if (giftCardStart !== -1 && mainPageStart !== -1) {
  content = content.substring(0, giftCardStart) + content.substring(mainPageStart);
}

// 2. Remove lucide imports
content = content.replace(
  /Ticket,\s*Gift,\s*Check,\s*AlertCircle,/,
  ''
);

// 3. Remove activeTab state
content = content.replace(
  /const \[activeTab, setActiveTab\] = useState\<'sites' \| 'giftCards'\>\('sites'\);\s*/,
  ''
);

// 4. Remove Tab navigation HTML
const tabNavRegex = /\{\/\* ── Tab navigation ── \*\/\}([\s\S]*?)\{\/\* ── Sites tab ── \*\/\}/;
content = content.replace(tabNavRegex, '');

// 5. Remove the conditional render for sites tab
content = content.replace(/\{activeTab === 'sites' && \(\s*<>\s*/, '');

// 6. Remove the closing tag for the conditional render
const closingTagRegex = /<\/Modal>\s*<\/>\s*\)\}/;
content = content.replace(closingTagRegex, '</Modal>');

fs.writeFileSync(file, content, 'utf8');
console.log('Removed Ваучери tab successfully.');
