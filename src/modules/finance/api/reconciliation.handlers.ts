/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ALiSiO PMS — Reconciliation Handler (Finance Module)
 *
 * Returns a joined view of fin_operations (income) ↔ invoices for a given month.
 * Used by the /documents "Журнал звірки" tab to surface unmatched or missing invoices.
 *
 * Reconciliation statuses:
 *  matched  — fin_operation + invoice exist, amounts within 1 CZK
 *  mismatch — invoice exists but amount differs > 1 CZK (e.g. OTA commission deducted)
 *  missing  — no invoice for a non-cash payment
 *  cash     — cash payment, invoice not mandatory
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export interface ReconRow {
  op_id: string;
  paid_at: string | null;
  op_amount: number;
  currency: string;
  method: string | null;
  source: string | null;
  reservation_id: string | null;
  comment: string | null;
  guest_name: string | null;
  guest_email: string | null;
  invoice_company_name: string | null;
  invoice_company_email: string | null;
  unit_name: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_status: string | null;
  recon_status: 'matched' | 'mismatch' | 'missing' | 'cash';
}

export interface ReconSummary {
  matched: number;
  mismatch: number;
  missing: number;
  cash: number;
  total_amount: number;
  missing_amount: number;
}

export async function reconciliationHandler(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);

    // Default to current month
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = searchParams.get('month') || defaultMonth;
    const statusFilter = searchParams.get('status') || 'all';
    const methodFilter = searchParams.get('method') || 'all';

    // Validate month format (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format, expected YYYY-MM' }, { status: 400 });
    }

    const rows = db.prepare(`
      SELECT
        fo.id                                      AS op_id,
        fo.paid_at,
        fo.amount                                  AS op_amount,
        COALESCE(fo.currency, 'CZK')               AS currency,
        fo.method,
        fo.source,
        fo.reservation_id,
        fo.comment,
        TRIM(COALESCE(g.first_name, '') || ' ' || COALESCE(g.last_name, ''))
                                                   AS guest_name,
        g.email                                    AS guest_email,
        r.invoice_company_name,
        r.invoice_company_email,
        u.name                                     AS unit_name,
        i.id                                       AS invoice_id,
        i.invoice_number,
        i.amount                                   AS invoice_amount,
        i.status                                   AS invoice_status,
        CASE
          WHEN fo.method = 'cash'             THEN 'cash'
          WHEN i.id IS NULL                   THEN 'missing'
          WHEN ABS(fo.amount - i.amount) > 1  THEN 'mismatch'
          ELSE 'matched'
        END                                        AS recon_status
      FROM fin_operations fo
      LEFT JOIN reservations r  ON fo.reservation_id = r.id
      LEFT JOIN guests       g  ON r.guest_id = g.id
      LEFT JOIN units        u  ON r.unit_id  = u.id
      LEFT JOIN invoices     i  ON (
        i.fin_operation_id = fo.id
        OR (
          i.reservation_id   = fo.reservation_id
          AND i.fin_operation_id IS NULL
          AND i.status           = 'issued'
        )
      )
      WHERE fo.op_type    = 'income'
        AND fo.status     = 'completed'
        AND fo.is_planned = 0
        AND strftime('%Y-%m', COALESCE(fo.paid_at, fo.created_at)) = ?
      ORDER BY fo.paid_at DESC, fo.created_at DESC
    `).all(month) as ReconRow[];

    // Apply client-side filters (small dataset, easy)
    let filtered = rows;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.recon_status === statusFilter);
    }
    if (methodFilter !== 'all') {
      filtered = filtered.filter(r => (r.method || '') === methodFilter);
    }

    // Summary over unfiltered rows (for the counter cards)
    const summary: ReconSummary = {
      matched:        rows.filter(r => r.recon_status === 'matched').length,
      mismatch:       rows.filter(r => r.recon_status === 'mismatch').length,
      missing:        rows.filter(r => r.recon_status === 'missing').length,
      cash:           rows.filter(r => r.recon_status === 'cash').length,
      total_amount:   rows.filter(r => r.recon_status !== 'cash').reduce((s, r) => s + (r.op_amount ?? 0), 0),
      missing_amount: rows.filter(r => r.recon_status === 'missing').reduce((s, r) => s + (r.op_amount ?? 0), 0),
    };

    return NextResponse.json({ rows: filtered, summary });
  } catch (e: any) {
    console.error('[Reconciliation] error:', e.message, e.stack);
    return NextResponse.json({ error: 'Failed to load reconciliation data', detail: e.message }, { status: 500 });
  }
}
