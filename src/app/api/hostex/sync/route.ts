import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { hostexSync, hostexSyncStatus } from '@channels';
import { getDb } from '@core/db';

const CRON_SECRET = process.env.CRON_SECRET || '';

/** Check if the request has a valid session (logged-in user) */
function hasValidSession(request: NextRequest): boolean {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return false;
  try {
    const db = getDb();
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    return !!session;
  } catch {
    return false;
  }
}

/** Auth: accept cron secret OR valid session cookie */
function isAuthorized(request: NextRequest): boolean {
  // Cron secret (header or query param)
  if (CRON_SECRET) {
    const secret = request.headers.get('x-cron-secret')
      || new URL(request.url).searchParams.get('secret');
    if (secret === CRON_SECRET) return true;
  }
  // Logged-in user (session cookie)
  if (hasValidSession(request)) return true;
  // No CRON_SECRET set → allow (dev mode)
  if (!CRON_SECRET) return true;
  return false;
}

// POST /api/hostex/sync — triggered by cron OR calendar UI button
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return hostexSync();
}

// GET /api/hostex/sync — sync status
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return hostexSyncStatus();
}
