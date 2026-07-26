import { NextRequest, NextResponse } from 'next/server';
import { summarizeDate, listByDate } from '../data/daylog.repo';
import { formatDailyReport } from '../domain/format';
import { sendToChat } from '../domain/telegram';

function pragueToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}

// GET /api/daylog/report?date=YYYY-MM-DD           → JSON summary + text + entries
// GET /api/daylog/report?date=...&post=1&chat_id=… → also post the report to Telegram
// Auth: shared secret header (same as ingest) so a cron can call it.
export async function daylogReport(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.DAYLOG_BRIDGE_SECRET;
  if (!secret) return NextResponse.json({ error: 'DAYLOG_BRIDGE_SECRET not configured' }, { status: 503 });
  if (request.headers.get('x-daylog-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || pragueToday();
  const summary = summarizeDate(date);
  const text = formatDailyReport(summary);

  if (url.searchParams.get('post') === '1') {
    const chatId = url.searchParams.get('chat_id') || process.env.DAYLOG_CHAT_ID || '';
    if (chatId) await sendToChat(chatId, text);
  }

  return NextResponse.json({ ok: true, date, summary, text, entries: listByDate(date) });
}
