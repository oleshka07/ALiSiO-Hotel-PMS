/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

export async function listBudgets(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const year = sp.get('year');
    const month = sp.get('month');
    const by = sp.get('by');

    const where: string[] = ['organization_id = ?'];
    const params: any[] = [orgId];
    if (year) { where.push('year = ?'); params.push(Number(year)); }
    if (month) { where.push('month = ?'); params.push(Number(month)); }
    if (by === 'category') where.push('category_id IS NOT NULL');
    if (by === 'project') where.push('project_id IS NOT NULL');

    const rows = db.prepare(`
      SELECT * FROM fin_budgets
      WHERE ${where.join(' AND ')}
      ORDER BY year, month, category_id, project_id
    `).all(...params);
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function upsertBudget(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { year, month, category_id = null, project_id = null, planned_amount } = body;

    if (!year || !month) return NextResponse.json({ error: 'year and month are required' }, { status: 400 });
    if (typeof planned_amount !== 'number' || !isFinite(planned_amount)) {
      return NextResponse.json({ error: 'planned_amount must be a number' }, { status: 400 });
    }

    const orgId = getOrgId(db);
    const existing = db.prepare(`
      SELECT id FROM fin_budgets
      WHERE organization_id = ? AND year = ? AND month = ?
        AND (category_id IS ? OR category_id = ?) AND (project_id IS ? OR project_id = ?)
    `).get(orgId, year, month, category_id, category_id, project_id, project_id) as { id: string } | undefined;

    if (existing) {
      db.prepare("UPDATE fin_budgets SET planned_amount = ?, updated_at = datetime('now') WHERE id = ?").run(planned_amount, existing.id);
      const updated = db.prepare("SELECT * FROM fin_budgets WHERE id = ?").get(existing.id);
      return NextResponse.json(updated);
    }

    const id = `bud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO fin_budgets (id, organization_id, year, month, category_id, project_id, planned_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, orgId, year, month, category_id, project_id, planned_amount);
    const created = db.prepare("SELECT * FROM fin_budgets WHERE id = ?").get(id);
    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function deleteBudget(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM fin_budgets WHERE id = ?").run(id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
