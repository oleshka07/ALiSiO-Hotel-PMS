/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';

export async function listExpenseCategories(): Promise<NextResponse> {
  try {
    const db = getDb();
    const categories = db.prepare(`SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY sort_order ASC`).all();
    return NextResponse.json(categories);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function createExpenseCategory(request: Request): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, std_group, pnl_line, alloc_method, icon, color } = body;

    if (!name || !std_group || !pnl_line) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    const id = `ec_${Date.now()}`;
    const maxOrder = db.prepare("SELECT MAX(sort_order) as mx FROM expense_categories").get() as any;

    // Keep both classification axes in sync — a category without
    // op_type/classifier is invisible to the matrix reports.
    const AXIS: Record<string, { op_type: string; classifier: string }> = {
      Revenue:   { op_type: 'income',   classifier: 'revenue' },
      COGS:      { op_type: 'expense',  classifier: 'cogs' },
      OPEX:      { op_type: 'expense',  classifier: 'operational' },
      Taxes:     { op_type: 'expense',  classifier: 'tax' },
      CAPEX:     { op_type: 'expense',  classifier: 'capex' },
      Financing: { op_type: 'expense',  classifier: 'financing' },
      Transfer:  { op_type: 'transfer', classifier: 'other' },
    };
    const axis = AXIS[std_group] || { op_type: 'other', classifier: 'other' };

    db.prepare(`
      INSERT INTO expense_categories (id, organization_id, name, std_group, pnl_line, alloc_method, icon, color, sort_order, op_type, classifier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgRow.id, name, std_group, pnl_line, alloc_method || 'DIRECT', icon || '📋', color || '#6b7280', (maxOrder?.mx || 0) + 1, axis.op_type, axis.classifier);

    return NextResponse.json(db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id), { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
