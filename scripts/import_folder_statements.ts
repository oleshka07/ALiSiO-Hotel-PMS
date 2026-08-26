import fs from 'fs';
import path from 'path';
import { getDb } from '../src/core/db';
import { parseKbPdf } from '../src/modules/finance/data/kb-pdf-parser';
import { importStatement } from '../src/modules/finance/data/bank-inbox-engine';

async function main() {
  const db = getDb();
  console.log('--- Bank Statement Importer ---');

  // 1. Ensure Komerční banka account has exact IBAN matching the statement
  const account = db.prepare(`
    SELECT * FROM finance_accounts WHERE type = 'bank' AND is_active = 1 LIMIT 1
  `).get() as any;

  if (!account) {
    console.error('❌ No active bank account found in finance_accounts!');
    process.exit(1);
  }

  console.log(`🏦 Bank Account: ${account.name} (id: ${account.id}, current IBAN: ${account.iban})`);

  // Update IBAN to match Komerční banka statement IBAN if needed
  const targetIban = 'CZ2601000001314361940207';
  if (account.iban !== targetIban) {
    db.prepare(`UPDATE finance_accounts SET iban = ? WHERE id = ?`).run(targetIban, account.id);
    console.log(`✅ Updated account IBAN to ${targetIban}`);
  }

  // 2. Fetch inbox config or construct mock inbox
  const inbox = db.prepare(`SELECT * FROM fin_bank_inboxes LIMIT 1`).get() as any || {
    id: 'inbox_manual_folder',
    organization_id: account.organization_id,
    name: 'Folder Import',
  };

  const folder = 'D:\\Antigraviti\\ALiSiO PMS\\data\\uploads\\bank-statements\\31.07';
  const files = fs.readdirSync(folder).filter((f) => f.endsWith('.pdf')).sort();

  console.log(`📂 Processing ${files.length} PDF statement files from ${folder}...`);

  let totalImportedOps = 0;
  let skippedFiles = 0;
  let importedFiles = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(folder, file);
    const buf = fs.readFileSync(filePath);

    try {
      const stmt = await parseKbPdf(buf);

      // Check if statement file was already imported
      const existing = db.prepare(`
        SELECT id FROM bank_statements
        WHERE organization_id = ? AND file_name = ?
      `).get(account.organization_id, file) as any;

      if (existing) {
        console.log(`⏩ Skipping ${file} (already imported as ${existing.id})`);
        skippedFiles++;
        continue;
      }

      // Import statement using bank-inbox-engine pipeline
      const { imported, skipped } = importStatement(db, inbox, stmt, 310700 + i, new Date());
      if (imported === -1) {
        console.error(`⚠️ ${file}: Account not matched for IBAN ${stmt.iban}`);
      } else {
        const dup = skipped ? `, ${skipped} already posted` : '';
        console.log(`✅ ${file}: Imported ${imported} transaction(s)${dup} [Date: ${stmt.period_from}, ${stmt.opening_balance} -> ${stmt.closing_balance} CZK]`);
        totalImportedOps += imported;
        importedFiles++;
      }
    } catch (err: any) {
      console.error(`❌ ${file} import failed:`, err.message);
    }
  }

  console.log('\n--- IMPORT SUMMARY ---');
  console.log(`Files Processed: ${importedFiles} imported, ${skippedFiles} skipped`);
  console.log(`Total New Operations Created: ${totalImportedOps}`);

  // Show summary of created operations
  const recentOps = db.prepare(`
    SELECT id, op_type, amount, currency, paid_at, comment
    FROM fin_operations
    WHERE source = 'bank_import'
    ORDER BY paid_at DESC, created_at DESC
    LIMIT 15
  `).all();

  console.log('\n📊 Recent Bank Operations in Database:');
  console.table(recentOps);
}

main().catch((err) => {
  console.error('Fatal error:', err);
});
