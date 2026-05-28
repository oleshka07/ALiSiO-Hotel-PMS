import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { verifyPassword, createSession } from '@core/auth';

// ─── Login rate limiter (in-memory) ────────────────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_LOGIN_ATTEMPTS;
}

// Cleanup stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

export async function login(request: Request) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    if (!checkLoginRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Забагато спроб входу. Спробуйте через 15 хвилин.' },
        { status: 429 }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email та пароль обов'язкові" }, { status: 400 });
    }

    const db = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user: any = db.prepare(
      'SELECT id, email, full_name, role, password_hash, is_active FROM app_users WHERE email = ?'
    ).get(email);

    if (!user) {
      return NextResponse.json({ error: 'Невірний email або пароль' }, { status: 401 });
    }

    if (!user.is_active) {
      return NextResponse.json({ error: 'Обліковий запис деактивовано' }, { status: 403 });
    }

    if (!user.password_hash) {
      return NextResponse.json({ error: 'Пароль не встановлено. Зверніться до адміністратора.' }, { status: 403 });
    }

    const valid = verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Невірний email або пароль' }, { status: 401 });
    }

    db.prepare("UPDATE app_users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    const sessionId = createSession(user.id);

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
    });
    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 });
  }
}
