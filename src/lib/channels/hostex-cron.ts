/**
 * Hostex Sync Cron Job
 * Runs every 10 minutes to pull reservations from Hostex
 * Also registers webhook on startup for real-time updates
 */
import { syncReservations, seedPropertyMap } from '../hostex-sync';
import { ensureWebhookRegistered } from '../hostex';

let cronInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let initialized = false;

const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const PMS_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://alisio.swipescape.eu';

export function startHostexCron() {
  if (cronInterval) return;

  console.log('[Hostex Cron] Starting sync scheduler (every 10 min)');

  // Initial sync after 10 seconds (let server start)
  setTimeout(async () => {
    if (!initialized) {
      try {
        await seedPropertyMap();
        initialized = true;
        console.log('[Hostex Cron] Property map seeded');
      } catch (e: any) {
        console.error('[Hostex Cron] Failed to seed property map:', e.message);
      }

      // Register webhook with Hostex (idempotent — skips if already registered)
      try {
        await ensureWebhookRegistered(PMS_BASE_URL);
      } catch (e: any) {
        console.error('[Hostex Cron] Webhook registration failed:', e.message);
      }
    }
    await runSync();
  }, 10_000);

  // Recurring sync
  cronInterval = setInterval(runSync, SYNC_INTERVAL_MS);
}

export function stopHostexCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('[Hostex Cron] Sync scheduler stopped');
  }
}

async function runSync() {
  if (isRunning) {
    console.log('[Hostex Cron] Sync already running, skipping');
    return;
  }

  isRunning = true;
  const start = Date.now();

  try {
    console.log('[Hostex Cron] Starting sync...');
    const result = await syncReservations();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Hostex Cron] Sync completed in ${elapsed}s: ${result.created} new, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors (rate: ${result.eurCzkRate})`);
  } catch (e: any) {
    console.error('[Hostex Cron] Sync failed:', e.message);
  } finally {
    isRunning = false;
  }
}

/** Manual trigger */
export async function triggerManualSync() {
  return runSync();
}
