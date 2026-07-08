/* eslint-disable @typescript-eslint/no-explicit-any */
// ════════════════════════════════════════════════════════════
// Reusable route guards for handlers OUTSIDE the finance module
// (invoices, accounting) that surface or mutate financial data.
//
// The edge middleware only checks cookie presence; these guards validate the
// session against the DB and enforce role/permission. Owner policy mirrors the
// finance module (owner, or an explicit FINANCE_EXTRA_USER_IDS allow-list).
// ════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { hasPermission, type Permission } from '@/lib/permissions';

type RouteHandler<C = any> = (request: any, context: C) => Promise<Response> | Response;

const FINANCE_ALLOWLIST: ReadonlySet<string> = new Set(
  (process.env.FINANCE_EXTRA_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return getSessionUser(store.get('session_id')?.value);
}

function unauthenticated(): NextResponse {
  return NextResponse.json({ error: 'Не авторизовано', code: 'UNAUTHENTICATED' }, { status: 401 });
}
function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message, code: 'FORBIDDEN' }, { status: 403 });
}

/** Owner-only (plus FINANCE_EXTRA_USER_IDS allow-list + finance_user_access table). */
export function requireOwner<C = any>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (request, context) => {
    const u = await currentUser();
    if (!u) return unauthenticated();
    if (u.role !== 'owner' && !FINANCE_ALLOWLIST.has(u.id)) {
      // Check DB-based access as a fallback
      try {
        const { isFinanceUserEnabled } = await import('@/modules/finance/api/finance-access.handlers');
        if (!isFinanceUserEnabled(u.id)) {
          return forbidden('Доступ лише для власника');
        }
      } catch {
        return forbidden('Доступ лише для власника');
      }
    }
    return handler(request, context);
  };
}

/** Requires a valid session and a specific feature permission. */
export function requirePermission<C = any>(
  permission: Permission,
  handler: RouteHandler<C>,
): RouteHandler<C> {
  return async (request, context) => {
    const u = await currentUser();
    if (!u) return unauthenticated();
    if (!hasPermission(u.permissions, permission)) {
      return forbidden(`Недостатньо прав. Потрібен дозвіл: ${permission}`);
    }
    return handler(request, context);
  };
}
