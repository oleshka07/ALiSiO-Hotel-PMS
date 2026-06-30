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
  yesterdayIncome: number;
  topExpenses: { comment: string; amount: number }[];
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

  const topExp = db.prepare(`
    SELECT comment, amount FROM fin_operations
    WHERE op_type = 'expense' AND status = 'completed'
      AND date(paid_at) = ?
    ORDER BY amount DESC LIMIT 3
  `).all(today) as any[];

  const totalIncome = Object.values(methods).reduce((s, v) => s + v, 0);

  // Yesterday's income for comparison
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const yesterdayRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM fin_operations
    WHERE op_type = 'income' AND status = 'completed'
      AND date(paid_at) = ?
  `).get(yesterdayStr) as any;

  return {
    cash: methods['cash'] || 0,
    card: methods['card'] || 0,
    bankTransfer: methods['bank_transfer'] || 0,
    online: methods['online'] || 0,
    bookingPlatform: methods['booking_platform'] || 0,
    totalIncome,
    totalExpenses: expenseRow?.total || 0,
    yesterdayIncome: yesterdayRow?.total || 0,
    topExpenses: topExp.map((r: any) => ({ comment: r.comment || '', amount: r.amount })),
    currency: 'CZK',
  };
}

// ─── Bookings Digest ─────────────────────────────────────

interface BookingsDigest {
  newBookingsToday: number;
  checkInsToday: { guestName: string; unitName: string; nights: number; categoryType: string }[];
  checkOutsToday: { guestName: string; unitName: string; paymentStatus: string }[];
  checkInsTomorrow: { guestName: string; unitName: string; nights: number; categoryType: string }[];
  unpaidToday: number;
  sourceBreakdown: { source: string; count: number }[];
  categoryCheckIns: { category: string; count: number }[];
  categoryCheckInsTomorrow: { category: string; count: number }[];
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

  // Check-ins today (with category)
  const checkIns = db.prepare(`
    SELECT g.first_name, g.last_name, u.name as unit_name, r.nights,
           COALESCE(c.name, c.type, 'інше') as category_name
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN units u ON u.id = r.unit_id
    LEFT JOIN categories c ON c.id = u.category_id
    WHERE r.check_in = ? AND r.status IN ('confirmed', 'checked_in')
    ORDER BY category_name, u.name
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

  // Tomorrow's check-ins
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const checkInsTmrw = db.prepare(`
    SELECT g.first_name, g.last_name, u.name as unit_name, r.nights,
           COALESCE(c.name, c.type, 'інше') as category_name
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN units u ON u.id = r.unit_id
    LEFT JOIN categories c ON c.id = u.category_id
    WHERE r.check_in = ? AND r.status IN ('confirmed', 'checked_in')
    ORDER BY category_name, u.name
  `).all(tomorrowStr) as any[];

  // Unpaid bookings currently in-house or arriving today
  const unpaidRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM reservations
    WHERE check_in <= ? AND check_out > ?
      AND status NOT IN ('cancelled', 'no_show', 'draft')
      AND payment_status != 'paid'
  `).get(today, today) as any;

  // Today's new bookings by source
  const sourceRows = db.prepare(`
    SELECT COALESCE(source, 'direct') as source, COUNT(*) as cnt
    FROM reservations
    WHERE date(created_at) = ? AND status NOT IN ('cancelled', 'draft')
    GROUP BY source ORDER BY cnt DESC
  `).all(today) as any[];

  // Occupancy — all active bookings covering tonight (exclude pool units)
  const occupied = (db.prepare(`
    SELECT COUNT(DISTINCT r.unit_id) as cnt FROM reservations r
    JOIN units u ON u.id = r.unit_id
    WHERE r.check_in <= ? AND r.check_out > ?
      AND r.status NOT IN ('cancelled', 'no_show', 'draft')
      AND u.is_pool = 0
  `).get(today, today) as any).cnt;

  const totalUnits = (db.prepare(
    `SELECT COUNT(*) as cnt FROM units WHERE is_active = 1 AND is_pool = 0`
  ).get() as any)?.cnt || (db.prepare(
    `SELECT COUNT(*) as cnt FROM units WHERE is_pool = 0`
  ).get() as any).cnt;

  // Group check-ins by category
  const catGroupToday: Record<string, number> = {};
  for (const ci of checkIns) {
    const cat = ci.category_name || 'інше';
    catGroupToday[cat] = (catGroupToday[cat] || 0) + 1;
  }
  const catGroupTmrw: Record<string, number> = {};
  for (const ci of checkInsTmrw) {
    const cat = ci.category_name || 'інше';
    catGroupTmrw[cat] = (catGroupTmrw[cat] || 0) + 1;
  }

  return {
    newBookingsToday: newBookings,
    checkInsToday: checkIns.map((r: any) => ({
      guestName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      unitName: r.unit_name,
      nights: r.nights,
      categoryType: r.category_name || 'інше',
    })),
    checkOutsToday: checkOuts.map((r: any) => ({
      guestName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      unitName: r.unit_name,
      paymentStatus: r.payment_status,
    })),
    checkInsTomorrow: checkInsTmrw.map((r: any) => ({
      guestName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      unitName: r.unit_name,
      nights: r.nights,
      categoryType: r.category_name || 'інше',
    })),
    unpaidToday: unpaidRow?.cnt || 0,
    sourceBreakdown: sourceRows.map((r: any) => ({ source: r.source, count: r.cnt })),
    categoryCheckIns: Object.entries(catGroupToday).map(([category, count]) => ({ category, count })),
    categoryCheckInsTomorrow: Object.entries(catGroupTmrw).map(([category, count]) => ({ category, count })),
    occupiedUnits: occupied,
    totalUnits,
    occupancyPct: totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0,
  };
}

// ─── Tasks Summary ───────────────────────────────────────

interface TasksSummary {
  overdue: number;
  overdueNames: string[];
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

  const overdueList = db.prepare(`
    SELECT title FROM tasks
    WHERE status NOT IN ('done', 'cancelled')
      AND due_date IS NOT NULL AND due_date < ?
    ORDER BY due_date ASC LIMIT 3
  `).all(today) as any[];

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

  return { overdue, overdueNames: overdueList.map((t: any) => t.title || ''), today: todayTasks, inProgress, total };
}

// ─── Detailed Property/BU Breakdown ──────────────────────

interface BuBreakdown {
  buId: string;
  buName: string;
  checkIns: { guestName: string; unitName: string; nights: number }[];
  cash: number;
  card: number;
  other: number;
  totalIncome: number;
  cashExpenses: number;
  expenseDetails: { comment: string; amount: number }[];
}

function getDetailedBreakdown(): BuBreakdown[] {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Get active business units
  const bus = db.prepare(`
    SELECT id, name FROM business_units
    WHERE is_active = 1 AND is_shared = 0
    ORDER BY sort_order
  `).all() as any[];

  // For each BU, collect income by method and expenses
  const result: BuBreakdown[] = [];

  for (const bu of bus) {
    // Income by method for this BU
    const incomeRows = db.prepare(`
      SELECT method, SUM(amount) as total
      FROM fin_operations
      WHERE project_id = ? AND op_type = 'income' AND status = 'completed'
        AND date(paid_at) = ?
      GROUP BY method
    `).all(bu.id, today) as any[];

    const methods: Record<string, number> = {};
    for (const r of incomeRows) methods[r.method || 'other'] = r.total;

    // Cash expenses for this BU
    const expenseRows = db.prepare(`
      SELECT amount, comment
      FROM fin_operations
      WHERE project_id = ? AND op_type = 'expense' AND status = 'completed'
        AND date(paid_at) = ? AND (method = 'cash' OR method IS NULL)
    `).all(bu.id, today) as any[];

    const cashExpenses = expenseRows.reduce((s: number, r: any) => s + r.amount, 0);

    // Check-ins: match BU name to category/property
    // BU maps: Глемпинг→glamping, Кемпинг→camping, Будова F/D→resort, etc.
    // Use unit category type + reservation check-in
    let checkIns: any[] = [];
    const buNameLower = bu.name.toLowerCase();
    
    if (buNameLower.includes('глемп') || buNameLower.includes('glamping')) {
      checkIns = db.prepare(`
        SELECT g.first_name, g.last_name, u.name as unit_name, r.nights
        FROM reservations r
        JOIN units u ON u.id = r.unit_id
        JOIN categories c ON c.id = u.category_id
        JOIN guests g ON g.id = r.guest_id
        WHERE r.check_in = ? AND r.status IN ('confirmed','checked_in')
          AND c.type = 'glamping'
        ORDER BY u.name
      `).all(today) as any[];
    } else if (buNameLower.includes('кемп') || buNameLower.includes('camping') || buNameLower.includes('палатк') || buNameLower.includes('караван')) {
      checkIns = db.prepare(`
        SELECT g.first_name, g.last_name, u.name as unit_name, r.nights
        FROM reservations r
        JOIN units u ON u.id = r.unit_id
        JOIN categories c ON c.id = u.category_id
        JOIN guests g ON g.id = r.guest_id
        WHERE r.check_in = ? AND r.status IN ('confirmed','checked_in')
          AND c.type = 'camping'
        ORDER BY u.name
      `).all(today) as any[];
    } else if (buNameLower.includes('будов') || buNameLower.includes('resort') || buNameLower.includes('готел')) {
      checkIns = db.prepare(`
        SELECT g.first_name, g.last_name, u.name as unit_name, r.nights
        FROM reservations r
        JOIN units u ON u.id = r.unit_id
        JOIN categories c ON c.id = u.category_id
        JOIN guests g ON g.id = r.guest_id
        WHERE r.check_in = ? AND r.status IN ('confirmed','checked_in')
          AND c.type = 'resort'
        ORDER BY u.name
      `).all(today) as any[];
    }

    const totalIncome = Object.values(methods).reduce((s, v) => s + v, 0);

    // Only include BU if it has any activity today
    if (totalIncome > 0 || cashExpenses > 0 || checkIns.length > 0) {
      result.push({
        buId: bu.id,
        buName: bu.name,
        checkIns: checkIns.map(r => ({
          guestName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          unitName: r.unit_name,
          nights: r.nights,
        })),
        cash: methods['cash'] || 0,
        card: methods['card'] || 0,
        other: totalIncome - (methods['cash'] || 0) - (methods['card'] || 0),
        totalIncome,
        cashExpenses,
        expenseDetails: expenseRows.map((r: any) => ({
          comment: r.comment || '',
          amount: r.amount,
        })),
      });
    }
  }

  return result;
}

function formatDetailedDigest(breakdown: BuBreakdown[]): string {
  const todayStr = new Date().toLocaleDateString('uk-UA', {
    day: '2-digit', month: '2-digit',
    timeZone: 'Europe/Prague',
  });

  const lines: string[] = [
    `📋 <b>${todayStr}</b>`,
    ``,
  ];

  for (const bu of breakdown) {
    lines.push(`<b>${escapeHtml(bu.buName)}</b>`);

    // Check-ins
    if (bu.checkIns.length > 0) {
      lines.push(`🔑 ${bu.checkIns.length} поселен${bu.checkIns.length === 1 ? 'ня' : 'ь'}`);
      for (const ci of bu.checkIns) {
        lines.push(`  • ${escapeHtml(ci.unitName)} — ${escapeHtml(ci.guestName)}`);
      }
    }

    // Income: cash / card
    const incomeParts: string[] = [];
    if (bu.cash > 0) incomeParts.push(`💵 ${formatAmount(bu.cash)} нал.`);
    if (bu.card > 0) incomeParts.push(`💳 ${formatAmount(bu.card)} картка`);
    if (bu.other > 0) incomeParts.push(`🌐 ${formatAmount(bu.other)} інше`);

    if (incomeParts.length > 0) {
      lines.push(incomeParts.join(' / '));
    } else if (bu.checkIns.length === 0) {
      // no income, no check-ins — skip income line
    }

    // Cash expenses
    if (bu.cashExpenses > 0) {
      lines.push(`📉 Витрати: ${formatAmount(bu.cashExpenses)}`);
      for (const exp of bu.expenseDetails) {
        if (exp.comment) {
          lines.push(`  • ${formatAmount(exp.amount)} — ${escapeHtml(exp.comment)}`);
        }
      }
    }

    lines.push(``);
  }

  if (breakdown.length === 0) {
    lines.push(`<i>Сьогодні немає активності по об'єктах</i>`);
  }

  return lines.join('\n');
}

// ─── Format & Send ───────────────────────────────────────

function formatDailyDigest(
  crm: CrmDigest,
  finance: FinanceDigest,
  bookings: BookingsDigest,
  tasks: TasksSummary,
  breakdown: BuBreakdown[],
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
      // Calculate wait time
      let waitLabel = '';
      if (lead.waitingSince) {
        const diffMs = Date.now() - new Date(lead.waitingSince).getTime();
        const diffH = Math.floor(diffMs / 3600000);
        const diffD = Math.floor(diffH / 24);
        waitLabel = diffD > 0 ? ` (${diffD} дн.)` : diffH > 0 ? ` (${diffH} год.)` : ' (щойно)';
      }
      const preview = lead.lastMessage ? ` — "${escapeHtml(lead.lastMessage)}..."` : '';
      lines.push(`  • ${escapeHtml(lead.name)}${waitLabel}${preview}`);
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
  lines.push(`🔗 <a href="${BASE_URL}/crm/inbox">Відкрити CRM →</a>`);
  lines.push(``);

  // ── Finance Block ──
  lines.push(`━━━ 💰 <b>Фінанси</b> ━━━`);
  if (finance.totalIncome > 0) {
    if (finance.cash > 0) lines.push(`  💵 Готівка: <b>${formatAmount(finance.cash)}</b>`);
    if (finance.card > 0) lines.push(`  💳 Картка: <b>${formatAmount(finance.card)}</b>`);
    if (finance.bankTransfer > 0) lines.push(`  🏦 Банк: <b>${formatAmount(finance.bankTransfer)}</b>`);
    if (finance.online > 0) lines.push(`  🌐 Онлайн: <b>${formatAmount(finance.online)}</b>`);
    if (finance.bookingPlatform > 0) lines.push(`  📱 Платформи: <b>${formatAmount(finance.bookingPlatform)}</b>`);
    let incomeLabel = `  📊 <b>Загальний дохід: ${formatAmount(finance.totalIncome)}</b>`;
    if (finance.yesterdayIncome > 0) {
      const diff = finance.totalIncome - finance.yesterdayIncome;
      const pct = Math.round((diff / finance.yesterdayIncome) * 100);
      const arrow = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
      incomeLabel += ` ${arrow} ${pct > 0 ? '+' : ''}${pct}% vs вчора`;
    }
    lines.push(incomeLabel);
  } else {
    lines.push(`  Сьогодні надходжень не було`);
  }
  if (finance.totalExpenses > 0) {
    lines.push(`  📉 Витрати: ${formatAmount(finance.totalExpenses)}`);
    if (finance.topExpenses.length > 0) {
      for (const exp of finance.topExpenses) {
        if (exp.comment) lines.push(`    • ${formatAmount(exp.amount)} — ${escapeHtml(exp.comment)}`);
      }
    }
  }
  lines.push(`🔗 <a href="${BASE_URL}/finance">Відкрити Фінанси →</a>`);

  // ── Per-BU Income Breakdown ──
  if (breakdown.length > 0) {
    lines.push(``);
    for (const bu of breakdown) {
      const parts: string[] = [];
      if (bu.cash > 0) parts.push(`💵 ${formatAmount(bu.cash)} нал.`);
      if (bu.card > 0) parts.push(`💳 ${formatAmount(bu.card)} картка`);
      if (bu.other > 0) parts.push(`🌐 ${formatAmount(bu.other)} інше`);
      if (parts.length > 0) {
        lines.push(`<b>${escapeHtml(bu.buName)}</b>`);
        lines.push(`  ${parts.join(' / ')}`);
        if (bu.cashExpenses > 0) {
          lines.push(`  📉 Витрати: ${formatAmount(bu.cashExpenses)}`);
          for (const exp of bu.expenseDetails) {
            if (exp.comment) lines.push(`    • ${formatAmount(exp.amount)} — ${escapeHtml(exp.comment)}`);
          }
        }
      }
    }
  }
  lines.push(``);

  // ── Bookings Block ──
  lines.push(`━━━ 🏨 <b>Бронювання</b> ━━━`);
  lines.push(`  ✅ Нових бронювань: <b>${bookings.newBookingsToday}</b>`);

  if (bookings.categoryCheckIns.length > 0) {
    lines.push(`  🔑 Заїзди (${bookings.checkInsToday.length}):`);
    for (const cat of bookings.categoryCheckIns) {
      lines.push(`    • ${escapeHtml(cat.category)} — ${cat.count}`);
    }
  } else {
    lines.push(`  🔑 Заїздів сьогодні немає`);
  }

  if (bookings.checkOutsToday.length > 0) {
    const unpaidOuts = bookings.checkOutsToday.filter(co => co.paymentStatus !== 'paid');
    if (unpaidOuts.length > 0) {
      lines.push(`  🚪 Виїзди (${bookings.checkOutsToday.length}), ⚠️ неоплачених: ${unpaidOuts.length}`);
      for (const co of unpaidOuts) {
        lines.push(`    • ${escapeHtml(co.guestName)} ← ${escapeHtml(co.unitName)} ⚠️`);
      }
    } else {
      lines.push(`  🚪 Виїзди (${bookings.checkOutsToday.length}) — всі оплачені ✅`);
    }
  }

  if (bookings.categoryCheckInsTomorrow.length > 0) {
    lines.push(`  📅 Завтра заїзди (${bookings.checkInsTomorrow.length}):`);
    for (const cat of bookings.categoryCheckInsTomorrow) {
      lines.push(`    • ${escapeHtml(cat.category)} — ${cat.count}`);
    }
  }

  lines.push(`  📈 Зайнятість: <b>${bookings.occupancyPct}%</b> (${bookings.occupiedUnits}/${bookings.totalUnits})`);

  if (bookings.unpaidToday > 0) {
    lines.push(`  ⚠️ Неоплачених бронювань: <b>${bookings.unpaidToday}</b>`);
  }
  if (bookings.sourceBreakdown.length > 0) {
    const srcParts = bookings.sourceBreakdown.map(s => `${s.source}: ${s.count}`).join(', ');
    lines.push(`  📋 Джерела: ${srcParts}`);
  }
  lines.push(`🔗 <a href="${BASE_URL}/calendar">Відкрити Календар →</a>`);
  lines.push(``);

  // ── Tasks Block ──
  if (tasks.total > 0) {
    lines.push(`━━━ 📋 <b>Задачі</b> ━━━`);
    if (tasks.overdue > 0) {
      const names = tasks.overdueNames.length > 0 ? ` — ${tasks.overdueNames.map(n => `"${escapeHtml(n)}"`).join(', ')}` : '';
      lines.push(`  🔴 Прострочені: <b>${tasks.overdue}</b>${names}`);
    }
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
 * Sends TWO messages:
 * 1. General digest (CRM, Finance totals, Bookings, Tasks)
 * 2. Detailed per-property/BU breakdown (check-ins, cash/card, expenses)
 */
export async function sendDailyOperationalDigest(): Promise<{
  sent: boolean;
  sections: { crm: CrmDigest; finance: FinanceDigest; bookings: BookingsDigest; tasks: TasksSummary };
}> {
  const crm = getCrmDigest();
  const finance = getFinanceDigest();
  const bookings = getBookingsDigest();
  const tasks = getTasksSummary();
  const breakdown = getDetailedBreakdown();
  const text = formatDailyDigest(crm, finance, bookings, tasks, breakdown);
  const detailedText = formatDetailedDigest(breakdown);

  let sent = false;

  // Send to primary chat — message 1 (general) + message 2 (detailed)
  if (CHAT_ID) {
    const msgId = await sendToChat(CHAT_ID, text);
    sent = !!msgId;
    if (breakdown.length > 0) {
      await sendToChat(CHAT_ID, detailedText);
    }
  }

  // Send copies to admin chats
  for (const adminId of ADMIN_CHAT_IDS) {
    sendToChat(adminId, text).catch(e =>
      console.error(`[DailyDigest] Admin send to ${adminId} failed:`, e.message)
    );
    if (breakdown.length > 0) {
      sendToChat(adminId, detailedText).catch(e =>
        console.error(`[DailyDigest] Admin detailed to ${adminId} failed:`, e.message)
      );
    }
  }

  console.log(`[DailyDigest] CRM: ${crm.newMessagesToday} msgs, ${crm.unansweredLeads.length} unanswered | Finance: ${finance.totalIncome} ${finance.currency} | Bookings: ${bookings.newBookingsToday} new, ${bookings.occupancyPct}% occ | Tasks: ${tasks.total} active | BU breakdown: ${breakdown.length} units`);

  return { sent, sections: { crm, finance, bookings, tasks } };
}
