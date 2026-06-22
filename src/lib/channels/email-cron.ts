/**
 * CRM Polling Scheduler
 * - Email polling: every 2 minutes (fetch new emails from all accounts)
 * - Stage sync: every 5 minutes (reservation status → lead stage)
 * 
 * NOTE: Telegram callback polling is handled by kemptimebot (Python bot)
 * via crm_bridge.py → HTTP POST to /api/crm/channels/telegram/callback
 * See TELEGRAM_BOT_BRIDGE.md for architecture details.
 */

let isRunning = false;
let emailIntervalId: ReturnType<typeof setTimeout> | null = null;
let tgPollIntervalId: ReturnType<typeof setTimeout> | null = null;
const EMAIL_POLL_MS = 2 * 60 * 1000; // 2 minutes
const TG_POLL_MS = 10 * 1000; // 10 seconds

async function pollEmails() {
  if (isRunning) return;
  isRunning = true;

  try {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/crm/channels/email/poll?secret=${process.env.EMAIL_POLL_SECRET || 'internal'}`;
    
    console.log('[Email Cron] Polling at', new Date().toISOString());
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: { 'X-Internal-Cron': '1' },
    });
    clearTimeout(timeout);
    
    if (res.ok) {
      const data = await res.json();
      if (data.fetched > 0 || data.leads_created > 0) {
        console.log(`[Email Cron] ✅ Fetched: ${data.fetched}, Guests: ${data.classified_guest}, Leads: ${data.leads_created}, Messages: ${data.messages_added}`);
      }
    } else {
      console.error('[Email Cron] ❌ Poll failed:', res.status);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[Email Cron] ⏱️ Poll timed out');
    } else {
      console.error('[Email Cron] ❌ Error:', err.message);
    }
  } finally {
    isRunning = false;
  }
}

let tgPollRunning = false;
async function pollTelegramCallbacks() {
  if (tgPollRunning) return;
  tgPollRunning = true;
  try {
    const { pollTelegram } = await import('@/modules/crm/api/telegram-poll.handlers');
    await pollTelegram();
  } catch (err: any) {
    console.error('[TG Cron] Poll error:', err.message);
  } finally {
    tgPollRunning = false;
  }
}

async function syncStages() {
  try {
    const { syncReservationStages } = await import('@/lib/sync/guest-lead-sync');
    const result = syncReservationStages();
    if (result.updated > 0) {
      console.log(`[Stage Sync] ✅ Updated ${result.updated} lead stage(s)`);
    }
  } catch (err: any) {
    console.error('[Stage Sync] Error:', err.message);
  }
}

export function startEmailPoller() {
  if (emailIntervalId) return;
  
  if (typeof window !== 'undefined') return;

  // Only auto-poll in production
  if (process.env.NODE_ENV !== 'production') {
    console.log('[CRM Cron] Skipped — auto-polling disabled in development');
    return;
  }

  // One-time: migrate existing leads without guest records
  setTimeout(async () => {
    try {
      const { migrateLeadsWithoutGuests } = await import('@/lib/sync/guest-lead-sync');
      const migrated = migrateLeadsWithoutGuests();
      if (migrated > 0) console.log(`[Migration] ✅ Created guest records for ${migrated} existing leads`);
    } catch (err: any) {
      console.error('[Migration] Error:', err.message);
    }
  }, 5000);

  // Seed stage prompts (idempotent — skips if already exist)
  setTimeout(async () => {
    try {
      const { seedStagePrompts } = await import('@/lib/crm/seed-prompts');
      const seeded = seedStagePrompts();
      if (seeded > 0) console.log(`[Seed] ✅ Created ${seeded} stage AI prompts`);
    } catch (err: any) {
      console.error('[Seed] Prompt seed error:', err.message);
    }
  }, 6000);

  // Email polling
  if (process.env.EMAIL_CZ_USER || process.env.GMAIL_USER) {
    const accounts = [process.env.EMAIL_CZ_USER, process.env.GMAIL_USER].filter(Boolean);
    console.log(`[CRM Cron] 📧 Email poller (every 2 min) — ${accounts.length} account(s): ${accounts.join(', ')}`);
    setTimeout(pollEmails, 10000);
    emailIntervalId = setInterval(pollEmails, EMAIL_POLL_MS);
  }

  // ⛔ Telegram callback polling is DISABLED in PMS.
  // The Python bot (kemptimebot / alisio-bot) is the sole getUpdates consumer.
  // Running getUpdates from BOTH PMS and the Python bot causes a race condition:
  // one process "steals" the update from the other, making buttons work intermittently.
  // See TELEGRAM_BOT_BRIDGE.md for architecture.
  // if (process.env.TELEGRAM_BOT_TOKEN) {
  //   console.log('[CRM Cron] 🤖 Telegram callback poller (every 10s)');
  //   setTimeout(pollTelegramCallbacks, 8000);
  //   tgPollIntervalId = setInterval(pollTelegramCallbacks, TG_POLL_MS);
  // }

  // Stage sync (every 5 min)
  console.log('[CRM Cron] 🔄 Stage sync (every 5 min)');
  setTimeout(syncStages, 20000);
  setInterval(syncStages, 5 * 60 * 1000);
}

export function stopEmailPoller() {
  if (emailIntervalId) {
    clearInterval(emailIntervalId);
    emailIntervalId = null;
  }
  if (tgPollIntervalId) {
    clearInterval(tgPollIntervalId);
    tgPollIntervalId = null;
  }
  console.log('[CRM Cron] Stopped');
}
