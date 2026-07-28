#!/usr/bin/env node
/* eslint-disable */
/**
 * reset-finance-passphrase.cjs — clear a forgotten finance passphrase.
 *
 * The finance module has an optional "second password" (step-up unlock). It is
 * stored as a bcrypt hash, so it can never be recovered or displayed — the only
 * way back in is to clear it and let the person set a new one.
 *
 * The owner can do this for other users from Finance → Settings → Users (🔑).
 * This script exists for the case that UI cannot cover: the OWNER forgetting
 * their own passphrase, which otherwise locks them out of finance entirely.
 *
 *   node reset-finance-passphrase.cjs                    # list who has one
 *   node reset-finance-passphrase.cjs <email>            # dry run
 *   node reset-finance-passphrase.cjs <email> --apply    # clear it
 *
 * Access rights (tabs, accounts, read-only) are NOT touched.
 */
const path = require('path');
const Database = require('better-sqlite3');

const args = process.argv.slice(2).filter((a) => a !== '--apply');
const APPLY = process.argv.includes('--apply');
const email = args[0];
const DB_PATH = path.join(process.cwd(), 'data', 'alisio.db');

const db = new Database(DB_PATH);

const holders = db.prepare(`
  SELECT u.id, u.email, u.full_name, u.role, fs.updated_at
  FROM finance_security fs
  JOIN app_users u ON u.id = fs.user_id
  ORDER BY u.full_name
`).all();

if (!email) {
  if (!holders.length) {
    console.log('Пароль фінансів не встановлено ні в кого.');
  } else {
    console.log('Пароль фінансів встановлено у:\n');
    for (const h of holders) {
      console.log(`  • ${h.full_name || '(без імені)'} <${h.email}>  [${h.role}]`);
    }
    console.log('\nЩоб скинути:  node reset-finance-passphrase.cjs <email> --apply');
  }
  db.close();
  process.exit(0);
}

const user = db.prepare('SELECT id, email, full_name, role FROM app_users WHERE email = ?').get(email);
if (!user) {
  console.error(`❌ Користувача з email "${email}" не знайдено.`);
  db.close();
  process.exit(1);
}

const has = db.prepare('SELECT 1 FROM finance_security WHERE user_id = ?').get(user.id);
if (!has) {
  console.log(`У «${user.full_name}» пароль фінансів не встановлений — скидати нічого.`);
  db.close();
  process.exit(0);
}

console.log(`Знайдено пароль фінансів: ${user.full_name} <${user.email}> [${user.role}]`);

if (!APPLY) {
  console.log('\n(dry-run — нічого не змінено; додай --apply щоб скинути)');
  db.close();
  process.exit(0);
}

const tx = db.transaction(() => {
  db.prepare('DELETE FROM finance_security WHERE user_id = ?').run(user.id);
  db.prepare('UPDATE sessions SET finance_unlocked_until = NULL WHERE user_id = ?').run(user.id);
});
tx();

console.log(`\n✅ Пароль фінансів для «${user.full_name}» скинуто.`);
console.log('   Хай зайде у Фінанси — доступ буде без пароля, і там можна встановити новий.');
db.close();
