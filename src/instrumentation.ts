/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts. Used to initialize background jobs.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the Node.js server (not edge, not client)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEmailPoller } = await import('./lib/channels/email-cron');
    startEmailPoller();

    const { startHostexCron } = await import('./lib/channels/hostex-cron');
    startHostexCron();

    // Register event subscribers
    const { registerCrmSubscribers } = await import('@crm');
    registerCrmSubscribers();

    const { registerBookingsSubscribers } = await import('@bookings');
    registerBookingsSubscribers();
  }
}
