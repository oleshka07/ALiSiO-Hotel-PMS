import { NextResponse } from 'next/server';
import { anonymizeOldRegistrations } from '@/modules/guests/data/registration.repo';

export async function GET(request: Request) {
  // Allow invoking locally or via cron, ideally guarded by a secret header in production
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 6 months is standard, but you can pass ?months=X in URL
    const { searchParams } = new URL(request.url);
    const monthsParam = searchParams.get('months');
    const months = monthsParam ? parseInt(monthsParam, 10) : 6;

    const anonymizedCount = anonymizeOldRegistrations(months);

    return NextResponse.json({
      success: true,
      message: `GDPR CRON: Anonymized ${anonymizedCount} guest records older than ${months} months.`,
      anonymizedCount
    });
  } catch (err: any) {
    console.error('[GDPR Cron Error]:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 });
  }
}
