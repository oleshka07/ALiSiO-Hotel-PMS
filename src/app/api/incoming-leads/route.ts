/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

// GET /api/incoming-leads?site_id=xxx&status=new
export async function GET(req: NextRequest) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const siteId = req.nextUrl.searchParams.get('site_id');
    if (!siteId) return NextResponse.json({ error: 'site_id required' }, { status: 400 });
    const status = req.nextUrl.searchParams.get('status');

    const db = getDb();
    const leads = db.prepare(`
      SELECT l.*, s.name as script_name
      FROM site_incoming_leads l
      LEFT JOIN site_capture_scripts s ON s.id = l.script_id
      WHERE l.site_id = ?
        ${status ? "AND l.status = ?" : ""}
      ORDER BY l.created_at DESC
      LIMIT 200
    `).all(...(status ? [siteId, status] : [siteId])) as any[];

    return NextResponse.json({ leads });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
