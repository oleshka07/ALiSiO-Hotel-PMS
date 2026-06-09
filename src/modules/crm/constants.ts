// CRM shared constants — single source of truth
// Used across Pipeline, Inbox, Leads, Settings pages

/* ================================================================
   Stage Configuration
   ================================================================ */
export const STAGE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  new: { label: 'Новий', icon: '🆕', color: '#6b7280' },
  inquiry: { label: 'Запит', icon: '❓', color: '#8b5cf6' },
  info_needed: { label: 'Уточнення', icon: '📋', color: '#f59e0b' },
  quote_sent: { label: 'Ціна', icon: '💰', color: '#3b82f6' },
  negotiation: { label: 'Переговори', icon: '🤝', color: '#ec4899' },
  deposit_paid: { label: 'Передплата', icon: '💳', color: '#06b6d4' },
  booked: { label: 'Заброньовано', icon: '✅', color: '#22c55e' },
  pre_stay: { label: 'До заїзду', icon: '📋', color: '#14b8a6' },
  check_in: { label: 'Заселення', icon: '🏠', color: '#0ea5e9' },
  in_stay: { label: 'Перебування', icon: '🛏️', color: '#6366f1' },
  check_out: { label: 'Виселення', icon: '👋', color: '#a855f7' },
  post_stay: { label: 'Після', icon: '⭐', color: '#eab308' },
  lost: { label: 'Втрачено', icon: '❌', color: '#ef4444' },
  spam: { label: 'Спам', icon: '🚫', color: '#9ca3af' },
};

// Stages visible on Kanban board (hide lost/spam)
export const KANBAN_STAGES = [
  'new', 'inquiry', 'info_needed', 'quote_sent',
  'negotiation', 'deposit_paid', 'booked', 'pre_stay',
];

/* ================================================================
   Channel Configuration
   ================================================================ */
export const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: '📱', email: '✉️', phone: '📞', guest_page: '🌐',
  telegram: '🤖', booking_com: '🅱️', airbnb: '🏡',
  web_form: '🌍', manual: '✍️',
};

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', email: 'Email', phone: 'Телефон',
  guest_page: 'Guest Page', telegram: 'Telegram', manual: 'Вручну',
};

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Вручну', whatsapp: 'WhatsApp', email: 'Email',
  phone: 'Телефон', booking_com: 'Booking.com', airbnb: 'Airbnb',
  web_form: 'Сайт', guest_page: 'Guest Page', telegram: 'Telegram',
};

/* ================================================================
   Camping / Vehicle / Tent labels
   ================================================================ */
export const VEHICLE_LABELS: Record<string, string> = {
  car: '🚗 Легковий', caravan: '🚐 Караван', motorhome: '🏕️ Кемпер',
  minibus: '🚌 Мінібус', motorcycle: '🏍️ Мотоцикл',
  bicycle: '🚲 Велосипед', none: '🚶 Без транспорту',
};

// Alias for pages that use VEHICLE_ICONS name
export const VEHICLE_ICONS = VEHICLE_LABELS;

export const TENT_LABELS: Record<string, string> = {
  small: 'Маленький', large: 'Великий', none: 'Без намету',
};

/* ================================================================
   Priority labels
   ================================================================ */
export const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: 'Низький', color: '#6b7280' },
  normal: { label: 'Нормальний', color: '#9aa0b0' },
  high: { label: 'Високий', color: '#f59e0b' },
  urgent: { label: 'Терміновий', color: '#ef4444' },
};

/* ================================================================
   Helpers
   ================================================================ */
export function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins}хв`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}год`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}д`;
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatNights(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn), b = new Date(checkOut);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}
