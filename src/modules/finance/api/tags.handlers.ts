/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

const MAX_NAME_LEN = 50;

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

export async function listTags(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const includeArchived = request.nextUrl.searchParams.get('archived') === '1';
    const where = includeArchived ? 'organization_id = ?' : 'organization_id = ? AND is_active = 1';
    const rows = db.prepare(`
      SELECT * FROM finance_tags
      WHERE ${where}
      ORDER BY sort_order ASC, name ASC
    `).all(orgId);
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function createTag(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, color, sort_order } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (name.trim().length > MAX_NAME_LEN) {
      return NextResponse.json({ error: `Назва тега не може бути довшою за ${MAX_NAME_LEN} символів` }, { status: 400 });
    }

    const orgId = getOrgId(db);
    const id = `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS mx FROM finance_tags WHERE organization_id = ?"
    ).get(orgId) as { mx: number };

    try {
      db.prepare(`
        INSERT INTO finance_tags (id, organization_id, name, color, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, orgId, name.trim(), color || '#6b7280', Number(sort_order) || (maxOrder.mx + 1));
    } catch (e: any) {
      if (String(e.message).includes('UNIQUE')) {
        return NextResponse.json({ error: `Тег «${name.trim()}» уже існує` }, { status: 409 });
      }
      throw e;
    }

    const created = db.prepare("SELECT * FROM finance_tags WHERE id = ?").get(id);
    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function updateTag(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();
    const { name, color, sort_order } = body;

    const existing = db.prepare("SELECT * FROM finance_tags WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

    const fields: string[] = [];
    const params: any[] = [];
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      if (name.trim().length > MAX_NAME_LEN) {
        return NextResponse.json({ error: `Назва тега не може бути довшою за ${MAX_NAME_LEN} символів` }, { status: 400 });
      }
      fields.push('name = ?'); params.push(name.trim());
    }
    if (color !== undefined) { fields.push('color = ?'); params.push(color || '#6b7280'); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(sort_order) || 0); }

    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    params.push(id);
    try {
      db.prepare(`UPDATE finance_tags SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    } catch (e: any) {
      if (String(e.message).includes('UNIQUE')) {
        return NextResponse.json({ error: 'Тег з такою назвою уже існує' }, { status: 409 });
      }
      throw e;
    }

    const updated = db.prepare("SELECT * FROM finance_tags WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function archiveTag(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const archived = body.archived !== false;

    const existing = db.prepare("SELECT id FROM finance_tags WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

    db.prepare("UPDATE finance_tags SET is_active = ? WHERE id = ?").run(archived ? 0 : 1, id);
    const updated = db.prepare("SELECT * FROM finance_tags WHERE id = ?").get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function deleteTag(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;

    const existing = db.prepare("SELECT id FROM finance_tags WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

    db.prepare("DELETE FROM finance_tags WHERE id = ?").run(id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
