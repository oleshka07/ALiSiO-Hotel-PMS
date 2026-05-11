/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Investor Portal v2 — CEO Monthly Notes CRUD.
//
// Powers the «CEO Monthly Note» card at the top of the investor portal
// (markdown commentary, scope = portfolio OR specific asset).
//
// Endpoints (admin-only, gated by manage_investors):
//   GET    /api/finance/investor-monthly-notes?scope=&scope_id=&month=
//   POST   /api/finance/investor-monthly-notes   (upsert)
//   DELETE /api/finance/investor-monthly-notes/[id]
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import * as crypto from 'crypto';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

export async function listMonthlyNotes(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const scope = sp.get('scope');
    const scopeId = sp.get('scope_id');
    const month = sp.get('month');

    const where: string[] = ['n.organization_id = ?'];
    const params: any[] = [orgId];
    if (scope)   { where.push('n.scope = ?');    params.push(scope); }
    if (scopeId) { where.push('n.scope_id = ?'); params.push(scopeId); }
    if (month)   { where.push('n.month = ?');    params.push(month); }

    // Resolve scope_id → display name. For 'portfolio' → investors.name;
    // for 'asset' → business_units.name. Both via LEFT JOIN.
    const rows = db.prepare(`
      SELECT n.*,
        i.name  AS investor_name,
        bu.name AS asset_name
      FROM investor_monthly_notes n
      LEFT JOIN investors i        ON n.scope = 'portfolio' AND i.id = n.scope_id
      LEFT JOIN business_units bu  ON n.scope = 'asset'     AND bu.id = n.scope_id
      WHERE ${where.join(' AND ')}
      ORDER BY n.month DESC, n.scope, n.scope_id
    `).all(...params);

    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/investor-monthly-notes
 * Body: { scope, scope_id, month, ceo_name?, body_md }
 * Upserts on (scope, scope_id, month).
 */
export async function upsertMonthlyNote(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    const { scope, scope_id, month, ceo_name, body_md } = body || {};
    if (!scope || !scope_id || !month) {
      return NextResponse.json({ error: 'scope, scope_id, month required' }, { status: 400 });
    }
    if (!['portfolio', 'asset'].includes(scope)) {
      return NextResponse.json({ error: 'scope must be portfolio or asset' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    }

    const id = `cnote_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    db.prepare(`
      INSERT INTO investor_monthly_notes (id, organization_id, scope, scope_id, month, ceo_name, body_md)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, scope_id, month) DO UPDATE SET
        ceo_name = excluded.ceo_name,
        body_md  = excluded.body_md,
        updated_at = datetime('now')
    `).run(id, orgId, scope, scope_id, month, ceo_name || null, body_md || null);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteMonthlyNote(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM investor_monthly_notes WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
