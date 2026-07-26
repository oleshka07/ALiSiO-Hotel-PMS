import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
  '/invest/',            // investor portal page (token-based)
  '/w/',                 // booking widget
];

const PUBLIC_EXACT = [
  '/',
  '/login',
  '/book',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/admin/export-may',
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
  if (pathname.startsWith('/api/guest-registry')) {
    const sessionId = request.cookies.get('session_id')?.value;
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    const expectedToken = process.env.TELEGRAM_BRIDGE_TOKEN;
    const isBridgeAuthorized = Boolean(expectedToken && token === expectedToken);

    if (!sessionId && !isBridgeAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized — session or Bearer token required' },
        { status: 401 }
      );
    }
  }

  // ─── Auth gate ──────────────────────────────────────────────────────
  if (!isPublicRoute(pathname)) {
    const sessionId = request.cookies.get('session_id')?.value;

    if (pathname.startsWith('/api/')) {
      // Allow internal requests authenticated with TELEGRAM_BRIDGE_TOKEN
      const authHeader = request.headers.get('authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
      const expectedToken = process.env.TELEGRAM_BRIDGE_TOKEN;
      const isBridgeAuthorized = Boolean(expectedToken && token === expectedToken);

      // API routes: return 401 JSON if neither session nor bridge token is present
      if (!sessionId && !isBridgeAuthorized) {
        return NextResponse.json(
          { error: 'Unauthorized — session required' },
          { status: 401 }
        );
      }
    } else {
      // Dashboard pages: redirect to login
      if (!sessionId) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        return NextResponse.redirect(loginUrl);
      }
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
