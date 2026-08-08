/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

const ACCRUAL_JOIN = `
  SELECT a.*, ec.name as category_name, ec.icon as category_icon, ec.color as category_color, bu.name as bu_name
  FROM accruals a LEFT JOIN expense_categories ec ON a.category_id = ec.id LEFT JOIN business_units bu ON a.business_unit_id = bu.id
  WHERE a.id = ?
`;

export async function getAccrual(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await params;
    const item = db.prepare(ACCRUAL_JOIN).get(id);
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(item);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function updateAccrual(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await params;
    const body = await request.json();
    const { category_id, business_unit_id, description, amount, month, status, paid_expense_id, notes } = body;

    if (!db.prepare("SELECT id FROM accruals WHERE id = ?").get(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    db.prepare(`
      UPDATE accruals SET
        category_id = COALESCE(?, category_id), business_unit_id = ?, description = COALESCE(?, description),
        amount = COALESCE(?, amount), month = COALESCE(?, month), status = COALESCE(?, status),
        paid_expense_id = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(category_id, business_unit_id ?? null, description, amount, month, status, paid_expense_id ?? null, notes ?? null, id);

    return NextResponse.json(db.prepare(ACCRUAL_JOIN).get(id));
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function deleteAccrual(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await params;
    const result = db.prepare("DELETE FROM accruals WHERE id = ?").run(id);
    if (result.changes === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
