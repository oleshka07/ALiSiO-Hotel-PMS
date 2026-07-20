/**
 * GET|POST /api/cron/sync-cnb-rates
 *
 * Pulls the ČNB daily FX fixing and upserts <CUR>→CZK into finance_exchange_rates.
 * Runs daily via cron; also callable manually with ?date=YYYY-MM-DD (backfill)
 * and ?currencies=EUR,USD to override the default set.
 *
 * Auth: x-cron-secret header or Bearer CRON_SECRET (same as other cron routes).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { syncCnbRates } from '@/lib/cnb-rates';

async function handle(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('x-cron-secret')
    || request.headers.get('authorization')?.replace('Bearer ', '');
  const secret = process.env.CRON_SECRET || 'local-cron';
  if (authHeader !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || undefined;
    const currencies = searchParams.get('currencies')?.split(',').map(c => c.trim()).filter(Boolean);

    const result = await syncCnbRates(getDb(), { date, currencies });
    console.log('[ČNB Rates] Synced', result.date, '→', result.upserted.join(', ') || '(none)');
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ČNB Rates]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
