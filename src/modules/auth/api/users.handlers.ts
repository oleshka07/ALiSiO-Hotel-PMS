/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@core/db';
import { getSessionUser, hashPassword } from '@core/auth';
import { getUserPermissions, type PermissionOverride, type Permission } from '@/lib/permissions';

export async function listUsers() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    const currentUser = getSessionUser(sessionId);

    if (!currentUser || !currentUser.permissions.includes('manage_users')) {
      return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 });
    }

    const db = getDb();
    const users = db.prepare(`
      SELECT id, organization_id, email, full_name, phone, telegram_chat_id, role, is_active, last_login, created_at, updated_at
      FROM app_users
      WHERE organization_id = ?
      ORDER BY
        CASE role
          WHEN 'owner' THEN 1
          WHEN 'director' THEN 2
          WHEN 'manager' THEN 3
          WHEN 'receptionist' THEN 4
          WHEN 'accountant' THEN 5
          WHEN 'housekeeper' THEN 6
          WHEN 'maintenance' THEN 7
        END,
        full_name
    `).all(currentUser.organization_id);

    const usersWithPermissions = users.map((u: any) => {
      const overrides: PermissionOverride[] = db.prepare(
        'SELECT permission, granted FROM user_permissions WHERE user_id = ?'
      ).all(u.id).map((o: any) => ({
        permission: o.permission as Permission,
        granted: o.granted === 1,
      }));
      const permissions = getUserPermissions(u.role, overrides);
      const overridesList = overrides.map((o) => ({ permission: o.permission, granted: o.granted }));

      return { ...u, permissions, overrides: overridesList };
    });

    return NextResponse.json({ users: usersWithPermissions });
  } catch (error) {
    console.error('Users GET error:', error);
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 });
  }
}

export async function createUser(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    const currentUser = getSessionUser(sessionId);

    if (!currentUser || !currentUser.permissions.includes('manage_users')) {
      return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 });
    }

    const body = await request.json();
    const { email, full_name, phone, telegram_chat_id, role, password, permissions_overrides } = body;

    if (!email || !full_name || !role || !password) {
      return NextResponse.json({ error: "Заповніть усі обов'язкові поля" }, { status: 400 });
    }

    if (role === 'owner' && currentUser.role !== 'owner') {
      return NextResponse.json({ error: 'Тільки Власник може створювати інших Власників' }, { status: 403 });
    }

    const db = getDb();

    const existing = db.prepare('SELECT id FROM app_users WHERE email = ?').get(email);
    if (existing) {
      return NextResponse.json({ error: 'Користувач з таким email вже існує' }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 32);

    db.prepare(`
      INSERT INTO app_users (id, organization_id, email, full_name, phone, telegram_chat_id, role, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, currentUser.organization_id, email, full_name, phone || null, telegram_chat_id || null, role, passwordHash);

    if (permissions_overrides && Array.isArray(permissions_overrides)) {
      const insertOverride = db.prepare(
        'INSERT OR REPLACE INTO user_permissions (user_id, permission, granted) VALUES (?, ?, ?)'
      );
      for (const ov of permissions_overrides) {
        insertOverride.run(id, ov.permission, ov.granted ? 1 : 0);
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Users POST error:', error);
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 });
  }
}
