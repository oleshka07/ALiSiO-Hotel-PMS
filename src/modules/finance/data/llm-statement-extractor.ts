/* eslint-disable @typescript-eslint/no-explicit-any */
//
// LLM-based bank statement extractor (PR #N).
//
// Replaces the brittle KB-specific regex parser with a single
// OpenAI prompt that works for any bank's PDF (KB, Erste, Raiffeisen,
// etc.). The extracted JSON is sanity-checked against opening + Σtx
// = closing before we trust it. PDFs are archived on disk so admin
// can audit / re-parse from /finance/bank-statements/audit later.
//
// Cost note: pdf-parse-extracted text per statement is ~1-3 KB
// (~400-800 tokens). gpt-4o-mini at $0.15/$0.60 per 1M tokens →
// ~$0.001 per statement. Negligible.
//

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';
import type { ParsedStatement, ParsedTransaction } from './bank-inbox-engine';
import { ensurePdfWorker } from './pdf-worker-init';

const ARCHIVE_ROOT = path.join(process.cwd(), 'data', 'uploads', 'bank-statements');

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT = `You extract structured data from bank account statements.

The input is the raw text extracted from a PDF bank statement (any bank,
any language — Czech/English/Ukrainian most common). Return ONLY valid
JSON (no markdown fences, no commentary) matching this schema:

{
  "iban": "string or null",
  "account_number": "string or null",
  "currency": "ISO 4217 code, e.g. CZK or EUR",
  "opening_balance": number,
  "closing_balance": number,
  "period_from": "YYYY-MM-DD or null",
  "period_to": "YYYY-MM-DD or null",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "amount": number,
      "counterparty": "string or null (payer/payee name)",
      "description": "string or null (transaction memo)",
      "reference": "string or null (variable symbol, end-to-end reference, etc.)"
    }
  ]
}

Rules:
- amount is SIGNED: positive for incoming/credit, negative for outgoing/debit.
- Use the EFFECTIVE booking date (Datum zúčtování in Czech). Not the value date if both exist.
- opening_balance and closing_balance may be negative; keep the sign as printed.
- If the statement crosses currencies (rare), use the account's currency for all amounts.
- IBAN often starts with country code (CZ, SK, etc.).
- DO NOT invent transactions. If you can't read a number clearly, set it to 0
  and add a "?" suffix to description so the validator catches the mismatch.
- Czech terminology hints:
    PŘÍCHOZÍ ÚHRADA = incoming payment (credit)
    ODCHOZÍ ÚHRADA = outgoing payment (debit)
    TRANSAKCE PLATEBNÍ KARTOU + Výběr = card cash withdrawal (debit)
    Počáteční zůstatek = opening balance
    Konečný zůstatek = closing balance
    Připsáno = credited
    Odepsáno = debited

Critical: the math must check out:
  opening_balance + sum(transactions.amount) ≈ closing_balance (±0.01)
The validator will reject the response if it doesn't, so be careful.`;

interface LlmStatement {
  iban: string | null;
  account_number: string | null;
  currency: string;
  opening_balance: number;
  closing_balance: number;
  period_from: string | null;
  period_to: string | null;
  transactions: Array<{
    date: string;
    amount: number;
    counterparty: string | null;
    description: string | null;
    reference: string | null;
  }>;
}

/**
 * Save the raw PDF to data/uploads/bank-statements/YYYY-MM/.
 * Returns the absolute path. Used for audit + manual re-parse later.
 */
function archivePdf(buffer: Buffer, filename: string, uid: number | undefined): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(ARCHIVE_ROOT, ym);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 60);
  const fname = `${Date.now()}-uid${uid ?? 'x'}-${safe}`;
  const fullPath = path.join(dir, fname);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}

/**
 * Parse a bank statement PDF using GPT-4o-mini.
 * Throws if math validation fails so the bank-inbox-engine can fall
 * through to its standard error-alert path.
 */
export async function parseStatementWithLlm(
  pdfBuffer: Buffer,
  filename: string,
  uid?: number,
): Promise<ParsedStatement> {
  // 1. Archive the raw PDF before doing anything else.
  let archivePath: string | null = null;
  try {
    archivePath = archivePdf(pdfBuffer, filename, uid);
  } catch (e: any) {
    console.log('[LLM-statement] archive failed (non-fatal):', e.message);
  }

  // 2. Extract text.
  ensurePdfWorker();
  const parsed = await new PDFParse({ data: pdfBuffer }).getText();
  const text = parsed.text || '';
  if (!text.trim()) {
    throw new Error('PDF text extraction returned empty');
  }

  // 3. Send to GPT-4o-mini with JSON response.
  const res = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Bank statement text:\n\n${text.substring(0, 30000)}` },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim() || '{}';
  let llm: LlmStatement;
  try {
    llm = JSON.parse(raw);
  } catch (e: any) {
    throw new Error(`LLM returned non-JSON: ${e.message}. Raw: ${raw.substring(0, 200)}`);
  }

  // 4. Math validation: opening + Σtx = closing (±0.01).
  if (llm.opening_balance == null || llm.closing_balance == null) {
    throw new Error('LLM did not return opening/closing balance');
  }
  if (!Array.isArray(llm.transactions)) {
    throw new Error('LLM did not return transactions array');
  }
  const txSum = llm.transactions.reduce((s, t) => s + (typeof t.amount === 'number' ? t.amount : 0), 0);
  const expected = llm.opening_balance + txSum;
  const diff = Math.abs(expected - llm.closing_balance);
  if (diff > 0.01) {
    throw new Error(
      `Math check failed: opening ${llm.opening_balance} + Σtx ${txSum.toFixed(2)} = ${expected.toFixed(2)}, ` +
      `but closing = ${llm.closing_balance} (diff ${diff.toFixed(2)})`,
    );
  }

  console.log(
    `[LLM-statement] ${filename}: ${llm.transactions.length} txns, ` +
    `${llm.opening_balance} → ${llm.closing_balance} ${llm.currency}` +
    (archivePath ? ` (archived: ${path.basename(archivePath)})` : ''),
  );

  // 5. Map to ParsedStatement (engine contract).
  const transactions: ParsedTransaction[] = llm.transactions.map((t) => ({
    date: t.date,
    amount: t.amount,
    currency: llm.currency,
    counterparty: t.counterparty || null,
    description: t.description || '',
    reference: t.reference || null,
  }));

  return {
    iban: llm.iban,
    account_number: llm.account_number,
    currency: llm.currency,
    opening_balance: llm.opening_balance,
    closing_balance: llm.closing_balance,
    period_from: llm.period_from,
    period_to: llm.period_to,
    transactions,
  };
}
