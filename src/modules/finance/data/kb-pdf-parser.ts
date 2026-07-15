/* eslint-disable @typescript-eslint/no-explicit-any */
import { PDFParse } from 'pdf-parse';
import type { ParsedStatement, ParsedTransaction } from './bank-inbox-engine';
import { ensurePdfWorker } from './pdf-worker-init';

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

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(.+))?$/;
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
// Multi-page boilerplate that pdf-parse leaves in mid-body for KB
// statements that span >1 page. We need to skip these so they don't
// look like description-block lines for the previous transaction.
const BOILERPLATE_RES: RegExp[] = [
  /^VÝPIS\s+DENNÍ/i,
  /^Strana:/i,
  /^Datum\s+výpisu:/i,
  /^Číslo\s+výpisu:/i,
  /^Zaslání:/i,
  /^k\s+účtu:/i,
  /^IBAN:/i,
  /^typ:/i,
  /^měna:/i,
  /^Cheb$/i,
  /^Dragounská\b/i,
  /^\d{3,4}\s\d{2}\s+Cheb$/i,
  /^tel\.:/i,
  /^www\.kb\.cz$/i,
  /^BIC\s*\/\s*SWIFT/i,
  /^KEMP\s+CARLSBAD/i,
  /^CHEBSKÁ/i,
  /^\d{3,4}\s\d{2}\s+KARLOVY\s+VARY/i,
  /^Počáteční\s+zůstatek$/i,
  /^Konečný\s+zůstatek$/i,
  /^Datum$/i,
  /^zúčtování$/i,
  /^transakce$/i,
  /^Popis\s+transakce$/i,
  /^Identifikace\s+transakce$/i,
  /^Název\s+protiúčtu/i,
  /^Protiúčet\s+a\s+kód/i,
  /^VS$/i,
  /^KS$/i,
  /^SS$/i,
  /^Připsáno$/i,
  /^Odepsáno$/i,
  /^Pokračování\s+na/i,
  /^DN\d{6}_/i,                  // "DN260504_4C6-0001135-2 ID: 0481374969"
  /^Komerční\s+banka/i,
  /^se\s+sídlem:/i,
  /^zapsaná/i,
  /^Děkujeme/i,
  /^Vklad\s+na/i,
  /^Rekapitulace\s+transakcí/i,
  /^Celkový\s+počet/i,
  /^Obraty\s+na/i,
];

function isBoilerplate(line: string): boolean {
  return BOILERPLATE_RES.some((re) => re.test(line));
}

function parseBlocks(lines: string[]): RawBlock[] {
  // Strip boilerplate lines — keeps multi-page statements parseable.
  const clean = lines.filter((l) => !isBoilerplate(l));

  const blocks: RawBlock[] = [];
  let i = 0;
  const n = clean.length;
  while (i < n) {
    // Find a settlement date.
    if (!DATE_RE.test(clean[i])) { i++; continue; }
    const m1 = clean[i].match(DATE_RE)!;
    const settlementDate = `${m1[3]}-${m1[2]}-${m1[1]}`;
    let type = m1[4] ? m1[4].trim() : '';

    let j = i + 1;
    let transactionDate: string | null = null;
    if (j < n && DATE_RE.test(clean[j])) {
      const m2 = clean[j].match(DATE_RE)!;
      transactionDate = `${m2[3]}-${m2[2]}-${m2[1]}`;
      if (!type && m2[4]) type = m2[4].trim();
      j++;
    }
    // Type line — all caps, may have / or dash. Optional.
    if (!type && j < n && TYPE_RE.test(clean[j])) {
      type = clean[j];
      j++;
    }
    // Collect raw lines until next date OR end OR amount line that's followed by a date.
    const rawLines: string[] = [];
    let amountLineIndex = -1;
    while (j < n) {
      const line = clean[j];
      if (DATE_RE.test(line)) {
        // Next block starts here.
        break;
      }
      if (AMOUNT_RE.test(line)) {
        amountLineIndex = j;
      }
      rawLines.push(line);
      j++;
    }
    if (amountLineIndex === -1) {
      // No amount — orphan settlement date. Skip.
      i = j;
      continue;
    }
    const amountStr = clean[amountLineIndex];
    const amount = parseAmount(amountStr);
    const signedAmount = /^-/.test(amountStr.trim()) ? -Math.abs(amount) : Math.abs(amount);
    const desc = rawLines.filter((l) => l !== amountStr);
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
  ensurePdfWorker();
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

  // Locate the transaction zone. Mixed-case "Počáteční zůstatek" appears
  // in the summary box at the very top of every page; the transaction
  // table starts at the all-caps "POČÁTEČNÍ ZŮSTATEK" header. Match that
  // case-sensitively to avoid grabbing the summary marker. The all-caps
  // KONEČNÝ ZŮSTATEK at the bottom is unique and only appears once.
  const allLines = text.split(/\r?\n/).map((s: string) => s.trim()).filter((l: string) => l.length > 0);

  const findFirst = (re: RegExp) => allLines.findIndex((l: string) => re.test(l));
  const findLast = (re: RegExp) => {
    for (let k = allLines.length - 1; k >= 0; k--) if (re.test(allLines[k])) return k;
    return -1;
  };

  // All-caps marker — this is the table header line.
  let startIdx = findFirst(/^POČÁTEČNÍ\s+ZŮSTATEK\b/);
  // Fallback: some pdf-parse runs concatenate "POČÁTEČNÍ ZŮSTATEK 5 432,43"
  // onto a single token. Accept that too.
  if (startIdx === -1) startIdx = findFirst(/POČÁTEČNÍ\s+ZŮSTATEK/);
  // Last resort: walk past the summary "Počáteční zůstatek" line so we
  // anchor on the second occurrence (mixed case in summary, all-caps in
  // table header would otherwise both match).
  if (startIdx === -1) {
    const first = findFirst(/Počáteční\s+zůstatek/i);
    if (first >= 0) {
      startIdx = allLines.findIndex((l: string, idx: number) => idx > first && /Počáteční\s+zůstatek/i.test(l));
    }
  }

  const endIdx = findLast(/^KONEČNÝ\s+ZŮSTATEK\b/) >= 0 ? findLast(/^KONEČNÝ\s+ZŮSTATEK\b/) : findLast(/KONEČNÝ\s+ZŮSTATEK/);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      `KB PDF: transaction zone markers not found (startIdx=${startIdx}, endIdx=${endIdx}, lines=${allLines.length}). ` +
      `First 200 chars: «${text.substring(0, 200).replace(/\s+/g, ' ')}»`,
    );
  }

  const body = allLines.slice(startIdx + 1, endIdx);
  const blocks = parseBlocks(body);
  if (blocks.length === 0) {
    // Diagnostic-rich error so the operator (and the next dev) can see
    // exactly what shape the PDF had instead of guessing.
    const sample = body.slice(0, 30).map((l) => l.length > 80 ? l.substring(0, 77) + '…' : l).join(' | ');
    throw new Error(
      `KB PDF: zero transactions detected. body lines=${body.length}, ` +
      `currency=${currency}, iban=${iban || 'none'}, opening=${opening_balance}. ` +
      `First body lines: «${sample}»`,
    );
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
