/**
 * Nationality is captured as free text — by OCR, by the guest portal, by hand.
 * The registry decided "is this a foreigner?" with a literal `nationality != 'CZ'`,
 * and that was wrong in both directions:
 *
 *  - 57 rows hold a Czech nationality spelled some other way (`CZE`, `Česko`,
 *    `Чехия`, even `СZ` with a Cyrillic С). Eight of those people were reported
 *    to the foreign police as foreigners.
 *  - An empty nationality gives `NULL != 'CZ'` → NULL → not true, so twelve
 *    guests were silently excluded from the registry and never reported at all.
 *    That is the direction that carries a fine.
 *
 * So: recognise Czech confidently, and treat everything we cannot recognise as
 * a foreigner that needs a human look — never as a Czech. Under-reporting must
 * not be the default a typo falls into.
 */

const CZECH = new Set([
  'cz', 'cze', 'czk', 'cesko', 'ceska', 'ceskarepublika', 'ceskarep',
  'czechia', 'czechrepublic', 'chekhiya', 'chehiya',
]);

/** Lowercase, drop diacritics and everything that is not a letter. */
function letters(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zа-яёіїєґ]/gi, '');
}

/**
 * Map Cyrillic characters that look identical to Latin ones. Applied only
 * AFTER the Cyrillic word check below — folding first turns «Чехия» into a
 * half-Latin string that no Cyrillic pattern can match.
 */
function latinise(s: string): string {
  const cyrToLat: Record<string, string> = {
    'с': 'c', 'о': 'o', 'е': 'e', 'а': 'a', 'р': 'p', 'х': 'x', 'у': 'y', 'к': 'k',
  };
  return s.split('').map((ch) => cyrToLat[ch] ?? ch).join('');
}

/**
 * 'CZ' when the value means Czech, an ISO-ish two-letter code when it already
 * is one, otherwise null — null means "unrecognised", NOT "Czech".
 */
export function normalizeNationality(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const base = letters(String(raw));
  if (!base) return null;

  // Cyrillic spellings first, while the Cyrillic letters are still Cyrillic.
  if (/^чех/.test(base) || /^чеськ/.test(base) || /^ческ/.test(base)) return 'CZ';

  const folded = latinise(base);
  if (CZECH.has(folded)) return 'CZ';
  if (/^[a-z]{2}$/.test(folded)) return folded.toUpperCase();
  return null;
}

/** True unless we are confident the person is Czech. */
export function isForeigner(raw: string | null | undefined): boolean {
  return normalizeNationality(raw) !== 'CZ';
}

/** Needs a human to look at it before it can be reported anywhere. */
export function isUnknownNationality(raw: string | null | undefined): boolean {
  return normalizeNationality(raw) === null;
}

/**
 * Expose the normaliser to SQL so the registry queries can filter on it. The
 * five places that compared to the literal 'CZ' now call norm_nat().
 */
export function registerNationalitySql(db: any): void {
  if (db.__natFnRegistered) return;
  db.function('norm_nat', { deterministic: true }, (raw: string | null) =>
    normalizeNationality(raw));
  db.__natFnRegistered = true;
}
