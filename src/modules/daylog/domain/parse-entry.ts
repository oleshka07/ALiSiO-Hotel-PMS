import OpenAI from 'openai';
import { toFile } from 'openai';

// Free-form day-log parser. Turns a mixed UA/CZ message (received money, a
// purchase, a walk-in booking) into one or more structured entries. Amounts may
// be in CZK (крони — primary) or EUR (євро). Anything unclear is flagged so the
// bot can ask a follow-up rather than silently drop it.

export type DaylogDirection = 'income' | 'expense' | 'unknown';

export interface ParsedEntry {
  direction: DaylogDirection;
  category: string;        // Проживання | Кемпінг | Послуги | Зарплата | Будматеріали | Закупівлі | Інше
  amount: number | null;   // null when the speaker didn't state it
  currency: 'CZK' | 'EUR' | null;
  qty_guests: number | null;
  qty_nights: number | null;
  payment_method: 'cash' | 'card' | 'unknown';
  counterparty: string | null;
  description: string;
  needs_review: boolean;
  review_reason: string | null;
  confidence: number;      // 0..1
}

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set on the server');
  _client = new OpenAI({ apiKey });
  return _client;
}

const SYSTEM_PROMPT = `Ти — помічник, що розбирає короткі повідомлення адміністратора кемпінгу/глемпінгу в Чехії.
Повідомлення українською/чеською/суржиком про те, що людина ЗА ДЕНЬ прийняла грошей, витратила або записала бронь.
Виділи КОЖЕН факт руху грошей в окремий запис. В одному повідомленні їх може бути кілька.

Поля кожного запису:
- direction: "income" (прийняв гроші / заробив) або "expense" (витратив / заплатив / видав) або "unknown".
- category: одне з — "Проживання" (номери, будови), "Кемпінг" (палатка, авто, кемпер, місце), "Послуги" (покос трави, послуги гостям), "Зарплата", "Будматеріали", "Закупівлі", "Інше".
- amount: число без валюти. Якщо суму НЕ названо — null.
- currency: "CZK" (крони/крон/kč) або "EUR" (євро/eur/€). Якщо неясно — null.
- qty_guests, qty_nights: цілі числа якщо згадані ("двоє дорослих"→2, "на дві доби"→2), інакше null.
- payment_method: "cash" (готівка/готівкою) або "card" (картою/карткою) або "unknown".
- counterparty: імʼя/назва (кому платив, від кого, назва магазину) або null.
- description: короткий підсумок факту людською мовою.
- needs_review: true якщо суми немає, валюта неясна, або фраза незрозуміла.
- review_reason: чому потребує уточнення (укр., коротко) або null.
- confidence: 0..1.

Крони — головна валюта. Відповідай СТРОГО JSON: {"entries":[ ... ]}. Без пояснень.`;

async function parseText(text: string): Promise<ParsedEntry[]> {
  const res = await client().chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
  });
  return normalize(res.choices[0]?.message?.content);
}

/** Transcribe a Telegram voice note (OGG/Opus) then parse the transcript. */
export async function parseVoice(audio: Buffer): Promise<{ transcript: string; entries: ParsedEntry[] }> {
  const file = await toFile(audio, 'voice.ogg', { type: 'audio/ogg' });
  const tr = await client().audio.transcriptions.create({ file, model: 'whisper-1' });
  const transcript = (tr.text || '').trim();
  const entries = transcript ? await parseText(transcript) : [];
  return { transcript, entries };
}

/** Parse a receipt photo (+ optional caption) via vision. */
export async function parsePhoto(image: Buffer, mime: string, caption?: string): Promise<ParsedEntry[]> {
  const dataUri = `data:${mime};base64,${image.toString('base64')}`;
  const res = await client().chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Це фото чеку/оплати${caption ? `. Підпис: ${caption}` : ''}. Розбери суму, валюту, магазин, спосіб оплати.` },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
  });
  return normalize(res.choices[0]?.message?.content);
}

export async function parseMessageText(text: string): Promise<ParsedEntry[]> {
  return parseText(text);
}

function normalize(content: string | null | undefined): ParsedEntry[] {
  if (!content) return [];
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { return []; }
  const list = Array.isArray(raw) ? raw : (raw as { entries?: unknown[] })?.entries;
  if (!Array.isArray(list)) return [];
  return list.map((e) => coerce(e as Record<string, unknown>));
}

function coerce(e: Record<string, unknown>): ParsedEntry {
  const amount = typeof e.amount === 'number' ? e.amount : (e.amount != null ? Number(e.amount) : null);
  const currency = e.currency === 'CZK' || e.currency === 'EUR' ? e.currency : null;
  const missingAmount = amount == null || !isFinite(amount);
  return {
    direction: e.direction === 'income' || e.direction === 'expense' ? e.direction : 'unknown',
    category: typeof e.category === 'string' && e.category ? e.category : 'Інше',
    amount: missingAmount ? null : amount,
    currency,
    qty_guests: intOrNull(e.qty_guests),
    qty_nights: intOrNull(e.qty_nights),
    payment_method: e.payment_method === 'cash' || e.payment_method === 'card' ? e.payment_method : 'unknown',
    counterparty: typeof e.counterparty === 'string' && e.counterparty ? e.counterparty : null,
    description: typeof e.description === 'string' ? e.description : '',
    needs_review: !!e.needs_review || missingAmount || currency == null,
    review_reason: typeof e.review_reason === 'string' && e.review_reason
      ? e.review_reason
      : (missingAmount ? 'Не вказано суму' : (currency == null ? 'Неясна валюта' : null)),
    confidence: typeof e.confidence === 'number' ? e.confidence : 0.5,
  };
}

function intOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : (v != null ? Number(v) : NaN);
  return isFinite(n) ? Math.round(n) : null;
}
