/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Telegram bot ↔ Finance bridge.
//
// The Python bot (kemptimebot) records two kinds of finance events that
// otherwise wouldn't make it into PMS:
//   - sauna walk-ins (income, ~2% of revenue but easy to miss)
//   - cash payments to staff / small purchases (expense)
//
// This module exposes HTTP endpoints the bot calls to push those events
// into fin_operations. Auth is shared-secret (TELEGRAM_BRIDGE_TOKEN env)
// rather than session cookie, since the bot has no user session.
//
// Idempotency: source_ref is the dedupe key — re-posting the same Telegram
// message returns the existing operation rather than creating a duplicate.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createOperationInTx } from './operations.handlers';

type BridgeEventType = 'sauna_income' | 'cash_expense' | 'income' | 'expense' | 'transfer';

interface BridgeEvent {
  type: BridgeEventType;
  amount: number;
  currency?: string;          // default CZK
  paid_at?: string;           // ISO datetime, default now
  category_id?: string | null;
  project_id?: string | null;
  account_id?: string | null; // override default account
  account_from_id?: string | null; // for transfers
  account_to_id?: string | null;   // for transfers
  counterparty_id?: string | null;
  method?: string | null;     // cash, card, bank_transfer
  fx_rate?: number | null;    // exchange rate for EUR operations
  comment?: string | null;
  // Telegram metadata for dedup
  chat_id: number | string;
  message_id: number | string;
  recorded_by?: string | null; // username/full_name from Telegram
}

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function authorizeBridge(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expected = process.env.TELEGRAM_BRIDGE_TOKEN;
  if (!expected) {
    return { ok: false, response: NextResponse.json({ error: 'Bridge not configured: TELEGRAM_BRIDGE_TOKEN missing on server' }, { status: 503 }) };
  }
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.substring(7) : '';
  if (!token || token !== expected) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid bridge token' }, { status: 401 }) };
  }
  return { ok: true };
}

function defaultCashAccountId(db: any, orgId: string, currency: string, recordedBy?: string | null): { accountId: string | null; actorUser: { id: string; name: string } | null } {
  let actorUser: { id: string; name: string } | null = null;
  if (recordedBy && recordedBy.trim().length > 0) {
    const cleanName = recordedBy.trim();
    const userRow = db.prepare(`
      SELECT id, name, default_cash_account_id FROM app_users
      WHERE is_active = 1 AND (name LIKE ? OR first_name LIKE ? OR username LIKE ?)
      LIMIT 1
    `).get(`%${cleanName}%`, `%${cleanName}%`, `%${cleanName}%`) as { id: string; name: string; default_cash_account_id: string | null } | undefined;

    if (userRow) {
      actorUser = { id: userRow.id, name: userRow.name };
      if (userRow.default_cash_account_id) {
        const acct = db.prepare(`
          SELECT id FROM finance_accounts WHERE id = ? AND is_active = 1
        `).get(userRow.default_cash_account_id) as { id: string } | undefined;
        if (acct) return { accountId: acct.id, actorUser };
      }
    }
  }

  const row = db.prepare(`
    SELECT id FROM finance_accounts
    WHERE organization_id = ? AND currency = ? AND is_active = 1
      AND type IN ('cash', 'bank')
    ORDER BY (type = 'cash') DESC, sort_order ASC, created_at ASC
    LIMIT 1
  `).get(orgId, currency) as { id: string } | undefined;
  return { accountId: row?.id || null, actorUser };
}

/**
 * POST /api/finance/telegram-bridge/operation
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *
 * Body: BridgeEvent
 *
 * Returns:
 *   201 + { operation_id, was_new: true }    — new op created
 *   200 + { operation_id, was_new: false }   — already imported, returning existing
 *   400 + { error }                          — validation
 *   401 + { error }                          — token missing/wrong
 *   503 + { error }                          — env not configured
 */
export async function recordTelegramOperation(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json() as BridgeEvent;
    const { type, amount, chat_id, message_id } = body;

    if (!type || !['sauna_income', 'cash_expense', 'income', 'expense', 'transfer'].includes(type)) {
      return NextResponse.json({ error: 'type must be income, expense, transfer, sauna_income, or cash_expense' }, { status: 400 });
    }
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }
    if (!chat_id || !message_id) {
      return NextResponse.json({ error: 'chat_id and message_id are required for dedup' }, { status: 400 });
    }

    const db = getDb();
    const orgId = getOrgId(db);

    const sourceTagMap: Record<string, string> = {
      sauna_income: 'telegram_sauna',
      cash_expense: 'telegram_cash',
      income: 'telegram_income',
      expense: 'telegram_expense',
      transfer: 'telegram_transfer',
    };
    const opTypeMap: Record<string, string> = {
      sauna_income: 'income',
      cash_expense: 'expense',
      income: 'income',
      expense: 'expense',
      transfer: 'transfer',
    };
    const sourceTag = sourceTagMap[type] || 'telegram_cash';
    const sourceRef = `tg:${chat_id}:${message_id}`;
    const opType = opTypeMap[type] || 'expense';
    const currency = (body.currency || 'CZK').toUpperCase();
    const paidAt = body.paid_at || new Date().toISOString();

    // Idempotency check — has this Telegram message already been imported?
    const existing = db.prepare(
      "SELECT id FROM fin_operations WHERE source = ? AND source_ref = ? LIMIT 1"
    ).get(sourceTag, sourceRef) as { id: string } | undefined;
    if (existing) {
      return NextResponse.json({ operation_id: existing.id, was_new: false }, { status: 200 });
    }

    // Resolve account & actor
    const { accountId, actorUser } = defaultCashAccountId(db, orgId, currency, body.recorded_by);

    let accountFromId: string | null = null;
    let accountToId: string | null = null;

    if (opType === 'transfer') {
      accountFromId = body.account_from_id || null;
      accountToId = body.account_to_id || null;
      if (!accountFromId || !accountToId) {
        return NextResponse.json({ error: 'transfer requires account_from_id and account_to_id' }, { status: 400 });
      }
    } else {
      const resolvedAccount = body.account_id || accountId;
      if (!resolvedAccount) {
        return NextResponse.json({
          error: `No active cash/bank account in ${currency} for this organization`,
        }, { status: 400 });
      }
      accountFromId = opType === 'expense' ? resolvedAccount : null;
      accountToId = opType === 'income' ? resolvedAccount : null;
    }

    // Build clear, informative comment
    const userLabel = body.recorded_by || 'Бот (Telegram)';
    const typeLabel = type === 'sauna_income' ? 'Сауна (готівка)'
      : type === 'cash_expense' ? 'Витрата (готівка)'
      : opType === 'income' ? 'Дохід (готівка)'
      : 'Витрата (готівка)';

    const userComment = body.comment ? ` · ${body.comment}` : '';
    const comment = `Готівка · ${typeLabel} | Внесено через Telegram: ${userLabel}${userComment}`;

    // Auto-resolve category (e.g. sauna_income -> ec_sauna)
    const categoryId = body.category_id || (type === 'sauna_income' ? 'ec_sauna' : null);

    // No hardcoded fallback rate: without an explicit fx_rate the operation
    // voronka (createOperationInTx → computeAmountCompany) resolves the rate
    // from finance_exchange_rates and errors loudly if none exists.
    const fxRate = body.fx_rate || null;

    const operationId = createOperationInTx(db, orgId, {
      op_type: opType as 'income' | 'expense' | 'transfer',
      account_from_id: accountFromId,
      account_to_id: accountToId,
      amount,
      currency,
      paid_at: paidAt,
      ...(fxRate ? { fx_rate_override: fxRate } : {}),
      category_id: categoryId,
      project_id: body.project_id || null,
      counterparty_id: body.counterparty_id || null,
      comment,
      method: body.method || 'cash',
      source: sourceTag,
      source_ref: sourceRef,
      status: 'completed',
    }, actorUser || null);

    return NextResponse.json({ operation_id: operationId, was_new: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/telegram-bridge/operations
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *   ?source=telegram_sauna|telegram_cash  (optional)
 *   ?limit=50                              (max 200)
 *
 * Returns recent bridge-recorded operations, for the bot's "what did I
 * record today?" view.
 */
export async function listTelegramOperations(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const sp = request.nextUrl.searchParams;
    const sourceFilter = sp.get('source');
    const limit = Math.min(200, parseInt(sp.get('limit') || '50', 10));

    const where: string[] = ["source IN ('telegram_sauna', 'telegram_cash', 'telegram_income', 'telegram_expense', 'telegram_transfer')"];
    const params: any[] = [];
    if (sourceFilter) {
      where.push('source = ?');
      params.push(sourceFilter);
    }

    const rows = db.prepare(`
      SELECT id, op_type, amount, currency, paid_at, comment, source, source_ref, status, created_at
      FROM fin_operations
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `).all(...params);

    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/telegram-bridge/categories
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *
 * Returns active categories + projects for the bot to populate dropdowns.
 * Filtered by op_type: sauna → income categories, cash → expense categories.
 */
export async function listTelegramCategories(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const opType = sp.get('op_type'); // 'income' | 'expense'

    const where = ['organization_id = ?', 'is_active = 1'];
    const params: any[] = [orgId];
    if (opType && ['income', 'expense'].includes(opType)) {
      where.push('(op_type = ? OR op_type IS NULL)');
      params.push(opType);
    }

    const categories = db.prepare(`
      SELECT id, name, icon, op_type, parent_id
      FROM expense_categories
      WHERE ${where.join(' AND ')}
      ORDER BY parent_id NULLS FIRST, sort_order, name
    `).all(...params);

    const projects = db.prepare(`
      SELECT id, name FROM business_units
      WHERE organization_id = ? AND is_active = 1
      ORDER BY sort_order, name
    `).all(orgId);

    const accounts = db.prepare(`
      SELECT id, name, type, currency FROM finance_accounts
      WHERE organization_id = ? AND is_active = 1
      ORDER BY sort_order, name
    `).all(orgId);

    return NextResponse.json({ categories, projects, accounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/telegram-bridge/accounts
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *
 * Returns active finance accounts for the bot to use in transfers.
 */
export async function listTelegramAccounts(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();
    const orgId = getOrgId(db);

    const accounts = db.prepare(`
      SELECT id, name, type, currency, initial_balance
      FROM finance_accounts
      WHERE organization_id = ? AND is_active = 1
      ORDER BY sort_order, name
    `).all(orgId);

    return NextResponse.json({ accounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/telegram-bridge/services
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *
 * Returns active service catalog from additional_services.
 */
export async function listTelegramServices(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();

    const services = db.prepare(`
      SELECT id, name, name_en, icon, price, currency, service_type
      FROM additional_services
      WHERE is_active = 1
      ORDER BY sort_order
    `).all();

    return NextResponse.json({ services });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/telegram-bridge/reservations
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *
 * Returns active reservations (checked-in today, not cancelled/no_show)
 * with guest and unit info.
 */
export async function listTelegramReservations(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const db = getDb();

    const reservations = db.prepare(`
      SELECT r.id, r.check_in, r.check_out, r.status,
             g.first_name, g.last_name,
             u.name AS unit_name, u.id AS unit_id
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      LEFT JOIN units u ON r.unit_id = u.id
      WHERE r.check_in <= date('now') AND r.check_out >= date('now')
        AND r.status NOT IN ('cancelled', 'no_show')
      ORDER BY u.name
    `).all();

    return NextResponse.json({ reservations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/telegram-bridge/service-order
 * Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>
 *
 * Creates a service order in booking_service_orders.
 * If payment_status = 'paid', also creates a fin_operation (income).
 *
 * Body: { service_id, reservation_id, quantity, total_price,
 *         payment_status, service_date, payment_method, recorded_by }
 */
export async function createTelegramServiceOrder(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      service_id, reservation_id, quantity, total_price,
      payment_status, service_date, payment_method, recorded_by,
    } = body;

    if (!service_id) {
      return NextResponse.json({ error: 'service_id is required' }, { status: 400 });
    }
    if (typeof total_price !== 'number' || !isFinite(total_price) || total_price <= 0) {
      return NextResponse.json({ error: 'total_price must be a positive number' }, { status: 400 });
    }

    const db = getDb();
    const orgId = getOrgId(db);

    // Look up service name for the fin_operation description
    const service = db.prepare('SELECT id, name, currency FROM additional_services WHERE id = ?').get(service_id) as
      { id: string; name: string; currency?: string } | undefined;
    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const orderId = `bso_tg_${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO booking_service_orders
        (id, reservation_id, service_id, quantity, unit_price, total_price,
         status, payment_status, service_date, options_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
    `).run(
      orderId,
      reservation_id === 'none' ? null : reservation_id,
      service_id,
      quantity || 1,
      total_price / (quantity || 1),
      total_price,
      payment_status || 'pending',
      service_date || now.substring(0, 10),
      JSON.stringify({ recorded_by: recorded_by || null, payment_method: payment_method || null }),
      now,
    );

    let finOperationId: string | null = null;

    // If paid, create a fin_operation (income)
    if (payment_status === 'paid') {
      try {
        const currency = (service.currency || 'CZK').toUpperCase();
        const { accountId, actorUser } = defaultCashAccountId(db, orgId, currency, recorded_by);

        if (accountId) {
          const finResId = (reservation_id && reservation_id !== 'none') ? reservation_id : null;
          finOperationId = createOperationInTx(db, orgId, {
            op_type: 'income',
            account_to_id: accountId,
            amount: total_price,
            currency,
            paid_at: service_date || now.substring(0, 10),
            comment: `Дохід · Послуга: ${service.name}` + (recorded_by ? ` | Внесено: ${recorded_by}` : ''),
            method: payment_method || 'cash',
            source: 'telegram_service',
            source_ref: `tg_service:${orderId}`,
            reservation_id: finResId,
            status: 'completed',
          }, actorUser || null);
        }
      } catch (finErr: any) {
        console.error('[telegram-bridge] fin_operation creation failed:', finErr.message);
        // Order is still created, just fin_operation failed
      }
    }

    const order = db.prepare('SELECT * FROM booking_service_orders WHERE id = ?').get(orderId);

    return NextResponse.json({
      success: true,
      order,
      fin_operation_id: finOperationId,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
