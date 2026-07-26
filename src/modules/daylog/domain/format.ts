import type { ParsedEntry } from './parse-entry';
import type { DaylogSummary } from '../data/daylog.repo';

const DIR_ICON: Record<string, string> = { income: '💰', expense: '💸', unknown: '❔' };

function money(map: Record<string, number>): string {
  const parts = Object.entries(map)
    .filter(([, v]) => v !== 0)
    .map(([cur, v]) => `${Math.round(v).toLocaleString('uk-UA')} ${cur}`);
  return parts.length ? parts.join(' + ') : '0';
}

/** Reply sent right after a message is logged, so Andrey can spot mistakes. */
export function formatConfirmation(entries: ParsedEntry[]): string {
  if (!entries.length) return '🤔 Не зрозумів повідомлення. Напиши коротко: що прийняв/витратив і скільки.';
  const lines = entries.map((e) => {
    const icon = DIR_ICON[e.direction] || '❔';
    const amt = e.amount != null && e.currency ? `${Math.round(e.amount).toLocaleString('uk-UA')} ${e.currency}` : '—';
    const bits = [e.category, amt];
    if (e.counterparty) bits.push(e.counterparty);
    if (e.payment_method === 'card') bits.push('картою');
    if (e.payment_method === 'cash') bits.push('готівка');
    if (e.needs_review) {
      const q = e.review_reason === 'Не вказано суму' ? 'скільки?' : (e.review_reason || 'уточни');
      return `❓ ${icon} ${bits.join(' · ')} — ${q}`;
    }
    return `✅ ${icon} ${bits.join(' · ')}`;
  });
  return lines.join('\n');
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

  out.push(`\n🧾 Записів: ${s.count}`);
  if (s.needsReview) {
    out.push(`⚠️ Потребують уточнення: ${s.needsReview}`);
    for (const r of s.reviewItems) out.push(`   • ${r.category}: ${r.description} — ${r.reason || 'уточни'}`);
  }
  return out.join('\n');
}
