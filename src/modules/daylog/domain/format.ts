import type { ParsedEntry } from './parse-entry';
import type { DaylogSummary } from '../data/daylog.repo';

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
export function formatConfirmation(entries: ParsedEntry[]): string {
  if (!entries.length) return '🤔 Не зрозумів повідомлення. Напиши коротко: що прийняв/витратив і скільки.';
  const lines = entries.map((e) => {
    const icon = DIR_ICON[e.direction] || '❔';
    const amt = e.amount != null && e.currency ? `${Math.round(e.amount).toLocaleString('uk-UA')} ${e.currency}` : '—';
    const bits = [e.category, amt];
    if (e.items.length) bits.push(e.items.map((i) => `${i.qty}× ${i.name}`).join(', '));
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
