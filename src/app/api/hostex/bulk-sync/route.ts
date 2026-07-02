import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { hostexBulkSync } from '@channels';
import { getDb } from '@core/db';

const CRON_SECRET = process.env.CRON_SECRET || '';

function isAuthorized(request: NextRequest): boolean {
  if (CRON_SECRET) {
    const secret = request.headers.get('x-cron-secret')
      || new URL(request.url).searchParams.get('secret');
    if (secret === CRON_SECRET) return true;
  }
  const sessionId = request.cookies.get('session_id')?.value;
  if (sessionId) {
    try {
      const session = getDb().prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
      if (session) return true;
    } catch { /* ignore */ }
  }
  if (!CRON_SECRET) return true;
  return false;
}

// GET /api/hostex/bulk-sync — triggered by cron or UI
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return hostexBulkSync(request);
}
