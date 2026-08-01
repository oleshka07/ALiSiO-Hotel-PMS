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

// ── 2. statement lines whose operation no longer exists ─────────────────────
// bank_transactions keeps one row per imported statement line and points at the
// operation it created. The rollback deleted operations AND their audit rows, so
// those are invisible in fin_operations — but the statement line survives. This
// is where money that simply vanished from an account shows up.
console.log('\n─── РЯДКИ ВИПИСОК БЕЗ ОПЕРАЦІЇ (зниклі гроші) ────────────────────');
try {
  const orphans = db.prepare(`
    SELECT bt.transaction_date d, bt.amount, bt.counterparty, bt.description,
           bs.account_number, bs.file_name
    FROM bank_transactions bt
    LEFT JOIN bank_statements bs ON bs.id = bt.statement_id
    WHERE bt.matched_operation_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM fin_operations o WHERE o.id = bt.matched_operation_id)
    ORDER BY bt.transaction_date
  `).all();
  if (!orphans.length) {
    console.log('  (немає — жоден рядок виписки не втратив свою операцію)');
  } else {
    const sum = orphans.reduce((t, r) => t + Number(r.amount || 0), 0);
    console.log(`  ${orphans.length} рядків на суму ${sum.toFixed(2)} — операції видалено, рядок лишився`);
    for (const r of orphans.slice(0, 25)) {
      console.log(`    ${r.d}  ${String(r.amount).padStart(12)}  ${String(r.counterparty || '').slice(0, 26).padEnd(26)} ${String(r.file_name || '').slice(0, 28)}`);
    }
    if (orphans.length > 25) console.log(`    …ще ${orphans.length - 25}`);
    console.log('  ↑ ЦЕ найімовірніше джерело «зниклих» сум на рахунку.');
  }
} catch (e) {
  console.log(`  (не вдалось перевірити: ${e.message})`);
}

// Statement grouping: source_ref is "inbox:<inbox_id>:<message_id>:<line>", so a
// statement is the first THREE parts. Grouping by two compared mailboxes, not
// statements. Even grouped correctly, splits turned out to be how the importer
// behaves — the authoritative check is the create-snapshot comparison below.
console.log('\n─── ЧИ СТОЯТЬ БАНКІВСЬКІ ОПЕРАЦІЇ ТАМ, КУДИ ЇХ ПОКЛАВ ІМПОРТ ─────');
const impCmp = db.prepare(`
  SELECT COUNT(*) total,
         SUM(CASE WHEN snap IS NULL THEN 1 ELSE 0 END) no_audit,
         SUM(CASE WHEN snap IS NOT NULL
                   AND COALESCE(json_extract(snap,'$.account_to_id'),'')   = COALESCE(o.account_to_id,'')
                   AND COALESCE(json_extract(snap,'$.account_from_id'),'') = COALESCE(o.account_from_id,'')
              THEN 1 ELSE 0 END) same,
         SUM(CASE WHEN snap IS NOT NULL
                   AND (COALESCE(json_extract(snap,'$.account_to_id'),')   <> COALESCE(o.account_to_id,'')
                     OR COALESCE(json_extract(snap,'$.account_from_id'),'') <> COALESCE(o.account_from_id,''))
              THEN 1 ELSE 0 END) moved
  FROM (
    SELECT o2.*, (SELECT a.after_json FROM fin_operation_audit a
                  WHERE a.operation_id = o2.id AND a.action='create' LIMIT 1) snap
    FROM fin_operations o2 WHERE o2.source='bank_import'
  ) o
`.replace("(COALESCE(json_extract(snap,'$.account_to_id'),')", "(COALESCE(json_extract(snap,'$.account_to_id'),'')")).get();
console.log(`  усього bank_import: ${impCmp.total}   без аудиту: ${impCmp.no_audit}`);
console.log(`  стоять як при імпорті: ${impCmp.same}   перенесені пізніше: ${impCmp.moved}`);
if (impCmp.moved) console.log('  (перенесені — див. деталі по рахунках нижче)');

// ── 3. per-suspect account: what the audit says ─────────────────────────────
for (const s of suspects) {
  console.log(`\n─── ${s.name}: різниця ${s.diff.toFixed(2)} ${s.currency} ───────────`);

  // operations whose latest audit snapshot names a DIFFERENT account
  const moved = db.prepare(`
    SELECT o.id, o.op_type, o.amount, o.currency, o.paid_at, o.source,
           o.account_to_id, o.account_from_id,
           substr(COALESCE(o.comment,''),1,38) cmt,
           (SELECT a.after_json FROM fin_operation_audit a
            WHERE a.operation_id = o.id AND a.after_json IS NOT NULL
            ORDER BY a.performed_at DESC, a.rowid DESC LIMIT 1) snap
    FROM fin_operations o
    WHERE o.account_to_id = ? OR o.account_from_id = ?
    ORDER BY o.paid_at DESC LIMIT 400
  `).all(s.id, s.id);

  // Compare BOTH sides. Picking one side with to-priority reported every
  // transfer whose other leg is elsewhere — which is simply how transfers work.
  const wrong = [];
  for (const m of moved) {
    if (!m.snap) continue;
    let j; try { j = JSON.parse(m.snap); } catch { continue; }
    const sameTo = String(j.account_to_id ?? '') === String(m.account_to_id ?? '');
    const sameFrom = String(j.account_from_id ?? '') === String(m.account_from_id ?? '');
    if (sameTo && sameFrom) continue;                 // untouched
    wrong.push({
      ...m,
      wasTo: j.account_to_id ?? null, wasFrom: j.account_from_id ?? null,
    });
  }

  if (wrong.length) {
    console.log(`  ${wrong.length} операцій, які за аудитом належать ІНШОМУ рахунку:`);
    let sum = 0;
    const nameOf = (id) => {
      if (!id) return '—';
      const r = db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(id);
      return r ? r.name : id;
    };
    for (const w of wrong.slice(0, 20)) {
      sum += Number(w.amount || 0) * (w.op_type === 'expense' ? -1 : 1);
      console.log(
        `    ${w.paid_at}  ${String(w.op_type).padEnd(8)} ${String(w.amount).padStart(10)} ${w.currency}  ${w.cmt}`,
      );
      console.log(
        `        зараз:    ${nameOf(w.account_from_id)} → ${nameOf(w.account_to_id)}`,
      );
      console.log(
        `        в аудиті: ${nameOf(w.wasFrom)} → ${nameOf(w.wasTo)}`,
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
