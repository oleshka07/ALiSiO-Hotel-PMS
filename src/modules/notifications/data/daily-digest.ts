/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Daily Operational Digest — evening summary sent to Telegram at 19:00 (Prague time)
 * 
 * Collects data from 4 sources:
 * 1. CRM — new messages, unanswered leads, pending AI drafts
 * 2. Finance — cash, card, bank, total revenue
 * 3. Bookings — new bookings, check-ins, check-outs, occupancy
 * 4. Tasks — overdue, today, in progress
 */

import { getDb } from '@core/db';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const ADMIN_CHAT_IDS: string[] = (process.env.TELEGRAM_ADMIN_CHAT_IDS || '')
  .split(',').map(id => id.trim()).filter(id => id.length > 0 && id !== CHAT_ID);
const BASE_URL = process.env.NEXTAUTH_URL || 'https://alisio.swipescape.eu';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatAmount(amount: number, currency = 'CZK'): string {
  return `${amount.toLocaleString('cs-CZ')} ${currency}`;
}

// ─── CRM Digest ──────────────────────────────────────────

interface CrmDigest {
  newMessagesToday: number;
  unansweredLeads: { id: string; name: string; lastMessage: string; waitingSince: string }[];
  pendingDrafts: number;
  totalUnread: number;
}

function getCrmDigest(): CrmDigest {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // New inbound messages today
  const newMsgs = db.prepare(`
    SELECT COUNT(*) as cnt FROM crm_messages
    WHERE direction = 'inbound' AND date(created_at) = ?
  `).get(today) as any;

  // Unanswered leads — last message was inbound, lead not in closed stages
  const unanswered = db.prepare(`
    SELECT l.id, l.first_name, l.last_name,
      m.content as last_message, m.created_at as last_message_at
    FROM crm_leads l
    JOIN crm_conversations c ON c.lead_id = l.id
    JOIN crm_messages m ON m.conversation_id = c.id
    WHERE m.direction = 'inbound'
      AND m.id = (
        SELECT m3.id FROM crm_messages m3
        WHERE m3.conversation_id = c.id
        ORDER BY m3.created_at DESC LIMIT 1
      )
      AND l.stage NOT IN ('lost', 'spam', 'booked', 'check_in', 'in_stay', 'check_out', 'post_stay')
    ORDER BY m.created_at ASC
    LIMIT 20
  `).all() as any[];

  // Pending AI drafts
  let pendingDrafts = 0;
  try {
    const res = db.prepare(`
      SELECT COUNT(*) as cnt FROM crm_auto_drafts WHERE status = 'pending'
    `).get() as any;
    pendingDrafts = res?.cnt || 0;
  } catch { /* table may not exist */ }

  // Total unread
  const totalUnread = (db.prepare(
    `SELECT COALESCE(SUM(unread_count), 0) as cnt FROM crm_leads`
  ).get() as any).cnt;

  return {
    newMessagesToday: newMsgs?.cnt || 0,
    unansweredLeads: unanswered.map(u => ({
      id: u.id,
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Без імені',
      lastMessage: (u.last_message || '').substring(0, 60),
      waitingSince: u.last_message_at || '',
    })),
    pendingDrafts,
    totalUnread,
  };
}

// ─── Finance Digest ──────────────────────────────────────

interface FinanceDigest {
  cash: number;
  card: number;
  bankTransfer: number;
  online: number;
  bookingPlatform: number;
  totalIncome: number;
  totalExpenses: number;
  currency: string;
}

function getFinanceDigest(): FinanceDigest {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Revenue by method today
  const incomeRows = db.prepare(`
    SELECT method, COALESCE(SUM(amount), 0) as total
    FROM fin_operations
    WHERE op_type = 'income' AND status = 'completed'
      AND date(paid_at) = ?
    GROUP BY method
  `).all(today) as any[];

  const methods: Record<string, number> = {};
  for (const r of incomeRows) {
    methods[r.method || 'unknown'] = r.total;
  }

  // Total expenses today
  const expenseRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM fin_operations
    WHERE op_type = 'expense' AND status = 'completed'
      AND date(paid_at) = ?
  `).get(today) as any;

  const totalIncome = Object.values(methods).reduce((s, v) => s + v, 0);

  return {
    cash: methods['cash'] || 0,
    card: methods['card'] || 0,
    bankTransfer: methods['bank_transfer'] || 0,
    online: methods['online'] || 0,
    bookingPlatform: methods['booking_platform'] || 0,
    totalIncome,
    totalExpenses: expenseRow?.total || 0,
    currency: 'CZK',
  };
}

// ─── Bookings Digest ─────────────────────────────────────

interface BookingsDigest {
  newBookingsToday: number;
  checkInsToday: { guestName: string; unitName: string; nights: number }[];
  checkOutsToday: { guestName: string; unitName: string; paymentStatus: string }[];
  occupiedUnits: number;
  totalUnits: number;
  occupancyPct: number;
}

function getBookingsDigest(): BookingsDigest {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // New bookings created today
  const newBookings = (db.prepare(`
    SELECT COUNT(*) as cnt FROM reservations
    WHERE date(created_at) = ? AND status NOT IN ('cancelled', 'draft')
  `).get(today) as any).cnt;

  // Check-ins today
  const checkIns = db.prepare(`
    SELECT g.first_name, g.last_name, u.name as unit_name, r.nights
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN units u ON u.id = r.unit_id
    WHERE r.check_in = ? AND r.status IN ('confirmed', 'checked_in')
    ORDER BY u.name
  `).all(today) as any[];

  // Check-outs today
  const checkOuts = db.prepare(`
    SELECT g.first_name, g.last_name, u.name as unit_name, r.payment_status
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN units u ON u.id = r.unit_id
    WHERE r.check_out = ? AND r.status IN ('checked_in', 'checked_out')
    ORDER BY u.name
  `).all(today) as any[];

  // Occupancy — currently checked in
  const occupied = (db.prepare(`
    SELECT COUNT(DISTINCT unit_id) as cnt FROM reservations
    WHERE status = 'checked_in'
  `).get() as any).cnt;

  const totalUnits = (db.prepare(
    `SELECT COUNT(*) as cnt FROM units WHERE is_active = 1`
  ).get() as any)?.cnt || (db.prepare(
    `SELECT COUNT(*) as cnt FROM units`
  ).get() as any).cnt;

  return {
    newBookingsToday: newBookings,
    checkInsToday: checkIns.map((r: any) => ({
      guestName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      unitName: r.unit_name,
      nights: r.nights,
    })),
    checkOutsToday: checkOuts.map((r: any) => ({
      guestName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      unitName: r.unit_name,
      paymentStatus: r.payment_status,
    })),
    occupiedUnits: occupied,
    totalUnits,
    occupancyPct: totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0,
  };
}

// ─── Tasks Summary ───────────────────────────────────────

interface TasksSummary {
  overdue: number;
  today: number;
  inProgress: number;
  total: number;
}

function getTasksSummary(): TasksSummary {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const overdue = (db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks
    WHERE status NOT IN ('done', 'cancelled')
      AND due_date IS NOT NULL AND due_date < ?
  `).get(today) as any).cnt;

  const todayTasks = (db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks
    WHERE status NOT IN ('done', 'cancelled')
      AND due_date = ?
  `).get(today) as any).cnt;

  const inProgress = (db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks
    WHERE status = 'in_progress'
  `).get() as any).cnt;

  const total = (db.prepare(`
    SELECT COUNT(*) as cnt FROM tasks
    WHERE status NOT IN ('done', 'cancelled')
  `).get() as any).cnt;

  return { overdue, today: todayTasks, inProgress, total };
}

// ─── Format & Send ───────────────────────────────────────

function formatDailyDigest(
  crm: CrmDigest,
  finance: FinanceDigest,
  bookings: BookingsDigest,
  tasks: TasksSummary,
): string {
  const today = new Date().toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/Prague',
  });

  const lines: string[] = [
    `📊 <b>Вечірнє зведення</b>`,
    `📅 ${today}`,
    ``,
  ];

  // ── CRM Block ──
  lines.push(`━━━ 📨 <b>CRM</b> ━━━`);
  lines.push(`📩 Нових повідомлень: <b>${crm.newMessagesToday}</b>`);
  if (crm.unansweredLeads.length > 0) {
    lines.push(`⚠️ Без відповіді: <b>${crm.unansweredLeads.length}</b>`);
    for (const lead of crm.unansweredLeads.slice(0, 5)) {
      const preview = lead.lastMessage ? ` — "${escapeHtml(lead.lastMessage)}..."` : '';
      lines.push(`  • ${escapeHtml(lead.name)}${preview}`);
    }
    if (crm.unansweredLeads.length > 5) {
      lines.push(`  <i>...та ще ${crm.unansweredLeads.length - 5}</i>`);
    }
  } else {
    lines.push(`✅ Всі повідомлення мають відповідь`);
  }
  if (crm.pendingDrafts > 0) {
    lines.push(`📝 AI-чернетки на підтвердження: <b>${crm.pendingDrafts}</b>`);
  }
  lines.push(`🔗 <a href="${BASE_URL}/crm">Відкрити CRM →</a>`);
  lines.push(``);

  // ── Finance Block ──
  lines.push(`━━━ 💰 <b>Фінанси</b> ━━━`);
  if (finance.totalIncome > 0) {
    if (finance.cash > 0) lines.push(`  💵 Готівка: <b>${formatAmount(finance.cash)}</b>`);
    if (finance.card > 0) lines.push(`  💳 Картка: <b>${formatAmount(finance.card)}</b>`);
    if (finance.bankTransfer > 0) lines.push(`  🏦 Банк: <b>${formatAmount(finance.bankTransfer)}</b>`);
    if (finance.online > 0) lines.push(`  🌐 Онлайн: <b>${formatAmount(finance.online)}</b>`);
    if (finance.bookingPlatform > 0) lines.push(`  📱 Платформи: <b>${formatAmount(finance.bookingPlatform)}</b>`);
    lines.push(`  📊 <b>Загальний дохід: ${formatAmount(finance.totalIncome)}</b>`);
  } else {
    lines.push(`  Сьогодні надходжень не було`);
  }
  if (finance.totalExpenses > 0) {
    lines.push(`  📉 Витрати: ${formatAmount(finance.totalExpenses)}`);
  }
  lines.push(`🔗 <a href="${BASE_URL}/finance">Відкрити Фінанси →</a>`);
  lines.push(``);

  // ── Bookings Block ──
  lines.push(`━━━ 🏨 <b>Бронювання</b> ━━━`);
  lines.push(`  ✅ Нових бронювань: <b>${bookings.newBookingsToday}</b>`);

  if (bookings.checkInsToday.length > 0) {
    lines.push(`  🔑 Заїзди (${bookings.checkInsToday.length}):`);
    for (const ci of bookings.checkInsToday) {
      lines.push(`    • ${escapeHtml(ci.guestName)} → ${escapeHtml(ci.unitName)} (${ci.nights} н.)`);
    }
  } else {
    lines.push(`  🔑 Заїздів сьогодні немає`);
  }

  if (bookings.checkOutsToday.length > 0) {
    lines.push(`  🚪 Виїзди (${bookings.checkOutsToday.length}):`);
    for (const co of bookings.checkOutsToday) {
      const paid = co.paymentStatus === 'paid' ? '✅' : '⚠️';
      lines.push(`    • ${escapeHtml(co.guestName)} ← ${escapeHtml(co.unitName)} ${paid}`);
    }
  }

  lines.push(`  📈 Зайнятість: <b>${bookings.occupancyPct}%</b> (${bookings.occupiedUnits}/${bookings.totalUnits})`);
  lines.push(`🔗 <a href="${BASE_URL}/bookings">Відкрити Бронювання →</a>`);
  lines.push(``);

  // ── Tasks Block ──
  if (tasks.total > 0) {
    lines.push(`━━━ 📋 <b>Задачі</b> ━━━`);
    if (tasks.overdue > 0) lines.push(`  🔴 Прострочені: <b>${tasks.overdue}</b>`);
    if (tasks.today > 0) lines.push(`  📅 На сьогодні: <b>${tasks.today}</b>`);
    if (tasks.inProgress > 0) lines.push(`  🔄 В роботі: <b>${tasks.inProgress}</b>`);
    lines.push(`  📊 Всього активних: ${tasks.total}`);
    lines.push(`🔗 <a href="${BASE_URL}/tasks">Відкрити Задачі →</a>`);
  }

  return lines.join('\n');
}

// ─── Send to Telegram ────────────────────────────────────

async function sendToChat(chatId: string, text: string): Promise<number | null> {
  if (!BOT_TOKEN) return null;
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
      console.error('[DailyDigest] sendMessage failed:', data.description);
      return null;
    }
    return data.result?.message_id || null;
  } catch (err: any) {
    console.error('[DailyDigest] sendMessage error:', err.message);
    return null;
  }
}

/**
 * Main entry point — collect all data and send digest to Telegram.
 */
export async function sendDailyOperationalDigest(): Promise<{
  sent: boolean;
  sections: { crm: CrmDigest; finance: FinanceDigest; bookings: BookingsDigest; tasks: TasksSummary };
}> {
  const crm = getCrmDigest();
  const finance = getFinanceDigest();
  const bookings = getBookingsDigest();
  const tasks = getTasksSummary();
  const text = formatDailyDigest(crm, finance, bookings, tasks);

  let sent = false;

  // Send to primary chat
  if (CHAT_ID) {
    const msgId = await sendToChat(CHAT_ID, text);
    sent = !!msgId;
  }

  // Send copies to admin chats
  for (const adminId of ADMIN_CHAT_IDS) {
    sendToChat(adminId, text).catch(e =>
      console.error(`[DailyDigest] Admin send to ${adminId} failed:`, e.message)
    );
  }

  console.log(`[DailyDigest] CRM: ${crm.newMessagesToday} msgs, ${crm.unansweredLeads.length} unanswered | Finance: ${finance.totalIncome} ${finance.currency} | Bookings: ${bookings.newBookingsToday} new, ${bookings.occupancyPct}% occ | Tasks: ${tasks.total} active`);

  return { sent, sections: { crm, finance, bookings, tasks } };
}
