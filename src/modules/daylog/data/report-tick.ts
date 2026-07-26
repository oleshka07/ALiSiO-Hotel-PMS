/* eslint-disable @typescript-eslint/no-explicit-any */
import { summarizeDate } from './daylog.repo';
import { reconcileDay } from './reconcile';
import { formatDailyReport, formatReconcile } from '../domain/format';
import { sendToChat } from '../domain/telegram';
import { DAYLOG_CHAT_ID, DAYLOG_REPORT_HOUR } from '../domain/config';

// Posts the day-log summary to the chat once per day, after DAYLOG_REPORT_HOUR
// (Europe/Prague). Runs off the existing getDb() tick — no cron/systemd timer
// needed. Fire-and-forget: never throws into the DB bootstrap path.

function pragueParts(): { date: string; hour: number } {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
  const hour = Number(
    now.toLocaleString('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', hour12: false }),
  );
  return { date, hour: isFinite(hour) ? hour : 0 };
}

export function runDaylogReportTickIfDue(db: any): void {
  const { date, hour } = pragueParts();
  if (hour < DAYLOG_REPORT_HOUR) return;

  const row = db
    .prepare("SELECT value FROM fin_system_state WHERE key = 'daylog_report_last_date'")
    .get() as { value: string } | undefined;
  if (row?.value === date) return; // already posted today

  const summary = summarizeDate(date);

  // Cross-check against PMS. Worth reporting even on a silent day: arrivals or
  // unpaid stays still need chasing.
  let reconcile = null;
  try { reconcile = reconcileDay(date); } catch (e: any) {
    console.log('[daylog] reconcile failed:', e?.message);
  }

  const worthPosting = summary.count > 0
    || (reconcile ? reconcile.arrivals.total > 0 || reconcile.issues.length > 0 : false);
  if (!worthPosting) return;

  // Mark first so a slow send can't double-post on a concurrent tick.
  db.prepare(`
    INSERT OR REPLACE INTO fin_system_state (key, value, updated_at)
    VALUES ('daylog_report_last_date', ?, datetime('now'))
  `).run(date);

  const text = formatDailyReport(summary) + (reconcile ? formatReconcile(reconcile) : '');
  sendToChat(DAYLOG_CHAT_ID, text).catch((e: any) =>
    console.log('[daylog] report tick send error:', e?.message),
  );
  console.log(
    `[daylog] posted daily report for ${date} (${summary.count} entries, ${reconcile?.issues.length ?? 0} issues)`,
  );
}
