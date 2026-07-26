/* eslint-disable @typescript-eslint/no-explicit-any */
import { runDaylogReportTickIfDue } from './report-tick';

// Dedicated timer for the evening report.
//
// The tick also runs off getDb(), but that only fires when something happens to
// touch the database — on a quiet evening nothing does, and 22:00 passes in
// silence. This timer makes the report independent of incidental traffic.

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min
let timer: NodeJS.Timeout | null = null;

export function startDaylogScheduler(): void {
  if (timer) return;

  const run = async () => {
    try {
      const { getDb } = await import('@core/db');
      runDaylogReportTickIfDue(getDb());
    } catch (e: any) {
      console.log('[daylog] scheduler tick error:', e?.message);
    }
  };

  // Small delay so the first run doesn't collide with server boot.
  setTimeout(run, 30_000);
  timer = setInterval(run, CHECK_INTERVAL_MS);
  console.log('[daylog] 🕙 report scheduler armed (checks every 5 min)');
}

export function stopDaylogScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
