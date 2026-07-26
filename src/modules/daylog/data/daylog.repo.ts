import { getDb } from '@core/db';
import crypto from 'crypto';
import type { ParsedEntry } from '../domain/parse-entry';

export interface DaylogInsert extends ParsedEntry {
  entry_date: string;
  chat_id: string | null;
  telegram_message_id: number | null;
  author: string | null;
  input_type: 'text' | 'voice' | 'photo';
  raw_text: string | null;
  media_file_id: string | null;
  media_path: string | null;
  parsed_json: string;
}

export interface DaylogRow extends DaylogInsert { id: string; created_at: string; corrected: number }

export function insertEntry(e: DaylogInsert): string {
  const db = getDb();
  const id = 'dl_' + crypto.randomBytes(10).toString('hex');
  db.prepare(`
    INSERT INTO daylog_entries (
      id, entry_date, chat_id, telegram_message_id, author, input_type, raw_text,
      media_file_id, media_path, direction, category, amount, currency,
      qty_guests, qty_nights, payment_method, counterparty, description,
      needs_review, review_reason, confidence, parsed_json
    ) VALUES (
      @id, @entry_date, @chat_id, @telegram_message_id, @author, @input_type, @raw_text,
      @media_file_id, @media_path, @direction, @category, @amount, @currency,
      @qty_guests, @qty_nights, @payment_method, @counterparty, @description,
      @needs_review, @review_reason, @confidence, @parsed_json
    )
  `).run({
    id,
    entry_date: e.entry_date,
    chat_id: e.chat_id,
    telegram_message_id: e.telegram_message_id,
    author: e.author,
    input_type: e.input_type,
    raw_text: e.raw_text,
    media_file_id: e.media_file_id,
    media_path: e.media_path,
    direction: e.direction,
    category: e.category,
    amount: e.amount,
    currency: e.currency,
    qty_guests: e.qty_guests,
    qty_nights: e.qty_nights,
    payment_method: e.payment_method,
    counterparty: e.counterparty,
    description: e.description,
    needs_review: e.needs_review ? 1 : 0,
    review_reason: e.review_reason,
    confidence: e.confidence,
    parsed_json: e.parsed_json,
  });
  return id;
}

export function listByDate(date: string): DaylogRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM daylog_entries WHERE entry_date = ? ORDER BY created_at').all(date) as DaylogRow[];
}

export interface DaylogSummary {
  date: string;
  count: number;
  needsReview: number;
  income: Record<string, Record<string, number>>;   // category -> currency -> sum
  expense: Record<string, Record<string, number>>;
  totals: { income: Record<string, number>; expense: Record<string, number> };
  cash: Record<string, number>;
  card: Record<string, number>;
  reviewItems: Array<{ category: string; description: string; reason: string | null }>;
}

export function summarizeDate(date: string): DaylogSummary {
  const rows = listByDate(date);
  const s: DaylogSummary = {
    date, count: rows.length, needsReview: 0,
    income: {}, expense: {}, totals: { income: {}, expense: {} },
    cash: {}, card: {}, reviewItems: [],
  };
  for (const r of rows) {
    if (r.needs_review) {
      s.needsReview++;
      s.reviewItems.push({ category: r.category, description: r.description || r.raw_text || '', reason: r.review_reason });
    }
    if (r.amount == null || !r.currency) continue;
    const bucket = r.direction === 'expense' ? s.expense : (r.direction === 'income' ? s.income : null);
    if (!bucket) continue;
    bucket[r.category] = bucket[r.category] || {};
    bucket[r.category][r.currency] = (bucket[r.category][r.currency] || 0) + r.amount;

    const totBucket = r.direction === 'expense' ? s.totals.expense : s.totals.income;
    totBucket[r.currency] = (totBucket[r.currency] || 0) + r.amount;

    const signed = r.direction === 'expense' ? -r.amount : r.amount;
    if (r.payment_method === 'cash') s.cash[r.currency] = (s.cash[r.currency] || 0) + signed;
    else if (r.payment_method === 'card') s.card[r.currency] = (s.card[r.currency] || 0) + signed;
  }
  return s;
}
