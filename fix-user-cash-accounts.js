#!/usr/bin/env node
/**
 * Backfill default_cash_account_id for production users.
 * Run with --apply to make changes.
 */
const Database = require('better-sqlite3');
const path = require('path');
const apply = process.argv.includes('--apply');
const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'), { readonly: !apply });

const NAME_TO_ACCOUNT = {
  'Андрій': 'Андріїв cash',
  'Андрей': 'Андріїв cash',
  'Andrii': 'Андріїв cash',
  'Andrey': 'Андріїв cash',
  'Олег':  'Олег наличные',
  'Oleg':  'Олег наличные',
  'Admin': 'Олег наличные',
  'Наталія': 'Каса Кемпінг і проживання',
  'Наташа': 'Каса Кемпінг і проживання',
  'Natasha': 'Каса Кемпінг і проживання',
  'Nataly': 'Каса Кемпінг і проживання',
  'Антон': 'Антон Готівка',
  'Anton': 'Антон Готівка',
};

console.log(`Backfill default_cash_account_id [${apply ? 'APPLY' : 'DRY RUN'}]\n`);

const users = db.prepare('SELECT id, full_name, organization_id, default_cash_account_id FROM app_users').all();

for (const u of users) {
  const current = u.default_cash_account_id;
  const currentName = current
    ? db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(current)?.name
    : null;

  if (current) {
    console.log(`  ✅ ${u.full_name} → ${currentName} (already set)`);
    continue;
  }

  let matched = false;
  for (const [namePart, acctName] of Object.entries(NAME_TO_ACCOUNT)) {
    if (u.full_name && u.full_name.includes(namePart)) {
      const acct = db.prepare(
        "SELECT id FROM finance_accounts WHERE organization_id = ? AND name = ? AND is_active = 1 LIMIT 1"
      ).get(u.organization_id, acctName);
      if (acct) {
        if (apply) {
          db.prepare('UPDATE app_users SET default_cash_account_id = ? WHERE id = ?').run(acct.id, u.id);
        }
        console.log(`  ${apply ? '✅ SET' : '🔍 WOULD SET'}: ${u.full_name} → ${acctName} (${acct.id})`);
        matched = true;
      } else {
        console.log(`  ⚠️ ${u.full_name}: account "${acctName}" not found`);
      }
      break;
    }
  }
  if (!matched) {
    console.log(`  ❓ ${u.full_name} — no mapping found`);
  }
}

db.close();
console.log('\nDone.');
