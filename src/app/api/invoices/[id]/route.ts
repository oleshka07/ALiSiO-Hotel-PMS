/**
 * GET  /api/invoices/[id]   — returns invoice HTML (existing)
 * DELETE /api/invoices/[id] — permanently deletes the invoice
 */
import { getInvoiceHtml } from '@finance';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

export const GET = getInvoiceHtml;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const db = getDb();

    // Fetch invoice info before deletion (for logging)
    const inv = db.prepare(
      'SELECT invoice_number, amount, currency FROM invoices WHERE id = ?'
    ).get(id) as { invoice_number: string; amount: number; currency: string } | undefined;

    if (!inv) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM invoices WHERE id = ?').run(id);

    console.log(`[InvoiceDelete] Deleted ${inv.invoice_number} (${id}) amount=${inv.amount} ${inv.currency}`);

    return NextResponse.json({ ok: true, deletedNumber: inv.invoice_number });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[InvoiceDelete] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
