/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Task Telegram Notifications — sends notifications via @kemptimebot
 * when tasks are assigned, updated, or due.
 */

import { getDb } from '@core/db';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const BASE_URL = process.env.NEXTAUTH_URL || 'https://alisio.swipescape.eu';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PRIORITY_EMOJI: Record<string, string> = {
  urgent: '🔴',
  high: '🟡',
  normal: '🔵',
  low: '⚪',
};

const STATUS_LABEL: Record<string, string> = {
  todo: 'Нове',
  in_progress: 'В роботі',
  done: '✅ Готово',
  cancelled: '❌ Скасовано',
};

/**
 * Send Telegram notification when a task is assigned to a user.
 */
export async function notifyTaskAssigned(opts: {
  taskId: string;
  taskTitle: string;
  priority: string;
  dueDate?: string | null;
  projectName?: string | null;
  assignedByName?: string;
}): Promise<void> {
  if (!BOT_TOKEN) return;

  const db = getDb();
  // Get the assignee's telegram_chat_id
  const task = db.prepare(`
    SELECT t.assignee_id, u.telegram_chat_id, u.full_name
    FROM tasks t
    JOIN app_users u ON u.id = t.assignee_id
    WHERE t.id = ?
  `).get(opts.taskId) as any;

  if (!task?.telegram_chat_id) return;

  const priEmoji = PRIORITY_EMOJI[opts.priority] || '🔵';
  const lines = [
    `📋 <b>Нова задача для вас</b>`,
    ``,
    `${priEmoji} <b>${escapeHtml(opts.taskTitle)}</b>`,
  ];

  if (opts.projectName) lines.push(`📁 ${escapeHtml(opts.projectName)}`);
  if (opts.dueDate) lines.push(`📅 Дедлайн: ${opts.dueDate}`);
  if (opts.assignedByName) lines.push(`👤 Від: ${escapeHtml(opts.assignedByName)}`);

  lines.push(``, `🔗 <a href="${BASE_URL}/tasks">Відкрити в PMS</a>`);

  await sendToChat(task.telegram_chat_id, lines.join('\n'));
}

/**
 * Send Telegram notification when a task status changes.
 */
export async function notifyTaskStatusChanged(opts: {
  taskId: string;
  taskTitle: string;
  newStatus: string;
  changedByName?: string;
}): Promise<void> {
  if (!BOT_TOKEN) return;

  const db = getDb();
  const task = db.prepare(`
    SELECT t.assignee_id, u.telegram_chat_id, u.full_name
    FROM tasks t
    JOIN app_users u ON u.id = t.assignee_id
    WHERE t.id = ?
  `).get(opts.taskId) as any;

  if (!task?.telegram_chat_id) return;

  const statusLabel = STATUS_LABEL[opts.newStatus] || opts.newStatus;
  const lines = [
    `🔄 <b>Статус задачі змінено</b>`,
    ``,
    `📋 ${escapeHtml(opts.taskTitle)}`,
    `📊 Новий статус: <b>${statusLabel}</b>`,
  ];
  if (opts.changedByName) lines.push(`👤 Змінив: ${escapeHtml(opts.changedByName)}`);
  lines.push(``, `🔗 <a href="${BASE_URL}/tasks">Відкрити в PMS</a>`);

  await sendToChat(task.telegram_chat_id, lines.join('\n'));
}

/**
 * Get daily task summary for a user (used by daily digest).
 */
export function getUserTaskSummary(userId: string): {
  overdue: any[];
  today: any[];
  upcoming: any[];
  inProgress: any[];
} {
  const db = getDb();
  const now = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const overdue = db.prepare(`
    SELECT id, title, priority, due_date, project_id,
      (SELECT name FROM task_projects WHERE id = tasks.project_id) as project_name
    FROM tasks
    WHERE assignee_id = ? AND status NOT IN ('done','cancelled')
      AND due_date IS NOT NULL AND due_date < ?
    ORDER BY due_date
  `).all(userId, now) as any[];

  const today = db.prepare(`
    SELECT id, title, priority, due_date, project_id,
      (SELECT name FROM task_projects WHERE id = tasks.project_id) as project_name
    FROM tasks
    WHERE assignee_id = ? AND status NOT IN ('done','cancelled')
      AND due_date = ?
    ORDER BY priority DESC
  `).all(userId, now) as any[];

  const upcoming = db.prepare(`
    SELECT id, title, priority, due_date, project_id,
      (SELECT name FROM task_projects WHERE id = tasks.project_id) as project_name
    FROM tasks
    WHERE assignee_id = ? AND status NOT IN ('done','cancelled')
      AND due_date > ? AND due_date <= ?
    ORDER BY due_date
  `).all(userId, now, weekEnd) as any[];

  const inProgress = db.prepare(`
    SELECT id, title, priority, due_date, project_id,
      (SELECT name FROM task_projects WHERE id = tasks.project_id) as project_name
    FROM tasks
    WHERE assignee_id = ? AND status = 'in_progress'
    ORDER BY due_date NULLS LAST
  `).all(userId) as any[];

  return { overdue, today, upcoming, inProgress };
}

/**
 * Send daily task digest to a specific user via Telegram.
 */
export async function sendDailyTaskDigest(userId: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;

  const db = getDb();
  const user = db.prepare('SELECT telegram_chat_id, full_name FROM app_users WHERE id = ?').get(userId) as any;
  if (!user?.telegram_chat_id) return false;

  const summary = getUserTaskSummary(userId);
  const total = summary.overdue.length + summary.today.length + summary.upcoming.length + summary.inProgress.length;
  if (total === 0) return false;

  const lines: string[] = [
    `📊 <b>Щоденний звіт задач</b>`,
    `👤 ${escapeHtml(user.full_name)}`,
    ``,
  ];

  if (summary.overdue.length > 0) {
    lines.push(`🔴 <b>Прострочені (${summary.overdue.length}):</b>`);
    for (const t of summary.overdue) {
      const pri = PRIORITY_EMOJI[t.priority] || '';
      lines.push(`  ${pri} ${escapeHtml(t.title)} — ${t.due_date}`);
    }
    lines.push(``);
  }

  if (summary.today.length > 0) {
    lines.push(`📅 <b>Сьогодні (${summary.today.length}):</b>`);
    for (const t of summary.today) {
      const pri = PRIORITY_EMOJI[t.priority] || '';
      lines.push(`  ${pri} ${escapeHtml(t.title)}`);
    }
    lines.push(``);
  }

  if (summary.inProgress.length > 0) {
    lines.push(`🔄 <b>В роботі (${summary.inProgress.length}):</b>`);
    for (const t of summary.inProgress) {
      const pri = PRIORITY_EMOJI[t.priority] || '';
      const due = t.due_date ? ` — до ${t.due_date}` : '';
      lines.push(`  ${pri} ${escapeHtml(t.title)}${due}`);
    }
    lines.push(``);
  }

  if (summary.upcoming.length > 0) {
    lines.push(`📆 <b>Наступні 7 днів (${summary.upcoming.length}):</b>`);
    for (const t of summary.upcoming.slice(0, 10)) {
      const pri = PRIORITY_EMOJI[t.priority] || '';
      lines.push(`  ${pri} ${escapeHtml(t.title)} — ${t.due_date}`);
    }
    lines.push(``);
  }

  lines.push(`🔗 <a href="${BASE_URL}/tasks">Всі задачі в PMS</a>`);

  await sendToChat(user.telegram_chat_id, lines.join('\n'));
  return true;
}

/**
 * Send daily digest to ALL users with telegram_chat_id.
 */
export async function sendDailyTaskDigestAll(): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  const users = db.prepare(
    "SELECT id FROM app_users WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id != '' AND is_active = 1"
  ).all() as { id: string }[];

  let sent = 0, skipped = 0;
  for (const u of users) {
    const ok = await sendDailyTaskDigest(u.id);
    if (ok) sent++; else skipped++;
  }
  return { sent, skipped };
}

/**
 * List tasks for Telegram /tasks command — returns formatted text.
 */
export function formatUserTasksForTelegram(userId: string): string {
  const summary = getUserTaskSummary(userId);
  const total = summary.overdue.length + summary.today.length + summary.upcoming.length + summary.inProgress.length;

  if (total === 0) return '✅ У вас немає активних задач!';

  const lines: string[] = [`📋 <b>Ваші задачі:</b>`, ``];

  const allTasks = [
    ...summary.overdue.map(t => ({ ...t, _section: '🔴 Прострочене' })),
    ...summary.today.map(t => ({ ...t, _section: '📅 Сьогодні' })),
    ...summary.inProgress.map(t => ({ ...t, _section: '🔄 В роботі' })),
    ...summary.upcoming.map(t => ({ ...t, _section: '📆 Найближчі' })),
  ];

  let currentSection = '';
  for (const t of allTasks) {
    if (t._section !== currentSection) {
      currentSection = t._section;
      lines.push(`<b>${currentSection}:</b>`);
    }
    const pri = PRIORITY_EMOJI[t.priority] || '';
    const due = t.due_date ? ` (${t.due_date})` : '';
    const proj = t.project_name ? ` [${escapeHtml(t.project_name)}]` : '';
    lines.push(`  ${pri} ${escapeHtml(t.title)}${due}${proj}`);
  }

  lines.push(``, `🔗 <a href="${BASE_URL}/tasks">Відкрити в PMS</a>`);
  return lines.join('\n');
}

// ─── Low-level sender ─────────────────────────────────────

async function sendToChat(chatId: string, text: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('[TaskTG] sendMessage failed:', data.description);
      return null;
    }
    return data.result?.message_id || null;
  } catch (err: any) {
    console.error('[TaskTG] sendMessage error:', err.message);
    return null;
  }
}
