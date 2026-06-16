/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { sendDailyOperationalDigest } from '@/modules/notifications/data/daily-digest';

export async function GET(request: NextRequest) {
  // Auth: require CRON_SECRET in production
  const authHeader = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');
  const secret = process.env.CRON_SECRET || 'local-cron';
  if (authHeader !== secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await sendDailyOperationalDigest();
    console.log(`[Daily Digest Cron] Sent: ${result.sent}`);
    return NextResponse.json({
      sent: result.sent,
      crm: {
        newMessages: result.sections.crm.newMessagesToday,
        unanswered: result.sections.crm.unansweredLeads.length,
        pendingDrafts: result.sections.crm.pendingDrafts,
      },
      finance: {
        totalIncome: result.sections.finance.totalIncome,
        totalExpenses: result.sections.finance.totalExpenses,
      },
      bookings: {
        newToday: result.sections.bookings.newBookingsToday,
        checkIns: result.sections.bookings.checkInsToday.length,
        checkOuts: result.sections.bookings.checkOutsToday.length,
        occupancy: result.sections.bookings.occupancyPct,
      },
      tasks: result.sections.tasks,
    });
  } catch (error: any) {
    console.error('[Daily Digest Cron] Error:', error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
