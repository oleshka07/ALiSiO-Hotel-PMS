import { NextResponse } from 'next/server';
import { anonymizeOldRegistrations } from '@/modules/guests/data/registration.repo';

// Minimum retention this endpoint will accept. ?months=0 means "everything whose
// stay has ended", i.e. the whole registry, and the anonymisation cannot be
// undone — so a typo in a cron line must not be able to express it.
const MIN_MONTHS = 6;

export async function GET(request: Request) {
  // Fail closed. The previous form was
  //   if (process.env.CRON_SECRET && authHeader !== `Bearer ${...}`) return 401
  // so a missing or renamed CRON_SECRET removed the check altogether, on the one
  // endpoint in the system whose effect cannot be reversed.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[GDPR Cron] CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const monthsParam = new URL(request.url).searchParams.get('months');
  let months = 6;
  if (monthsParam !== null) {
    months = Number(monthsParam);
    if (!Number.isInteger(months) || months < MIN_MONTHS) {
      return NextResponse.json(
        { error: `months must be an integer of at least ${MIN_MONTHS}` },
        { status: 400 },
      );
    }
  }

  try {
    const anonymizedCount = anonymizeOldRegistrations(months);
    return NextResponse.json({
      success: true,
      message: `GDPR CRON: Anonymized ${anonymizedCount} guest records older than ${months} months.`,
      anonymizedCount,
    });
  } catch (err: unknown) {
    console.error('[GDPR Cron Error]:', err);
    return NextResponse.json({ error: 'Anonymisation failed' }, { status: 500 });
  }
}
