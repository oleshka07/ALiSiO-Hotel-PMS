import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@core/db';
import { parseKbPdf } from '@/modules/finance/data/kb-pdf-parser';
import { importStatement } from '@/modules/finance/data/bank-inbox-engine';

export async function GET() {
  try {
    const db = getDb();
    const dir = path.join(process.cwd(), 'temporary', 'bank Rest');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));

    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    if (!orgRow) throw new Error("No org");
    const orgId = orgRow.id;

    // We need a dummy inbox config to pass to importStatement
    // It only needs id and organization_id in that function
    const dummyInbox: any = {
      id: 'inbox_manual_debug',
      organization_id: orgId
    };

    const results = [];

    for (const file of files) {
      const buffer = fs.readFileSync(path.join(dir, file));
      try {
        const stmt = await parseKbPdf(buffer);
        // UID can just be random or sequential
        const uid = Math.floor(Math.random() * 1000000);
        const importedCount = importStatement(db, dummyInbox, stmt, uid, new Date());
        
        results.push({
          file,
          status: 'success',
          iban: stmt.iban,
          account_number: stmt.account_number,
          tx_count: stmt.transactions.length,
          importedCount
        });
      } catch (err: any) {
        results.push({
          file,
          status: 'error',
          error: err.message
        });
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
