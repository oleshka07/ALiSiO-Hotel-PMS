/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

// Transaction log — single SELECT from fin_operations (post-PR #6).
// Reports all operations with shape compatible with the previous union-based log.
export async function getFinanceLog(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const type = searchParams.get('type'); // income | expense | payment | transfer
    const search = searchParams.get('search');
    const account_id = searchParams.get('account_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;

    const where: string[] = ['1=1'];
    const params: any[] = [];

    // Semantic type mapping:
    //  'income'   → op_type='income' and no reservation_id (manual income)
    //  'expense'  → op_type='expense' and no reservation_id
    //  'payment'  → any reservation-linked op (both income + refund-expense)
    //  'transfer' → op_type='transfer'
    if (type === 'income') {
      where.push("o.op_type = 'income' AND o.reservation_id IS NULL");
    } else if (type === 'expense') {
      where.push("o.op_type = 'expense' AND o.reservation_id IS NULL");
    } else if (type === 'payment') {
      where.push("o.reservation_id IS NOT NULL");
    } else if (type === 'transfer') {
      where.push("o.op_type = 'transfer'");
    }

    if (month) { where.push("strftime('%Y-%m', o.paid_at) = ?"); params.push(month); }
    if (dateFrom) { where.push('o.paid_at >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('o.paid_at <= ?'); params.push(dateTo); }
    if (account_id) { where.push('(o.account_from_id = ? OR o.account_to_id = ?)'); params.push(account_id, account_id); }
    if (search) {
      where.push('(o.comment LIKE ? OR ec.name LIKE ? OR cp.name LIKE ? OR g.first_name LIKE ? OR g.last_name LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q, q);
    }
    where.push("o.status = 'completed'");

    const whereSql = where.join(' AND ');

    const countRow = db.prepare(`
      SELECT COUNT(*) AS total FROM fin_operations o
      LEFT JOIN expense_categories    ec ON ec.id = o.category_id
      LEFT JOIN finance_counterparties cp ON cp.id = o.counterparty_id
      LEFT JOIN reservations           r ON r.id = o.reservation_id
      LEFT JOIN guests                 g ON g.id = r.guest_id
      WHERE ${whereSql}
    `).get(...params) as { total: number };

    const rows = db.prepare(`
      SELECT
        CASE
          WHEN o.reservation_id IS NOT NULL THEN 'payment'
          WHEN o.op_type = 'transfer' THEN 'transfer'
          WHEN o.op_type = 'income' THEN 'income'
          ELSE 'expense'
        END AS tx_type,
        o.id,
        o.paid_at AS date,
        CASE WHEN o.op_type = 'expense' AND o.reservation_id IS NULL THEN -o.amount ELSE o.amount END AS amount_raw,
        o.currency,
        CASE WHEN o.op_type = 'transfer' THEN o.account_from_id ELSE COALESCE(o.account_from_id, o.account_to_id) END AS account_id,
        CASE
          WHEN o.op_type = 'transfer' THEN (afr.name || ' → ' || ato.name)
          ELSE COALESCE(afr.name, ato.name)
        END AS account_name,
        COALESCE(afr.color, ato.color) AS account_color,
        CASE
          WHEN o.reservation_id IS NOT NULL AND g.first_name IS NOT NULL THEN (g.first_name || ' ' || g.last_name)
          ELSE cp.name
        END AS counterparty,
        CASE
          WHEN o.op_type = 'transfer' THEN 'Переказ'
          WHEN o.reservation_id IS NOT NULL THEN COALESCE(o.payment_subtype, 'payment')
          ELSE ec.name
        END AS category,
        bu.name AS bu_name,
        o.comment AS notes,
        r.hostex_reservation_code AS reservation_code
      FROM fin_operations o
      LEFT JOIN expense_categories    ec  ON ec.id  = o.category_id
      LEFT JOIN business_units        bu  ON bu.id  = o.project_id
      LEFT JOIN finance_counterparties cp ON cp.id  = o.counterparty_id
      LEFT JOIN finance_accounts      afr ON afr.id = o.account_from_id
      LEFT JOIN finance_accounts      ato ON ato.id = o.account_to_id
      LEFT JOIN reservations           r  ON r.id   = o.reservation_id
      LEFT JOIN guests                 g  ON g.id   = r.guest_id
      WHERE ${whereSql}
      ORDER BY o.paid_at DESC, o.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return NextResponse.json({ transactions: rows, total: countRow.total, page, limit });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
