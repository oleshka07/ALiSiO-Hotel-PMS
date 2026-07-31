#!/usr/bin/env node
/* eslint-disable */
/**
 * export-audit-log.cjs — preserve the finance audit trail outside the database.
 *
 * After the 31.07 incident the audit log is the only surviving record of what
 * every operation looked like before it was damaged: the destructive scripts
 * used raw SQL, which never writes audit rows, so the trail still holds the
 * truth. One of those scripts did delete audit rows, so this exports the whole
 * thing to plain files that no future script can touch.
 *
 * STRICTLY READ-ONLY — opens the database in readonly mode and cannot write.
 *
 *   node export-audit-log.cjs                 # export + analysis
 *   node export-audit-log.cjs --out /root/evidence
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT_DIR = outIdx !== -1 ? argv[outIdx + 1] : path.join(process.cwd(), 'audit-export');
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'alisio.db');
const CUTOFF = '2026-07-31 18:00:00';

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ База не знайдена: ${DB_PATH}`);
  process.exit(1);
}

// readonly: this process physically cannot modify the database.
const db = new Database(DB_PATH, { readonly: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(OUT_DIR, stamp);
fs.mkdirSync(dest, { recursive: true });

console.log(`База (тільки читання): ${DB_PATH}`);
console.log(`Вивантаження у:        ${dest}\n`);

function dump(name, sql) {
  const rows = db.prepare(sql).all();
  fs.writeFileSync(path.join(dest, `${name}.json`), JSON.stringify(rows, null, 1));
  console.log(`  ✅ ${name.padEnd(22)} ${String(rows.length).padStart(6)} рядків`);
  return rows;
}

const audit = dump('fin_operation_audit', 'SELECT * FROM fin_operation_audit ORDER BY performed_at, rowid');
dump('fin_operations', 'SELECT * FROM fin_operations ORDER BY paid_at');
dump('finance_accounts', 'SELECT * FROM finance_accounts');
try { dump('bank_statements', 'SELECT * FROM bank_statements ORDER BY uploaded_at'); } catch {}
try { dump('bank_transactions', 'SELECT * FROM bank_transactions ORDER BY transaction_date'); } catch {}

// Human-readable CSV of the audit trail, so it can be opened in Excel too.
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
const csv = ['operation_id,action,user_name,performed_at,after_json']
  .concat(audit.map((r) => [r.operation_id, r.action, r.user_name, r.performed_at, r.after_json].map(esc).join(',')));
fs.writeFileSync(path.join(dest, 'fin_operation_audit.csv'), csv.join('\n'));
console.log(`  ✅ fin_operation_audit.csv`);

// ── what the trail says can be recovered ────────────────────────────────────
const q = (sql, ...p) => db.prepare(sql).get(...p);

const totalOps = q('SELECT COUNT(*) n FROM fin_operations').n;
const auditedIds = q('SELECT COUNT(DISTINCT operation_id) n FROM fin_operation_audit').n;
const recoverable = q(
  `SELECT COUNT(DISTINCT a.operation_id) n FROM fin_operation_audit a
   JOIN fin_operations o ON o.id = a.operation_id
   WHERE a.performed_at < ? AND a.after_json IS NOT NULL`, CUTOFF).n;

// Operations the trail knows about that are no longer in the table.
const goneWithDelete = q(
  `SELECT COUNT(DISTINCT a.operation_id) n FROM fin_operation_audit a
   WHERE NOT EXISTS (SELECT 1 FROM fin_operations o WHERE o.id = a.operation_id)
     AND EXISTS (SELECT 1 FROM fin_operation_audit d
                 WHERE d.operation_id = a.operation_id AND d.action = 'delete')`).n;
const goneSilently = q(
  `SELECT COUNT(DISTINCT a.operation_id) n FROM fin_operation_audit a
   WHERE NOT EXISTS (SELECT 1 FROM fin_operations o WHERE o.id = a.operation_id)
     AND NOT EXISTS (SELECT 1 FROM fin_operation_audit d
                     WHERE d.operation_id = a.operation_id AND d.action = 'delete')`).n;

console.log('\n─── ЩО КАЖЕ ЖУРНАЛ ────────────────────────────');
console.log(`  операцій зараз у базі:            ${totalOps}`);
console.log(`  операцій згадано в журналі:       ${auditedIds}`);
console.log(`  можна відновити з журналу:        ${recoverable}`);
console.log(`  зникли, але Є запис 'delete':     ${goneWithDelete}  (видалені штатно — так і має бути)`);
console.log(`  зникли БЕЗ запису 'delete':       ${goneSilently}  ${goneSilently ? '← ці могли знищити скриптом' : ''}`);

if (goneSilently) {
  const list = db.prepare(
    `SELECT a.operation_id, MAX(a.performed_at) last_seen,
            (SELECT after_json FROM fin_operation_audit x
             WHERE x.operation_id = a.operation_id AND x.after_json IS NOT NULL
             ORDER BY x.performed_at DESC LIMIT 1) snap
     FROM fin_operation_audit a
     WHERE NOT EXISTS (SELECT 1 FROM fin_operations o WHERE o.id = a.operation_id)
       AND NOT EXISTS (SELECT 1 FROM fin_operation_audit d
                       WHERE d.operation_id = a.operation_id AND d.action = 'delete')
     GROUP BY a.operation_id ORDER BY last_seen DESC`).all();
  fs.writeFileSync(path.join(dest, 'vanished-operations.json'), JSON.stringify(list, null, 1));
  console.log(`\n  Перелік у vanished-operations.json — у кожної є знімок, тож їх можливо відтворити.`);
  console.log('  Приклади:');
  for (const r of list.slice(0, 10)) {
    let s = {};
    try { s = JSON.parse(r.snap || '{}'); } catch {}
    console.log(`    ${r.operation_id}  ${r.last_seen}  ${s.op_type || '?'} ${s.amount || '?'} ${s.currency || ''}`);
  }
  if (list.length > 10) console.log(`    …ще ${list.length - 10}`);
}

const size = fs.readdirSync(dest).reduce((t, f) => t + fs.statSync(path.join(dest, f)).size, 0);
console.log(`\n✅ Готово: ${dest}  (${(size / 1024 / 1024).toFixed(1)} МБ)`);
console.log('   Скопіюй цю папку з сервера — це незалежна копія доказів.');
db.close();
