// ─── Public API of the pricing module ────────────────────────────────────────
// Import via: import { ... } from '@pricing'

export { getPricing, updatePricing } from './pricing.handlers';
export { getBulkPricing, updateBulkPricing } from './bulk.handlers';
export { getQuote } from './quote.handlers';

// Not wrapped with withPermission — authenticates via X-Cron-Secret header
// against process.env.CRON_SECRET. Called from a daily VPS crontab.
export { syncPriceLabsFromCron } from './cron-pricelabs-sync.handlers';

// The rate card the public booking widget quotes from: seasons, holidays,
// per-item camping rates, tourist tax, deposit split. Server-side so the bot
// and the widget cannot drift apart on price.
export * from '../domain/rate-card';

export type {
  PriceCalendar,
  DayPrice,
  PriceUpsertInput,
  QuoteResult,
  RatePlan,
  Promotion,
  PromotionType,
} from '../domain/types';
