/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts. Used to initialize background jobs.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the Node.js server (not edge, not client)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // A deploy starts the new build on a spare port and waits for it to answer
  // before the live service is touched. That throwaway process must not poll
  // the mailbox, mark bank messages read, or fire the evening report — but it
  // MUST still load every module below, because this hook is exactly where a
  // broken build shows itself. So the imports always run and only the timers
  // are held back.
  const smoke = process.env.PMS_SMOKE_TEST === '1';

  const { startEmailPoller } = await import('./lib/channels/email-cron');
  if (!smoke) startEmailPoller();

  const { startHostexCron } = await import('./lib/channels/hostex-cron');
  if (!smoke) startHostexCron();

  // Evening day-log report — own timer so it doesn't depend on traffic.
  const { startDaylogScheduler } = await import('./modules/daylog/data/scheduler');
  if (!smoke) startDaylogScheduler();

  // Register event subscribers
  const { registerCrmSubscribers } = await import('@crm');
  const { registerBookingsSubscribers } = await import('@bookings');
  if (!smoke) {
    registerCrmSubscribers();
    registerBookingsSubscribers();
  }
}
