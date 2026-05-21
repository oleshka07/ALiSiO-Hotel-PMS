/**
 * fix-andrey-payments.js
 * ─────────────────────────────────────────────────────────────────
 * 1. Знаходить усі бронювання підтверджені Андреєм (internal_notes + audit_log)
 *    за останні 14 днів.
 * 2. Показує які з них відсутні у fin_operations.
 * 3. З прапором --apply — додає відсутні операції.
 *
 * Запуск:
 *   node fix-andrey-payments.js          ← тільки звіт (dry-run)
 *   node fix-andrey-payments.js --apply  ← звіт + виправлення
 */

'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.resolve(__dirname, 'data/alisio.db');
const APPLY   = process.argv.includes('--apply');
const DAYS    = 14;   // скільки днів назад дивитись

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function genId() {
  return 'fo_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

// ── 1. Знайти організацію ─────────────────────────────────────────
const orgRow = db.prepare('SELECT organization_id FROM properties LIMIT 1').get();
if (!orgRow) { console.error('Немає properties в БД!'); process.exit(1); }
const orgId = orgRow.organization_id;
console.log(`\n🏢 Organization: ${orgId}`);

// ── 2. Знайти рахунок Андрія ──────────────────────────────────────
const andreyAccount = db.prepare(
  "SELECT id, name FROM finance_accounts WHERE organization_id = ? AND name LIKE '%Андрів%' AND is_active = 1 LIMIT 1"
).get(orgId);

let fallbackAccount = null;
if (!andreyAccount) {
  fallbackAccount = db.prepare(
    "SELECT id, name FROM finance_accounts WHERE organization_id = ? AND type = 'cash' AND currency = 'CZK' AND is_active = 1 ORDER BY sort_order ASC LIMIT 1"
  ).get(orgId);
}

const account = andreyAccount || fallbackAccount;
console.log(`💰 Рахунок: ${account ? account.name + ' (' + account.id + ')' : 'НЕ ЗНАЙДЕНО!'}`);
if (!andreyAccount && fallbackAccount) {
  console.log('   ⚠️  "Андрів cash" не знайдено — використовується fallback рахунок');
}

// ── 3. Знайти бронювання підтверджені Андреєм ──────────────────────
// Шукаємо в internal_notes (всі варіанти написання) або в audit_log
const reservationsFromNotes = db.prepare(`
  SELECT r.id, r.total_price, r.currency, r.payment_status, r.status,
         r.internal_notes, r.created_at, r.check_in, r.check_out,
         g.first_name || ' ' || g.last_name AS guest_name
  FROM reservations r
  LEFT JOIN guests g ON g.id = r.guest_id
  WHERE r.created_at >= datetime('now', '-${DAYS} days')
    AND (
      r.internal_notes LIKE '%Андрей%'
      OR r.internal_notes LIKE '%Андрів%'
      OR r.internal_notes LIKE '%1315%'
    )
  ORDER BY r.created_at DESC
`).all();

// Також з audit_log
let reservationsFromAudit = [];
try {
  reservationsFromAudit = db.prepare(`
    SELECT DISTINCT al.entity_id AS reservation_id, al.created_at, al.new_values
    FROM audit_log al
    WHERE al.organization_id = ?
      AND al.entity_type = 'reservation'
      AND al.action IN ('cash_payment_confirmed', 'payment_confirmed', 'terminal_payment_confirmed')
      AND al.created_at >= datetime('now', '-${DAYS} days')
      AND al.new_values LIKE '%Андрей%'
    ORDER BY al.created_at DESC
  `).all(orgId);
} catch(e) { /* audit_log може бути відсутній */ }

// Об'єднуємо ID без дублів
const seenIds = new Set();
const allReservations = [];

for (const r of reservationsFromNotes) {
  if (!seenIds.has(r.id)) {
    seenIds.add(r.id);
    allReservations.push(r);
  }
}
for (const al of reservationsFromAudit) {
  if (!seenIds.has(al.reservation_id)) {
    seenIds.add(al.reservation_id);
    // Отримуємо повні дані бронювання
    const r = db.prepare(`
      SELECT r.id, r.total_price, r.currency, r.payment_status, r.status,
             r.internal_notes, r.created_at, r.check_in, r.check_out,
             g.first_name || ' ' || g.last_name AS guest_name
      FROM reservations r LEFT JOIN guests g ON g.id = r.guest_id
      WHERE r.id = ?
    `).get(al.reservation_id);
    if (r) allReservations.push(r);
  }
}

console.log(`\n📋 Знайдено бронювань Андрія за ${DAYS} днів: ${allReservations.length}`);

if (allReservations.length === 0) {
  console.log('\n⚠️  Жодного бронювання не знайдено. Можливо:');
  console.log('   • Стара версія коду (до додавання internal_notes) була задеплоєна');
  console.log('   • Час підтвердження вийшов за межі', DAYS, 'днів');

  // Розширений пошук — без обмеження дат
  const allTime = db.prepare(`
    SELECT r.id, r.total_price, r.currency, r.payment_status, r.status,
           r.internal_notes, r.created_at,
           g.first_name || ' ' || g.last_name AS guest_name
    FROM reservations r
    LEFT JOIN guests g ON g.id = r.guest_id
    WHERE r.internal_notes LIKE '%Андрей%' OR r.internal_notes LIKE '%Готівку%'
    ORDER BY r.created_at DESC LIMIT 20
  `).all();

  console.log(`\n🔍 Розширений пошук (без обмеження дат): ${allTime.length} записів`);
  if (allTime.length > 0) {
    for (const r of allTime) {
      console.log(`  • ${r.id.slice(0,12)} | ${r.guest_name || 'N/A'} | ${r.total_price} ${r.currency} | ${r.payment_status} | ${r.created_at?.slice(0,10)}`);
      if (r.internal_notes) console.log(`    notes: ${r.internal_notes.split('\n')[0]}`);
    }
  }
  process.exit(0);
}

// ── 4. Перевірити які відсутні в fin_operations ────────────────────
console.log('\n' + '─'.repeat(70));
console.log('ID бронювання        | Гість              | Сума    | Є в фін. | Примітка');
console.log('─'.repeat(70));

const missing = [];
const existing = [];

for (const r of allReservations) {
  const sourceRef = `pin_${r.id}`;
  const finOp = db.prepare(`
    SELECT id, amount, method, account_to_id, created_at
    FROM fin_operations
    WHERE reservation_id = ? AND source = 'booking_widget'
    LIMIT 1
  `).get(r.id);

  // Також перевіримо за source_ref
  const finOpByRef = !finOp ? db.prepare(`
    SELECT id, amount, method, account_to_id, created_at
    FROM fin_operations
    WHERE source_ref = ? LIMIT 1
  `).get(sourceRef) : null;

  const op = finOp || finOpByRef;
  const guestShort = (r.guest_name || 'N/A').slice(0, 18).padEnd(18);
  const resShort = r.id.slice(0, 20).padEnd(20);
  const amount = String(r.total_price + ' ' + (r.currency || 'CZK')).padEnd(8);
  const noteSnippet = r.internal_notes ? r.internal_notes.split('\n')[0].slice(0, 35) : 'no notes';

  if (op) {
    existing.push(r);
    console.log(`✅ ${resShort} | ${guestShort} | ${amount} | ТАК (${op.id.slice(0,8)}) | ${noteSnippet}`);
  } else {
    missing.push(r);
    console.log(`❌ ${resShort} | ${guestShort} | ${amount} | НІ       | ${noteSnippet}`);
  }
}

console.log('─'.repeat(70));
console.log(`\nПідсумок: ✅ ${existing.length} є в фінансах, ❌ ${missing.length} відсутні\n`);

if (missing.length === 0) {
  console.log('✨ Всі платежі вже є у фінансових операціях!');
  process.exit(0);
}

// ── 5. Якщо --apply — додати відсутні ─────────────────────────────
if (!APPLY) {
  console.log('💡 Запусти з прапором --apply щоб додати відсутні операції:');
  console.log('   node fix-andrey-payments.js --apply\n');
  process.exit(0);
}

if (!account) {
  console.error('❌ Не можна додати операції — рахунок не знайдено!');
  process.exit(1);
}

console.log('\n🔧 ЗАСТОСОВУЮ виправлення...\n');

const insertOp = db.prepare(`
  INSERT INTO fin_operations (
    id, organization_id, op_type,
    account_from_id, account_to_id,
    amount, currency, amount_company,
    paid_at, status, method, payment_subtype,
    comment, is_planned, source, source_ref,
    reservation_id, needs_review,
    created_at, updated_at
  ) VALUES (
    ?, ?, 'income',
    NULL, ?,
    ?, ?, ?,
    datetime('now'), 'completed', 'cash', 'full',
    ?, 0, 'booking_widget', ?,
    ?, ?,
    datetime('now'), datetime('now')
  )
`);

let added = 0;
let failed = 0;

for (const r of missing) {
  try {
    const opId = genId();
    const sourceRef = `pin_${r.id}`;
    const needsReview = andreyAccount ? 0 : 1;
    const comment = `Готівка · Андрей · Booking widget · ${r.guest_name || ''} · check-in ${r.check_in || 'N/A'}`;

    insertOp.run(
      opId, orgId,
      account.id,
      r.total_price, r.currency || 'CZK', r.total_price,
      comment, sourceRef,
      r.id, needsReview
    );

    // Оновлення payment_status резервації якщо ще не paid
    db.prepare(`
      UPDATE reservations SET payment_status = 'paid', updated_at = datetime('now')
      WHERE id = ? AND payment_status != 'paid'
    `).run(r.id);

    console.log(`✅ Додано: ${r.id.slice(0,12)} | ${r.guest_name || 'N/A'} | ${r.total_price} ${r.currency || 'CZK'} → ${account.name}`);
    added++;
  } catch(e) {
    console.error(`❌ Помилка для ${r.id}: ${e.message}`);
    failed++;
  }
}

console.log(`\n🏁 Готово: додано ${added}, помилок ${failed}`);
if (added > 0 && !andreyAccount) {
  console.log('\n⚠️  Операції додано до FALLBACK рахунку (не "Андрів cash").');
  console.log('   Перенеси їх вручну у PMS → Фінанси якщо потрібно.');
}

db.close();
