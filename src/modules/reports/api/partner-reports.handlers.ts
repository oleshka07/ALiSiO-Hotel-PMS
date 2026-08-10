/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@core/db';
import { publicMessage } from '@core/security/public-error';

/**
 * Партнерський звіт, опублікований за токеном.
 *
 * Звіт складається руками — цифри з ПМС плюс фотографії й описи — і має дійти до
 * людей, у яких тут немає акаунта. Тому та сама схема, що в інвесторському
 * порталі: довгий випадковий токен у посиланні й жодної сесії.
 *
 * Документ лежить у рядку таблиці, а не файлом на диску: переживає деплой, не
 * потребує каталогу завантажень, а звіт — це текст.
 */

function orgId(db: any): string {
  const row = db.prepare('SELECT id FROM organizations LIMIT 1').get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

const newToken = () => crypto.randomBytes(32).toString('hex');

/** GET /report/[token] — сам звіт. Без сесії, лише за токеном. */
export async function getPublicPartnerReport(
  _request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 32) return new NextResponse('Not found', { status: 404 });

    const db = getDb();
    const row = db.prepare(
      'SELECT id, html FROM partner_reports WHERE token = ? AND is_published = 1',
    ).get(token) as { id: string; html: string } | undefined;

    if (!row) return new NextResponse('Not found', { status: 404 });

    // Скільки разів відкривали — єдина статистика, яка тут потрібна.
    try {
      db.prepare(
        "UPDATE partner_reports SET view_count = view_count + 1, last_viewed_at = datetime('now') WHERE id = ?",
      ).run(row.id);
    } catch (e) {
      console.error('[partner-report] view counter failed:', e);
    }

    return new NextResponse(row.html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        // Посилання розсилається партнерам, але лишається приватним: у пошук
        // потрапити не має, у кеші проксі — теж.
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    console.error('GET /report/[token] failed:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}

/** GET /api/reports/partner — список звітів для адміністратора. */
export async function listPartnerReports(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, token, title, period, is_published, view_count, last_viewed_at,
             LENGTH(html) AS size_bytes, created_at, updated_at
      FROM partner_reports WHERE organization_id = ?
      ORDER BY COALESCE(period, created_at) DESC, created_at DESC
    `).all(orgId(db));
    return NextResponse.json({ reports: rows });
  } catch (error: any) {
    console.error('GET /api/reports/partner failed:', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/** POST /api/reports/partner — опублікувати звіт. Повертає готове посилання. */
export async function createPartnerReport(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const title = String(body.title || '').trim();
    const html = String(body.html || '');
    const period = body.period ? String(body.period).trim() : null;

    if (!title) return NextResponse.json({ error: 'Вкажіть назву звіту' }, { status: 400 });
    if (html.length < 20) return NextResponse.json({ error: 'Порожній HTML звіту' }, { status: 400 });

    const id = `prep_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const token = newToken();
    db.prepare(`
      INSERT INTO partner_reports (id, organization_id, token, title, period, html, is_published)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, orgId(db), token, title, period, html);

    return NextResponse.json({ id, token, url: `/report/${token}`, title, period }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/reports/partner failed:', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * PUT /api/reports/partner/[id] — замінити вміст, назву або зняти з публікації.
 * Токен не змінюється, тому вже розіслане посилання показує новий вміст. Щоб
 * обірвати доступ, треба або `is_published: false`, або `rotate_token: true`.
 */
export async function updatePartnerReport(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const exists = db.prepare('SELECT id FROM partner_reports WHERE id = ?').get(id);
    if (!exists) return NextResponse.json({ error: 'Звіт не знайдено' }, { status: 404 });

    const body = await request.json();
    const fields: string[] = [];
    const params: any[] = [];

    if (typeof body.title === 'string' && body.title.trim()) { fields.push('title = ?'); params.push(body.title.trim()); }
    if (typeof body.period === 'string') { fields.push('period = ?'); params.push(body.period.trim() || null); }
    if (typeof body.html === 'string' && body.html.length >= 20) { fields.push('html = ?'); params.push(body.html); }
    if (typeof body.is_published === 'boolean') { fields.push('is_published = ?'); params.push(body.is_published ? 1 : 0); }
    if (body.rotate_token === true) { fields.push('token = ?'); params.push(newToken()); }

    if (!fields.length) return NextResponse.json({ error: 'Нічого змінювати' }, { status: 400 });

    fields.push("updated_at = datetime('now')");
    db.prepare(`UPDATE partner_reports SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);

    const row = db.prepare('SELECT id, token, title, period, is_published FROM partner_reports WHERE id = ?').get(id) as any;
    return NextResponse.json({ ...row, url: `/report/${row.token}` });
  } catch (error: any) {
    console.error('PUT /api/reports/partner/[id] failed:', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/** DELETE /api/reports/partner/[id] */
export async function deletePartnerReport(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const db = getDb();
    const res = db.prepare('DELETE FROM partner_reports WHERE id = ?').run(id);
    if (!res.changes) return NextResponse.json({ error: 'Звіт не знайдено' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('DELETE /api/reports/partner/[id] failed:', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
