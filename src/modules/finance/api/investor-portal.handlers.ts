/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Public investor portal API. Auth = portal_token in URL (no session).
// Endpoint is intentionally NOT wrapped with withPermission since it's
// public read-only. Token revocation = regenerate via admin UI.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { buildPortalData } from '../data/investor-portal-engine';
import { publicMessage } from '@core/security/public-error';

/**
 * GET /api/invest/[token]/portfolio
 * Returns the full investor dashboard data (totals, per-property,
 * time series, monthly reports). 404 if token invalid or investor
 * is archived.
 */
export async function getInvestorPortalData(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { token } = await context.params;
    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }
    const data = buildPortalData(db, token);
    if (!data) {
      return NextResponse.json({ error: 'Portal not found or revoked' }, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
