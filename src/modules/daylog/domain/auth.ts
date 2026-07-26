import { NextRequest, NextResponse } from 'next/server';

// Day-log bridge auth. Deliberately reuses TELEGRAM_BRIDGE_TOKEN — the same
// shared secret the bot already sends for the finance/registration bridges — so
// this add-on needs no new configuration on either side. DAYLOG_BRIDGE_SECRET
// (x-daylog-secret header) stays supported as an optional override.
export function authorizeDaylog(
  request: NextRequest,
): { ok: true } | { ok: false; response: NextResponse } {
  const daylogSecret = process.env.DAYLOG_BRIDGE_SECRET;
  if (daylogSecret && request.headers.get('x-daylog-secret') === daylogSecret) {
    return { ok: true };
  }

  const expected = process.env.TELEGRAM_BRIDGE_TOKEN;
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Bridge not configured: TELEGRAM_BRIDGE_TOKEN missing on server' },
        { status: 503 },
      ),
    };
  }

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.substring(7) : '';
  if (!token || token !== expected) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid bridge token' }, { status: 401 }) };
  }
  return { ok: true };
}
