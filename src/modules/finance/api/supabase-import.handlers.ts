/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { runSupabaseImport } from '../data/supabase-import-engine';
import { publicMessage } from '@core/security/public-error';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

/**
 * POST /api/finance/investors/import-supabase
 * Multipart with optional fields:
 *   investors_csv, investments_csv, payments_csv, metrics_csv
 * Query: ?dry_run=1 for preview without writes.
 *
 * Idempotent — re-running the same files is a no-op (matched by
 * supabase_id stored on each row).
 */
export async function importFromSupabase(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const dryRun = request.nextUrl.searchParams.get('dry_run') === '1';
    const form = await request.formData();

    const propertiesCsv   = form.get('properties_csv');
    const investorsCsv    = form.get('investors_csv');
    const investmentsCsv  = form.get('investments_csv');
    const paymentsCsv     = form.get('payments_csv');
    const metricsCsv      = form.get('metrics_csv');

    const input: any = { dryRun };
    if (propertiesCsv instanceof File)  input.propertiesCsv  = await propertiesCsv.text();
    if (investorsCsv instanceof File)   input.investorsCsv   = await investorsCsv.text();
    if (investmentsCsv instanceof File) input.investmentsCsv = await investmentsCsv.text();
    if (paymentsCsv instanceof File)    input.paymentsCsv    = await paymentsCsv.text();
    if (metricsCsv instanceof File)     input.metricsCsv     = await metricsCsv.text();

    if (!input.propertiesCsv && !input.investorsCsv && !input.investmentsCsv && !input.paymentsCsv && !input.metricsCsv) {
      return NextResponse.json({ error: 'At least one CSV file required' }, { status: 400 });
    }

    const result = runSupabaseImport(db, orgId, input);
    return NextResponse.json({ ok: true, dry_run: dryRun, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
