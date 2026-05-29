import { NextResponse } from 'next/server';
import { processSyncQueue } from '@channels';

const CRON_SECRET = process.env.CRON_SECRET || '';

// POST /api/channels/sync/process — ARI sync queue processor, triggered by cron
export async function POST(request: Request) {
  if (CRON_SECRET) {
    const secret = request.headers.get('x-cron-secret')
      || new URL(request.url).searchParams.get('secret');
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return processSyncQueue();
}
