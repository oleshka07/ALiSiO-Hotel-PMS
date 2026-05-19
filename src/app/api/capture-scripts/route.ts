/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

// GET /api/capture-scripts?site_id=xxx
export async function GET(req: NextRequest) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const siteId = req.nextUrl.searchParams.get('site_id');
    if (!siteId) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

    const db = getDb();
    const scripts = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM site_incoming_leads l WHERE l.script_id = s.id) as leads_count
      FROM site_capture_scripts s
      WHERE s.site_id = ?
      ORDER BY s.created_at ASC
    `).all(siteId) as any[];

    return NextResponse.json({ scripts });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// POST /api/capture-scripts
export async function POST(req: NextRequest) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = getDb();
    const body = await req.json();
    const { site_id, name = 'Основний скрипт' } = body;
    if (!site_id) return NextResponse.json({ error: 'site_id required' }, { status: 400 });

    const result = db.prepare(`
      INSERT INTO site_capture_scripts (site_id, name) VALUES (?, ?)
    `).run(site_id, name.trim() || 'Основний скрипт');

    const script = db.prepare('SELECT * FROM site_capture_scripts WHERE rowid = ?').get(result.lastInsertRowid) as any;
    return NextResponse.json({ script }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
