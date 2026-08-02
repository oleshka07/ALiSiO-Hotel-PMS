#!/usr/bin/env node
/* eslint-disable */
/**
 * check-ubyport-resend.cjs — prove (or disprove) why Ubyport re-sent the season.
 *
 * The morning job reports every foreign guest whose reservation_guests row has
 * police_reported = 0. That column lives ONLY on that row. The boot-time
 * "auto-sync" migration rebuilt every guest row of every reservation with
 * DELETE-then-INSERT on each process start, and the INSERT never carried the
 * flag — so each deploy handed the next morning's run a database in which the
 * whole season looked unreported.
 *
 * The rebuild leaves a fingerprint that cannot be faked: reservation_guests.id
 * defaults to a fresh random value and created_at to datetime('now'), so after a
 * rebuild hundreds of rows for guests who arrived months apart share one
 * created_at second. That is what this counts.
 *
 * STRICTLY READ-ONLY.
 *
 *   node check-ubyport-resend.cjs
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'alisio.db');
if (!fs.existsSync(DB_PATH)) { console.error(`❌ База не знайдена: ${DB_PATH}`); process.exit(1); }
const db = new Database(DB_PATH, { readonly: true });

const one = (sql, ...p) => db.prepare(sql).get(...p);

console.log('─── СТАН РЕЄСТРУ ─────────────────────────────────────────────────');
const t = one(`
  SELECT COUNT(*) rows,
         COUNT(DISTINCT rg.reservation_id) res,
         SUM(CASE WHEN rg.nationality IS NOT NULL AND rg.nationality <> 'CZ' THEN 1 ELSE 0 END) foreigners,
         SUM(CASE WHEN rg.nationality IS NOT NULL AND rg.nationality <> 'CZ'
                   AND COALESCE(rg.police_reported,0) = 0 THEN 1 ELSE 0 END) unreported
  FROM reservation_guests rg
`);
console.log(`  рядків гостей:        ${t.rows}   у ${t.res} бронюваннях`);
console.log(`  іноземців:            ${t.foreigners}`);
console.log(`  з них НЕ відзвітовано: ${t.unreported}   ← стільки піде в Ubyport завтра`);

// Cancelled / no-show reservations must never reach the foreign police.
const dead = one(`
  SELECT COUNT(*) n FROM reservation_guests rg
  JOIN reservations r ON r.id = rg.reservation_id
  WHERE r.status IN ('cancelled','no_show')
    AND rg.nationality IS NOT NULL AND rg.nationality <> 'CZ'
`);
if (dead.n) {
  console.log(`  ⚠️  ${dead.n} іноземців на СКАСОВАНИХ бронюваннях — вони теж потрапляли у відправку`);
}

// ── the fingerprint of a mass rebuild ───────────────────────────────────────
console.log('\n─── СЛІД МАСОВОЇ ПЕРЕЗБІРКИ ──────────────────────────────────────');
console.log('  Рядок гостя створюється раз — при реєстрації. Якщо сотні рядків');
console.log('  мають однаковий created_at, їх переписали всі разом (деплой).\n');

const bursts = db.prepare(`
  SELECT created_at, COUNT(*) n,
         MIN(r.check_in) first_stay, MAX(r.check_in) last_stay
  FROM reservation_guests rg
  JOIN reservations r ON r.id = rg.reservation_id
  GROUP BY created_at HAVING n >= 5
  ORDER BY n DESC LIMIT 15
`).all();

if (!bursts.length) {
  console.log('  ✅ жодної масової перезбірки не видно — рядки створювались поштучно.');
} else {
  console.log('    створено о             рядків    заїзди від → до');
  for (const b of bursts) {
    const span = `${b.first_stay} → ${b.last_stay}`;
    console.log(`    ${String(b.created_at).padEnd(22)} ${String(b.n).padStart(6)}    ${span}`);
  }
  const worst = bursts[0];
  console.log(`\n  ↑ ${worst.n} рядків з одним created_at, а заїзди рознесені на місяці —`);
  console.log('    це перезбірка, а не реєстрація гостей. Кожна така подія обнуляла');
  console.log('    police_reported і змушувала ранкову відправку слати сезон наново.');
}

// ── what the sender marked but could not have sent ──────────────────────────
console.log('\n─── ВІДЗВІТОВАНІ БЕЗ НОМЕРА ПІДТВЕРДЖЕННЯ ────────────────────────');
const noRef = one(`
  SELECT COUNT(*) n FROM reservation_guests
  WHERE COALESCE(police_reported,0) = 1
    AND (police_report_ref IS NULL OR TRIM(police_report_ref) = '')
`);
console.log(`  ${noRef.n} гостей позначені як відправлені, але без реєстраційного номера.`);
if (noRef.n) {
  console.log('  Відправник ставить позначку більшій кількості, ніж реально відправив');
  console.log('  ("212/224 sent, 224 marked"). Ці люди більше ніколи не потраплять у');
  console.log('  відправку — для поліції вони не зареєстровані. Це недозвіт, і його');
  console.log('  треба лагодити на боці відправника, а не тут.');
  const sample = db.prepare(`
    SELECT rg.first_name, rg.last_name, rg.nationality, r.check_in
    FROM reservation_guests rg JOIN reservations r ON r.id = rg.reservation_id
    WHERE COALESCE(rg.police_reported,0) = 1
      AND (rg.police_report_ref IS NULL OR TRIM(rg.police_report_ref) = '')
    ORDER BY r.check_in DESC LIMIT 10
  `).all();
  for (const s of sample) {
    console.log(`    ${s.check_in}  ${String(s.nationality || '??').padEnd(3)} ${s.first_name} ${s.last_name}`);
  }
}

console.log('\nНічого не змінено.');
db.close();
