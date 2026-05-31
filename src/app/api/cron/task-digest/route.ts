import { NextResponse } from 'next/server';
import { sendDailyTaskDigestAll } from '@/modules/tasks/data/task-notifications';

export async function GET() {
  try {
    const result = await sendDailyTaskDigestAll();
    console.log(`[Task Digest Cron] Sent: ${result.sent}, Skipped: ${result.skipped}`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Task Digest Cron] Error:', error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
