import type { ParsedEntry } from './parse-entry';
import type { DaylogSummary } from '../data/daylog.repo';
import type { DayReconcile } from '../data/reconcile';

const DIR_ICON: Record<string, string> = { income: '💰', expense: '💸', unknown: '❔' };

const CURRENCY_ORDER = ['CZK', 'EUR'];

function money(map: Record<string, number>): string {
  const parts = Object.entries(map)
    .filter(([, v]) => Math.round(v) !== 0)
    .sort(([a], [b]) => {
      const ia = CURRENCY_ORDER.indexOf(a), ib = CURRENCY_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    })
    .map(([cur, v], i) => {
      const n = Math.round(v);
      const abs = Math.abs(n).toLocaleString('uk-UA');
      if (i === 0) return `${n < 0 ? '−' : ''}${abs} ${cur}`;
      return `${n < 0 ? '− ' : '+ '}${abs} ${cur}`;
    });
  if (!parts.length) return '0';
  return parts.reduce((acc, p, i) => (i === 0 ? p : `${acc} ${p}`), '');
}

/** Reply sent right after a message is logged, so Andrey can spot mistakes. */
export function formatConfirmation(entries: ParsedEntry[], mention?: string): string {
  if (!entries.length) {
    return `${mention ? mention + ' ' : ''}🤔 Не зрозумів повідомлення. Напиши коротко: що прийняв/витратив і скільки. Можеш відповісти на це повідомлення.`;
  }
  const lines = entries.map((e) => {
    const icon = DIR_ICON[e.direction] || '❔';
    // Show the amount even when the currency is missing — hiding it made a
    // correctly-heard "700" look like nothing was captured.
    const amt = e.amount != null
      ? `${Math.round(e.amount).toLocaleString('uk-UA')}${e.currency ? ` ${e.currency}` : ''}`
      : '—';
    // Show category › project so it is visible at a glance whether both were
    // assigned — an unassigned one shows as «?» instead of silently missing.
    const head = `${e.category}${e.project ? ` › ${e.project}` : ' › ❓проєкт'}`;
    const bits = [head, amt];
    if (e.items.length) bits.push(e.items.map((i) => `${i.qty}× ${i.name}`).join(', '));
    const qty = [
      e.qty_guests ? `${e.qty_guests} ос.` : null,
      e.qty_nights ? `${e.qty_nights} ноч.` : null,
    ].filter(Boolean).join(' × ');
    if (qty) bits.push(qty);
    if (e.counterparty) bits.push(e.counterparty);
    if (e.payment_method === 'card') bits.push('картою');
    if (e.payment_method === 'cash') bits.push('готівка');
    if (e.needs_review) {
      const q = e.review_reason === 'Не вказано суму' ? 'скільки?' : (e.review_reason || 'уточни');
      return `❓ ${icon} ${bits.join(' · ')} — ${q}`;
    }
    return `✅ ${icon} ${bits.join(' · ')}`;
  });

  // Tag the author only when something actually needs them, and tell them the
  // reply is what resolves it.
  if (entries.some((e) => e.needs_review)) {
    lines.push(`\n${mention ? mention + ' — ' : ''}відповідь на це повідомлення допише, чого бракує.`);
  }
  return lines.join('\n');
}

/** HTML mention that works even for users without a @username. */
export function mentionUser(userId: string | null, name: string | null, username: string | null): string {
  if (username) return `@${username}`;
  if (userId) return `<a href="tg://user?id=${userId}">${escapeHtml(name || 'колего')}</a>`;
  return '';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Evening cross-check block appended to the daily report. */
export function formatReconcile(r: DayReconcile): string {
  const n = (v: number) => Math.round(v).toLocaleString('uk-UA');
  const out: string[] = ['\n━━━━━━━━━━━━━━', '🔍 <b>Звірка джерел</b>'];

  // Where the money was recorded, channel by channel.
  out.push('\n📥 <b>Зафіксовано доходу</b>');
  out.push(`  📱 Журнал Telegram: ${n(r.daylog.income)} CZK`);
  for (const s of r.sources) {
    if (!s.count) continue;
    const parts = [`${n(s.income)} CZK`];
    if (s.expense) parts.push(`витрати ${n(s.expense)}`);
    out.push(`  🏦 ${s.label}: ${parts.join(' · ')} (${s.count})`);
  }
  out.push(`  <b>Разом у PMS: ${n(r.pmsIncome)} CZK</b>`);

  out.push('\n💳 <b>Спосіб оплати</b>');
  out.push(`  Карта: журнал ${n(r.daylog.card)} · PMS ${n(r.pmsCard)} CZK ${okMark(r.daylog.card - r.pmsCard)}`);
  out.push(`  Готівка: журнал ${n(r.daylog.cash)} · PMS ${n(r.pmsCash)} CZK ${okMark(r.daylog.cash - r.pmsCash)}`);

  out.push('\n🛎 <b>Календар</b>');
  out.push(`  Заїзди сьогодні: ${r.bookings.arrivalsToday} — оплачено ${r.bookings.paid}, без оплати ${r.bookings.unpaid}`);
  out.push(`  Записів про проживання в журналі: ${r.loggedLodging}`);
  if (r.bookings.createdToday) out.push(`  Нових броней створено сьогодні: ${r.bookings.createdToday}`);

  if (r.bookings.unpaid) {
    out.push(`  💰 Очікується до оплати: ${n(r.bookings.expectedUnpaidTotal)} CZK`);
    for (const a of r.bookings.unpaidList.slice(0, 10)) {
      out.push(`     • ${a.guest || 'без імені'}${a.unit ? ` — ${a.unit}` : ''} — ${n(a.total_price)} ${a.currency}`);
    }
    if (r.bookings.unpaidList.length > 10) out.push(`     …ще ${r.bookings.unpaidList.length - 10}`);
  }

  if (r.issues.length) {
    out.push('\n❗️ <b>Не сходиться</b>');
    for (const i of r.issues) out.push(`  • ${i}`);
  } else {
    out.push('\n✅ Все сходиться.');
  }

  return out.join('\n');
}

function okMark(diff: number): string {
  return Math.abs(diff) < 1 ? '✅' : '⚠️';
}

/** Shown instead of silence when the cross-check itself fails. */
export function formatReconcileError(message: string): string {
  return `\n━━━━━━━━━━━━━━\n🔍 <b>Звірка джерел</b>\n  ⚠️ Не вдалося звірити: ${message}`;
}

/** End-of-day summary report. */
export function formatDailyReport(s: DaylogSummary): string {
  const d = s.date.split('-').reverse().join('.');
  const out: string[] = [`📊 <b>Звіт за ${d}</b>`];

  if (!s.count) { out.push('\nЗаписів немає.'); return out.join('\n'); }

  const incomeCats = Object.keys(s.income);
  if (incomeCats.length) {
    out.push('\n💰 <b>Дохід</b>');
    for (const cat of incomeCats) out.push(`  ${cat}: ${money(s.income[cat])}`);
    out.push(`  <b>Разом: ${money(s.totals.income)}</b>`);
  }

  const expenseCats = Object.keys(s.expense);
  if (expenseCats.length) {
    out.push('\n💸 <b>Витрати</b>');
    for (const cat of expenseCats) out.push(`  ${cat}: ${money(s.expense[cat])}`);
    out.push(`  <b>Разом: ${money(s.totals.expense)}</b>`);
  }

  if (Object.keys(s.cash).length || Object.keys(s.card).length) {
    out.push('\n💵 <b>Баланс дня</b>');
    if (Object.keys(s.cash).length) out.push(`  Готівка: ${money(s.cash)}`);
    if (Object.keys(s.card).length) out.push(`  Карта: ${money(s.card)}`);
  }

  const projects = Object.keys(s.byProject);
  if (projects.length) {
    out.push('\n🏷 <b>За напрямками</b>');
    for (const p of projects) out.push(`  ${p}: ${money(s.byProject[p])}`);
  }

  const bar = Object.entries(s.barItems).sort((a, b) => b[1] - a[1]);
  if (bar.length) {
    out.push('\n🍺 <b>Бар — продано</b>');
    for (const [name, qty] of bar.slice(0, 15)) out.push(`  ${name}: ${qty}`);
    if (bar.length > 15) out.push(`  …ще ${bar.length - 15} позицій`);
  }

  out.push(`\n🧾 Записів: ${s.count}`);
  if (s.unmapped) out.push(`🏷 Без категорії: ${s.unmapped}`);
  if (s.needsReview) {
    out.push(`⚠️ Потребують уточнення: ${s.needsReview}`);
    for (const r of s.reviewItems) out.push(`   • ${r.category}: ${r.description} — ${r.reason || 'уточни'}`);
  }
  return out.join('\n');
}
