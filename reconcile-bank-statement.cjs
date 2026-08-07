#!/usr/bin/env node
/* eslint-disable */
/**
 * reconcile-bank-statement.cjs — compare a MojeBanka CSV export against what
 * the PMS holds for that account.
 *
 * A bank statement with a stated opening balance is the only authority we have.
 * Everything else — the operator's screenshot, the audit trail, the balance
 * formula — is a derived number that can be wrong without anyone noticing.
 *
 * Written for the KB Restaurante export, which turned out to carry the account's
 * ENTIRE history (opening balance 0.00 on 01.04.2026), so the closing balance is
 * checkable without any prior context.
 *
 * Matching is by (date, amount). Bank ids are not stored on fin_operations in a
 * form we can rely on, and the 31.07 double-import proved that matching on ids
 * invents losses that are not there.
 *
 * STRICTLY READ-ONLY.
 *
 *   node reconcile-bank-statement.cjs выписка.csv "KB Restaurante"
 *   node reconcile-bank-statement.cjs выписка.csv "KB Restaurante" --days 3
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const argv = process.argv.slice(2);
const CSV = argv[0];
const ACCOUNT = argv[1];
const dIdx = argv.indexOf('--days');
const TOLERANCE_DAYS = dIdx !== -1 ? Number(argv[dIdx + 1]) : 3;

if (!CSV || !ACCOUNT) {
  console.error('Використання: node reconcile-bank-statement.cjs <виписка.csv> "<назва рахунку>"');
  process.exit(2);
}
if (!fs.existsSync(CSV)) { console.error(`❌ Виписку не знайдено: ${CSV}`); process.exit(1); }

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'alisio.db');
if (!fs.existsSync(DB_PATH)) { console.error(`❌ База не знайдена: ${DB_PATH}`); process.exit(1); }

// ── parse the export ────────────────────────────────────────────────────────
// MojeBanka writes CP1250 with ';' separators. Empty fields are bare, filled
// ones are quoted, so a naive split on '";"' silently drops every debit row.
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ';' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

let raw;
try { raw = fs.readFileSync(CSV); } catch (e) { console.error(e.message); process.exit(1); }
// MojeBanka exports CP1250, but the file may already have been converted. Valid
// UTF-8 wins; only bytes that are NOT valid UTF-8 can be CP1250. Sniffing on an
// ASCII phrase does not work — it matches under either decoding.
let text;
try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
catch { text = new TextDecoder('windows-1250').decode(raw); }
const lines = text.split(/\r?\n/);

// Header keys carry diacritics; compare without them so either encoding path
// and either export version resolve to the same key.
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const header = {};
for (const l of lines.slice(0, 18)) {
  const f = splitCsv(l);
  if (f[0] && f[1] !== undefined) header[plain(f[0])] = String(f[1]).trim();
}
const num = (s) => parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.'));
const opening = num(header['pocatecni zustatek']) || 0;
const closing = num(header['konecny zustatek']);
if (!isFinite(closing)) {
  console.error('❌ У заголовку немає «Konečný zůstatek» — це не експорт MojeBanka?');
  process.exit(1);
}

const bank = [];
for (const l of lines.slice(18)) {
  if (!l.trim()) continue;
  const f = splitCsv(l);
  if (f.length < 14) continue;
  const amt = num(f[4]);
  if (!isFinite(amt)) continue;
  const [d, m, y] = String(f[0]).split('.');
  if (!y) continue;
  bank.push({
    date: `${y}-${m}-${d}`, amt,
    acct: f[2] || '', cp: f[3] || '', kind: f[12] || '', sys: f[13] || '',
    av: String(f[15] || '').trim(),
  });
}
bank.sort((a, b) => (a.date < b.date ? -1 : 1));
const sum = (a) => a.reduce((s, r) => s + r.amt, 0);

console.log(`Виписка:  ${path.basename(CSV)}`);
console.log(`Рахунок:  ${header['cislo uctu'] || '?'}   ${header['iban'] || ''}`);
console.log(`Період:   ${bank[0]?.date} → ${bank[bank.length - 1]?.date}   рядків: ${bank.length}`);
console.log(`Початковий залишок: ${opening.toFixed(2)}`);

const computed = opening + sum(bank);
const okTotals = Math.abs(computed - closing) < 0.01;
console.log(`Кінцевий залишок:   ${closing.toFixed(2)}   (порахований ${computed.toFixed(2)}) ${okTotals ? '✅' : '❌ РОЗБІЖНІСТЬ'}`);
if (!okTotals) {
  console.log('  Розбір виписки не сходиться з її ж заголовком — далі не йду.');
  process.exit(1);
}

// ── the PMS side ────────────────────────────────────────────────────────────
const db = new Database(DB_PATH, { readonly: true });
const norm = (s) => String(s || '').replace(/[💶💰🏦\s]+/g, ' ').trim().toLowerCase();
const acc = db.prepare('SELECT id, name, currency, COALESCE(initial_balance,0) init FROM finance_accounts')
  .all().find((a) => norm(a.name) === norm(ACCOUNT));
if (!acc) {
  console.error(`\n❌ Рахунку «${ACCOUNT}» немає. Доступні:`);
  for (const a of db.prepare('SELECT name FROM finance_accounts WHERE is_active=1').all()) console.error(`   ${a.name}`);
  process.exit(1);
}

const from = bank[0].date, to = bank[bank.length - 1].date;
const ops = db.prepare(`
  SELECT o.id, o.paid_at, o.op_type, o.amount, o.currency, o.source, o.status,
         CASE WHEN o.account_to_id = ? THEN 1 ELSE -1 END AS sign,
         substr(COALESCE(o.comment,''),1,44) cmt
  FROM fin_operations o
  WHERE (o.account_to_id = ? OR o.account_from_id = ?)
    AND o.status = 'completed'
    AND substr(COALESCE(o.paid_at,''),1,10) BETWEEN ? AND ?
`).all(acc.id, acc.id, acc.id, from, to)
  .map((o) => ({ ...o, date: String(o.paid_at).slice(0, 10), signed: o.sign * Number(o.amount || 0) }));

// initial_balance is the account's opening from the beginning of its life in the
// PMS, not the opening of this statement's period. Comparing the two directly
// reported a 3 732,59 gap on an account that matched the bank to the cent, and a
// 76 268,09 gap on one that was 1 340,55 out — both times because operations
// dated before the statement period were left out of the sum. The PMS opening
// for this period is initial_balance plus everything booked before `from`.
const preOps = db.prepare(`
  SELECT COALESCE(SUM(CASE WHEN o.account_to_id = ? THEN o.amount ELSE -o.amount END), 0) s
  FROM fin_operations o
  WHERE (o.account_to_id = ? OR o.account_from_id = ?)
    AND o.status = 'completed' AND COALESCE(o.is_planned, 0) = 0
    AND substr(COALESCE(o.paid_at,''),1,10) < ?
`).get(acc.id, acc.id, acc.id, from).s;
const pmsOpening = acc.init + preOps;

console.log(`\n─── РАХУНОК У PMS: ${acc.name} ─────────────────────────────`);
console.log(`  initial_balance: ${acc.init.toFixed(2)}   операції до ${from}: ${preOps.toFixed(2)}`);
console.log(`  => на початок періоду: ${pmsOpening.toFixed(2)}   у банку: ${opening.toFixed(2)}` +
  (Math.abs(pmsOpening - opening) >= 0.01 ? '   ← РОЗХОДЯТЬСЯ' : '   ✅'));
console.log(`  операцій за період: ${ops.length}   у виписці рядків: ${bank.length}`);
console.log(`  сума в PMS: ${sum(ops.map((o) => ({ amt: o.signed }))).toFixed(2)}   у банку: ${sum(bank).toFixed(2)}`);

const pmsBalance = pmsOpening + sum(ops.map((o) => ({ amt: o.signed })));
console.log(`\n  БАЛАНС за період — PMS ${pmsBalance.toFixed(2)}   БАНК ${closing.toFixed(2)}`);
const gap = pmsBalance - closing;
console.log(`  РІЗНИЦЯ: ${gap.toFixed(2)} ${Math.abs(gap) < 0.01 ? '✅ сходиться' : '←'}`);

// ── month by month, both sides ──────────────────────────────────────────────
console.log('\n─── ПО МІСЯЦЯХ ───────────────────────────────────────────────');
console.log('  місяць     банк оп.       банк сума     PMS оп.        PMS сума       різниця');
const months = [...new Set([...bank, ...ops].map((r) => r.date.slice(0, 7)))].sort();
let rb = opening, rp = pmsOpening;
for (const m of months) {
  const b = bank.filter((r) => r.date.startsWith(m));
  const p = ops.filter((r) => r.date.startsWith(m));
  const bs = sum(b), ps = sum(p.map((o) => ({ amt: o.signed })));
  rb += bs; rp += ps;
  const d = ps - bs;
  console.log(`  ${m}   ${String(b.length).padStart(6)} ${bs.toFixed(2).padStart(15)} ${String(p.length).padStart(9)} ${ps.toFixed(2).padStart(15)} ${d.toFixed(2).padStart(13)}${Math.abs(d) >= 0.01 ? ' ←' : ''}`);
}
console.log(`  наростаючим:  банк ${rb.toFixed(2)}    PMS ${rp.toFixed(2)}`);

// ── line-level matching on (date ± tolerance, amount) ───────────────────────
const usedOps = new Set();
const missing = [];
for (const b of bank) {
  const hit = ops.find((o, i) => !usedOps.has(i)
    && Math.abs(o.signed - b.amt) < 0.005
    && Math.abs(Date.parse(o.date) - Date.parse(b.date)) <= TOLERANCE_DAYS * 864e5);
  if (hit) usedOps.add(ops.indexOf(hit)); else missing.push(b);
}
const extra = ops.filter((_, i) => !usedOps.has(i));

console.log(`\n─── РЯДКИ ВИПИСКИ, ЯКИХ НЕМАЄ В PMS (${missing.length}) ───────────────`);
if (!missing.length) console.log('  ✅ жодного — усе з банку записано.');
for (const r of missing) {
  console.log(`  ${r.date}  ${r.amt.toFixed(2).padStart(12)}  ${(r.cp || r.sys || r.av).slice(0, 46)}`);
}
if (missing.length) console.log(`  разом: ${sum(missing).toFixed(2)}`);

console.log(`\n─── ОПЕРАЦІЇ PMS, ЯКИХ НЕМАЄ У ВИПИСЦІ (${extra.length}) ─────────────`);
if (!extra.length) console.log('  ✅ жодної — PMS не вигадав нічого зайвого.');
for (const o of extra.slice(0, 40)) {
  console.log(`  ${o.date}  ${o.signed.toFixed(2).padStart(12)}  ${String(o.source || '').padEnd(14)} ${o.cmt}`);
}
if (extra.length > 40) console.log(`  …ще ${extra.length - 40}`);
if (extra.length) console.log(`  разом: ${sum(extra.map((o) => ({ amt: o.signed }))).toFixed(2)}`);

// ── transfers to a sibling account are not expenses ─────────────────────────
const internal = bank.filter((r) => /KEMP CARLSBAD/i.test(r.cp) && r.amt < 0);
if (internal.length) {
  console.log(`\n─── ПЕРЕКАЗИ НА ВЛАСНИЙ РАХУНОК (${internal.length}, ${sum(internal).toFixed(2)}) ────────`);
  console.log('  Це переміщення між своїми рахунками, а не витрати. У PMS вони мають');
  console.log('  бути op_type=transfer з обома сторонами — інакше гроші зникають з');
  console.log('  одного рахунку і не з\'являються на іншому.');
  for (const r of internal) {
    const asTransfer = db.prepare(`
      SELECT COUNT(*) n FROM fin_operations
      WHERE op_type='transfer' AND account_from_id = ?
        AND ABS(amount - ?) < 0.005
        AND substr(COALESCE(paid_at,''),1,10) BETWEEN date(?, '-3 day') AND date(?, '+3 day')
    `).get(acc.id, Math.abs(r.amt), r.date, r.date).n;
    console.log(`  ${r.date}  ${r.amt.toFixed(2).padStart(11)}  ${asTransfer ? '✅ є як transfer' : '❌ як transfer НЕ записано'}`);
  }
}

console.log('\nНічого не змінено.');
db.close();
