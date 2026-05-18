// ─── Booking Widget Date & Price Utilities ───
import type { BookingLang } from './translations';

export function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

export function formatDisplayDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatFullDate(s: string, lang: BookingLang): string {
  const d = parseDate(s);
  const locales: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', cs: 'cs-CZ', de: 'de-DE' };
  return d.toLocaleDateString(locales[lang] || 'uk-UA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatPrice(n: number, currency: string = 'Kč'): string {
  const formatted = new Intl.NumberFormat('cs-CZ').format(n).replace(',', ' ');
  return `${formatted} ${currency}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
