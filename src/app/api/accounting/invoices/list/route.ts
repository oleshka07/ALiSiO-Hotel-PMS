/**
 * GET /api/accounting/invoices/list
 *
 * Returns all invoices (reservation-linked + batch/custom) with unified
 * buyer name, source label, and optional search + source filter.
 *
 * Query params:
 *   source  = all | airbnb | booking | teya | manual | pms
 *   search  = free-text (matches invoice_number, buyer_name, amount)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/core/db';
import { requireOwner } from '@core/security/route-guard';

export const GET = requireOwner(_GET);
async function _GET(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || 'all';
    const search = (searchParams.get('search') || '').trim();

    const from   = searchParams.get('from');
    const to     = searchParams.get('to');

    // Build the base query — LEFT JOINs so custom/batch invoices without
    // reservation_id are still returned.
    const rows: any[] = db.prepare(`
      SELECT
        i.id,
        i.invoice_number,
        i.issued_at,
        i.due_date,
        i.amount,
        i.currency,
        i.status,
        i.is_custom,
        i.is_credit_note,
        i.notes,
        i.custom_description,
        -- Unified buyer name
        COALESCE(
          NULLIF(TRIM(i.custom_buyer_name), ''),
          CASE
            WHEN g.first_name IS NOT NULL THEN TRIM(g.first_name || ' ' || g.last_name)
            ELSE NULL
          END
        ) as buyer_name,
        -- Source badge
        CASE
          WHEN i.notes LIKE 'airbnb:%'  THEN 'airbnb'
          WHEN i.notes LIKE 'booking:%' THEN 'booking'
          WHEN i.notes LIKE 'teya:%'    THEN 'teya'
          WHEN i.is_custom = 1          THEN 'manual'
          WHEN i.reservation_id IS NOT NULL THEN 'pms'
          ELSE 'manual'
        END as source,
        u.name as unit_name
      FROM invoices i
      LEFT JOIN reservations r ON i.reservation_id = r.id
      LEFT JOIN guests      g ON r.guest_id = g.id
      LEFT JOIN units       u ON r.unit_id  = u.id
      ORDER BY i.issued_at DESC, i.invoice_number DESC
      LIMIT 1000
    `).all();

    // Apply source + search filters in JS (simpler than dynamic SQL for SQLite)
    let filtered = rows;

    if (source !== 'all') {
      filtered = filtered.filter(r => r.source === source);
    }

    if (from) {
      filtered = filtered.filter(r => r.issued_at >= from);
    }

    if (to) {
      filtered = filtered.filter(r => r.issued_at <= to);
    }

    if (search) {      const q = search.toLowerCase();
      filtered = filtered.filter(r => {
        const name   = (r.buyer_name || '').toLowerCase();
        const num    = (r.invoice_number || '').toLowerCase();
        const desc   = (r.custom_description || '').toLowerCase();
        const amount = String(Math.abs(r.amount || 0));
        return name.includes(q) || num.includes(q) || desc.includes(q) || amount.includes(q);
      });
    }

    return NextResponse.json(filtered);
  } catch (e: any) {
    console.error('[accounting/invoices/list]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
