/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@core/db';
import { getSessionUser, hashPassword } from '@core/auth';

export async function getUser(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    const currentUser = getSessionUser(sessionId);

    if (!currentUser || !currentUser.permissions.includes('manage_users')) {
      return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 });
    }

    const db = getDb();
    const user = db.prepare(
      'SELECT id, organization_id, email, full_name, phone, telegram_chat_id, role, is_active, default_cash_account_id, last_login, created_at, updated_at FROM app_users WHERE id = ?'
    ).get(id);

    if (!user) {
      return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });
    }

    const overrides = db.prepare(
      'SELECT permission, granted FROM user_permissions WHERE user_id = ?'
    ).all(id);

    return NextResponse.json({ user, overrides });
  } catch (error) {
    console.error('User GET error:', error);
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 });
  }
}

export async function updateUser(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    const currentUser = getSessionUser(sessionId);

    if (!currentUser || !currentUser.permissions.includes('manage_users')) {
      return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 });
    }

    const db = getDb();
    const existing: any = db.prepare('SELECT * FROM app_users WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });
    }

    const body = await request.json();

    if (body.password) {
      const passwordHash = hashPassword(body.password);
      db.prepare("UPDATE app_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(passwordHash, id);
    }

    if (body.full_name || body.email || body.phone !== undefined || body.telegram_chat_id !== undefined || body.role || body.is_active !== undefined || body.default_cash_account_id !== undefined) {
      const fullName = body.full_name || existing.full_name;
      const email = body.email || existing.email;
      const phone = body.phone !== undefined ? body.phone : existing.phone;
      const telegramChatId = body.telegram_chat_id !== undefined ? (body.telegram_chat_id || null) : existing.telegram_chat_id;
      const role = body.role || existing.role;
      const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;
      const cashAcct = body.default_cash_account_id !== undefined ? (body.default_cash_account_id || null) : existing.default_cash_account_id;

      if (existing.role === 'owner' && role !== 'owner' && currentUser.role !== 'owner') {
        return NextResponse.json({ error: 'Не можна змінити роль Власника' }, { status: 403 });
      }

      db.prepare(`
        UPDATE app_users
        SET full_name = ?, email = ?, phone = ?, telegram_chat_id = ?, role = ?, is_active = ?, default_cash_account_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(fullName, email, phone, telegramChatId, role, isActive, cashAcct, id);
    }

    if (body.permissions_overrides && Array.isArray(body.permissions_overrides)) {
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);
      const insertOverride = db.prepare(
        'INSERT INTO user_permissions (user_id, permission, granted) VALUES (?, ?, ?)'
      );
      for (const ov of body.permissions_overrides) {
        insertOverride.run(id, ov.permission, ov.granted ? 1 : 0);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('User PUT error:', error);
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 });
  }
}

export async function deleteUser(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    const currentUser = getSessionUser(sessionId);

    if (!currentUser || !currentUser.permissions.includes('manage_users')) {
      return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 });
    }

    if (currentUser.id === id) {
      return NextResponse.json({ error: 'Не можна видалити себе' }, { status: 400 });
    }

    const db = getDb();
    const existing: any = db.prepare('SELECT role FROM app_users WHERE id = ?').get(id);

    if (!existing) {
      return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });
    }

    if (existing.role === 'owner' && currentUser.role !== 'owner') {
      return NextResponse.json({ error: 'Не можна видалити Власника' }, { status: 403 });
    }

    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM app_users WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('User DELETE error:', error);
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 });
  }
}
