import { NextRequest, NextResponse } from 'next/server';
import { sendDailyTaskDigestAll } from '@/modules/tasks/data/task-notifications';

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
    const result = await sendDailyTaskDigestAll();
    console.log(`[Task Digest Cron] Sent: ${result.sent}, Skipped: ${result.skipped}`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Task Digest Cron] Error:', error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
