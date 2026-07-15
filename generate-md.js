const fs = require('fs');

const raw = fs.readFileSync('may_bookings.json', 'utf-8');
const lines = raw.split('\n').filter(line => !line.includes('[DB]')).join('\n');
const bookings = JSON.parse(lines);

let md = `# Бронювання за Травень 2026 (Бойова база)\n\n`;

const targetUnits = ['A1', 'A2', 'B1', 'B2', 'B3', 'B4'];

md += `| Будинок | Гість | Заїзд | Виїзд | Ночей | Сума | Джерело | Статус |\n`;
md += `|---------|-------|-------|-------|-------|------|---------|--------|\n`;

let totalNights = 0;
let totalSum = 0;

const byUnit = {};
for (const unit of targetUnits) {
  byUnit[unit] = { nights: 0, sum: 0, count: 0 };
}

bookings.forEach(b => {
  const u = b.unit_name || '';
  let include = false;
  for (const unit of targetUnits) {
    if (u.includes(unit)) {
      include = unit;
      break;
    }
  }
  
  if (include) {
    md += `| ${include} | ${b.guest_name || '?'} | ${b.check_in} | ${b.check_out} | ${b.nights} | ${b.total_price} ${b.currency} | ${b.source} | ${b.status} |\n`;
    byUnit[include].nights += b.nights || 0;
    byUnit[include].sum += b.total_price || 0;
    byUnit[include].count++;
    totalNights += b.nights || 0;
    totalSum += b.total_price || 0;
  }
});

md += `\n## Підсумки по будинках\n\n`;
md += `| Будинок | Кількість бронювань | Зайнято ночей | Загальний дохід (CZK) | Завантаженість (з 31 ночі) |\n`;
md += `|---------|---------------------|---------------|-----------------------|----------------------------|\n`;

for (const unit of targetUnits) {
  const st = byUnit[unit];
  const occ = ((st.nights / 31) * 100).toFixed(1);
  md += `| ${unit} | ${st.count} | ${st.nights} | ${st.sum.toFixed(2)} | ${occ}% |\n`;
}

md += `\n**Загальна кількість ночей по всім 6 будинках:** ${totalNights}\n`;
md += `**Загальна сума доходу:** ${totalSum.toFixed(2)} CZK\n`;

fs.writeFileSync('C:/Users/stepe/.gemini/antigravity/brain/2f1a9d3d-2378-4989-b612-40b6a88d4a7b/live_may_bookings_table.md', md);
