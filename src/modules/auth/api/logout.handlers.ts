import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession } from '@core/auth';

export async function logout() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;

    if (sessionId) {
      deleteSession(sessionId);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set('session_id', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 });
  }
}
