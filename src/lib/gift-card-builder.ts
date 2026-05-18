/**
 * GiftCard Builder
 * Використовується в: src/app/api/gift-cards/route.ts
 */

export interface GiftCardTemplate {
  id: string;
  name: string;
  description: string;
  type: 'open_date' | 'package' | 'discount';
  value_type: 'fixed_czk' | 'fixed_eur' | 'percent' | 'nights';
  face_value: number;
  currency: string;
  config_json: Record<string, unknown>;
  emoji: string;
  badge: string;          // напр. "8 500 CZK" або "від €95/ніч"
  validityMonths: number; // стандартний термін дії
}

/**
 * 6 стандартних шаблонів ваучерів для Kemp Carlsbad
 */
export const GIFT_CARD_TEMPLATES: GiftCardTemplate[] = [
  {
    id: 'forest_weekend_gift',
    name: 'ПОДАРУЙ ВІКЕНД В ЛІСІ',
    description: 'Ваучер на будиночок з відкритою датою — ідеально на подарунок. Гість сам обирає зручний час.',
    type: 'open_date',
    value_type: 'fixed_czk',
    face_value: 4900,
    currency: 'CZK',
    emoji: '🌲',
    badge: '~4 900 CZK',
    validityMonths: 12,
    config_json: {
      unit_type: 'tiny',
      nights: 2,
      max_guests: 2,
      days_any: true,
    },
  },
  {
    id: 'couple_vip',
    name: 'БУДИНОЧОК ДЛЯ ДВОХ',
    description: 'VIP ваучер — Романтичний вікенд у лісі: 2 ночі + сесія сауни + чан + сніданки.',
    type: 'package',
    value_type: 'fixed_czk',
    face_value: 8500,
    currency: 'CZK',
    emoji: '💑',
    badge: '8 500 CZK',
    validityMonths: 12,
    config_json: {
      unit_type: 'tiny',
      nights: 2,
      max_guests: 2,
      includes: ['sauna_1session', 'chan_1session', 'breakfast_2days'],
      price_czk: 8500,
    },
  },
  {
    id: 'workcation',
    name: 'ЛІСОВИЙ WORKCATION',
    description: '5 ночей (Нд–Пт) за ціною 4 + 50% знижка на всі сесії сауни. Ідеально для фокусу та продуктивності.',
    type: 'package',
    value_type: 'fixed_eur',
    face_value: 580,
    currency: 'EUR',
    emoji: '💻',
    badge: '580 EUR',
    validityMonths: 12,
    config_json: {
      unit_type: 'tiny',
      nights_paid: 4,
      nights_total: 5,
      days_allowed: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
      sauna_discount_percent: 50,
      original_price_eur: 725,
      discount_eur: 145,
    },
  },
  {
    id: 'birthday_nature',
    name: 'ДЕНЬ НАРОДЖЕННЯ НА ПРИРОДІ',
    description: 'Бронюй будиночок у місяць свого ДН — отримуй сесію сауни безкоштовно + 50% знижку на решту сесій.',
    type: 'discount',
    value_type: 'fixed_eur',
    face_value: 190,
    currency: 'EUR',
    emoji: '🎂',
    badge: '~€190 / 2 ночі',
    validityMonths: 12,
    config_json: {
      condition: 'birthday_month',
      max_nights: 2,
      sauna_included_sessions: 1,
      sauna_discount_percent: 50,
    },
  },
  {
    id: 'one_plus_one_plus_one',
    name: 'АКЦІЯ 1+1+1',
    description: 'Заброньовуй ніч у глемпінгу — друга ніч за 50% + безкоштовна сауна + 50% знижка на решту сесій. Нд–Чт.',
    type: 'discount',
    value_type: 'fixed_eur',
    face_value: 220,
    currency: 'EUR',
    emoji: '🎯',
    badge: '~€220 / 2 ночі',
    validityMonths: 6,
    config_json: {
      days_allowed: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
      second_night_discount_percent: 50,
      sauna_included_sessions: 1,
      sauna_discount_percent: 50,
    },
  },
  {
    id: 'solo_escape',
    name: 'СОЛО-ВТЕЧА В ЛІС',
    description: 'Будиночок для одного. Час виключно для себе. Спеціальний тариф з неділі по четвер.',
    type: 'discount',
    value_type: 'fixed_eur',
    face_value: 95,
    currency: 'EUR',
    emoji: '🧘',
    badge: '~€95/ніч',
    validityMonths: 12,
    config_json: {
      days_allowed: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
      max_guests: 1,
      price_eur_per_night: 95,
    },
  },
];

/**
 * Генерує унікальний код ваучера у форматі LIS-XXXX
 * де XXXX — 4 випадкових буквено-цифрових символи (верхній регістр)
 */
export function buildGiftCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без 0,O,I,1 для читабельності
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `LIS-${suffix}`;
}

/**
 * Повертає шаблон за ID або null
 */
export function getGiftCardTemplate(templateId: string): GiftCardTemplate | null {
  return GIFT_CARD_TEMPLATES.find(t => t.id === templateId) ?? null;
}

/**
 * Розраховує дату закінчення ваучера від поточної дати
 */
export function calcExpiresAt(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}
