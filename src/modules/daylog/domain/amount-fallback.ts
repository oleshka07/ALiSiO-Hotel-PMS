// Deterministic safety net for amounts/currencies.
//
// Speech-to-text regularly mangles the currency word — "700 крон" comes back as
// "700 хрон", "700 корон", "700 kc". When the model then fails to recognise the
// currency it also tends to drop the amount, and a real 700 CZK entry silently
// becomes "no amount". This recovers the number from the raw text before we ask
// anyone to clarify.
//
// House rule (explicit operator decision): everything is CZK unless EUR is
// actually said. So a bare number never needs a currency follow-up.

const CZK_WORDS = /(кро[нш]|хро[нн]|коро[нн]|крн|kč|kc\b|czk|čk|корун)/i;
const EUR_WORDS = /(євро|евро|euro|eur\b|€)/i;

const NUM_WORDS: Record<string, number> = {
  'один': 1, 'одна': 1, 'одне': 1, 'два': 2, 'дві': 2, 'три': 3, 'чотири': 4,
  'пʼять': 5, "п'ять": 5, 'пять': 5, 'шість': 6, 'сім': 7, 'вісім': 8,
  'девʼять': 9, "дев'ять": 9, 'девять': 9, 'десять': 10,
};

export function wordToNumber(w: string): number | null {
  return NUM_WORDS[w.trim().toLowerCase()] ?? null;
}

/** True when the text explicitly says euro. */
export function mentionsEur(text: string): boolean {
  return EUR_WORDS.test(text);
}

/**
 * Pull the most likely money amount out of free-form speech.
 * Prefers a number that sits next to a currency word; otherwise falls back to
 * the largest standalone number (quantities like "дві особи" stay small).
 */
export function extractAmount(text: string): { amount: number; currency: 'CZK' | 'EUR' } | null {
  if (!text) return null;
  const eur = mentionsEur(text);
  const currency: 'CZK' | 'EUR' = eur ? 'EUR' : 'CZK';

  // "700 крон" / "700хрон" / "80 євро" / "1 200 Kč"
  const nextToCurrency = new RegExp(
    `(\\d[\\d\\s.,]*)\\s*(?:${CZK_WORDS.source}|${EUR_WORDS.source})`,
    'i',
  );
  const m = text.match(nextToCurrency);
  if (m) {
    const n = toNumber(m[1]);
    if (n != null) {
      // The matched word decides the currency for this specific number.
      const tail = text.slice(m.index ?? 0, (m.index ?? 0) + m[0].length);
      return { amount: n, currency: EUR_WORDS.test(tail) ? 'EUR' : 'CZK' };
    }
  }

  // No currency word survived transcription — take the largest number, which in
  // these messages is the price (guests/nights are single digits).
  const numbers = (text.match(/\d[\d\s.,]*/g) || [])
    .map(toNumber)
    .filter((n): n is number => n != null && n > 0);
  if (!numbers.length) return null;
  const max = Math.max(...numbers);
  if (max < 10) return null; // 2 guests / 3 nights — not a price
  return { amount: max, currency };
}

// Strong wording signals for the direction. Used only to catch a contradiction
// (an "expense" that is clearly a guest payment) — recording income as a
// construction expense corrupts the books twice over, so we rather ask.
const INCOME_SIGNALS = /(заплатил|оплатил|сплатил|розрахувал|заїзд|проживанн|ноч[іи]|доб[ауи]\b|гост[іяе]|прийня[вл]|продав|взяв)/i;
const EXPENSE_SIGNALS = /(купи[влв]|придба[влв]|вида[влв]|зарплат|постачальник|заправ|оплатив рахунок|рахунок за)/i;

/** 'income' | 'expense' when the wording is unambiguous, otherwise null. */
export function directionSignal(text: string): 'income' | 'expense' | null {
  if (!text) return null;
  const inc = INCOME_SIGNALS.test(text);
  const exp = EXPENSE_SIGNALS.test(text);
  if (inc && !exp) return 'income';
  if (exp && !inc) return 'expense';
  return null;
}

/**
 * "будова F" / "будова Д" — an accommodation building, never construction.
 * Note: \b is ASCII-only in JS, so a Cyrillic "Д" needs an explicit lookahead.
 */
export function mentionsLodgingBuilding(text: string): boolean {
  return /будов[аиуі]\s*["«]?\s*[fdфд](?![a-zа-яіїєґ0-9])/i.test(text);
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isFinite(n) && n > 0 ? n : null;
}
