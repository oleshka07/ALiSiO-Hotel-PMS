/* eslint-disable @typescript-eslint/no-explicit-any */
import { PDFParse } from 'pdf-parse';
import type { ParsedStatement, ParsedTransaction } from './bank-inbox-engine';

// ─────────────────────────────────────────────────────────────────
// KB (Komerční banka) PDF statement parser
// ─────────────────────────────────────────────────────────────────
//
// KB Mojebanka delivers daily statements as PDF (the only format
// available for many account types). Each PDF has a stable layout:
//
//   - Header: account number, IBAN, currency, statement number, date
//   - Opening balance ("Počáteční zůstatek") + closing ("Konečný zůstatek")
//   - Transaction table — each row spans multiple text lines:
//       <settlement date DD.MM.YYYY>
//       <transaction date DD.MM.YYYY>     (sometimes absent)
//       <ALL-CAPS TYPE>                   PŘÍCHOZÍ ÚHRADA / OKAMŽITÁ ODCHOZÍ ÚHRADA / TRANSAKCE PLATEBNÍ KARTOU / CENA ZA REZERVACI ZDROJŮ / …
//       <type-specific description block>
//       <amount on a line by itself>      e.g. " 392,23" (positive=credit)
//                                                "-1 247,78" (negative=debit)
//   - Footer: "Rekapitulace transakcí na účtu" with totals
//
// The parser extracts the same ParsedStatement shape produced by the
// CAMT.053 / KB CSV parsers, so the rest of bank-inbox-engine is reused
// unchanged.
//
// ────────────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const AMOUNT_RE = /^-?\s?\d{1,3}(?:[\s ]\d{3})*,\d{2}$/;
// Type lines are all-caps Czech words; allow letters, spaces, slash and dash.
const TYPE_RE = /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ\s/-]{4,}$/;

function parseAmount(s: string): number {
  // KB uses Czech format: comma decimal, space (or non-breaking space)
  // thousands separator. Strip spaces, swap comma for dot.
  const cleaned = s.replace(/[\s ]/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

function isoDate(dd: string): string | null {
  const m = dd.match(DATE_RE);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function detectCurrency(text: string): string {
  const m = text.match(/měna:\s*([A-Z]{3})/i);
  if (m) return m[1].toUpperCase();
  // Fallback: scan IBAN format. CZ + national check + bank … doesn't tell currency.
  // Default to CZK because that's the home currency.
  return 'CZK';
}

function detectIban(text: string): string | null {
  const m = text.match(/IBAN:\s*([A-Z]{2}\d{2}[A-Z0-9]{10,30})/);
  return m ? m[1] : null;
}

function detectAccountNumber(text: string): string | null {
  // Format: "k účtu: 131-3569410227/0100" — keep the local-form too
  // because some inbox routes match by it instead of IBAN.
  const m = text.match(/k\s*účtu:\s*([\d-]+\/\d{4})/i);
  return m ? m[1] : null;
}

function detectBalance(text: string, label: 'Počáteční' | 'Konečný'): number | null {
  // Use word-boundary match so "POČÁTEČNÍ ZŮSTATEK" recap doesn't double-fire.
  // First occurrence is in the header summary box, that's fine.
  const re = new RegExp(`${label}\\s*zůstatek\\s+(-?\\s?\\d{1,3}(?:[\\s\\u00a0]\\d{3})*,\\d{2})`, 'i');
  const m = text.match(re);
  return m ? parseAmount(m[1]) : null;
}

function detectStatementDate(text: string): string | null {
  const m = text.match(/Datum\s*výpisu:\s*(\d{2})\.(\d{2})\.(\d{4})/i);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

interface RawBlock {
  settlementDate: string;       // YYYY-MM-DD
  transactionDate: string | null;
  type: string;
  rawLines: string[];           // lines between type and amount
  signedAmount: number;
}

/**
 * Walk the body lines from the table and split into transaction blocks.
 * Anchor: the amount line at end of each block (last string matching
 * AMOUNT_RE before the next date or end of body).
 */
function parseBlocks(lines: string[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    // Find a settlement date.
    if (!DATE_RE.test(lines[i])) { i++; continue; }
    const settlementDate = isoDate(lines[i])!;
    let j = i + 1;
    let transactionDate: string | null = null;
    if (j < n && DATE_RE.test(lines[j])) {
      transactionDate = isoDate(lines[j]);
      j++;
    }
    // Type line — all caps, may have / or dash.
    let type = '';
    if (j < n && TYPE_RE.test(lines[j])) {
      type = lines[j];
      j++;
    }
    // Collect raw lines until next date OR end OR amount line that's followed by a date.
    const rawLines: string[] = [];
    let amountLineIndex = -1;
    while (j < n) {
      const line = lines[j];
      if (DATE_RE.test(line)) {
        // Next block starts here. Look back for amount.
        break;
      }
      if (AMOUNT_RE.test(line)) {
        // Could be amount; we accept the LAST AMOUNT_RE match before next date.
        amountLineIndex = j;
      }
      rawLines.push(line);
      j++;
    }
    if (amountLineIndex === -1) {
      // No amount in this block — skip (probably table header / footer rows).
      i = j;
      continue;
    }
    const amountStr = lines[amountLineIndex];
    const amount = parseAmount(amountStr);
    // Sign: AMOUNT_RE only allows leading "-". Positive amounts come from
    // the "Připsáno" column (credit), negatives from "Odepsáno" (debit).
    const signedAmount = /^-/.test(amountStr.trim()) ? -Math.abs(amount) : Math.abs(amount);
    // Strip the amount line itself out of the description payload.
    const desc = rawLines.filter((_, idx) => rawLines[idx] !== amountStr);
    blocks.push({ settlementDate, transactionDate, type, rawLines: desc, signedAmount });
    i = j;
  }
  return blocks;
}

/** Pull KB "Zpráva pro příjemce" payload as a useful reference token. */
function extractReference(rawLines: string[]): string | null {
  const idx = rawLines.findIndex((l) => /Zpráva\s+pro\s+příjemce:/i.test(l));
  if (idx === -1 || idx + 1 >= rawLines.length) return null;
  // Take the first non-empty non-account-number line after the marker.
  for (let k = idx + 1; k < rawLines.length; k++) {
    const l = rawLines[k].trim();
    if (!l) continue;
    if (/^\d{6,12}\/\d{4}$/.test(l)) continue; // Account number line
    if (TYPE_RE.test(l)) continue;
    return l;
  }
  return null;
}

function extractCounterparty(rawLines: string[]): string | null {
  // Pattern: counterparty appears just before a "<digits>/<bank-code>"
  // or "<card>** **** XXXX" line. Walk backward looking for a line that
  // resembles a name (any letters, optional dot/comma/&). Skip "Zpráva
  // pro příjemce:" markers and account numbers.
  for (let k = rawLines.length - 1; k >= 0; k--) {
    const l = rawLines[k].trim();
    if (!l) continue;
    if (/^\d{6,12}\/\d{4}$/.test(l)) continue;            // account code
    if (/^\d{2,4}$/.test(l)) continue;                    // VS/KS/SS
    if (/^kurz:/i.test(l)) continue;
    if (/^zúčt\.?\s*částka:/i.test(l)) continue;
    if (/^\d{4}\s*\d{2}\*\*/.test(l)) continue;           // card mask line
    if (/^Zpráva\s*pro\s*příjemce:/i.test(l)) continue;
    if (/^EndToEnd/i.test(l)) continue;
    if (/^[A-Z]{2}\d{2}/.test(l)) continue;               // IBAN line
    // First sane candidate going backward.
    if (/[A-ZА-Я]/i.test(l)) return l;
  }
  return null;
}

/**
 * Parse a KB Mojebanka PDF buffer into the same ParsedStatement shape as
 * CAMT.053 / KB CSV parsers, so importStatement() can reuse the rest of
 * the bank-inbox pipeline unchanged.
 *
 * Throws on hard structural failures (no opening balance, no transactions
 * detected). The bank-inbox-engine catch wraps the throw into result.errors
 * which then triggers the Telegram alert (see notifyParseFailure).
 */
export async function parseKbPdf(buf: Buffer): Promise<ParsedStatement> {
  const parser = new PDFParse({ data: buf });
  const data = await parser.getText();
  const text = data.text || '';

  const currency = detectCurrency(text);
  const iban = detectIban(text);
  const account_number = detectAccountNumber(text);
  const opening_balance = detectBalance(text, 'Počáteční');
  const closing_balance = detectBalance(text, 'Konečný');
  const stmtDate = detectStatementDate(text);

  if (opening_balance === null || closing_balance === null) {
    throw new Error('KB PDF: opening or closing balance not detected — format may have changed');
  }

  // Locate the transaction zone — starts at "POČÁTEČNÍ ZŮSTATEK" header
  // (recap line, all caps) and ends at "KONEČNÝ ZŮSTATEK" recap line.
  const allLines = text.split(/\r?\n/).map((s: string) => s.trim()).filter((l: string) => l.length > 0);
  const startIdx = allLines.findIndex((l: string) => /^POČÁTEČNÍ\s+ZŮSTATEK/i.test(l));
  const endIdx = allLines.findIndex((l: string) => /^KONEČNÝ\s+ZŮSTATEK/i.test(l));
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('KB PDF: transaction zone markers not found — format may have changed');
  }
  const body = allLines.slice(startIdx + 1, endIdx);

  const blocks = parseBlocks(body);
  if (blocks.length === 0) {
    throw new Error('KB PDF: zero transactions detected — possible format change or empty statement');
  }

  const transactions: ParsedTransaction[] = blocks.map((b) => {
    const ref = extractReference(b.rawLines);
    const counterparty = extractCounterparty(b.rawLines);
    const description = [b.type, ...b.rawLines].filter(Boolean).join(' | ').slice(0, 500);
    return {
      date: b.settlementDate,
      amount: b.signedAmount,
      currency,
      counterparty,
      description,
      reference: ref,
    };
  });

  return {
    iban,
    account_number,
    currency,
    opening_balance,
    closing_balance,
    period_from: stmtDate,
    period_to: stmtDate,
    transactions,
  };
}

/**
 * Sanity-check that a parsed statement is internally consistent: the
 * closing balance must equal opening + sum(credits) − sum(debits) within
 * a small tolerance. KB rounds to two decimals, so 0.01 covers banker's
 * rounding noise.
 *
 * Returns null if the statement looks fine, or a human-readable reason
 * why it doesn't. The caller fires a Telegram alert when this returns
 * non-null.
 */
export function validateParsedStatement(stmt: ParsedStatement): string | null {
  if (stmt.opening_balance === null) return 'opening_balance missing';
  if (stmt.closing_balance === null) return 'closing_balance missing';
  if (!stmt.iban && !stmt.account_number) return 'no IBAN / account number';
  if (stmt.transactions.length === 0) return 'zero transactions';

  const sum = stmt.transactions.reduce((s, t) => s + t.amount, 0);
  const expectedClose = stmt.opening_balance + sum;
  const diff = Math.abs(expectedClose - stmt.closing_balance);
  if (diff > 0.02) {
    return `balance mismatch: opening ${stmt.opening_balance.toFixed(2)} + Σ${sum.toFixed(2)} = ${expectedClose.toFixed(2)}, but PDF says closing ${stmt.closing_balance.toFixed(2)} (diff ${diff.toFixed(2)})`;
  }

  // Currency sanity — KB always sends ISO codes; reject anything weird.
  if (!/^[A-Z]{3}$/.test(stmt.currency)) return `unexpected currency code "${stmt.currency}"`;

  return null;
}
