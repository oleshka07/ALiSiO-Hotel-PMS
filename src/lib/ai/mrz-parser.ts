import { parse } from 'mrz';
import type { OcrResult } from './ocr-document';

// ICAO 9303 line lengths: TD1 30, TD2 36, TD3 (passport) 44.
const MRZ_LENGTHS = [30, 36, 44];

/**
 * Restore a filler run the OCR swallowed.
 *
 * '<' is padding and carries no data, and a long run of identical glyphs has
 * no word shape for the engine to lock onto — so the tail of the name line
 * routinely comes back a few characters short. On a real passport scan line 2,
 * the one with the document number and the check digits, comes out exact.
 *
 * Padding is therefore safe only where the line already ends in filler.
 * A short line ending in a digit has lost something that matters, and is left
 * alone to fail honestly rather than be completed with a guess that would put
 * a wrong document number in front of the foreign police.
 */
function snap(len: number): number | null {
  for (const n of MRZ_LENGTHS) if (len === n) return n;
  return null;
}

/**
 * Bring the recovered lines to one consistent document format.
 *
 * '<' is padding and carries no data, and a long run of identical glyphs has
 * no word shape for the engine to lock onto — so the tail of the name line
 * routinely comes back short while line 2, the one with the document number
 * and the check digits, comes out exact. Guessing a length per line therefore
 * gets it wrong: a 32-character name line looks like a truncated TD2 when it
 * is really a TD3 that lost twelve fillers.
 *
 * So the longest line decides the format, and the others are padded to match.
 * Padding is only ever filler, and only where the line already ends in filler:
 * a short line ending in a digit has lost something that matters and is left
 * alone to fail honestly rather than be completed with a guess that would put
 * a wrong document number in front of the foreign police.
 */
function unify(lines: string[]): string[] {
  if (!lines.length) return lines;

  const longest = Math.max(...lines.map(l => l.length));
  const target = snap(longest) ?? MRZ_LENGTHS.find(n => n >= longest) ?? MRZ_LENGTHS[MRZ_LENGTHS.length - 1];

  return lines.map((line) => {
    if (line.length === target) return line;
    if (line.length < target) return line.endsWith('<') ? line.padEnd(target, '<') : line;
    // Too long: glyphs read out of the margin, but only if they are filler.
    return /^<+$/.test(line.slice(target)) ? line.slice(0, target) : line;
  });
}

function cleanMrzLines(rawText: string): string[] {
  const lines = rawText.split('\n')
    .map(line => line.replace(/\s+/g, '').replace(/«/g, '<').toUpperCase())
    .filter(line => line.includes('<') && line.length > 20);

  // Take the last 2 or 3 valid MRZ lines
  return unify(lines.length > 3 ? lines.slice(-3) : lines);
}

function formatDateOfBirth(mrzDate: string): string | null {
  if (!mrzDate || mrzDate.length !== 6) return null;
  const year = parseInt(mrzDate.substring(0, 2), 10);
  const month = mrzDate.substring(2, 4);
  const day = mrzDate.substring(4, 6);
  // Assume > 50 means 19xx, else 20xx
  const fullYear = year > 50 ? 1900 + year : 2000 + year;
  return `${fullYear}-${month}-${day}`;
}

/**
 * The issuing state, straight off the strip.
 *
 * The `mrz` package resolves the code against a country list and returns null
 * for anything it does not know. That is the one field the foreign police
 * always need, so when the lookup fails take the three characters ICAO 9303
 * puts at a fixed offset: line 2 columns 11–13 on a passport or TD2, line 2
 * columns 16–18 on a TD1 identity card.
 */
function rawNationality(lines: string[]): string | null {
  const second = lines.length >= 3 ? lines[1] : lines[lines.length - 1];
  if (!second) return null;
  const at = second.length === 30 ? 15 : 10;
  const code = second.slice(at, at + 3);
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function parseMrz(text: string): Partial<OcrResult> | null {
  const lines = cleanMrzLines(text);
  if (lines.length < 2) return null; // Not enough lines

  try {
    const result = parse(lines);

    // Check if result is valid
    if (!result || !result.fields) return null;

    const f = result.fields;
    
    const docTypeRaw = f.documentCode?.toLowerCase() || '';
    let docType: OcrResult['documentType'] = 'other';
    if (docTypeRaw.includes('p')) docType = 'passport';
    else if (docTypeRaw.includes('i') || docTypeRaw.includes('c') || docTypeRaw.includes('a')) docType = 'id_card';

    return {
      firstName: f.firstName || 'Unknown',
      lastName: f.lastName || '',
      fullName: `${f.firstName || ''} ${f.lastName || ''}`.trim() || 'Unknown',
      documentNumber: f.documentNumber || null,
      documentType: docType,
      nationality: f.nationality || rawNationality(lines),
      dateOfBirth: f.birthDate ? formatDateOfBirth(f.birthDate) : null,
      // The MRZ carries check digits precisely so a misread can be detected.
      // A failed one still gives usable fields, but the operator has to look:
      // a document number off by one character goes straight to the police.
      confidence: result.valid ? 95 : 55,
    };
  } catch (err) {
    console.error('MRZ parsing failed:', err);
    return null;
  }
}
