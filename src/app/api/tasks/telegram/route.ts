import { NextRequest, NextResponse } from 'next/server';
import { formatUserTasksForTelegram } from '@/modules/tasks/data/task-notifications';
import { getDb } from '@core/db';

// GET /api/tasks/telegram?chat_id=123 — returns task list for Telegram user
export async function GET(request: NextRequest) {
  try {
    const chatId = request.nextUrl.searchParams.get('chat_id');
    if (!chatId) {
      return NextResponse.json({ error: 'chat_id required' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare(
      "SELECT id FROM app_users WHERE telegram_chat_id = ? AND is_active = 1"
    ).get(chatId) as { id: string } | undefined;

    if (!user) {
      return NextResponse.json({
        text: '❌ Ваш Telegram не прив\'язаний до жодного користувача PMS. Зверніться до адміністратора.',
      });
    }

    const text = formatUserTasksForTelegram(user.id);
    return NextResponse.json({ text });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
