import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import path from 'path';

// ─── Session validation ───────────────────────────────────────────────
// Proxy always runs on the Node.js runtime in Next 16, so the gate can read
// the session store directly.
// Until now this file only checked that a `session_id` cookie was PRESENT.
// It never looked the value up, so `Cookie: session_id=anything` passed the
// gate and reached every route that has no guard of its own — 334 of 372.
//
// Deliberately a separate read-only connection instead of importing
// @/lib/db: that module runs initSchema + runMigrations on first access, and
// the request gate is the last place that should be able to write to or
// migrate the database.
let sessionDb: { prepare: (sql: string) => { get: (v: string) => unknown } } | null = null;
let sessionDbFailed = false;

function getSessionDb() {
  if (sessionDb || sessionDbFailed) return sessionDb;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    sessionDb = new Database(path.join(process.cwd(), 'data', 'alisio.db'), { readonly: true });
  } catch (e) {
    sessionDbFailed = true;
    console.error('[proxy] cannot open the session store — denying authenticated routes:', e);
  }
  return sessionDb;
}

function hasValidSession(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  const db = getSessionDb();
  if (!db) return false; // fail closed: no store, no access
  try {
    const row = db.prepare(`
      SELECT 1 FROM sessions s
      JOIN app_users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `).get(sessionId);
    return Boolean(row);
  } catch (e) {
    console.error('[proxy] session lookup failed — denying:', e);
    return false;
  }
}

function hasBridgeToken(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_BRIDGE_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') && header.substring(7) === expected;
}

// ─── Security: Public routes that do NOT require authentication ───────
const PUBLIC_PREFIXES = [
  '/api/auth/',          // login, logout, me
  '/api/guest/',         // guest portal (token-based)
  '/api/public/',        // public capture, availability
  '/api/webhooks/',      // Hostex, Teya webhooks (own auth)
  '/api/ical-export/',   // iCal feed (token-based URL)
  '/api/ical-sync/',     // iCal cron sync (own ?secret= auth)
  '/api/booking/',       // guest self-registration, payments
  '/api/cron/',          // cron jobs (own secret-header auth)
  '/api/finance/telegram-bridge/', // Telegram bot (Bearer token auth)
  '/api/registration/telegram-bridge', // Telegram bot guest registration (Bearer token auth)
  '/api/guest-registry',               // Ubyport / Guest registry (session or Bearer token auth)
  '/api/crm/channels/',            // CRM email poll + telegram callback (own auth)
  '/api/crm/leads/from-bot',       // Telegram bot → PMS lead creation
  '/api/hostex/sync',              // Hostex sync (cron secret in route.ts)
  '/api/hostex/bulk-sync',         // Hostex bulk sync (cron secret in route.ts)
  '/api/channels/reservations/poll', // Booking.com polling (cron secret in route.ts)
  '/api/channels/sync/process',    // ARI sync queue (cron secret in route.ts)
  '/api/invest/',                  // investor portal API (token-based auth in handler)
  '/api/widget',         // widget-* endpoints (public embed)
  '/api/file-upload',    // guest passport photo upload from /book page (no session)
  '/login',              // login page
  '/guest/',             // guest portal page
  '/book/',              // public booking wizard
  '/checkin',            // QR self check-in at the gate (no session, by design)
  '/invest/',            // investor portal page (token-based)
  '/w/',                 // booking widget
  '/report/',            // partner monthly report (token-based, no account)
];

const PUBLIC_EXACT = [
  '/',
  '/login',
  '/book',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

// ─── Device detection ─────────────────────────────────────────────────
const MOBILE_UA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Special case for /api/guest-registry ──────────────────────────
  // Listed in PUBLIC_PREFIXES so it skips the gate below, yet it serves the
  // guest registry: names, dates of birth, nationality, document numbers and
  // addresses, plus a CSV export of all of it.
  if (pathname.startsWith('/api/guest-registry')) {
    const sessionId = request.cookies.get('session_id')?.value;
    if (!hasValidSession(sessionId) && !hasBridgeToken(request)) {
      return NextResponse.json(
        { error: 'Unauthorized — session or Bearer token required' },
        { status: 401 }
      );
    }
  }

  // ─── Auth gate ──────────────────────────────────────────────────────
  if (!isPublicRoute(pathname)) {
    const sessionId = request.cookies.get('session_id')?.value;
    const authorized = hasValidSession(sessionId) || hasBridgeToken(request);

    if (pathname.startsWith('/api/')) {
      if (!authorized) {
        return NextResponse.json(
          { error: 'Unauthorized — session required' },
          { status: 401 }
        );
      }
    } else if (!authorized) {
      // Dashboard pages: redirect to login
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      return NextResponse.redirect(loginUrl);
    }
  }

  // ─── Device detection (existing logic) ──────────────────────────────
  const response = NextResponse.next();

  // Allow force override via cookie (for testing)
  const forceDevice = request.cookies.get('force-device')?.value;
  if (forceDevice) {
    response.headers.set('x-device-type', forceDevice);
    return response;
  }

  const ua = request.headers.get('user-agent') || '';
  const deviceType = MOBILE_UA.test(ua) ? 'mobile' : 'desktop';
  response.headers.set('x-device-type', deviceType);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|woff|woff2|ttf|eot)$).*)'],
};
