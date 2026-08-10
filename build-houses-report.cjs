#!/usr/bin/env node
/**
 * Збирає reports/PNL-та-будинки-липень-2026.md — P&L за червень-липень плюс
 * бронювання липня по шести будинках (A1, A2, B1, B2, B3, B4): ночі й вартість.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'reports');
const OUT = path.join(OUT_DIR, 'PNL-та-будинки-липень-2026.md');
const JSON_DIR = '/tmp/pnlout';

const db = new Database(path.join(__dirname, 'data/alisio.db'), { readonly: true });

// Шість будинків у порядку, в якому їх називає власник. Ключ — id юніта, бо
// назви в базі змішані («River Wood-A1», «B4 - Svitanok»).
const HOUSES = [
  { code: 'A1', id: 'u_mr1', label: 'A1 — River Wood', type: 'Mirror House' },
  { code: 'A2', id: 'u_mr2', label: 'A2 — Slow Down', type: 'Mirror House' },
  { code: 'B1', id: 'u_st1', label: 'B1 — Stealth', type: 'Stealth House' },
  { code: 'B2', id: 'u_st2', label: 'B2 — Stealth', type: 'Stealth House' },
  { code: 'B3', id: 'u_st3', label: 'B3 — Mirror Forest', type: 'Stealth House' },
  { code: 'B4', id: '1e7f6c7bd383af9cdfaa43eb50160148', label: 'B4 — Svitanok', type: 'Stealth House' },
];
const byId = new Map(HOUSES.map((h) => [h.id, h]));

const n = (v) => (v == null ? '' : Number(v).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const n0 = (v) => (v == null ? '' : Math.round(Number(v)).toLocaleString('uk-UA'));
const L = [];
const w = (s = '') => L.push(s);

const PERIODS = [
  { key: '2026-07', name: 'Липень', from: '2026-07-01', to: '2026-08-01', days: 31 },
  { key: '2026-06', name: 'Червень', from: '2026-06-01', to: '2026-07-01', days: 30 },
];

const fetchRes = (from, to) => db.prepare(`
  SELECT r.id, r.unit_id, r.check_in, r.check_out, r.nights, r.total_price,
         r.status, r.payment_status, r.source, r.registration_status,
         r.adults, r.children, COALESCE(r.parent_id,'') parent_id,
         TRIM(COALESCE(g.first_name,'') || ' ' || COALESCE(g.last_name,'')) guest,
         CAST(julianday(MIN(r.check_out, ?)) - julianday(MAX(r.check_in, ?)) AS INTEGER) nights_p,
         COALESCE((SELECT SUM(o.amount_company) FROM fin_operations o
                    WHERE o.reservation_id = r.id AND o.op_type='income' AND o.status='completed'),0)
       - COALESCE((SELECT SUM(o.amount_company) FROM fin_operations o
                    WHERE o.reservation_id = r.id AND o.payment_subtype='refund' AND o.status='completed'),0) paid_in_pms
  FROM reservations r LEFT JOIN guests g ON g.id = r.guest_id
  WHERE r.unit_id IN (${HOUSES.map(() => '?').join(',')})
    AND r.check_in < ? AND r.check_out > ?
  ORDER BY r.check_in
`).all(to, from, ...HOUSES.map((h) => h.id), to, from).map((r) => {
  const nights_p = Math.max(0, r.nights_p || 0);
  const totalNights = r.nights > 0 ? r.nights : (nights_p || 1);
  return { ...r, nights_p, price_p: (r.total_price || 0) * (nights_p / totalNights) };
});

// ─────────────────────────── P&L ───────────────────────────
const matrix = JSON.parse(fs.readFileSync(path.join(JSON_DIR, 'matrix.json'), 'utf8'));
const pnl2 = {
  '2026-06': JSON.parse(fs.readFileSync(path.join(JSON_DIR, 'pnl2-2026-06.json'), 'utf8')),
  '2026-07': JSON.parse(fs.readFileSync(path.join(JSON_DIR, 'pnl2-2026-07.json'), 'utf8')),
};

w('# P&L і будинки — липень 2026');
w();
w(`KEMP CARLSBAD s.r.o. · складено ${db.prepare("SELECT datetime('now') d").get().d} UTC`);
w();
w('Усі суми в CZK. Базис P&L — **нарахування** (`accrued_at`): передоплата віднесена до місяця проживання, ' +
  'а не до місяця надходження грошей.');
w();
w('Будинки: **A1** River Wood · **A2** Slow Down · **B1** Stealth · **B2** Stealth · **B3** Mirror Forest · **B4** Svitanok.');
w();
w('---');
w();
w('## 1. P&L за статтями (червень–липень)');
w();
w('Джерело: звіт «P&L» у ПМС (`/finance/reports/pnl`).');
w();
{
  const months = matrix.months;
  w(`| Стаття | ${months.join(' | ')} | Разом |`);
  w(`|---|${months.map(() => '---:').join('|')}|---:|`);
  for (const s of matrix.sections) {
    const bold = s.isDerived || s.isTotal;
    w(`| ${bold ? `**${s.name}**` : s.name} | ${months.map((m) => n0(s.byMonth[m] || 0)).join(' | ')} | ${bold ? `**${n0(s.total)}**` : n0(s.total)} |`);
    for (const r of s.rows || []) {
      w(`| ⤷ ${r.category_name} | ${months.map((m) => n0(r.months[m] || 0)).join(' | ')} | ${n0(r.total)} |`);
    }
  }
}

w();
w('## 2. P&L по напрямках');
w();
w('Джерело: «P&L-2» (`/finance/reports/pnl-2`). Спільні витрати «Загальне» розкидані за сезонним правилом ' +
  '(сезон 25.05–30.09): Будова F/D 25%, Кемпінг 35%, Glamping 25%, Ресторан 10%, СПА 5%. ' +
  'Колонка **Glamping** — це і є шість будинків.');
for (const p of PERIODS.slice().reverse()) {
  const d = pnl2[p.key];
  w();
  w(`### ${p.name} 2026`);
  w();
  w(`| Стаття | ${d.businessUnits.map((b) => b.name).join(' | ')} | Разом |`);
  w(`|---|${d.businessUnits.map(() => '---:').join('|')}|---:|`);
  for (const r of d.rows) {
    const bold = r.type === 'calc' || ['revenue', 'net', 'cash', 'store_ebitda'].includes(r.key);
    w(`| ${bold ? `**${r.name}**` : r.name} | ${d.businessUnits.map((b) => n0(r.buValues[b.id] || 0)).join(' | ')} | ${bold ? `**${n0(r.total)}**` : n0(r.total)} |`);
  }
}

// ─────────────────── Будинки: липень ───────────────────
const july = PERIODS[0];
const resJuly = fetchRes(july.from, july.to);
const live = resJuly.filter((r) => r.status !== 'cancelled');
const cancelled = resJuly.filter((r) => r.status === 'cancelled');

const agg = (rows) => rows.reduce((s, r) => ({
  res: s.res + 1, nights: s.nights + r.nights_p, price: s.price + r.price_p, full: s.full + (r.total_price || 0),
}), { res: 0, nights: 0, price: 0, full: 0 });

w();
w('---');
w();
w('## 3. Будинки за липень — зведення');
w();
w('Це **бронювання, що відбулися**: скасовані виключені й показані окремо в розділі 5. ' +
  '«Ночей у липні» — тільки ночі, що припадають на липень. «Вартість липня» — пропорційна цим ночам частина ' +
  'вартості бронювання (заїзд міг перейти межу місяця).');
w();
w('| Будинок | Тип | Бронювань | Ночей у липні | Завантаження | Вартість липня | Середня за ніч | Дохід на добу будинку |');
w('|---|---|---:|---:|---:|---:|---:|---:|');
let tot = { res: 0, nights: 0, price: 0, full: 0 };
for (const h of HOUSES) {
  const rows = live.filter((r) => r.unit_id === h.id);
  const a = agg(rows);
  tot = { res: tot.res + a.res, nights: tot.nights + a.nights, price: tot.price + a.price, full: tot.full + a.full };
  w(`| **${h.code}** ${h.label.replace(/^\S+ — /, '')} | ${h.type} | ${a.res} | ${a.nights} | ` +
    `${((a.nights / july.days) * 100).toFixed(0)}% | ${n(a.price)} | ${a.nights ? n(a.price / a.nights) : '—'} | ${n(a.price / july.days)} |`);
}
w(`| **Разом 6 будинків** | | **${tot.res}** | **${tot.nights}** | ` +
  `**${((tot.nights / (HOUSES.length * july.days)) * 100).toFixed(0)}%** | **${n(tot.price)}** | ` +
  `**${tot.nights ? n(tot.price / tot.nights) : '—'}** | **${n(tot.price / (HOUSES.length * july.days))}** |`);
w();
w('«Дохід на добу будинку» — вартість липня, поділена на 31 добу: показує, скільки будинок приносить у середньому ' +
  'за кожну добу місяця незалежно від того, зайнятий він чи стоїть.');

// Порівняння з червнем
const resJune = fetchRes(PERIODS[1].from, PERIODS[1].to).filter((r) => r.status !== 'cancelled');
w();
w('### Порівняння з червнем');
w();
w('| Будинок | Ночей чер | Ночей лип | Вартість чер | Вартість лип | Зміна |');
w('|---|---:|---:|---:|---:|---:|');
let jt = { n: 0, p: 0 }, lt = { n: 0, p: 0 };
for (const h of HOUSES) {
  const aJ = agg(resJune.filter((r) => r.unit_id === h.id));
  const aL = agg(live.filter((r) => r.unit_id === h.id));
  jt = { n: jt.n + aJ.nights, p: jt.p + aJ.price };
  lt = { n: lt.n + aL.nights, p: lt.p + aL.price };
  const delta = aJ.price > 0 ? `${(((aL.price - aJ.price) / aJ.price) * 100).toFixed(0)}%` : (aL.price > 0 ? 'з нуля' : '—');
  w(`| **${h.code}** | ${aJ.nights} | ${aL.nights} | ${n(aJ.price)} | ${n(aL.price)} | ${delta} |`);
}
w(`| **Разом** | **${jt.n}** | **${lt.n}** | **${n(jt.p)}** | **${n(lt.p)}** | ` +
  `**${jt.p > 0 ? `${(((lt.p - jt.p) / jt.p) * 100).toFixed(0)}%` : '—'}** |`);

// ─────────────────── Деталізація ───────────────────
w();
w('---');
w();
w('## 4. Кожне бронювання липня по будинках');
w();
for (const h of HOUSES) {
  const rows = live.filter((r) => r.unit_id === h.id).sort((a, b) => a.check_in.localeCompare(b.check_in));
  const a = agg(rows);
  w(`### ${h.code} — ${h.label.replace(/^\S+ — /, '')} (${h.type})`);
  w();
  if (!rows.length) {
    w('Бронювань у липні не було — будинок простояв увесь місяць.');
    w();
    continue;
  }
  w('| Заїзд | Виїзд | Ночей | З них у липні | Гостей | Вартість | Вартість липня | За ніч | Канал | Оплата | Статус | Реєстрація |');
  w('|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|');
  for (const r of rows) {
    const guests = (r.adults || 0) + (r.children || 0);
    w(`| ${r.check_in} | ${r.check_out} | ${r.nights} | ${r.nights_p} | ${guests || '—'} | ${n(r.total_price)} | ` +
      `${n(r.price_p)} | ${r.nights ? n((r.total_price || 0) / r.nights) : '—'} | ${r.source} | ${r.payment_status} | ` +
      `${r.status} | ${r.registration_status || '—'} |`);
  }
  w(`| **Разом** | | | **${a.nights}** | | | **${n(a.price)}** | | | | | |`);
  w();
}

// ─────────────────── Скасовані ───────────────────
w();
w('## 5. Скасовані бронювання липня по будинках');
w();
w('Показую окремо, бо в ПМС більшість із них має `payment_status = paid` — але це метадані каналу ' +
  '(Booking.com так позначає передоплату віртуальною картою), а не отримані гроші: **ні в однієї з цих ' +
  'броней немає ні привязаного надходження, ні повернення** у фінансах. Тобто як дохід їх рахувати не можна, ' +
  'але як втрачений попит — варто бачити.');
w();
if (cancelled.length) {
  w('| Будинок | Заїзд | Виїзд | Ночей у липні | Вартість липня | Канал | Оплата в ПМС |');
  w('|---|---|---|---:|---:|---|---|');
  for (const r of cancelled.sort((a, b) => (byId.get(a.unit_id)?.code || '').localeCompare(byId.get(b.unit_id)?.code || '') || a.check_in.localeCompare(b.check_in))) {
    w(`| ${byId.get(r.unit_id)?.code || '?'} | ${r.check_in} | ${r.check_out} | ${r.nights_p} | ${n(r.price_p)} | ${r.source} | ${r.payment_status} |`);
  }
  const c = agg(cancelled);
  w(`| **Разом** | | | **${c.nights}** | **${n(c.price)}** | | |`);
  w();
  w(`Якби ці ${c.res} бронювань відбулися, липень по будинках був би ${n(tot.price + c.price)} замість ${n(tot.price)}, ` +
    `а завантаження ${(((tot.nights + c.nights) / (HOUSES.length * july.days)) * 100).toFixed(0)}% замість ` +
    `${((tot.nights / (HOUSES.length * july.days)) * 100).toFixed(0)}%.`);
}

// ─────────────────── Застереження ───────────────────
const noShow = live.filter((r) => r.status === 'no_show');
const noShowReg = noShow.filter((r) => r.registration_status === 'registered');
const zeroPrice = live.filter((r) => (r.total_price || 0) === 0);
const linked = live.filter((r) => r.paid_in_pms > 0);
const glampRevJuly = pnl2['2026-07'].rows.find((r) => r.key === 'revenue')?.buValues['bu_glamping'] || 0;
const royaltyJuly = pnl2['2026-07'].rows.find((r) => r.key === 'royalty')?.buValues['bu_glamping'] || 0;

w();
w('---');
w();
w('## 6. Що треба знати про ці цифри');
w();
w(`1. **Статус \`no_show\` тут не означає, що гість не приїхав.** З ${live.length} бронювань липня ` +
  `${noShow.length} стоять як \`no_show\`, і ${noShowReg.length} з них мають гостей, **зареєстрованих в Ubyport** — ` +
  `тобто люди жили. Схоже, у ПМС просто не тиснуть «заселити/виселити». Тому я фільтрував за фактом ` +
  `бронювання, а не за статусом.`);
if (zeroPrice.length) {
  w(`2. **${zeroPrice.length === 1 ? 'Одне бронювання' : `${zeroPrice.length} бронювань`} з вартістю 0** — це під-бронювання групи, де вся сума записана на ` +
    `іншому будинку: ${zeroPrice.map((r) => `${byId.get(r.unit_id)?.code} ${r.check_in}`).join(', ')}. ` +
    `Ночі в них є, вартості немає, тому по цьому будинку вона занижена.`);
}
w(`3. **Вартість ≠ отримані гроші.** ${linked.length === 0 ? 'Жодне' : `Лише ${linked.length}`} з ${live.length} ` +
  `бронювань липня ${linked.length === 0 ? 'не має' : 'мають'} привязаної операції у фінансах: гроші прийшли ` +
  `зведеними виплатами Booking.com, Airbnb і Teya, які ПМС не розкладає на бронювання. Тому таблиці — це ` +
  `**вартість за прайсом**, а не підтверджені надходження.`);
w(`4. ⚠️ **Вартість бронювань перевищує виручку Glamping у P&L, і це розходження не закрите.** ` +
  `Бронювання будинків за липень — ${n(tot.price)}, виручка напрямку Glamping у P&L — ${n(glampRevJuly)}, ` +
  `тобто прайс на ${n(tot.price - glampRevJuly)} більший за визнані гроші. Причина може бути в будь-якому з трьох: ` +
  `виплата Booking.com за кінець липня надійшла вже в серпні; частина грошей рознесена на інший напрямок; ` +
  `або ціна бронювання завищена — дивись «Варто перевірити ціну» нижче, там одне бронювання на ${n(53940)} ` +
  `майже дорівнює всьому розходженню. Перед звітом це варто закрити.`);
if (royaltyJuly) {
  w(`5. **Роялті інвестору** за липень у P&L — ${n(royaltyJuly)} (30% від виручки Glamping). Саме через нього ` +
    `напрямок виходить у мінус, хоч Store-level EBITDA додатній.`);
}
w(`6. **Завантаження** пораховане як ночі / 31 добу на будинок. «Дохід на добу будинку» рахує всі 31 добу, ` +
  `включно з порожніми.`);

// Ціна за ніч, що різко вибивається з історії будинку, — найчастіше це або
// справді пікова ціна, або сума за все бронювання, вбита як ціна за добу.
const norms = new Map(db.prepare(`
  SELECT r.unit_id, AVG(r.total_price / r.nights) avg_rate, COUNT(*) c
  FROM reservations r
  WHERE r.unit_id IN (${HOUSES.map(() => '?').join(',')})
    AND r.status != 'cancelled' AND r.nights > 0 AND r.total_price > 0
  GROUP BY r.unit_id`).all(...HOUSES.map((h) => h.id)).map((x) => [x.unit_id, x]));

const outliers = live
  .filter((r) => r.nights > 0 && r.total_price > 0)
  .map((r) => ({ r, rate: r.total_price / r.nights, norm: norms.get(r.unit_id)?.avg_rate || 0 }))
  .filter((x) => x.norm > 0 && x.rate > x.norm * 2)
  .sort((a, b) => b.r.price_p - a.r.price_p);

if (outliers.length) {
  w();
  w('### Варто перевірити ціну');
  w();
  w('Ці бронювання мають ціну за ніч більш ніж удвічі вищу за середню по цьому будинку. Це або справді пікова ціна, ' +
    'або сума за все бронювання, вбита як ціна за добу — і тоді липень завищений.');
  w();
  w('| Будинок | Заїзд | Виїзд | Ночей | Вартість | За ніч | Середня по будинку | Канал |');
  w('|---|---|---|---:|---:|---:|---:|---|');
  for (const x of outliers) {
    w(`| ${byId.get(x.r.unit_id)?.code} | ${x.r.check_in} | ${x.r.check_out} | ${x.r.nights} | ${n(x.r.total_price)} | ` +
      `**${n(x.rate)}** | ${n(x.norm)} | ${x.r.source} |`);
  }
  const outSum = outliers.reduce((s, x) => s + x.r.price_p, 0);
  w();
  w(`${outliers.length === 1 ? 'Це бронювання дає' : `Разом ці ${outliers.length} бронювань дають`} ${n(outSum)} — це ${((outSum / tot.price) * 100).toFixed(0)}% ` +
    `усієї вартості будинків за липень. Якщо ціна десь помилкова, підсумок розділу 3 зміниться помітно.`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, L.join('\n') + '\n');
console.log(`✅ ${OUT}  (${(fs.statSync(OUT).size / 1024).toFixed(1)} КБ)`);
console.log(`   липень, що відбулося: ${tot.res} броней, ${tot.nights} ночей, ${tot.price.toFixed(2)} CZK`);
console.log(`   скасовано: ${cancelled.length} броней, ${agg(cancelled).nights} ночей, ${agg(cancelled).price.toFixed(2)} CZK`);
db.close();
