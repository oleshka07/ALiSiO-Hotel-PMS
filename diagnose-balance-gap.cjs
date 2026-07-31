#!/usr/bin/env node
/* eslint-disable */
/**
 * diagnose-balance-gap.cjs — find WHICH operations explain a wrong balance.
 *
 * The audit-based check said the data matched the trail, yet four accounts
 * disagree with the balances recorded before the 31.07 incident. Both can be
 * true: the destructive scripts used raw SQL, which never writes audit rows, so
 * a re-linked operation leaves the trail and the table equally wrong. The
 * operator's own saved balances are the more reliable reference.
 *
 * This does not adjust anything. It locates the operations responsible:
 *
 *  1. every account against its expected balance
 *  2. for bank-imported operations, whether a statement's rows are split across
 *     several accounts — one statement belongs to exactly one bank account, so
 *     a split is the fingerprint of the mass re-link
 *  3. what the audit trail says each suspect account should be
 *
 * STRICTLY READ-ONLY.
 *
 *   node diagnose-balance-gap.cjs
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'alisio.db');
if (!fs.existsSync(DB_PATH)) { console.error(`❌ База не знайдена: ${DB_PATH}`); process.exit(1); }
const db = new Database(DB_PATH, { readonly: true });

// Balances the operator recorded before the incident.
const EXPECTED = {
  'Андріїв cash': 1398.00,
  'Готівка EUR': 252.00,
  'Олег наличные': 76620.46,
  'Антон Готівка': -902.84,
  'Каса Ресторану': 8102.00,
  'Олег Євро': 4000.00,
  'KB Restaurante': 37261.22,
  'KB - Glamping CZ': 9772.09,
  'KB EUR': 159.43,
  'KB KEMP Gold': 400660.68,
  'Інвест. СвайпСкейп': -82661.00,
};

const norm = (s) => String(s || '').replace(/[💶💰🏦\s]+/g, ' ').trim().toLowerCase();

const accounts = db.prepare(
  `SELECT id, name, currency, COALESCE(initial_balance,0) init
   FROM finance_accounts WHERE is_active = 1 ORDER BY name`,
).all();

const balStmt = db.prepare(`
  SELECT COALESCE(SUM(CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END),0) t
  FROM fin_operations o WHERE o.status='completed' AND o.%COL% = ?
`.replace('%COL%', 'account_to_id'));
const balFrom = db.prepare(`
  SELECT COALESCE(SUM(CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END),0) t
  FROM fin_operations o WHERE o.status='completed' AND o.account_from_id = ?
`);

console.log('─── БАЛАНСИ ПРОТИ ЗБЕРЕЖЕНИХ ─────────────────────────────────────');
console.log('рахунок                        зараз          очікується      різниця');
const suspects = [];
for (const a of accounts) {
  const cur = a.init + balStmt.get(a.currency, a.id).t - balFrom.get(a.currency, a.id).t;
  const key = Object.keys(EXPECTED).find((k) => norm(k) === norm(a.name));
  if (key === undefined) { continue; }
  const exp = EXPECTED[key];
  const diff = cur - exp;
  const mark = Math.abs(diff) >= 0.5 ? ' ←' : '';
  if (Math.abs(diff) >= 0.5) suspects.push({ ...a, cur, exp, diff });
  console.log(
    `${String(a.name).padEnd(30)} ${cur.toFixed(2).padStart(13)} ${exp.toFixed(2).padStart(15)} ${diff.toFixed(2).padStart(12)}${mark}`,
  );
}

if (!suspects.length) { console.log('\n✅ Усі рахунки збігаються.'); db.close(); process.exit(0); }

// ── 2. statements split across accounts ─────────────────────────────────────
// source_ref looks like "inbox:<inbox_id>:<statement>:<line>" — the first three
// parts identify one statement, which can only belong to one bank account.
console.log('\n─── ВИПИСКИ, РОЗІРВАНІ МІЖ РАХУНКАМИ ─────────────────────────────');
const split = db.prepare(`
  WITH s AS (
    SELECT o.id, o.amount, o.currency, o.op_type, o.paid_at, o.comment,
           COALESCE(o.account_to_id, o.account_from_id) AS acct,
           CASE WHEN instr(o.source_ref,':') > 0
                THEN substr(o.source_ref, 1, length(o.source_ref) - length(replace(o.source_ref,':','')) )
                ELSE o.source_ref END AS grp,
           o.source_ref
    FROM fin_operations o
    WHERE o.source = 'bank_import' AND o.source_ref IS NOT NULL AND o.status='completed'
  )
  SELECT
    substr(s.source_ref, 1, instr(s.source_ref || ':', ':') - 1) || ':' ||
    substr(s.source_ref, instr(s.source_ref,':')+1,
           instr(substr(s.source_ref, instr(s.source_ref,':')+1) || ':', ':') - 1) AS statement_key,
    COUNT(*) n, COUNT(DISTINCT s.acct) accounts_used,
    GROUP_CONCAT(DISTINCT (SELECT name FROM finance_accounts WHERE id = s.acct)) names
  FROM s GROUP BY statement_key HAVING accounts_used > 1 ORDER BY n DESC
`).all();

if (!split.length) {
  console.log('  (жодна виписка не розірвана — масової перепривʼязки в поточному стані немає)');
} else {
  for (const r of split) {
    console.log(`  ${r.statement_key}  ${r.n} операцій розкидано по ${r.accounts_used} рахунках:`);
    console.log(`      ${r.names}`);
  }
}

// ── 3. per-suspect account: what the audit says ─────────────────────────────
for (const s of suspects) {
  console.log(`\n─── ${s.name}: різниця ${s.diff.toFixed(2)} ${s.currency} ───────────`);

  // operations whose latest audit snapshot names a DIFFERENT account
  const moved = db.prepare(`
    SELECT o.id, o.op_type, o.amount, o.currency, o.paid_at, o.source,
           substr(COALESCE(o.comment,''),1,38) cmt,
           (SELECT a.after_json FROM fin_operation_audit a
            WHERE a.operation_id = o.id AND a.after_json IS NOT NULL
            ORDER BY a.performed_at DESC, a.rowid DESC LIMIT 1) snap
    FROM fin_operations o
    WHERE o.account_to_id = ? OR o.account_from_id = ?
    ORDER BY o.paid_at DESC LIMIT 400
  `).all(s.id, s.id);

  const wrong = [];
  for (const m of moved) {
    if (!m.snap) continue;
    let j; try { j = JSON.parse(m.snap); } catch { continue; }
    const other = j.account_to_id || j.account_from_id;
    if (other && other !== s.id) wrong.push({ ...m, should: other });
  }

  if (wrong.length) {
    console.log(`  ${wrong.length} операцій, які за аудитом належать ІНШОМУ рахунку:`);
    let sum = 0;
    for (const w of wrong.slice(0, 20)) {
      const nm = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(w.should);
      sum += Number(w.amount || 0) * (w.op_type === 'expense' ? -1 : 1);
      console.log(
        `    ${w.paid_at}  ${String(w.op_type).padEnd(8)} ${String(w.amount).padStart(10)} ${w.currency}` +
        `  → має бути: ${nm ? nm.name : w.should}   ${w.cmt}`,
      );
    }
    if (wrong.length > 20) console.log(`    …ще ${wrong.length - 20}`);
    console.log(`  сума показаних: ${sum.toFixed(2)} ${s.currency}`);
  } else {
    console.log('  Аудит не знає про жодну чужу операцію тут —');
    console.log('  отже перепривʼязка сталася повз аудит (сирим SQL), і винних');
    console.log('  треба шукати за випискою/IBAN, а не за журналом.');
  }

  // biggest single operations, as candidates to eyeball
  const top = db.prepare(`
    SELECT o.paid_at, o.op_type, o.amount, o.currency, o.source,
           substr(COALESCE(o.comment,''),1,42) cmt
    FROM fin_operations o
    WHERE (o.account_to_id = ? OR o.account_from_id = ?) AND o.status='completed'
    ORDER BY o.amount DESC LIMIT 8
  `).all(s.id, s.id);
  console.log('  найбільші операції на рахунку (для ока):');
  for (const t of top) {
    console.log(`    ${t.paid_at}  ${String(t.op_type).padEnd(8)} ${String(t.amount).padStart(10)} ${t.currency}  ${t.source || ''}  ${t.cmt}`);
  }
}

console.log('\nНічого не змінено. Наступний крок — визначити, які саме операції');
console.log('повернути на їхні рахунки, і зробити це точково.');
db.close();
