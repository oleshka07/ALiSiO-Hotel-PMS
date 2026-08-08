/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

export async function listCapex(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const business_unit_id = searchParams.get('business_unit_id');
    const status = searchParams.get('status');

    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (month) { where += ' AND c.month = ?'; params.push(month); }
    if (business_unit_id) { where += ' AND c.business_unit_id = ?'; params.push(business_unit_id); }
    if (status) { where += ' AND c.status = ?'; params.push(status); }

    const items = db.prepare(`
      SELECT c.*, bu.name as bu_name FROM capex_items c LEFT JOIN business_units bu ON c.business_unit_id = bu.id
      ${where} ORDER BY c.purchase_date DESC
    `).all(...params);

    const summary = db.prepare(`
      SELECT COUNT(*) as total_items, COALESCE(SUM(c.amount), 0) as total_amount,
             COALESCE(SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END), 0) as active_items,
             COALESCE(SUM(CASE WHEN c.status = 'active' THEN c.depreciation_monthly ELSE 0 END), 0) as monthly_depreciation
      FROM capex_items c ${where}
    `).get(...params) as any;

    return NextResponse.json({ items, summary });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function createCapex(request: Request): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, asset_type, business_unit_id, amount, counterparty, purchase_date, useful_life_months, notes } = body;

    if (!name || !amount || !purchase_date) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const id = `capex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const month = purchase_date.substring(0, 7);
    const depMonthly = useful_life_months && useful_life_months > 0 ? Math.round((amount / useful_life_months) * 100) / 100 : 0;

    db.prepare(`
      INSERT INTO capex_items (id, organization_id, business_unit_id, name, asset_type, amount, counterparty, purchase_date, month, useful_life_months, depreciation_monthly, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgRow.id, business_unit_id || null, name, asset_type || 'construction', amount, counterparty || null, purchase_date, month, useful_life_months || null, depMonthly, notes || null);

    const item = db.prepare(`SELECT c.*, bu.name as bu_name FROM capex_items c LEFT JOIN business_units bu ON c.business_unit_id = bu.id WHERE c.id = ?`).get(id);
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
