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
 *  2. statement lines whose operation is gone — cross-checked by (date + amount),
 *     because a dangling id usually means a re-import, not lost money
 *  3. whether bank-imported operations still sit where the import put them
 *  4. what the audit trail says each suspect account should be
 *  5. a month-by-month walk of each suspect account, split by source, so a gap
 *     that lands in one month (a single episode) is told apart from one that
 *     spreads evenly (two sources counting the same money)
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

// Balances the operator recorded before touching Antigravity — i.e. the state of
// the accounts on 31.07 before ~18:00, taken verbatim from their own notes.
//
// That timing matters: statement lines dated 07.07–23.07 were only imported at
// 22:27 on 31.07, AFTER the snapshot was written down. They are real bank
// movements, so the database legitimately holds money the snapshot does not.
// LATE_IMPORTS shifts the target for those accounts instead of pretending the
// difference is damage.
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

const SNAPSHOT_AT = process.env.SNAPSHOT_AT || '2026-07-31 18:00:00';

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

// Money the snapshot could not have known about: written to the database after
// the snapshot was taken, but dated before it. Computed, never hardcoded.
const lateStmt = db.prepare(`
  SELECT COALESCE(SUM(
    CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END
    * CASE WHEN o.account_to_id = ? THEN 1 ELSE -1 END
  ),0) t, COUNT(*) n
  FROM fin_operations o
  JOIN fin_operation_audit a ON a.operation_id = o.id AND a.action = 'create'
  WHERE o.status='completed'
    AND (o.account_to_id = ? OR o.account_from_id = ?)
    AND a.performed_at >= ?
    AND COALESCE(o.paid_at,'') < ?
`);

console.log('─── БАЛАНСИ ПРОТИ ЗБЕРЕЖЕНИХ ─────────────────────────────────────');
console.log(`знімок оператора: ${SNAPSHOT_AT}   (пізніші імпорти старих дат враховано окремо)`);
console.log('рахунок                        зараз          очікується      різниця   пізній імпорт');
const suspects = [];
for (const a of accounts) {
  const cur = a.init + balStmt.get(a.currency, a.id).t - balFrom.get(a.currency, a.id).t;
  const key = Object.keys(EXPECTED).find((k) => norm(k) === norm(a.name));
  if (key === undefined) { continue; }
  const late = lateStmt.get(a.currency, a.id, a.id, a.id, SNAPSHOT_AT, SNAPSHOT_AT.slice(0, 10));
  const exp = EXPECTED[key] + late.t;   // target the snapshot WOULD have had
  const diff = cur - exp;
  const mark = Math.abs(diff) >= 0.5 ? ' ←' : '';
  if (Math.abs(diff) >= 0.5) suspects.push({ ...a, cur, exp, diff, late: late.t });
  console.log(
    `${String(a.name).padEnd(30)} ${cur.toFixed(2).padStart(13)} ${exp.toFixed(2).padStart(15)} ${diff.toFixed(2).padStart(12)}${mark}` +
    (late.n ? `   ${late.t.toFixed(2)} у ${late.n} оп.` : ''),
  );
}

if (!suspects.length) { console.log('\n✅ Усі рахунки збігаються.'); db.close(); process.exit(0); }

// ── 2. statement lines whose operation no longer exists ─────────────────────
// bank_transactions keeps one row per imported statement line and points at the
// operation it created. A dangling matched_operation_id is NOT proof the money
// vanished: the 31.07 statement was imported twice ~80 minutes apart and the
// first batch was deleted, leaving every pointer aimed at a dead id while the
// second batch sits in fin_operations perfectly intact. Matching by id alone
// reported all 20 such rows as "зниклі гроші" — following that list would have
// re-created 22 391 CZK of duplicates.
//
// So the id is only the starting point: a row counts as genuinely lost only if
// no live operation carries the same date and the same amount.
console.log('\n─── РЯДКИ ВИПИСОК БЕЗ ОПЕРАЦІЇ ──────────────────────────────────');
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

  // A live operation with the same date and magnitude means the line is present
  // under a different id — re-imported, not lost.
  const twin = db.prepare(`
    SELECT COUNT(*) n FROM fin_operations o
    WHERE substr(COALESCE(o.paid_at,''),1,10) = ?
      AND ABS(COALESCE(o.amount,0) - ?) < 0.005
  `);

  const lost = [];
  let reimported = 0;
  let reimportedSum = 0;
  for (const r of orphans) {
    const date = String(r.d || '').slice(0, 10);
    const amt = Math.abs(Number(r.amount || 0));
    if (twin.get(date, amt).n > 0) { reimported++; reimportedSum += Number(r.amount || 0); continue; }
    lost.push(r);
  }

  if (!orphans.length) {
    console.log('  (немає — жоден рядок виписки не втратив свою операцію)');
  } else {
    console.log(`  рядків із мертвим посиланням: ${orphans.length}`);
    if (reimported) {
      console.log(
        `  з них ${reimported} (${reimportedSum.toFixed(2)}) мають живу операцію з тією ж датою і сумою —`,
      );
      console.log('  виписку імпортували двічі, посилання лишилось на видалений батч. Гроші НА МІСЦІ.');
    }
    if (!lost.length) {
      console.log('  ✅ жоден рядок виписки не втратив свої гроші.');
    } else {
      const sum = lost.reduce((t, r) => t + Number(r.amount || 0), 0);
      console.log(`\n  ${lost.length} рядків на суму ${sum.toFixed(2)} НЕ мають живої операції ні за id, ні за (дата+сума):`);
      for (const r of lost.slice(0, 25)) {
        console.log(`    ${r.d}  ${String(r.amount).padStart(12)}  ${String(r.counterparty || '').slice(0, 26).padEnd(26)} ${String(r.file_name || '').slice(0, 28)}`);
      }
      if (lost.length > 25) console.log(`    …ще ${lost.length - 25}`);
    }
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

  // ── month-by-month walk ───────────────────────────────────────────────────
  // A gap that lands in one month is a single episode and can be repaired by
  // hand. A gap that grows a little every month is a method difference — most
  // likely the same money counted twice because two import sources feed this
  // one account. The per-source columns say which of the two it is.
  const months = db.prepare(`
    SELECT substr(COALESCE(o.paid_at,'?'),1,7) ym,
           COALESCE(o.source,'—') src,
           COUNT(*) n,
           SUM((CASE WHEN o.currency = ? THEN o.amount ELSE o.amount_company END)
               * CASE WHEN o.account_to_id = ? THEN 1 ELSE -1 END) net
    FROM fin_operations o
    WHERE (o.account_to_id = ? OR o.account_from_id = ?) AND o.status='completed'
    GROUP BY ym, src ORDER BY ym, src
  `).all(s.currency, s.id, s.id, s.id);

  if (months.length) {
    const bySrc = new Map();
    const byMonth = new Map();
    for (const m of months) {
      bySrc.set(m.src, (bySrc.get(m.src) || 0) + m.net);
      if (!byMonth.has(m.ym)) byMonth.set(m.ym, { net: 0, n: 0, src: new Map() });
      const b = byMonth.get(m.ym);
      b.net += m.net; b.n += m.n; b.src.set(m.src, (b.src.get(m.src) || 0) + m.net);
    }

    const srcNames = [...bySrc.keys()].sort();
    console.log('\n  по місяцях (наростаючий баланс від початкового):');
    console.log(`    місяць    оп.        за місяць      наростаючим   ${srcNames.map((x) => x.slice(0, 12).padStart(13)).join('')}`);
    let run = s.init;
    for (const [ym, b] of [...byMonth.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      run += b.net;
      const cols = srcNames.map((x) => (b.src.has(x) ? b.src.get(x).toFixed(0) : '·').padStart(13)).join('');
      console.log(
        `    ${ym.padEnd(9)} ${String(b.n).padStart(4)} ${b.net.toFixed(2).padStart(15)} ${run.toFixed(2).padStart(15)}   ${cols}`,
      );
    }
    console.log('    ' + '─'.repeat(46 + srcNames.length * 13));
    console.log(
      `    разом по джерелах: ${srcNames.map((x) => `${x}=${bySrc.get(x).toFixed(2)}`).join('  ')}`,
    );

    const bankish = srcNames.filter((x) => /bank|import|kb|statement/i.test(x));
    if (bankish.length > 1) {
      console.log(`    ⚠️  на рахунку ДВА банківські джерела (${bankish.join(', ')}) —`);
      console.log('        перевір, чи не записані ті самі рухи двічі.');
    }
  }
}

console.log('\nНічого не змінено. Наступний крок — визначити, які саме операції');
console.log('повернути на їхні рахунки, і зробити це точково.');
db.close();
