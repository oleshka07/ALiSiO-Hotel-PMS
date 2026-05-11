const fs = require('fs');

const file = 'C:/Projects/web dev/ALiSiO-Hotel-PMS/src/app/(dashboard)/sites/[siteId]/_components/RatePlansTab.tsx';
let content = fs.readFileSync(file, 'utf8');

const mealSectionRegex = /\{\/\* Meals \*\/\}\s*<div style=\{\{ borderTop: '1px solid var\(--border-primary\)', paddingTop: 24 \}\}>\s*<h4 style=\{\{ margin: '0 0 8px 0', fontSize: 16 \}\}>Прийоми їжі<\/h4>[\s\S]*?<\/div>\s*<\/div>/;

if (mealSectionRegex.test(content)) {
  content = content.replace(mealSectionRegex, '');
  fs.writeFileSync(file, content, 'utf8');
  console.log('Removed Meals section successfully.');
} else {
  console.log('Meals section not found.');
}
