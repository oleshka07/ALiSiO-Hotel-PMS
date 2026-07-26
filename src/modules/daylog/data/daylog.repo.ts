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

export interface DaylogRow extends DaylogInsert {
  id: string;
  created_at: string;
  corrected: number;
  items_json: string | null;
  question_message_id: number | null;
  asked_user_id: string | null;
  asked_user_name: string | null;
}

export function insertEntry(e: DaylogInsert): string {
  const db = getDb();
  const id = 'dl_' + crypto.randomBytes(10).toString('hex');
  db.prepare(`
    INSERT INTO daylog_entries (
      id, entry_date, chat_id, telegram_message_id, author, input_type, raw_text,
      media_file_id, media_path, direction, category, category_id, project_id,
      counterparty_id, amount, currency,
      qty_guests, qty_nights, payment_method, counterparty, items_json, description,
      needs_review, review_reason, confidence, parsed_json
    ) VALUES (
      @id, @entry_date, @chat_id, @telegram_message_id, @author, @input_type, @raw_text,
      @media_file_id, @media_path, @direction, @category, @category_id, @project_id,
      @counterparty_id, @amount, @currency,
      @qty_guests, @qty_nights, @payment_method, @counterparty, @items_json, @description,
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
    category_id: e.category_id,
    project_id: e.project_id,
    counterparty_id: e.counterparty_id,
    amount: e.amount,
    currency: e.currency,
    qty_guests: e.qty_guests,
    qty_nights: e.qty_nights,
    payment_method: e.payment_method,
    counterparty: e.counterparty,
    items_json: e.items?.length ? JSON.stringify(e.items) : null,
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
  byProject: Record<string, Record<string, number>>; // project name -> currency -> net
  barItems: Record<string, number>;                  // item name -> qty sold
  unmapped: number;                                  // entries with no category_id
  reviewItems: Array<{ category: string; description: string; reason: string | null }>;
}

function projectNames(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT id, name FROM business_units').all() as Array<{ id: string; name: string }>;
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export function summarizeDate(date: string): DaylogSummary {
  const rows = listByDate(date);
  const names = projectNames();
  const s: DaylogSummary = {
    date, count: rows.length, needsReview: 0,
    income: {}, expense: {}, totals: { income: {}, expense: {} },
    cash: {}, card: {}, byProject: {}, barItems: {}, unmapped: 0, reviewItems: [],
  };
  for (const r of rows) {
    if (r.needs_review) {
      s.needsReview++;
      s.reviewItems.push({ category: r.category, description: r.description || r.raw_text || '', reason: r.review_reason });
    }
    if (!r.category_id) s.unmapped++;

    for (const it of parseItems(r.items_json)) {
      s.barItems[it.name] = (s.barItems[it.name] || 0) + (it.qty || 1);
    }

    if (r.amount == null || !r.currency) continue;

    if (r.project_id) {
      const pname = names[r.project_id] || r.project_id;
      s.byProject[pname] = s.byProject[pname] || {};
      const net = r.direction === 'expense' ? -r.amount : r.amount;
      s.byProject[pname][r.currency] = (s.byProject[pname][r.currency] || 0) + net;
    }
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

function parseItems(s: string | null | undefined): Array<{ qty: number; name: string }> {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((i) => i && typeof i.name === 'string') : [];
  } catch {
    return [];
  }
}

/** Entries awaiting a clarification reply to a specific bot question. */
export function findPendingByQuestion(questionMessageId: number): DaylogRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM daylog_entries WHERE question_message_id = ? ORDER BY created_at',
  ).all(questionMessageId) as DaylogRow[];
}

export function markQuestionAsked(
  ids: string[],
  questionMessageId: number,
  userId: string | null,
  userName: string | null,
): void {
  if (!ids.length || !questionMessageId) return;
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE daylog_entries
     SET question_message_id = ?, asked_user_id = ?, asked_user_name = ?
     WHERE id = ?`,
  );
  const tx = db.transaction(() => { for (const id of ids) stmt.run(questionMessageId, userId, userName, id); });
  tx();
}

/** Replace the entries produced by an unclear message with the re-parsed ones. */
export function deleteEntries(ids: string[]): void {
  if (!ids.length) return;
  const db = getDb();
  const stmt = db.prepare('DELETE FROM daylog_entries WHERE id = ?');
  const tx = db.transaction(() => { for (const id of ids) stmt.run(id); });
  tx();
}
