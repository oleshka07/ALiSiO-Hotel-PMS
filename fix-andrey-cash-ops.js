#!/usr/bin/env node
/**
 * Fix misrouted cash operations: move Andrey's ops from "Олег наличные" to "Андріїв cash".
 * Run with --apply to actually make changes.
 */
const Database = require('better-sqlite3');
const path = require('path');
const apply = process.argv.includes('--apply');
const db = new Database(path.join(process.cwd(), 'data', 'alisio.db'), { readonly: !apply });

const ANDREY_CASH = 'acct_1778843245916_cj7m';
const OLEG_CASH = 'acct_imp_1777364002109_935c64';

// Misrouted income operations (account_to_id should be Андріїв cash)
const INCOME_OPS = [
  'inc_1780153007641_l5c7',  // ZVIRECI PETR — 800 CZK
  'inc_1780151743578_1vaa',  // Bronislav Košťál — 6497 CZK
];

// Misrouted transfer (account_from_id should be Андріїв cash)
const TRANSFER_OPS = [
  'txfr_1780079530619_o7z3',  // 9000 CZK transfer
];

console.log('═══════════════════════════════════════════════════════════');
console.log('  FIX: Reroute Andrey cash operations');
console.log(`  Mode: ${apply ? '🔧 APPLY' : '👀 DRY RUN'}`);
console.log('═══════════════════════════════════════════════════════════\n');

// Show current state
for (const id of [...INCOME_OPS, ...TRANSFER_OPS]) {
  const op = db.prepare('SELECT id, op_type, amount, currency, account_from_id, account_to_id, comment FROM fin_operations WHERE id = ?').get(id);
  if (!op) { console.log(`  ❌ ${id} — NOT FOUND`); continue; }
  const fromName = op.account_from_id ? db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(op.account_from_id)?.name : null;
  const toName = op.account_to_id ? db.prepare('SELECT name FROM finance_accounts WHERE id = ?').get(op.account_to_id)?.name : null;
  console.log(`  ${id} | ${op.op_type} | ${op.amount} ${op.currency}`);
  console.log(`    from: ${fromName || 'NULL'} (${op.account_from_id || 'NULL'})`);
  console.log(`    to:   ${toName || 'NULL'} (${op.account_to_id || 'NULL'})`);
  console.log(`    comment: ${op.comment}`);
  console.log('');
}

if (apply) {
  const tx = db.transaction(() => {
    // Fix income ops: account_to_id Олег → Андрій
    for (const id of INCOME_OPS) {
      const r = db.prepare(
        'UPDATE fin_operations SET account_to_id = ? WHERE id = ? AND account_to_id = ?'
      ).run(ANDREY_CASH, id, OLEG_CASH);
      console.log(`  ${id}: ${r.changes > 0 ? '✅ FIXED' : '⚠️ NO CHANGE'} (income → Андріїв cash)`);

      // Audit trail
      if (r.changes > 0) {
        db.prepare(`
          INSERT INTO fin_operation_audit (id, operation_id, action, user_name, before_json, after_json, performed_at)
          VALUES (?, ?, 'update', 'System (cash routing fix)', ?, ?, datetime('now'))
        `).run(
          `aud_fix_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          id,
          JSON.stringify({ account_to_id: OLEG_CASH, note: 'Was on Олег наличные' }),
          JSON.stringify({ account_to_id: ANDREY_CASH, note: 'Moved to Андріїв cash (Andrey created this op)' }),
        );
      }
    }

    // Fix transfer ops: account_from_id Олег → Андрій
    for (const id of TRANSFER_OPS) {
      const op = db.prepare('SELECT account_from_id, account_to_id FROM fin_operations WHERE id = ?').get(id);
      if (!op) continue;

      // Determine which side to fix
      if (op.account_from_id === OLEG_CASH) {
        const r = db.prepare(
          'UPDATE fin_operations SET account_from_id = ? WHERE id = ? AND account_from_id = ?'
        ).run(ANDREY_CASH, id, OLEG_CASH);
        console.log(`  ${id}: ${r.changes > 0 ? '✅ FIXED' : '⚠️ NO CHANGE'} (transfer from → Андріїв cash)`);
      } else if (op.account_to_id === OLEG_CASH) {
        const r = db.prepare(
          'UPDATE fin_operations SET account_to_id = ? WHERE id = ? AND account_to_id = ?'
        ).run(ANDREY_CASH, id, OLEG_CASH);
        console.log(`  ${id}: ${r.changes > 0 ? '✅ FIXED' : '⚠️ NO CHANGE'} (transfer to → Андріїв cash)`);
      }

      // Audit trail
      db.prepare(`
        INSERT INTO fin_operation_audit (id, operation_id, action, user_name, before_json, after_json, performed_at)
        VALUES (?, ?, 'update', 'System (cash routing fix)', ?, ?, datetime('now'))
      `).run(
        `aud_fix_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        id,
        JSON.stringify({ note: 'Was on Олег наличные' }),
        JSON.stringify({ note: 'Moved to Андріїв cash (Andrey created this op)' }),
      );
    }
  });
  tx();
  console.log('\n✅ All fixes applied.');
} else {
  console.log('Dry run. Pass --apply to execute.');
}

db.close();
