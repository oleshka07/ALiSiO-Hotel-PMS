import { NextResponse } from 'next/server';
import { hostexBulkSync } from '@channels';

const CRON_SECRET = process.env.CRON_SECRET || '';

// GET /api/hostex/bulk-sync — triggered by cron, requires secret
export async function GET(request: Request) {
  if (CRON_SECRET) {
    const secret = request.headers.get('x-cron-secret')
      || new URL(request.url).searchParams.get('secret');
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return hostexBulkSync();
}
