/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Investor Portal v2 — Forecast Scenarios CRUD.
//
// 3 scenarios per business_unit (pessimistic / base / optimistic), each with
// JSON assumptions and a JSON array of monthly_cashback_projection. Powers
// the Forward Projection fan chart on the investor portal (Phase 4).
//
// Endpoints (admin-only):
//   GET    /api/finance/forecast-scenarios?business_unit_id=
//   POST   /api/finance/forecast-scenarios     (upsert on bu + scenario)
//   DELETE /api/finance/forecast-scenarios/[id]
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import * as crypto from 'crypto';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

const ALLOWED_SCENARIOS = ['pessimistic', 'base', 'optimistic'] as const;

export async function listForecastScenarios(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const buId = sp.get('business_unit_id');

    const where: string[] = ['s.organization_id = ?'];
    const params: any[] = [orgId];
    if (buId) { where.push('s.business_unit_id = ?'); params.push(buId); }

    const rows = db.prepare(`
      SELECT s.*, bu.name AS business_unit_name
      FROM forecast_scenarios s
      LEFT JOIN business_units bu ON bu.id = s.business_unit_id
      WHERE ${where.join(' AND ')}
      ORDER BY bu.name, s.scenario
    `).all(...params);

    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/forecast-scenarios
 * Body: { business_unit_id, scenario, assumptions_json?, monthly_cashback_projection_json?, full_repayment_eta? }
 * Upserts on (business_unit_id, scenario).
 */
export async function upsertForecastScenario(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    const { business_unit_id, scenario, assumptions_json, monthly_cashback_projection_json, full_repayment_eta } = body || {};

    if (!business_unit_id || !scenario) {
      return NextResponse.json({ error: 'business_unit_id, scenario required' }, { status: 400 });
    }
    if (!ALLOWED_SCENARIOS.includes(scenario)) {
      return NextResponse.json({ error: `scenario must be one of ${ALLOWED_SCENARIOS.join(', ')}` }, { status: 400 });
    }

    const id = `fc_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    db.prepare(`
      INSERT INTO forecast_scenarios
        (id, organization_id, business_unit_id, scenario, assumptions_json,
         monthly_cashback_projection_json, full_repayment_eta)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_unit_id, scenario) DO UPDATE SET
        assumptions_json = excluded.assumptions_json,
        monthly_cashback_projection_json = excluded.monthly_cashback_projection_json,
        full_repayment_eta = excluded.full_repayment_eta,
        updated_at = datetime('now')
    `).run(
      id, orgId, business_unit_id, scenario,
      assumptions_json || null, monthly_cashback_projection_json || null,
      full_repayment_eta || null,
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteForecastScenario(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM forecast_scenarios WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
