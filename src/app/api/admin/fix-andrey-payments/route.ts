import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { getSessionUser } from '@/lib/auth';

/**
 * GET  /api/admin/fix-andrey-payments          — dry-run (показати список)
 * POST /api/admin/fix-andrey-payments          — застосувати виправлення
 *
 * Тільки для авторизованих адміністраторів.
 */

function genId() {
  return `fo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function buildReport(apply: boolean) {
  const db = getDb();

  const orgRow = db.prepare('SELECT organization_id FROM properties LIMIT 1').get() as any;
  if (!orgRow) throw new Error('No properties found');
  const orgId = orgRow.organization_id;

  // Знайти рахунок Андрія
  const andreyAccount = db.prepare(
    "SELECT id, name FROM finance_accounts WHERE organization_id = ? AND name LIKE '%Андрів%' AND is_active = 1 LIMIT 1"
  ).get(orgId) as any;

  const fallbackAccount = !andreyAccount
    ? (db.prepare(
        "SELECT id, name FROM finance_accounts WHERE organization_id = ? AND type = 'cash' AND currency = 'CZK' AND is_active = 1 ORDER BY sort_order ASC LIMIT 1"
      ).get(orgId) as any)
    : null;

  const account = andreyAccount || fallbackAccount;

  // Всі бронювання підтверджені Андреєм (без обмеження дат)
  const reservations = db.prepare(`
    SELECT r.id, r.total_price, r.currency, r.payment_status, r.status,
           r.internal_notes, r.created_at, r.check_in, r.check_out,
           g.first_name || ' ' || g.last_name AS guest_name
    FROM reservations r
    LEFT JOIN guests g ON g.id = r.guest_id
    WHERE r.internal_notes LIKE '%Андрей%'
       OR r.internal_notes LIKE '%Андрів%'
       OR r.internal_notes LIKE '%Готівку прийняв: Андрей%'
    ORDER BY r.created_at DESC
  `).all() as any[];

  // Також перевіряємо через audit_log
  let auditIds: string[] = [];
  try {
    const auditRows = db.prepare(`
      SELECT DISTINCT entity_id FROM audit_log
      WHERE organization_id = ? AND entity_type = 'reservation'
        AND action IN ('cash_payment_confirmed', 'payment_confirmed')
        AND new_values LIKE '%Андрей%'
    `).all(orgId) as any[];
    auditIds = auditRows.map((r: any) => r.entity_id);
  } catch { /* audit_log may not exist */ }

  // Додаємо з audit_log якщо ще нема
  const seenIds = new Set(reservations.map((r: any) => r.id));
  for (const aid of auditIds) {
    if (!seenIds.has(aid)) {
      const r = db.prepare(`
        SELECT r.id, r.total_price, r.currency, r.payment_status, r.status,
               r.internal_notes, r.created_at, r.check_in, r.check_out,
               g.first_name || ' ' || g.last_name AS guest_name
        FROM reservations r LEFT JOIN guests g ON g.id = r.guest_id
        WHERE r.id = ?
      `).get(aid) as any;
      if (r) { reservations.push(r); seenIds.add(aid); }
    }
  }

  const result = [];

  for (const r of reservations) {
    const sourceRef = `pin_${r.id}`;
    const finOp = db.prepare(`
      SELECT id, amount, method, account_to_id, created_at
      FROM fin_operations
      WHERE (reservation_id = ? AND source = 'booking_widget')
         OR source_ref = ?
      LIMIT 1
    `).get(r.id, sourceRef) as any;

    const item: any = {
      reservation_id: r.id,
      guest_name: r.guest_name,
      amount: r.total_price,
      currency: r.currency || 'CZK',
      check_in: r.check_in,
      payment_status: r.payment_status,
      created_at: r.created_at,
      note: r.internal_notes?.split('\n')[0] || null,
      has_fin_operation: !!finOp,
      fin_operation_id: finOp?.id || null,
    };

    if (!finOp && apply && account && r.total_price > 0) {
      try {
        const opId = genId();
        const comment = `Готівка · Андрей · Booking widget · ${r.guest_name || ''} · check-in ${r.check_in || 'N/A'}`;
        db.prepare(`
          INSERT INTO fin_operations (
            id, organization_id, op_type,
            account_from_id, account_to_id,
            amount, currency, amount_company,
            paid_at, status, method, payment_subtype,
            comment, is_planned, source, source_ref,
            reservation_id, needs_review,
            created_at, updated_at
          ) VALUES (
            ?, ?, 'income', NULL, ?,
            ?, ?, ?,
            datetime('now'), 'completed', 'cash', 'full',
            ?, 0, 'booking_widget', ?,
            ?, ?,
            datetime('now'), datetime('now')
          )
        `).run(
          opId, orgId, account.id,
          r.total_price, r.currency || 'CZK', r.total_price,
          comment, sourceRef,
          r.id, andreyAccount ? 0 : 1
        );

        // Ensure reservation marked paid
        db.prepare(`UPDATE reservations SET payment_status = 'paid', updated_at = datetime('now') WHERE id = ? AND payment_status != 'paid'`).run(r.id);

        item.fixed = true;
        item.new_fin_operation_id = opId;
        item.routed_to = account.name;
      } catch (e: any) {
        item.fix_error = e.message;
      }
    }

    result.push(item);
  }

  return {
    organization_id: orgId,
    account_found: account?.name || null,
    account_is_andrey: !!andreyAccount,
    total_reservations: reservations.length,
    missing_count: result.filter(r => !r.has_fin_operation && !r.fixed).length,
    fixed_count: result.filter(r => r.fixed).length,
    items: result,
  };
}

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const report = await buildReport(false);
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const report = await buildReport(true);
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
