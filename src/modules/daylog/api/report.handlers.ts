import { NextRequest, NextResponse } from 'next/server';
import { summarizeDate, listByDate } from '../data/daylog.repo';
import { reconcileDay } from '../data/reconcile';
import { formatDailyReport, formatReconcile } from '../domain/format';
import { sendToChat } from '../domain/telegram';
import { DAYLOG_CHAT_ID } from '../domain/config';
import { authorizeDaylog } from '../domain/auth';

function pragueToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}

// GET /api/daylog/report?date=YYYY-MM-DD           → JSON summary + text + entries
// GET /api/daylog/report?date=...&post=1&chat_id=… → also post the report to Telegram
// Auth: the same bridge token the bot already uses elsewhere.
export async function daylogReport(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeDaylog(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || pragueToday();
  const summary = summarizeDate(date);
  let reconcile = null;
  try { reconcile = reconcileDay(date); } catch (e) {
    console.error('[daylog] reconcile failed:', (e as Error).message);
  }
  const text = formatDailyReport(summary) + (reconcile ? formatReconcile(reconcile) : '');

  if (url.searchParams.get('post') === '1') {
    const chatId = url.searchParams.get('chat_id') || DAYLOG_CHAT_ID || '';
    if (chatId) await sendToChat(chatId, text);
  }

  return NextResponse.json({ ok: true, date, summary, reconcile, text, entries: listByDate(date) });
}
