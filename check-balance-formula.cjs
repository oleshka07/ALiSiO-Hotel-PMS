#!/usr/bin/env node
/* eslint-disable */
/**
 * check-balance-formula.cjs — compare how account balances are computed.
 *
 * The balance query treats a foreign-currency operation as if amount_company
 * (always CZK) were denominated in the account's own currency:
 *
 *   CASE WHEN o.currency = fa.currency THEN o.amount ELSE o.amount_company END
 *
 * For a CZK account that is right — amount_company IS the CZK value. For a EUR
 * account paired with a CZK operation it subtracts a crown figure as if it were
 * euros, which is how «Олег Євро» reached −104 560 EUR.
 *
 * This shows each account under the current formula and under a corrected one
 * that converts amount_company into the account currency using the rate
 * effective on the operation date, so the fix can be judged on real numbers
 * BEFORE any code changes.
 *
 * STRICTLY READ-ONLY.
 *
 *   node check-balance-formula.cjs
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'alisio.db');
if (!fs.existsSync(DB_PATH)) { console.error(`❌ База не знайдена: ${DB_PATH}`); process.exit(1); }

const db = new Database(DB_PATH, { readonly: true });

// Rate to convert CZK into `cur` on a given date: amount_company / rate.
const rateStmt = db.prepare(`
  SELECT rate FROM finance_exchange_rates
  WHERE from_currency = ? AND to_currency = 'CZK' AND effective_from <= ?
  ORDER BY effective_from DESC LIMIT 1
`);
const rateAny = db.prepare(`
  SELECT rate FROM finance_exchange_rates
  WHERE from_currency = ? AND to_currency = 'CZK'
  ORDER BY effective_from DESC LIMIT 1
`);
const rateCache = new Map();
function czkPerUnit(cur, date) {
  if (cur === 'CZK') return 1;
  const key = `${cur}|${date}`;
  if (rateCache.has(key)) return rateCache.get(key);
  const r = rateStmt.get(cur, date) || rateAny.get(cur);
  const v = r && r.rate > 0 ? r.rate : null;
  rateCache.set(key, v);
  return v;
}

const accounts = db.prepare(
  `SELECT id, name, currency, COALESCE(initial_balance,0) AS init
   FROM finance_accounts WHERE is_active = 1 ORDER BY name`,
).all();

const ops = db.prepare(
  `SELECT account_to_id, account_from_id, op_type, amount, amount_to, currency, currency_to,
          amount_company, paid_at
   FROM fin_operations WHERE status = 'completed'`,
).all();

let noRate = 0;

// value of one leg of an operation, expressed in the account's currency
function leg(op, acc, side) {
  // transfer legs carry their own amount/currency on the destination side
  if (side === 'to' && op.op_type === 'transfer' && op.currency_to && op.currency_to === acc.currency) {
    return Number(op.amount_to ?? op.amount ?? 0);
  }
  if (op.currency === acc.currency) return Number(op.amount || 0);

  // currency mismatch → amount_company is CZK
  const czk = Number(op.amount_company || 0);
  if (acc.currency === 'CZK') return czk;

  const rate = czkPerUnit(acc.currency, op.paid_at || '');
  if (!rate) { noRate++; return null; }
  return czk / rate;
}

function legCurrent(op, acc, side) {
  if (side === 'to' && op.op_type === 'transfer' && op.currency_to && op.currency_to === acc.currency) {
    return Number(op.amount_to ?? op.amount ?? 0);
  }
  return op.currency === acc.currency ? Number(op.amount || 0) : Number(op.amount_company || 0);
}

console.log('Порівняння формул балансу (нічого не змінюється)\n');
console.log('рахунок                        валюта      ЗАРАЗ    ПРАВИЛЬНО    різниця');
console.log('─────────────────────────────────────────────────────────────────────────');

const rows = [];
for (const acc of accounts) {
  let cur = acc.init, fixed = acc.init;
  for (const op of ops) {
    if (op.account_to_id === acc.id) {
      cur += legCurrent(op, acc, 'to');
      const f = leg(op, acc, 'to'); if (f !== null) fixed += f;
    }
    if (op.account_from_id === acc.id) {
      cur -= legCurrent(op, acc, 'from');
      const f = leg(op, acc, 'from'); if (f !== null) fixed -= f;
    }
  }
  rows.push({ name: acc.name, currency: acc.currency, cur, fixed, diff: fixed - cur });
}

const n = (v) => Math.round(v).toLocaleString('uk-UA');
for (const r of rows) {
  const flag = Math.abs(r.diff) >= 1 ? '  ←' : '';
  console.log(
    `${String(r.name).padEnd(30)} ${String(r.currency).padEnd(5)} ` +
    `${n(r.cur).padStart(11)} ${n(r.fixed).padStart(11)} ${n(r.diff).padStart(11)}${flag}`,
  );
}

const affected = rows.filter((r) => Math.abs(r.diff) >= 1);
console.log('\n─────────────────────────────────────────────────────────────────────────');
console.log(`Рахунків із розбіжністю: ${affected.length} з ${rows.length}`);
if (noRate) console.log(`⚠️  ${noRate} операцій без курсу — для них конвертацію пропущено.`);
if (!affected.length) {
  console.log('Формула на ваших даних дає той самий результат — проблема не в ній.');
} else {
  console.log('Ці рахунки показуються неправильно через змішування валют у формулі.');
}
db.close();
