/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

// ─────────────────────────────────────────────────────────────────
// Finance User Access — API handlers
//
// Manages per-user finance access: which users can see finance,
// which tabs/accounts they can access, period restrictions, etc.
// ─────────────────────────────────────────────────────────────────

export interface FinanceAccessRow {
  user_id: string;
  is_enabled: number;
  period_mode: 'all' | 'month';
  allowed_tabs: string;     // JSON array
  allowed_accounts: string; // JSON array
  can_export: number;
  read_only: number;
  created_at: string;
  updated_at: string;
}

export interface FinanceAccessParsed {
  is_enabled: boolean;
  period_mode: 'all' | 'month';
  allowed_tabs: string[];
  allowed_accounts: string[];
  can_export: boolean;
  read_only: boolean;
}

function parseAccess(row: FinanceAccessRow): FinanceAccessParsed {
  return {
    is_enabled: !!row.is_enabled,
    period_mode: row.period_mode,
    allowed_tabs: safeJsonParse(row.allowed_tabs, ['operations']),
    allowed_accounts: safeJsonParse(row.allowed_accounts, []),
    can_export: !!row.can_export,
    read_only: !!row.read_only,
  };
}

function safeJsonParse(s: string | null, fallback: any): any {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

/**
 * Check if a user has finance access via the finance_user_access table.
 * Used by _guard.ts to authorize non-owner users.
 */
export function isFinanceUserEnabled(userId: string): boolean {
  const db = getDb();
  const row = db.prepare(
    'SELECT 1 FROM finance_user_access WHERE user_id = ? AND is_enabled = 1'
  ).get(userId);
  return !!row;
}

/**
 * Get the full access configuration for a user.
 * Returns null if no access record exists.
 */
export function getFinanceAccessForUser(userId: string): FinanceAccessParsed | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM finance_user_access WHERE user_id = ?'
  ).get(userId) as FinanceAccessRow | undefined;
  if (!row) return null;
  return parseAccess(row);
}

/**
 * GET /api/finance/access
 * List all non-owner users with their finance access settings.
 * Owner-only.
 */
export async function listFinanceAccess(): Promise<NextResponse> {
  try {
    const db = getDb();

    const users = db.prepare(`
      SELECT u.id, u.full_name, u.email, u.role, u.is_active,
             fa.is_enabled, fa.period_mode, fa.allowed_tabs,
             fa.allowed_accounts, fa.can_export, fa.read_only,
             (fs.user_id IS NOT NULL) AS has_passphrase,
             (u.pin_hash IS NOT NULL) AS has_pin,
             u.default_cash_account_id
      FROM app_users u
      LEFT JOIN finance_user_access fa ON fa.user_id = u.id
      LEFT JOIN finance_security    fs ON fs.user_id = u.id
      ORDER BY (u.role = 'owner') DESC, u.full_name
    `).all() as any[];

    const result = users.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      is_active: !!u.is_active,
      has_passphrase: !!u.has_passphrase,
      // Owners were filtered out of this list because they hold finance access by
      // role and have nothing to grant. They are included now: two of the four
      // reception PINs belong to owners, so excluding them left those PINs
      // unmanageable anywhere in the interface.
      is_owner: u.role === 'owner',
      has_pin: !!u.has_pin,
      default_cash_account_id: u.default_cash_account_id || null,
      access: u.is_enabled !== null ? {
        is_enabled: !!u.is_enabled,
        period_mode: u.period_mode || 'month',
        allowed_tabs: safeJsonParse(u.allowed_tabs, ['operations']),
        allowed_accounts: safeJsonParse(u.allowed_accounts, []),
        can_export: !!u.can_export,
        read_only: u.read_only !== null ? !!u.read_only : true,
      } : null,
    }));

    return NextResponse.json({ users: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/finance/access/[id]
 * Create or update finance access for a user.
 * Owner-only.
 */
export async function upsertFinanceAccess(request: NextRequest, context: any): Promise<NextResponse> {
  try {
    const db = getDb();
    const params = await context.params;
    const userId = params.id;

    if (!userId) {
      return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
    }

    // Verify user exists and is not owner
    const user = db.prepare('SELECT id, role FROM app_users WHERE id = ?').get(userId) as any;
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (user.role === 'owner') {
      return NextResponse.json({ error: 'Cannot modify owner access' }, { status: 400 });
    }

    const body = await request.json();
    const {
      is_enabled = false,
      period_mode = 'month',
      allowed_tabs = ['operations'],
      allowed_accounts = [],
      can_export = false,
      read_only = true,
    } = body;

    // Validate period_mode
    if (!['all', 'month'].includes(period_mode)) {
      return NextResponse.json({ error: 'period_mode must be all or month' }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO finance_user_access (user_id, is_enabled, period_mode, allowed_tabs, allowed_accounts, can_export, read_only, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        is_enabled = excluded.is_enabled,
        period_mode = excluded.period_mode,
        allowed_tabs = excluded.allowed_tabs,
        allowed_accounts = excluded.allowed_accounts,
        can_export = excluded.can_export,
        read_only = excluded.read_only,
        updated_at = datetime('now')
    `).run(
      userId,
      is_enabled ? 1 : 0,
      period_mode,
      JSON.stringify(allowed_tabs),
      JSON.stringify(allowed_accounts),
      can_export ? 1 : 0,
      read_only ? 1 : 0,
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/finance/access/[id]
 * Revoke finance access for a user.
 * Owner-only.
 */
export async function deleteFinanceAccess(_request: NextRequest, context: any): Promise<NextResponse> {
  try {
    const db = getDb();
    const params = await context.params;
    const userId = params.id;

    db.prepare('DELETE FROM finance_user_access WHERE user_id = ?').run(userId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/finance/access/[id]/passphrase
 * Clear a user's forgotten finance passphrase. The hash is one-way, so it can
 * never be recovered or shown — removing it and letting the person set a new
 * one is the only route back in. Their tab/account restrictions are untouched.
 * Owner-only (guarded by manage_users at the module boundary).
 */
export async function resetUserFinancePassphrase(_request: NextRequest, context: any): Promise<NextResponse> {
  try {
    const db = getDb();
    const params = await context.params;
    const userId = params?.id;
    if (!userId) return NextResponse.json({ error: 'Missing user id' }, { status: 400 });

    const user = db.prepare('SELECT id, full_name, role FROM app_users WHERE id = ?').get(userId) as any;
    if (!user) return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });

    const { clearFinancePassphrase } = await import('./_finance-unlock');
    const cleared = clearFinancePassphrase(userId);

    console.log(`[FinanceSecurity] passphrase reset for ${user.full_name} (${userId}) — existed=${cleared}`);

    return NextResponse.json({
      ok: true,
      cleared,
      message: cleared
        ? `Пароль фінансів для «${user.full_name}» скинуто. При наступному вході у Фінанси вона/він встановить новий — до того часу дані закриті.`
        : `У «${user.full_name}» пароль фінансів не був встановлений.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/access/my
 * Returns the current user's finance access restrictions.
 * Available to any authenticated finance user.
 */
export async function getMyFinanceAccess(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();

    // Extract user from cookie — we import lazily to avoid circular deps
    const { cookies } = await import('next/headers');
    const store = await cookies();
    const sessionId = store.get('session_id')?.value;
    if (!sessionId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { getSessionUser } = await import('@/lib/auth');
    const user = getSessionUser(sessionId);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Owner has no restrictions
    if (user.role === 'owner') {
      return NextResponse.json({
        is_owner: true,
        is_enabled: true,
        period_mode: 'all',
        allowed_tabs: [],  // empty = all
        allowed_accounts: [],  // empty = all
        can_export: true,
        read_only: false,
      });
    }

    const access = getFinanceAccessForUser(user.id);
    if (!access || !access.is_enabled) {
      return NextResponse.json({ error: 'No finance access' }, { status: 403 });
    }

    return NextResponse.json({
      is_owner: false,
      ...access,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/finance/access/[id]/pin      — set or replace the cash-confirmation PIN
 * DELETE /api/finance/access/[id]/pin   — remove it
 *
 * The PIN the operator types at reception to confirm a cash payment in the
 * widget. It used to be a literal in booking-drafts.handlers.ts together with
 * the staff name and the cash account it books to, in a file behind a public
 * endpoint. Stored hashed here, so it can be replaced but never displayed —
 * same shape as the finance passphrase above.
 *
 * The cash account is not part of the PIN: it comes from the user's
 * default_cash_account_id, which the Accounts column of this tab already edits.
 */
export async function setUserCashPin(request: NextRequest, context: any): Promise<NextResponse> {
  try {
    const db = getDb();
    const params = await context.params;
    const userId = params?.id;
    if (!userId) return NextResponse.json({ error: 'Missing user id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const pin = String((body as any).pin ?? '').trim();
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN має бути від 4 до 8 цифр' }, { status: 400 });
    }

    const user = db.prepare('SELECT id, full_name, is_active, default_cash_account_id FROM app_users WHERE id = ?')
      .get(userId) as any;
    if (!user) return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });

    // Two people sharing a PIN would silently route one person's cash to the
    // other's box, and the audit trail would name the wrong operator.
    const bcrypt = (await import('bcryptjs')).default;
    const others = db.prepare(
      'SELECT id, full_name, pin_hash FROM app_users WHERE pin_hash IS NOT NULL AND id != ?',
    ).all(userId) as { id: string; full_name: string; pin_hash: string }[];
    for (const o of others) {
      if (bcrypt.compareSync(pin, o.pin_hash)) {
        return NextResponse.json(
          { error: `Цей PIN уже використовує «${o.full_name}». Оберіть інший.` },
          { status: 409 },
        );
      }
    }

    db.prepare('UPDATE app_users SET pin_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(bcrypt.hashSync(pin, 10), userId);

    console.log(`[FinanceSecurity] cash PIN set for ${user.full_name} (${userId})`);

    return NextResponse.json({
      ok: true,
      message: user.default_cash_account_id
        ? `PIN для «${user.full_name}» встановлено.`
        : `PIN для «${user.full_name}» встановлено, але каса не вибрана — готівка піде на резервний рахунок. Вкажіть касу в цій же вкладці.`,
    });
  } catch (error: any) {
    console.error('[FinanceSecurity] setUserCashPin:', error?.message);
    return NextResponse.json({ error: 'Не вдалося встановити PIN' }, { status: 500 });
  }
}

export async function clearUserCashPin(_request: NextRequest, context: any): Promise<NextResponse> {
  try {
    const db = getDb();
    const params = await context.params;
    const userId = params?.id;
    if (!userId) return NextResponse.json({ error: 'Missing user id' }, { status: 400 });

    const user = db.prepare('SELECT id, full_name, pin_hash FROM app_users WHERE id = ?').get(userId) as any;
    if (!user) return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });

    const existed = Boolean(user.pin_hash);
    db.prepare('UPDATE app_users SET pin_hash = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(userId);

    console.log(`[FinanceSecurity] cash PIN cleared for ${user.full_name} (${userId}) — existed=${existed}`);

    return NextResponse.json({
      ok: true,
      cleared: existed,
      message: existed
        ? `PIN для «${user.full_name}» видалено — підтверджувати готівку в віджеті вона/він більше не зможе.`
        : `У «${user.full_name}» PIN не був встановлений.`,
    });
  } catch (error: any) {
    console.error('[FinanceSecurity] clearUserCashPin:', error?.message);
    return NextResponse.json({ error: 'Не вдалося видалити PIN' }, { status: 500 });
  }
}
