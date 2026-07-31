#!/usr/bin/env node
/* eslint-disable */
/**
 * restore-operations-from-audit.cjs
 *
 * Repairs fin_operations after the 31.07 incident, where a series of scripts
 * mass-reassigned every source='bank_import' operation to one account and then
 * "restored" them from a RANDOMLY chosen audit row — the restore used
 * MAX(id) on fin_operation_audit, whose id is lower(hex(randomblob(16))), i.e.
 * a random string, not a sequence. Amounts, currencies, dates and account links
 * were all overwritten from arbitrary points in each operation's history.
 *
 * This restores each operation to its LAST GENUINE state — the newest audit
 * entry recorded before the incident began — ordered correctly by
 * performed_at, with rowid as the tie-break.
 *
 * Raw SQL updates never wrote audit rows, so the audit trail itself is intact
 * and still holds the pre-incident truth.
 *
 *   node restore-operations-from-audit.cjs                 # dry run (default)
 *   node restore-operations-from-audit.cjs --apply         # write changes
 *   node restore-operations-from-audit.cjs --cutoff "2026-07-31 18:00:00"
 *   node restore-operations-from-audit.cjs --accounts-only # only re-link accounts
 *
 * Always takes a copy of the database before writing.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ACCOUNTS_ONLY = argv.includes('--accounts-only');
const cutoffIdx = argv.indexOf('--cutoff');
const CUTOFF = cutoffIdx !== -1 ? argv[cutoffIdx + 1] : '2026-07-31 18:00:00';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'alisio.db');
if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ База не знайдена: ${DB_PATH}`);
  process.exit(1);
}

const FIELDS = ACCOUNTS_ONLY
  ? ['account_to_id', 'account_from_id']
  : ['account_to_id', 'account_from_id', 'op_type', 'amount', 'currency', 'paid_at'];

const db = new Database(DB_PATH);

console.log(`База:    ${DB_PATH}`);
console.log(`Межа:    ${CUTOFF}  (беремо останній стан ДО цього моменту)`);
console.log(`Поля:    ${FIELDS.join(', ')}`);
console.log(`Режим:   ${APPLY ? '⚠️  ЗАПИС' : 'перегляд (нічого не зміниться)'}\n`);

// ── balances before ─────────────────────────────────────────────────────────
function balances() {
  return db.prepare(`
    SELECT fa.name, fa.currency,
      ROUND(COALESCE(fa.initial_balance,0)
        + COALESCE((SELECT SUM(CASE WHEN o.currency = fa.currency THEN o.amount ELSE o.amount_company END)
             FROM fin_operations o WHERE o.account_to_id = fa.id AND o.status='completed'),0)
        - COALESCE((SELECT SUM(CASE WHEN o.currency = fa.currency THEN o.amount ELSE o.amount_company END)
             FROM fin_operations o WHERE o.account_from_id = fa.id AND o.status='completed'),0)
      , 2) AS balance
    FROM finance_accounts fa WHERE fa.is_active = 1 ORDER BY fa.name
  `).all();
}
const before = balances();

// ── the correct "latest state before the incident" query ────────────────────
const snapshots = db.prepare(`
  SELECT a.operation_id, a.after_json, a.performed_at
  FROM fin_operation_audit a
  JOIN (
    SELECT operation_id, MAX(performed_at) AS mx
    FROM fin_operation_audit
    WHERE performed_at < ? AND after_json IS NOT NULL
    GROUP BY operation_id
  ) last ON last.operation_id = a.operation_id AND last.mx = a.performed_at
  WHERE a.performed_at < ? AND a.after_json IS NOT NULL
  GROUP BY a.operation_id
  HAVING a.rowid = MAX(a.rowid)
`).all(CUTOFF, CUTOFF);

const current = new Map(
  db.prepare(`SELECT id, ${FIELDS.join(', ')} FROM fin_operations`).all().map((r) => [r.id, r]),
);

const changes = [];
const perField = Object.fromEntries(FIELDS.map((f) => [f, 0]));
let missing = 0;

for (const snap of snapshots) {
  const cur = current.get(snap.operation_id);
  if (!cur) { missing++; continue; }         // operation no longer exists
  let parsed;
  try { parsed = JSON.parse(snap.after_json); } catch { continue; }
  if (!parsed || typeof parsed !== 'object') continue;

  const diff = {};
  for (const f of FIELDS) {
    if (!(f in parsed)) continue;            // never invent a value
    const want = parsed[f] ?? null;
    const have = cur[f] ?? null;
    const same = (f === 'amount')
      ? Math.abs(Number(want || 0) - Number(have || 0)) < 0.005
      : String(want ?? '') === String(have ?? '');
    if (!same) { diff[f] = { from: have, to: want }; perField[f]++; }
  }
  if (Object.keys(diff).length) changes.push({ id: snap.operation_id, at: snap.performed_at, diff });
}

const noAudit = db.prepare(`
  SELECT COUNT(*) AS n FROM fin_operations o
  WHERE NOT EXISTS (SELECT 1 FROM fin_operation_audit a
                    WHERE a.operation_id = o.id AND a.performed_at < ?)
`).get(CUTOFF).n;

console.log('─── ЩО ЗМІНИТЬСЯ ───────────────────────────────');
console.log(`  операцій у базі:                ${current.size}`);
console.log(`  знайдено знімків до межі:       ${snapshots.length}`);
console.log(`  операцій буде відновлено:       ${changes.length}`);
console.log(`  без аудиту до межі (не чіпаємо): ${noAudit}`);
if (missing) console.log(`  знімки на видалені операції:    ${missing} (пропущено)`);
console.log('\n  по полях:');
for (const f of FIELDS) console.log(`    ${f.padEnd(16)} ${perField[f]}`);

console.log('\n  приклади (до 10):');
for (const c of changes.slice(0, 10)) {
  const parts = Object.entries(c.diff).map(([f, v]) => `${f}: ${v.from} → ${v.to}`);
  console.log(`    ${c.id}  [${c.at}]  ${parts.join(' | ')}`);
}
if (changes.length > 10) console.log(`    …ще ${changes.length - 10}`);

// ── operations created AFTER the incident ───────────────────────────────────
// The bank page used to run an import on every load, so opening it created
// fresh operations. Restoring field values cannot remove those — they are
// listed here for a human decision, never deleted automatically.
const created = db.prepare(`
  SELECT o.id, o.op_type, o.amount, o.currency, o.source, o.comment, o.paid_at,
         COALESCE(a.performed_at, o.paid_at) AS at,
         (SELECT name FROM finance_accounts WHERE id = COALESCE(o.account_to_id, o.account_from_id)) AS account
  FROM fin_operations o
  LEFT JOIN fin_operation_audit a
    ON a.operation_id = o.id AND a.action = 'create'
  WHERE COALESCE(a.performed_at, '') >= ?
  ORDER BY at DESC
`).all(CUTOFF);

if (created.length) {
  const sum = created.reduce((t, r) => t + Number(r.amount || 0), 0);
  console.log(`\n─── ЗАПИСАНІ В БАЗУ ПІСЛЯ ${CUTOFF} ──────────`);
  console.log(`  ${created.length} операцій на суму ~${Math.round(sum).toLocaleString('uk-UA')}`);
  console.log('  УВАГА: це час ЗАПИСУ, а не дата транзакції. Пізній імпорт справжньої');
  console.log('  банківської операції теж потрапляє сюди. Дивись колонку "дата" —');
  console.log('  якщо вона давніша за інцидент, це реальна транзакція, а не сміття.');
  console.log('  Скрипт нічого не видаляє.\n');
  console.log('    записано о          дата        тип      сума            рахунок');
  for (const r of created.slice(0, 25)) {
    console.log(
      `    ${r.at}  ${String(r.paid_at || '?').padEnd(10)}  ${String(r.op_type).padEnd(8)}` +
      ` ${String(Math.round(r.amount)).padStart(8)} ${r.currency}  ${String(r.account || '—').padEnd(18)}` +
      ` ${String(r.comment || '').slice(0, 32)}`,
    );
  }
  if (created.length > 25) console.log(`    …ще ${created.length - 25}`);
  console.log('\n  Видалити конкретну: node restore-operations-from-audit.cjs --delete-id <id> --apply');
}

// Optional targeted deletion of a post-incident operation.
const delIdx = argv.indexOf('--delete-id');
if (delIdx !== -1) {
  const victim = argv[delIdx + 1];
  const row = db.prepare('SELECT id, amount, currency, comment FROM fin_operations WHERE id = ?').get(victim);
  if (!row) { console.log(`\n❌ Операцію ${victim} не знайдено.`); db.close(); process.exit(1); }
  console.log(`\nВидалення: ${row.id}  ${row.amount} ${row.currency}  ${row.comment || ''}`);
  if (!APPLY) { console.log('(перегляд — додай --apply щоб видалити)'); db.close(); process.exit(0); }
  const stampD = new Date().toISOString().replace(/[:.]/g, '-');
  db.prepare('VACUUM INTO ?').run(`${DB_PATH}.before-delete-${stampD}`);
  db.prepare('DELETE FROM fin_operations WHERE id = ?').run(victim);
  console.log('✅ Видалено (копію бази збережено).');
  db.close();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n(перегляд — нічого не змінено. Додай --apply щоб записати)');
  db.close();
  process.exit(0);
}

// ── safety copy ─────────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const copyPath = `${DB_PATH}.before-restore-${stamp}`;
db.prepare('VACUUM INTO ?').run(copyPath);
console.log(`\n🛟 Копія бази перед записом: ${copyPath}`);

const updates = {};
for (const f of FIELDS) {
  updates[f] = db.prepare(`UPDATE fin_operations SET ${f} = ? WHERE id = ?`);
}

let applied = 0;
const tx = db.transaction(() => {
  for (const c of changes) {
    for (const [f, v] of Object.entries(c.diff)) updates[f].run(v.to, c.id);
    applied++;
  }
});
tx();

console.log(`✅ Відновлено ${applied} операцій.\n`);

// ── balances after ──────────────────────────────────────────────────────────
const after = balances();
console.log('─── БАЛАНСИ ────────────────────────────────────');
console.log('  рахунок                        було →  стало');
for (const a of after) {
  const b = before.find((x) => x.name === a.name && x.currency === a.currency);
  const moved = b && Math.abs((b.balance || 0) - (a.balance || 0)) >= 0.01;
  console.log(
    `  ${String(a.name).padEnd(28)} ${String(b ? b.balance : '—').padStart(12)} → ` +
    `${String(a.balance).padStart(12)} ${a.currency}${moved ? '  *' : ''}`,
  );
}
console.log('\nЯкщо цифри не ті — відкат: зупини сервіс і поверни файл-копію вище.');
db.close();
