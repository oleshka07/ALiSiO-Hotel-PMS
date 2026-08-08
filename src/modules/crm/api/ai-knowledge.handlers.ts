/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { getSessionUser, getSessionIdFromCookies } from '@/lib/auth';
import { publicMessage } from '@core/security/public-error';

export async function listKnowledge(request: NextRequest) {
  const sessionId = getSessionIdFromCookies(request.headers.get('cookie'));
  const session = getSessionUser(sessionId);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = 'SELECT * FROM crm_knowledge_base';
    const params: any[] = [];

    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }

    query += ' ORDER BY category ASC, usage_count DESC, updated_at DESC';
    const articles = db.prepare(query).all(...params);
    return NextResponse.json({ articles });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function saveKnowledge(request: NextRequest) {
  const sessionId = getSessionIdFromCookies(request.headers.get('cookie'));
  const session = getSessionUser(sessionId);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getDb();
    const body = await request.json();
    const { id, topic, keywords, content, category, language, isActive } = body;

    if (!topic || !keywords || !content) {
      return NextResponse.json({ error: 'Missing topic, keywords, or content' }, { status: 400 });
    }

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    if (!org) return NextResponse.json({ error: 'No organization' }, { status: 500 });

    if (id) {
      db.prepare(`
        UPDATE crm_knowledge_base SET
          topic = ?, keywords = ?, content = ?, category = ?,
          language = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(topic, keywords, content, category || 'general', language || 'all', isActive !== false ? 1 : 0, id);
      return NextResponse.json({ success: true, id });
    } else {
      db.prepare(`
        INSERT INTO crm_knowledge_base
        (organization_id, topic, keywords, content, category, language, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(org.id, topic, keywords, content, category || 'general', language || 'all', isActive !== false ? 1 : 0);
      const inserted = db.prepare('SELECT id FROM crm_knowledge_base ORDER BY created_at DESC LIMIT 1').get() as any;
      return NextResponse.json({ success: true, id: inserted.id }, { status: 201 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function deleteKnowledge(request: NextRequest) {
  const sessionId = getSessionIdFromCookies(request.headers.get('cookie'));
  const session = getSessionUser(sessionId);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    db.prepare('DELETE FROM crm_knowledge_base WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
