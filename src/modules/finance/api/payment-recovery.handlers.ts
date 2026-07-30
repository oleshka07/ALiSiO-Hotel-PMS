/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { createPaymentOperation, hasPaymentOperation } from './payment-bridge';

// ════════════════════════════════════════════════════════════
// Orphan payment recovery (PR #G)
//
// A "paid" service order or booking service order that has no matching
// fin_operations row is a payment we lost track of — usually because the
// Teya webhook arrived for a different payment_ref (sessionId vs
// transactionId), the webhook handler crashed, or an early version of the
// handler simply never reached the bridge.
//
// listOrphanPayments returns the candidates so the admin can triage them;
// restoreOrphanPayment manually creates the missing fin_operation.
// ════════════════════════════════════════════════════════════

interface OrphanRow {
  source_table: 'booking_service_orders' | 'service_orders';
  order_id: string;
  reservation_id: string | null;
  service_id: string;
  service_name: string | null;
  total_price: number;
  payment_id: string | null;
  payment_status: string;
  created_at: string;
  guest_name: string | null;
  unit_name: string | null;
}

export async function listOrphanPayments(): Promise<NextResponse> {
  try {
    const db = getDb();

    const bsoRows = db.prepare(`
      SELECT
        'booking_service_orders' AS source_table,
        bso.id AS order_id,
        bso.reservation_id,
        bso.service_id,
        ads.name AS service_name,
        bso.total_price,
        bso.payment_id,
        bso.payment_status,
        bso.created_at,
        CASE WHEN g.first_name IS NOT NULL
             THEN g.first_name || ' ' || COALESCE(g.last_name, '')
             ELSE NULL END AS guest_name,
        u.name AS unit_name
      FROM booking_service_orders bso
      LEFT JOIN additional_services ads ON ads.id = bso.service_id
      LEFT JOIN reservations r ON r.id = bso.reservation_id
      LEFT JOIN guests g ON g.id = r.guest_id
      LEFT JOIN units u ON u.id = r.unit_id
      WHERE bso.payment_status = 'paid'
        AND bso.payment_id IS NOT NULL
        AND bso.reservation_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM fin_operations o
          WHERE o.op_type = 'income'
            AND (
              (o.reservation_id = bso.reservation_id
               AND (o.source_ref = bso.payment_id OR o.source_ref = bso.reservation_id))
              OR (o.reservation_id = bso.reservation_id
                  AND o.source IN ('bank_import', 'teya_sync', 'teia'))
            )
        )
      ORDER BY bso.created_at DESC
    `).all() as OrphanRow[];

    const soRows = db.prepare(`
      SELECT
        'service_orders' AS source_table,
        so.id AS order_id,
        so.reservation_id,
        so.service_id,
        ads.name AS service_name,
        so.total_price,
        so.payment_id,
        so.payment_status,
        so.created_at,
        CASE WHEN g.first_name IS NOT NULL
             THEN g.first_name || ' ' || COALESCE(g.last_name, '')
             ELSE NULL END AS guest_name,
        u.name AS unit_name
      FROM service_orders so
      LEFT JOIN additional_services ads ON ads.id = so.service_id
      LEFT JOIN reservations r ON r.id = so.reservation_id
      LEFT JOIN guests g ON g.id = r.guest_id
      LEFT JOIN units u ON u.id = r.unit_id
      WHERE so.payment_status = 'paid'
        AND so.payment_id IS NOT NULL
        AND so.reservation_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM fin_operations o
          WHERE o.op_type = 'income'
            AND (
              (o.reservation_id = so.reservation_id
               AND (o.source_ref = so.payment_id OR o.source_ref = so.reservation_id))
              OR (o.reservation_id = so.reservation_id
                  AND o.source IN ('bank_import', 'teya_sync', 'teia'))
            )
        )
      ORDER BY so.created_at DESC
    `).all() as OrphanRow[];

    return NextResponse.json({
      orphans: [...bsoRows, ...soRows].sort(
        (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      ),
      count: bsoRows.length + soRows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════
// Paid services list — every SO/BSO in payment_status='paid' across
// time, augmented with whether a fin_operation exists for that payment.
// Powers /finance/payments/services dashboard.
// ════════════════════════════════════════════════════════════

export async function listPaidServices(req: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const onlyOrphans = searchParams.get('only_orphans') === '1';

    const dateClause: string[] = [];
    const dateParams: any[] = [];
    if (from) { dateClause.push("date(t.created_at) >= ?"); dateParams.push(from); }
    if (to)   { dateClause.push("date(t.created_at) <= ?"); dateParams.push(to); }
    const dateWhere = dateClause.length ? `AND ${dateClause.join(' AND ')}` : '';

    const bsoSql = `
      SELECT
        'booking_service_orders' AS source_table,
        t.id AS order_id,
        t.reservation_id,
        t.service_id,
        ads.name AS service_name,
        t.quantity,
        t.total_price,
        t.payment_id,
        t.payment_status,
        t.service_date,
        t.options_json,
        t.created_at,
        CASE WHEN g.first_name IS NOT NULL
             THEN g.first_name || ' ' || COALESCE(g.last_name, '')
             ELSE NULL END AS guest_name,
        u.name AS unit_name,
        (SELECT id FROM fin_operations o
           WHERE o.reservation_id = t.reservation_id
             AND o.source = 'teia'
             AND (o.source_ref = t.payment_id OR o.source_ref = t.reservation_id)
           LIMIT 1) AS fin_operation_id
      FROM booking_service_orders t
      LEFT JOIN additional_services ads ON ads.id = t.service_id
      LEFT JOIN reservations r ON r.id = t.reservation_id
      LEFT JOIN guests g ON g.id = r.guest_id
      LEFT JOIN units u ON u.id = r.unit_id
      WHERE t.payment_status = 'paid'
      ${dateWhere}
    `;
    const soSql = `
      SELECT
        'service_orders' AS source_table,
        t.id AS order_id,
        t.reservation_id,
        t.service_id,
        ads.name AS service_name,
        t.quantity,
        t.total_price,
        t.payment_id,
        t.payment_status,
        t.service_date,
        NULL AS options_json,
        t.created_at,
        CASE WHEN g.first_name IS NOT NULL
             THEN g.first_name || ' ' || COALESCE(g.last_name, '')
             ELSE NULL END AS guest_name,
        u.name AS unit_name,
        (SELECT id FROM fin_operations o
           WHERE o.reservation_id = t.reservation_id
             AND o.source = 'teia'
             AND (o.source_ref = t.payment_id OR o.source_ref = t.reservation_id)
           LIMIT 1) AS fin_operation_id
      FROM service_orders t
      LEFT JOIN additional_services ads ON ads.id = t.service_id
      LEFT JOIN reservations r ON r.id = t.reservation_id
      LEFT JOIN guests g ON g.id = r.guest_id
      LEFT JOIN units u ON u.id = r.unit_id
      WHERE t.payment_status = 'paid'
      ${dateWhere}
    `;

    const bso = db.prepare(bsoSql).all(...dateParams) as any[];
    const so = db.prepare(soSql).all(...dateParams) as any[];
    let rows = [...bso, ...so].sort(
      (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
    );
    if (onlyOrphans) rows = rows.filter((r) => !r.fin_operation_id);

    const totalsByCurrency: Record<string, number> = {};
    let withOpCount = 0, orphanCount = 0;
    for (const r of rows) {
      totalsByCurrency['CZK'] = (totalsByCurrency['CZK'] || 0) + Number(r.total_price || 0);
      if (r.fin_operation_id) withOpCount++; else orphanCount++;
    }

    return NextResponse.json({
      services: rows,
      count: rows.length,
      totals_by_currency: totalsByCurrency,
      with_fin_operation: withOpCount,
      orphan_count: orphanCount,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function restoreOrphanPayment(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const {
      source_table,
      order_id,
      currency = 'CZK',
      paid_at,
    } = body as {
      source_table: 'booking_service_orders' | 'service_orders';
      order_id: string;
      currency?: string;
      paid_at?: string;
    };

    if (!source_table || !order_id) {
      return NextResponse.json(
        { error: 'source_table and order_id are required' },
        { status: 400 },
      );
    }
    if (source_table !== 'booking_service_orders' && source_table !== 'service_orders') {
      return NextResponse.json({ error: 'invalid source_table' }, { status: 400 });
    }

    const db = getDb();
    const order = db.prepare(`
      SELECT id, reservation_id, service_id, total_price, payment_id, payment_status, created_at
      FROM ${source_table} WHERE id = ?
    `).get(order_id) as {
      id: string; reservation_id: string | null; service_id: string;
      total_price: number; payment_id: string | null; payment_status: string;
      created_at: string;
    } | undefined;

    if (!order) {
      return NextResponse.json({ error: 'order not found' }, { status: 404 });
    }
    if (!order.reservation_id) {
      return NextResponse.json({ error: 'order has no reservation_id' }, { status: 400 });
    }
    if (order.payment_status !== 'paid') {
      return NextResponse.json(
        { error: `order is not paid (status=${order.payment_status})` },
        { status: 400 },
      );
    }

    const paymentRef = order.payment_id || order.reservation_id;
    if (hasPaymentOperation(order.reservation_id, 'teia', paymentRef)) {
      return NextResponse.json({
        ok: false,
        reason: 'duplicate',
        message: 'fin_operation already exists for this reservation+ref',
      });
    }

    const { operationId } = createPaymentOperation({
      reservationId: order.reservation_id,
      amount: Math.abs(Number(order.total_price)),
      currency,
      method: 'cash',
      paymentSubtype: 'service',
      source: 'manual',
      sourceRef: paymentRef,
      status: 'completed',
      paidAt: paid_at || order.created_at || new Date().toISOString(),
      comment: `Orphan recovery (cash): ${source_table} ${order.id}`,
    });

    return NextResponse.json({ ok: true, operation_id: operationId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
