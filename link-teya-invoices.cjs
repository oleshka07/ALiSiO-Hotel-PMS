#!/usr/bin/env node
/* eslint-disable */
/**
 * link-teya-invoices.cjs — tie every Teya transaction to the bank settlement that
 * paid it, and attribute it to the business unit that earned it.
 *
 * The bank receives Teya money as a lump per settlement — daily for the
 * restaurant and the two web stores, batched over several days for the camping
 * terminal — so a settlement line says nothing about what was sold. The
 * per-transaction detail already exists: the operator uploads the Teya report and
 * each transaction becomes an invoice in series TEYA whose notes carry the date,
 * the device and the amount:
 *
 *   teya:teya_2026-07-31_mC6OdAth_275
 *
 * and one device is always one store — checked across all ten, no overlap. What
 * was missing is the link: fin_operation_id was NULL on all 372 invoices.
 *
 * Attribution:
 *   Restaurace              → Ресторан
 *   qa-glamping.eu          → Glamping
 *   Camping / kemp-carlsbad → Кемпинг, unless the single payment exceeds 3 400,
 *                             which makes it a glamping house
 *
 * The threshold is the owner's rule and it holds against the PMS: no camping
 * pitch booking has ever reached 3 400 (BB tops out at 3 350, FB at 3 000, F
 * rooms at 2 760) while Mirror House averages 6 219 and Stealth 4 475. The PMS
 * bookings that would break it came through direct and booking_com, which never
 * touch Teya, so inside this data the rule has neither a false positive nor a
 * miss.
 *
 * Settlements are matched by walking each store's transactions oldest-first and
 * accumulating until the net sum equals the settlement, because that is how Teya
 * pays: sequential batches, never reordered. A store whose transactions do not
 * add up is reported and left alone rather than forced.
 *
 * READ-ONLY unless --apply. Writes only invoices.fin_operation_id.
 *
 *   node link-teya-invoices.cjs <teya-report.csv> <from> <to>
 *   node link-teya-invoices.cjs <teya-report.csv> 2026-06-01 2026-07-31 --apply
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const REPORT = process.argv[2];
const FROM = process.argv[3];
const TO = process.argv[4];
const APPLY = process.argv.includes('--apply');
const TOL = 0.06;      // haléř rounding between Teya and the bank
const THRESHOLD = 3400;

if (!REPORT || !FROM || !TO) {
  console.error('Використання: node link-teya-invoices.cjs <звіт.csv> <від РРРР-ММ-ДД> <до РРРР-ММ-ДД> [--apply]');
  process.exit(2);
}
if (!fs.existsSync(REPORT)) { console.error(`❌ звіт не знайдено: ${REPORT}`); process.exit(1); }

const STORE_UNIT = {
  'Restaurace KEMP CARLSBAD': { bu: 'bu_restaurant', cat: 'ec_restaurant' },
  'https://qa-glamping.eu/': { bu: 'bu_glamping', cat: 'ec_accommodation' },
  'Camping KEMP CARLSBAD': { bu: 'bu_camping', cat: 'ec_accommodation' },
  'https://kemp-carlsbad.cz/': { bu: 'bu_camping', cat: 'ec_accommodation' },
};
const THRESHOLD_STORES = new Set(['Camping KEMP CARLSBAD', 'https://kemp-carlsbad.cz/']);
const GLAMPING = { bu: 'bu_glamping', cat: 'ec_accommodation' };
// Which bank reference belongs to which store. Verified to the haléř on a clean
// settlement window; see setup-teya-rules.cjs for the figures.
const REF_STORE = {
  '5155056TEYA': 'Restaurace KEMP CARLSBAD',
  '5155087TEYA': 'https://qa-glamping.eu/',
  '5155073TEYA': 'https://kemp-carlsbad.cz/',
  '5095484TEYA': 'Camping KEMP CARLSBAD',
};

function splitCsvLine(l) {
  const f = []; let cur = '', q = false;
  for (const ch of l) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { f.push(cur); cur = ''; }
    else cur += ch;
  }
  f.push(cur); return f;
}
const lines = fs.readFileSync(REPORT, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const head = splitCsvLine(lines[0].replace(/^﻿/, ''));
const rep = lines.slice(1).map((l) => Object.fromEntries(splitCsvLine(l).map((v, i) => [head[i], v])));
const num = (x) => { const n = parseFloat(String(x || '').replace(/\s/g, '')); return isFinite(n) ? n : 0; };

const devStore = {};
const fees = new Map(); const seenRep = new Map();
for (const r of rep) {
  if (!r['Device ID']) continue;
  devStore[r['Device ID']] = r['Store name'];
  const k = `${r.Date}|${r['Device ID']}|${num(r.Sales).toFixed(2)}|${r['Payment type']}`;
  const n = (seenRep.get(k) || 0) + 1; seenRep.set(k, n);
  fees.set(`${k}|${n}`, num(r['Total fees']));
}

const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'));
db.pragma('busy_timeout = 15000');

// ── transactions, from the invoice series ────────────────────────────────────
const invs = db.prepare(`
  SELECT id, invoice_number, notes, amount, issued_at, fin_operation_id
  FROM invoices WHERE series = 'TEYA' AND date(issued_at) BETWEEN ? AND ?
  ORDER BY issued_at, invoice_number
`).all(FROM, TO);

const seenInv = new Map();
const tx = []; const unparsed = [];
for (const iv of invs) {
  const m = /^teya:teya_(\d{4}-\d{2}-\d{2})_([A-Za-z0-9]+)_(\d+(?:\.\d+)?)(_REFUND)?(?:_(\d+))?$/.exec(iv.notes || '');
  if (!m) { unparsed.push(iv); continue; }
  const [, date, dev, amtS, isRefund] = m;
  const amt = parseFloat(amtS);
  const store = devStore[dev];
  if (!store) { unparsed.push(iv); continue; }
  const key = `${date}|${dev}|${amt.toFixed(2)}|${isRefund ? 'REFUND' : 'PAYMENT'}`;
  const n = (seenInv.get(key) || 0) + 1; seenInv.set(key, n);
  const fee = fees.get(`${key}|${n}`) ?? 0;
  const unit = (THRESHOLD_STORES.has(store) && amt > THRESHOLD) ? GLAMPING : STORE_UNIT[store];
  tx.push({
    invId: iv.id, no: iv.invoice_number, date, dev, store, amt, fee,
    refund: !!isRefund, unit, net: (isRefund ? -amt : amt) - fee,
    linked: iv.fin_operation_id,
  });
}

console.log(`період ${FROM} → ${TO}`);
console.log(`фактур серії TEYA: ${invs.length}   розпізнано: ${tx.length}   не розпізнано: ${unparsed.length}`);
for (const u of unparsed.slice(0, 5)) console.log(`   ⚠️  ${u.invoice_number}  ${u.notes}`);
if (unparsed.length) { console.error('\n❌ є нерозпізнані фактури — не пишу нічого'); process.exit(1); }

// ── settlements, from the ledger ─────────────────────────────────────────────
const ops = db.prepare(`
  SELECT id, paid_at, amount, comment, account_to_id FROM fin_operations
  WHERE op_type = 'income' AND comment LIKE '%Banking Circle%'
    AND date(paid_at) BETWEEN date(?, '-3 day') AND date(?, '+12 day')
  ORDER BY paid_at
`).all(FROM, TO);

const KEMP_GOLD = db.prepare("SELECT id FROM finance_accounts WHERE name LIKE '%KEMP Gold%'").get()?.id;
function storeOfOp(op) {
  for (const [ref, st] of Object.entries(REF_STORE)) if ((op.comment || '').includes(ref)) return st;
  if (/Bezkemp/i.test(op.comment || '')) return null;               // not acquiring
  if (op.account_to_id === KEMP_GOLD) return 'Camping KEMP CARLSBAD'; // SY000 on Gold is camping
  return null;                                                      // ambiguous
}

// ── allocate: per store, oldest transactions first, until the settlement matches
const report = [];
let linked = 0, unmatchedTx = 0;
const assign = new Map();  // invoice id → operation id

for (const store of Object.keys(STORE_UNIT)) {
  const stTx = tx.filter((t) => t.store === store).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const stOps = ops.filter((o) => storeOfOp(o) === store).sort((a, b) => (a.paid_at < b.paid_at ? -1 : 1));
  let i = 0;
  for (const op of stOps) {
    let sum = 0; const take = [];
    while (i < stTx.length) {
      // never pull in a transaction dated after the settlement
      if (stTx[i].date > String(op.paid_at).slice(0, 10)) break;
      sum += stTx[i].net; take.push(stTx[i]); i++;
      if (Math.abs(sum - op.amount) < TOL) break;
    }
    const ok = Math.abs(sum - op.amount) < TOL;
    if (ok) {
      for (const t of take) assign.set(t.invId, op.id);
      linked += take.length;
    } else {
      i -= take.length; // give them back
    }
    report.push({ op, store, n: take.length, sum, ok });
  }
  unmatchedTx += stTx.length - i;
}

console.log('\nЗІСТАВЛЕННЯ РОЗРАХУНКІВ:');
for (const r of report) {
  const mark = r.ok ? '✅' : '❌';
  console.log(`  ${mark} ${String(r.op.paid_at).slice(0, 10)}  банк ${r.op.amount.toFixed(2).padStart(10)}  транзакцій ${String(r.n).padStart(3)}  сума ${r.sum.toFixed(2).padStart(10)}  ${r.store}`);
}
const okCount = report.filter((r) => r.ok).length;
console.log(`\nрозрахунків зіставлено: ${okCount}/${report.length}   транзакцій привʼязано: ${linked}/${tx.length}`);
if (unmatchedTx) console.log(`⚠️  транзакцій без розрахунку: ${unmatchedTx} (найсвіжіші — розрахунок ще не прийшов)`);

console.log('\nЗА БІЗНЕС-ЮНІТАМИ (те, що має показувати P&L):');
const byBu = {};
for (const t of tx) {
  const k = t.unit.bu;
  byBu[k] = byBu[k] || { n: 0, gross: 0, net: 0 };
  byBu[k].n++; byBu[k].gross += t.refund ? -t.amt : t.amt; byBu[k].net += t.net;
}
for (const [bu, v] of Object.entries(byBu).sort((a, b) => b[1].net - a[1].net)) {
  const name = db.prepare('SELECT name FROM business_units WHERE id = ?').get(bu)?.name || bu;
  console.log(`  ${name.padEnd(12)} ${String(v.n).padStart(4)} тр.  обіг ${v.gross.toFixed(2).padStart(11)}  нетто ${v.net.toFixed(2).padStart(11)}`);
}

const moved = tx.filter((t) => THRESHOLD_STORES.has(t.store) && t.amt > THRESHOLD);
console.log(`\nПОНАД ПОРОГОМ ${THRESHOLD} — глемпінг, оплачений на кемпінговому пристрої: ${moved.length} тр., обіг ${moved.reduce((s, t) => s + t.amt, 0).toFixed(2)}`);
for (const t of moved) {
  const opId = assign.get(t.invId);
  console.log(`  ${t.date}  ${t.amt.toFixed(2).padStart(9)}  ${t.no}  розрахунок: ${opId || '—'}`);
}

if (!APPLY) { console.log('\nПробний прогін. Нічого не змінено. Для запису — з --apply'); process.exit(0); }
if (!assign.size) { console.log('\nПривʼязувати нічого.'); process.exit(0); }

const upd = db.prepare('UPDATE invoices SET fin_operation_id = ? WHERE id = ? AND series = \'TEYA\'');
let wrote = 0;
db.transaction(() => {
  for (const [invId, opId] of assign) {
    const r = upd.run(opId, invId);
    if (r.changes !== 1) throw new Error(`очікував 1 зміну для фактури ${invId}`);
    wrote++;
  }
})();
console.log(`\n✅ привʼязано ${wrote} фактур до їхніх розрахунків`);
