/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function listAccruals(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const status = searchParams.get('status');
    const business_unit_id = searchParams.get('business_unit_id');

    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (month) { where += ' AND a.month = ?'; params.push(month); }
    if (status) { where += ' AND a.status = ?'; params.push(status); }
    if (business_unit_id) { where += ' AND a.business_unit_id = ?'; params.push(business_unit_id); }

    const items = db.prepare(`
      SELECT a.*, ec.name as category_name, ec.icon as category_icon, ec.color as category_color, bu.name as bu_name
      FROM accruals a LEFT JOIN expense_categories ec ON a.category_id = ec.id LEFT JOIN business_units bu ON a.business_unit_id = bu.id
      ${where} ORDER BY a.month DESC, a.created_at DESC
    `).all(...params);

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN a.status = 'pending' THEN ABS(a.amount) ELSE 0 END), 0) as pending_total,
        COALESCE(SUM(CASE WHEN a.status = 'paid' THEN ABS(a.amount) ELSE 0 END), 0) as paid_total,
        COUNT(CASE WHEN a.status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN a.status = 'paid' THEN 1 END) as paid_count,
        COUNT(*) as total_count
      FROM accruals a ${where}
    `).get(...params) as any;

    return NextResponse.json({ items, summary });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function createAccrual(request: Request): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { category_id, business_unit_id, description, amount, month, accrual_type, notes } = body;

    if (!description || !amount || !month) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const id = `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    db.prepare(`
      INSERT INTO accruals (id, organization_id, category_id, business_unit_id, description, amount, month, accrual_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgRow.id, category_id || null, business_unit_id || null, description, amount, month, accrual_type || 'expense', notes || null);

    const item = db.prepare(`
      SELECT a.*, ec.name as category_name, ec.icon as category_icon, ec.color as category_color, bu.name as bu_name
      FROM accruals a LEFT JOIN expense_categories ec ON a.category_id = ec.id LEFT JOIN business_units bu ON a.business_unit_id = bu.id
      WHERE a.id = ?
    `).get(id);
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
