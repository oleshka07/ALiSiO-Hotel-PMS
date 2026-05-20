/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';

// PUT /api/capture-scripts/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    const body = await req.json();
    const { name, is_active } = body;

    db.prepare(`
      UPDATE site_capture_scripts
      SET name = COALESCE(?, name), is_active = COALESCE(?, is_active), updated_at = datetime('now')
      WHERE id = ?
    `).run(name ?? null, is_active !== undefined ? (is_active ? 1 : 0) : null, id);

    const script = db.prepare('SELECT * FROM site_capture_scripts WHERE id = ?').get(id) as any;
    return NextResponse.json({ script });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// DELETE /api/capture-scripts/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSessionUser(getSessionIdFromCookies(req.headers.get('cookie')));
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM site_capture_scripts WHERE id = ?').run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
