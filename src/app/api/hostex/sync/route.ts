import { NextResponse } from 'next/server';
import { hostexSync, hostexSyncStatus } from '@channels';

const CRON_SECRET = process.env.CRON_SECRET || '';

// POST /api/hostex/sync — triggered by cron, requires secret
export async function POST(request: Request) {
  if (CRON_SECRET) {
    const secret = request.headers.get('x-cron-secret')
      || new URL(request.url).searchParams.get('secret');
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return hostexSync();
}

// GET /api/hostex/sync — sync status (also protected by cron secret when public)
export async function GET(request: Request) {
  if (CRON_SECRET) {
    const secret = request.headers.get('x-cron-secret')
      || new URL(request.url).searchParams.get('secret');
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return hostexSyncStatus();
}
