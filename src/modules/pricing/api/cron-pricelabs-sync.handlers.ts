/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Cron entry point — POST /api/cron/sync-pricelabs.
// Pulls daily prices from PriceLabs for the 6 glamping houses, converts EUR→CZK,
// and upserts into price_calendar so the widget + channel manager see the
// fresh rates.
//
// Authentication mirrors poll-bank-inboxes: caller must present the
// `X-Cron-Secret` header matching `process.env.CRON_SECRET`. The crontab on
// the VPS reads that value from /root/projects/alisio-pms/.env.
//
// Usage in crontab (set up automatically by .github/workflows/deploy.yml):
//   0 4 * * * curl -fsS -X POST -H "X-Cron-Secret: $SECRET" \
//     http://localhost:3000/api/cron/sync-pricelabs
//

import { NextRequest, NextResponse } from 'next/server';
import { syncPriceLabsToCalendar } from '../data/pricelabs-sync';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

export async function syncPriceLabsFromCron(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET env variable is not configured on the server' },
      { status: 503 },
    );
  }

  const provided = request.headers.get('x-cron-secret');
  if (provided !== expected) {
    return NextResponse.json({ error: 'invalid or missing X-Cron-Secret header' }, { status: 401 });
  }

  // Optional ?days=N override for ad-hoc runs.
  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '90', 10)));

  try {
    const result = await syncPriceLabsToCalendar(days);

    // Best-effort TG digest. Failures suppressed so the cron exit code
    // still reflects the actual sync outcome, not Telegram availability.
    try {
      const conflictNote = result.conflicts.length > 0
        ? `\n⚠️ Конфлікти unit_type: ${result.conflicts.length} (типи з кількома лістингами PriceLabs — останній перезаписує)`
        : '';
      const errorNote = result.errors.length > 0 ? `\n❌ Помилки: ${result.errors.join('; ')}` : '';
      const lines = [
        result.ok ? '📈 <b>PriceLabs sync OK</b>' : '⚠️ <b>PriceLabs sync завершено з помилками</b>',
        ``,
        `Будинків: ${result.listingsResolved}${result.listingsSkipped > 0 ? ` (пропущено ${result.listingsSkipped})` : ''}`,
        `Записано днів: <b>${result.daysWrittenTotal}</b> (період ${result.dateFrom} → ${result.dateTo})`,
        `EUR→CZK: ${result.eurToCzk.toFixed(3)}`,
        ...result.perListing.map((p) => `  • ${p.unit_name}: ${p.days_written} днів`),
        conflictNote,
        errorNote,
      ].filter(Boolean).join('\n');
      await sendTelegramMessage(lines, undefined, { ownerOnly: true });
    } catch (tgErr: any) {
      console.error('[PL cron] TG notify failed (non-fatal):', tgErr.message);
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e: any) {
    console.error('[PL cron] sync failed:', e?.message, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message || 'sync failed' }, { status: 500 });
  }
}
