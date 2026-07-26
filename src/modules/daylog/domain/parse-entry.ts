import OpenAI from 'openai';
import { toFile } from 'openai';
import { renderReferenceForPrompt, type DaylogReference } from '../data/reference';
import { extractAmount, mentionsEur } from './amount-fallback';

// Vocabulary hint for Whisper — without it "700 крон" comes back as "700 хрон"
// and the amount is lost. Covers the words that actually occur in these logs.
const WHISPER_HINT =
  'Кемпінг і глемпінг у Чехії. Суми в кронах (крон, крони, Kč) та в євро. ' +
  'Слова: заїзд, караван, кемпер, палатка, авто, будова, глемпінг, кемпінг, сауна, купель, ' +
  'проживання, доба, доби, особи, дорослих, готівка, готівкою, картою, ' +
  'зарплата, покос трави, будматеріали, пиво, Пілзнер, Козел, Бехеровка, кола, ' +
  'рахунок, чек, крон, євро.';

// Free-form day-log parser. Turns a mixed UA/CZ message (received money, a
// purchase, a walk-in booking) into one or more structured entries. Amounts may
// be in CZK (крони — primary) or EUR (євро). Anything unclear is flagged so the
// bot can ask a follow-up rather than silently drop it.

export type DaylogDirection = 'income' | 'expense' | 'unknown';

/** A bar/restaurant line item ("чотири пива Пілзнер" → qty 4, name "пиво Пілзнер"). */
export interface ParsedItem { qty: number; name: string }

export interface ParsedEntry {
  direction: DaylogDirection;
  category: string;              // human label, kept for the chat reply
  category_id: string | null;    // expense_categories.id — ready for fin_operations
  project_id: string | null;     // business_units.id
  counterparty_id: string | null;// finance_counterparties.id (null when new/unknown)
  amount: number | null;         // null when the speaker didn't state it
  currency: 'CZK' | 'EUR' | null;
  qty_guests: number | null;
  qty_nights: number | null;
  payment_method: 'cash' | 'card' | 'unknown';
  counterparty: string | null;
  items: ParsedItem[];           // bar sales; empty for everything else
  description: string;
  needs_review: boolean;
  review_reason: string | null;
  confidence: number;            // 0..1
}

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set on the server');
  _client = new OpenAI({ apiKey });
  return _client;
}

function systemPrompt(reference?: string): string {
  return `Ти — помічник, що розбирає короткі повідомлення персоналу кемпінгу/глемпінгу/ресторану в Чехії.
Повідомлення українською/чеською/суржиком про те, що людина прийняла грошей, витратила, продала на барі або записала бронь.
Виділи КОЖЕН факт руху грошей в окремий запис. В одному повідомленні їх може бути кілька.

Поля кожного запису:
- direction: "income" (прийняв гроші / продав) або "expense" (витратив / заплатив / видав) або "unknown".
- category: людська назва категорії (візьми name з довідника нижче).
- category_id: ID з довідника категорій. Дохід → тільки з КАТЕГОРІЙ ДОХОДУ, витрата → тільки з КАТЕГОРІЙ ВИТРАТ. Якщо жодна не підходить — null.
- project_id: ID напрямку з довідника проєктів (бар/ресторан → Ресторан; палатка/кемпер/місце → Кемпинг; номери/будова → Будова F/D; глемпінг-шатри → Глемпинг; сауна → Сауна; загальне/адмін → Загальне). Якщо неясно — null.
- counterparty_id: ID з довідника контрагентів, якщо особа/фірма впізнана (враховуй псевдоніми в дужках). Якщо це нове імʼя — null.
- amount: число без валюти — ПОВНА сума цього запису. Якщо суму НЕ названо — null.
- currency: "CZK" (крони/крон/kč) або "EUR" (євро/eur/€). Якщо неясно — null.
- qty_guests, qty_nights: цілі числа якщо згадані ("двоє дорослих"→2, "на дві доби"→2), інакше null.
- payment_method: "cash" (готівка/готівкою) або "card" (картою/карткою) або "unknown".
- counterparty: імʼя/назва як сказано (кому платив, від кого, назва магазину) або null.
- items: позиції продажу на барі — [{"qty":число,"name":"назва"}]. "три пива"→[{"qty":3,"name":"пиво"}];
  "одна бехеровка і кола"→[{"qty":1,"name":"Бехеровка"},{"qty":1,"name":"кола"}];
  "чотири пива Пілзнер"→[{"qty":4,"name":"пиво Пілзнер"}]. Для НЕ-барних записів — [].
- description: короткий підсумок факту людською мовою.
- needs_review: true якщо суми немає, валюта неясна, або фраза незрозуміла.
- review_reason: чому потребує уточнення (укр., коротко) або null.
- confidence: 0..1.

БАР/РЕСТОРАН: типове повідомлення — сума + спосіб оплати + що продано ("150 крон готівкою три пива").
Це ОДИН запис-продаж: direction=income, amount=повна сума, items=перелік позицій, project_id=Ресторан.
Кожен окремий чек — окремий запис.

Валюта за замовчуванням — крони (CZK), якщо явно не сказано «євро».
${reference ? `\n─── ДОВІДНИКИ (використовуй ТІЛЬКИ ці ID) ───\n${reference}\n` : ''}
Відповідай СТРОГО JSON: {"entries":[ ... ]}. Без пояснень.`;
}

async function parseText(text: string, reference?: string, ref?: DaylogReference): Promise<ParsedEntry[]> {
  const res = await client().chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt(reference) },
      { role: 'user', content: text },
    ],
  });
  return normalize(res.choices[0]?.message?.content, ref, text);
}

/** Transcribe a Telegram voice note (OGG/Opus) then parse the transcript. */
export async function parseVoice(
  audio: Buffer,
  ref?: DaylogReference,
): Promise<{ transcript: string; entries: ParsedEntry[] }> {
  const file = await toFile(audio, 'voice.ogg', { type: 'audio/ogg' });
  const tr = await client().audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'uk',
    temperature: 0,
    prompt: WHISPER_HINT,
  });
  const transcript = (tr.text || '').trim();
  const entries = transcript ? await parseText(transcript, renderRef(ref), ref) : [];
  return { transcript, entries };
}

/** Parse a receipt photo (+ optional caption) via vision. */
export async function parsePhoto(
  image: Buffer,
  mime: string,
  caption?: string,
  ref?: DaylogReference,
): Promise<ParsedEntry[]> {
  const dataUri = `data:${mime};base64,${image.toString('base64')}`;
  const res = await client().chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt(renderRef(ref)) },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Це фото чеку/оплати${caption ? `. Підпис: ${caption}` : ''}. Розбери суму, валюту, магазин, спосіб оплати.` },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
  });
  return normalize(res.choices[0]?.message?.content, ref);
}

export async function parseMessageText(text: string, ref?: DaylogReference): Promise<ParsedEntry[]> {
  return verifyPass(await parseText(text, renderRef(ref), ref), text, ref);
}

/**
 * Second opinion for entries the first pass left unclear. Re-reads the original
 * wording with an explicit warning that speech-to-text mangles words, and keeps
 * whichever fields the re-read manages to recover. Only runs for the unclear
 * ones, so clean messages cost a single call.
 */
async function verifyPass(
  entries: ParsedEntry[],
  sourceText: string,
  ref?: DaylogReference,
): Promise<ParsedEntry[]> {
  const unclear = entries.filter((e) => e.needs_review);
  if (!unclear.length || !sourceText) return entries;

  const hint = `Це повідомлення розібрали, але дещо лишилось незрозумілим: ${unclear
    .map((e) => e.review_reason || 'незрозуміло')
    .join('; ')}.
Текст міг постраждати від розпізнавання голосу: "крон" часто чується як "хрон"/"корон", імена спотворюються.
Перечитай ОРИГІНАЛ і дістань те, чого бракує. Якщо суму названо цифрами — обовʼязково поверни її.
Валюта — крони (CZK), якщо явно не сказано «євро».
ОРИГІНАЛ: "${sourceText}"`;

  try {
    const retry = await parseText(hint, renderRef(ref), ref);
    if (!retry.length) return entries;
    // Prefer the re-read when it actually resolved something.
    const better = retry.filter((r) => !r.needs_review);
    if (!better.length) return entries;
    const clean = entries.filter((e) => !e.needs_review);
    return [...clean, ...better];
  } catch (e) {
    console.warn('[daylog] verify pass failed:', (e as Error).message);
    return entries;
  }
}

function renderRef(ref?: DaylogReference): string | undefined {
  return ref ? renderReferenceForPrompt(ref) : undefined;
}

function normalize(content: string | null | undefined, ref?: DaylogReference, sourceText?: string): ParsedEntry[] {
  if (!content) return [];
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { return []; }
  const list = Array.isArray(raw) ? raw : (raw as { entries?: unknown[] })?.entries;
  if (!Array.isArray(list)) return [];
  const single = list.length === 1;
  return list.map((e) => coerce(e as Record<string, unknown>, ref, single ? sourceText : undefined));
}

function coerce(e: Record<string, unknown>, ref?: DaylogReference, sourceText?: string): ParsedEntry {
  let amount = typeof e.amount === 'number' ? e.amount : (e.amount != null ? Number(e.amount) : null);
  let currency: 'CZK' | 'EUR' | null = e.currency === 'CZK' || e.currency === 'EUR' ? e.currency : null;

  // Recover from mangled speech ("700 хрон") before bothering anyone: pull the
  // number straight out of the raw text when the model dropped it.
  if ((amount == null || !isFinite(amount)) && sourceText) {
    const found = extractAmount(sourceText);
    if (found) {
      amount = found.amount;
      currency = currency ?? found.currency;
    }
  }

  // House rule: everything is CZK unless euro was actually said. A known amount
  // therefore never needs a currency follow-up.
  if (amount != null && isFinite(amount) && currency == null) {
    currency = sourceText && mentionsEur(sourceText) ? 'EUR' : 'CZK';
  }

  const missingAmount = amount == null || !isFinite(amount);
  const direction: DaylogDirection =
    e.direction === 'income' || e.direction === 'expense' ? e.direction : 'unknown';

  // Never trust model-invented ids — accept only ids that exist in the live
  // dictionaries, and only from the side matching the direction.
  const allowedCats = ref
    ? (direction === 'expense' ? ref.expenseCategories : ref.incomeCategories)
    : [];
  const catId = pickId(e.category_id, allowedCats);
  const projectId = pickId(e.project_id, ref?.projects ?? []);
  const counterpartyId = pickId(e.counterparty_id, ref?.counterparties ?? []);
  const catName = allowedCats.find((c) => c.id === catId)?.name;

  const items = Array.isArray(e.items)
    ? (e.items as unknown[])
        .map((it) => {
          const o = it as Record<string, unknown>;
          const qty = intOrNull(o?.qty) ?? 1;
          const name = typeof o?.name === 'string' ? o.name.trim() : '';
          return name ? { qty: qty > 0 ? qty : 1, name } : null;
        })
        .filter((x): x is ParsedItem => x !== null)
    : [];

  const unmapped = !!ref && catId === null;
  return {
    direction,
    category: catName || (typeof e.category === 'string' && e.category ? e.category : 'Інше'),
    category_id: catId,
    project_id: projectId,
    counterparty_id: counterpartyId,
    amount: missingAmount ? null : amount,
    currency,
    qty_guests: intOrNull(e.qty_guests),
    qty_nights: intOrNull(e.qty_nights),
    payment_method: e.payment_method === 'cash' || e.payment_method === 'card' ? e.payment_method : 'unknown',
    counterparty: typeof e.counterparty === 'string' && e.counterparty ? e.counterparty : null,
    items,
    description: typeof e.description === 'string' ? e.description : '',
    needs_review: !!e.needs_review || missingAmount || currency == null || unmapped,
    review_reason: firstReason(
      typeof e.review_reason === 'string' && e.review_reason ? e.review_reason : null,
      missingAmount ? 'Не вказано суму' : null,
      currency == null ? 'Неясна валюта' : null,
      unmapped ? 'Не визначено категорію' : null,
    ),
    confidence: typeof e.confidence === 'number' ? e.confidence : 0.5,
  };
}

function pickId(value: unknown, allowed: Array<{ id: string }>): string | null {
  if (typeof value !== 'string' || !value) return null;
  return allowed.some((a) => a.id === value) ? value : null;
}

function firstReason(...reasons: Array<string | null>): string | null {
  return reasons.find((r) => !!r) ?? null;
}

function intOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : (v != null ? Number(v) : NaN);
  return isFinite(n) ? Math.round(n) : null;
}
