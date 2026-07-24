/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { hasPermission, type Permission } from '@/lib/permissions';
import { hasFinancePassphrase, isFinanceUnlocked } from './_finance-unlock';

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

import { isFinanceUserEnabled, getFinanceAccessForUser } from './finance-access.handlers';

export function isFinanceAuthorized(user: SessionUser): boolean {
  return user.role === 'owner' || FINANCE_ALLOWLIST.has(user.id) || isFinanceUserEnabled(user.id);
}

// ── Per-user ACL enforcement (allowed_tabs / read_only / can_export) ─────────
//
// A restricted (non-owner) finance user carries an access record with a tab
// allow-list, a read-only flag and an export flag. The modal stored these but
// nothing enforced them server-side — so partial access behaved like full
// access. This maps each finance API path to the tab it belongs to and blocks
// requests that fall outside the user's grant.
//
// Only FEATURE-SPECIFIC segments are mapped. Shared reference reads (accounts,
// categories, counterparties, tags, projects, exchange-rates, …) are left
// unmapped on purpose: many tab pages depend on them, and their writes are
// already blocked by read_only + the permission guard. Unmapped path → allowed.
const FINANCE_TAB_BY_SEGMENT: Readonly<Record<string, string>> = {
  overview: 'overview',
  operations: 'operations', 'operations-drill-down': 'operations',
  'paid-services': 'operations', 'payment-orphans': 'operations',
  pnl: 'reports', 'pnl-2': 'reports', 'pnl-matrix': 'reports',
  cashflow: 'reports', 'cashflow-matrix': 'reports', 'plan-fact': 'reports',
  'project-profitability': 'reports', indicators: 'reports', balance: 'reports',
  'forecast-scenarios': 'reports',
  bank: 'bank', 'account-statement': 'bank',
  clearing: 'clearing',
  receipts: 'receipts',
  calendar: 'calendar',
  'expected-payments': 'expected-payments',
  capex: 'capex',
  accruals: 'accruals',
  history: 'history', log: 'history', audit: 'history', 'audit-cash-routing': 'history',
  import: 'import',
  reconcile: 'reconcile',
  investors: 'investors', 'investor-auto-revenue': 'investors',
  'investor-documents': 'investors', 'investor-investments': 'investors',
  'investor-monthly-digest': 'investors', 'investor-monthly-metrics': 'investors',
  'investor-monthly-notes': 'investors', 'investor-monthly-reports': 'investors',
  'investor-payouts': 'investors', 'investor-projects': 'investors',
  'investor-properties': 'investors',
};

function financeTabForPath(pathname: string): string | null {
  const m = pathname.match(/^\/api\/finance\/([^/?]+)/);
  if (!m) return null;
  return FINANCE_TAB_BY_SEGMENT[m[1]] ?? null;
}

function isFinanceExportPath(pathname: string): boolean {
  return pathname.startsWith('/api/finance/export/');
}

/**
 * Enforce a restricted finance user's ACL. Owners and env-allow-listed users
 * are unrestricted. Returns a 403 NextResponse to short-circuit, or null to
 * proceed.
 */
function financeAclError(
  user: SessionUser,
  pathname: string,
  isWrite: boolean,
): NextResponse | null {
  if (user.role === 'owner' || FINANCE_ALLOWLIST.has(user.id)) return null;

  const access = getFinanceAccessForUser(user.id);
  if (!access) return null; // enabled gate already passed; be permissive on missing row

  if (isWrite && access.read_only) {
    return forbidden('Тільки перегляд — редагування вимкнено для вашого доступу.', {
      code: 'READ_ONLY',
    });
  }

  if (isFinanceExportPath(pathname) && !access.can_export) {
    return forbidden('Експорт даних вимкнено для вашого доступу.', { code: 'EXPORT_FORBIDDEN' });
  }

  const tab = financeTabForPath(pathname);
  if (tab && tab !== 'overview' && !access.allowed_tabs.includes(tab)) {
    return forbidden(`Немає доступу до розділу «${tab}».`, { code: 'TAB_FORBIDDEN', tab });
  }

  return null;
}

async function getSession(): Promise<{ sessionId: string | undefined; user: SessionUser | null }> {
  const store = await cookies();
  const sessionId = store.get('session_id')?.value;
  return { sessionId, user: getSessionUser(sessionId) };
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
async function requireFinanceUser(
  request?: NextRequest,
  isWrite = false,
): Promise<SessionUser | NextResponse> {
  const { sessionId, user } = await getSession();
  if (!user) return unauthenticated();
  if (!isFinanceAuthorized(user)) {
    return forbidden('Доступ до фінансів лише для власника');
  }
  // Opt-in step-up: once a finance passphrase is set, every session must unlock.
  if (hasFinancePassphrase(user.id) && !isFinanceUnlocked(sessionId)) {
    return forbidden('Фінансовий розділ заблоковано. Введіть пароль фінансів.', {
      code: 'FINANCE_LOCKED',
    });
  }
  // Per-user ACL: tab allow-list / read-only / export (owner is unrestricted).
  if (request) {
    const aclError = financeAclError(user, request.nextUrl.pathname, isWrite);
    if (aclError) return aclError;
  }
  return user;
}

/**
 * Resolve + authorize the finance OWNER without enforcing the step-up unlock.
 * Used by the security endpoints themselves (status / setup / unlock / lock),
 * which must remain reachable while finance is locked.
 */
export async function resolveFinanceOwner(): Promise<
  { user: SessionUser; sessionId: string } | NextResponse
> {
  const { sessionId, user } = await getSession();
  if (!user || !sessionId) return unauthenticated();
  if (!isFinanceAuthorized(user)) {
    return forbidden('Доступ до фінансів лише для власника');
  }
  return { user, sessionId };
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
    const u = await requireFinanceUser(request, false);
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
    const u = await requireFinanceUser(request, true);
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
    const u = await requireFinanceUser(request, true);
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
