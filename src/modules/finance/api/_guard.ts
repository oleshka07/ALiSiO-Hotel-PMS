/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { hasPermission, type Permission } from '@/lib/permissions';

export type FinanceHandler<TCtx = unknown> = (
  request: NextRequest,
  context: TCtx,
) => Promise<NextResponse | Response>;

// ════════════════════════════════════════════════════════════
// Finance access policy — SINGLE SOURCE OF TRUTH
//
// The finance module (and everything it surfaces: P&L, cashflow, operations,
// bank data, investor data, invoices) is restricted to the OWNER only.
//
// An optional allow-list of user IDs (env FINANCE_EXTRA_USER_IDS, comma-sep)
// can grant point access to a specific person without changing their role.
//
// To change WHO can reach finance, edit ONLY this function.
// ════════════════════════════════════════════════════════════
const FINANCE_ALLOWLIST: ReadonlySet<string> = new Set(
  (process.env.FINANCE_EXTRA_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export function isFinanceAuthorized(user: SessionUser): boolean {
  return user.role === 'owner' || FINANCE_ALLOWLIST.has(user.id);
}

async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const sessionId = store.get('session_id')?.value;
  return getSessionUser(sessionId);
}

function unauthenticated(): NextResponse {
  return NextResponse.json(
    { error: 'Не авторизовано', code: 'UNAUTHENTICATED' },
    { status: 401 },
  );
}

function forbidden(message: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json(
    { error: message, code: 'FORBIDDEN', ...extra },
    { status: 403 },
  );
}

/**
 * Resolve the current session user AND enforce the finance access policy.
 * Returns the user on success, or a NextResponse (401/403) to short-circuit.
 *
 * This validates the session against the DB (the edge middleware only checks
 * cookie presence) — so a forged or expired cookie is rejected here.
 */
async function requireFinanceUser(): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();
  if (!isFinanceAuthorized(user)) {
    return forbidden('Доступ до фінансів лише для власника');
  }
  return user;
}

/**
 * Read guard — session + finance access policy (owner-only). No specific
 * feature permission required beyond reaching the finance module.
 *
 * Wrap EVERY session-based read handler with this. Token-authenticated entry
 * points (telegram bridge, cron, investor portal) and internal programmatic
 * functions (payment-bridge) must NOT be wrapped — they have their own auth
 * and no user session.
 */
export function withFinanceRead<TCtx = unknown>(
  handler: FinanceHandler<TCtx>,
): FinanceHandler<TCtx> {
  return async (request, context) => {
    const u = await requireFinanceUser();
    if (u instanceof NextResponse) return u;
    return handler(request, context);
  };
}

/**
 * Write guard — session + finance access policy (owner-only) + a specific
 * feature permission. Since the owner holds all permissions, the permission
 * check additionally documents intent and stays correct if the access policy
 * above is later widened via the allow-list.
 */
export function withPermission<TCtx = unknown>(
  permission: Permission,
  handler: FinanceHandler<TCtx>,
): FinanceHandler<TCtx> {
  return async (request, context) => {
    const u = await requireFinanceUser();
    if (u instanceof NextResponse) return u;
    if (!hasPermission(u.permissions, permission)) {
      return forbidden(`Недостатньо прав. Потрібен дозвіл: ${permission}`, { required: permission });
    }
    return handler(request, context);
  };
}

/**
 * Write guard requiring ANY of the given permissions (plus the finance access
 * policy). Useful for handlers usable under more than one permission.
 */
export function withAnyPermission<TCtx = unknown>(
  permissions: Permission[],
  handler: FinanceHandler<TCtx>,
): FinanceHandler<TCtx> {
  return async (request, context) => {
    const u = await requireFinanceUser();
    if (u instanceof NextResponse) return u;
    const ok = permissions.some((p) => hasPermission(u.permissions, p));
    if (!ok) {
      return forbidden(
        `Недостатньо прав. Потрібен один з дозволів: ${permissions.join(', ')}`,
        { required: permissions },
      );
    }
    return handler(request, context);
  };
}
