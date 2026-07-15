/* eslint-disable @typescript-eslint/no-explicit-any */
import * as crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser, type Attachment } from 'mailparser';
import { parseStringPromise } from 'xml2js';
import { loadActiveRules, applyRulesToOperation } from './auto-rules-engine';
import { createOperationInTx } from '../api/operations.handlers';
import { tryMatchBankOpToReceivables } from './clearing-engine';
import { tagOpWithRecurringSuggestion } from './recurring-engine';
import { parseKbPdf, validateParsedStatement } from './kb-pdf-parser';
import { parseStatementWithLlm } from './llm-statement-extractor';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';

// ─────────────────────────────────────────────────────────────────
// Encryption (AES-256-GCM)
// ─────────────────────────────────────────────────────────────────

function getKey(): Buffer {
  const hex = process.env.BANK_INBOX_SECRET;
  if (!hex || hex.length !== 64) {
    throw new Error('BANK_INBOX_SECRET env variable must be 64-char hex (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptPassword(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptPassword(encrypted: string): string {
  const key = getKey();
  const [ivB, tagB, ctB] = encrypted.split(':');
  if (!ivB || !tagB || !ctB) throw new Error('Invalid encrypted payload format');
  const iv = Buffer.from(ivB, 'base64');
  const tag = Buffer.from(tagB, 'base64');
  const ct = Buffer.from(ctB, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

// ─────────────────────────────────────────────────────────────────
// Telegram alert when an attachment fails to parse or validate.
// Dedup window keeps repeated KB layout changes from spamming chat —
// once we've shouted, we go quiet for an hour for the same reason.
// ─────────────────────────────────────────────────────────────────

const recentAlerts = new Map<string, number>();
const ALERT_DEDUP_MS = 60 * 60 * 1000; // 1 hour

async function notifyParseFailure(inboxName: string, filename: string, reason: string) {
  const key = `${inboxName}|${filename}|${reason.slice(0, 80)}`;
  const last = recentAlerts.get(key);
  const now = Date.now();
  if (last && now - last < ALERT_DEDUP_MS) return;
  recentAlerts.set(key, now);
  // Trim cache so it doesn't grow unbounded over a long-running process.
  if (recentAlerts.size > 50) {
    const cutoff = now - ALERT_DEDUP_MS;
    for (const [k, v] of recentAlerts) {
      if (v < cutoff) recentAlerts.delete(k);
    }
  }
  const esc = (s: string) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  const text = [
    `🚨 <b>Bank inbox: parser failed</b>`,
    ``,
    `📥 Inbox: <code>${esc(inboxName)}</code>`,
    `📎 File: <code>${esc(filename)}</code>`,
    `❌ Reason: ${esc(reason)}`,
    ``,
    `Перевір формат виписки на /finance/settings → Банк-приймач,`,
    `або глянь чи KB змінив структуру PDF.`,
  ].join('\n');
  await sendTelegramMessage(text);
}

// ─────────────────────────────────────────────────────────────────
// CAMT.053 XML parser
// ─────────────────────────────────────────────────────────────────

export interface ParsedTransaction {
  date: string;          // YYYY-MM-DD
  amount: number;        // signed: positive = credit (income), negative = debit (expense)
  currency: string;
  counterparty: string | null;
  description: string;
  reference: string | null;
}

export interface ParsedStatement {
  iban: string | null;
  account_number: string | null;
  currency: string;
  opening_balance: number | null;
  closing_balance: number | null;
  period_from: string | null;
  period_to: string | null;
  transactions: ParsedTransaction[];
}

export async function parseCamt053Xml(xml: string): Promise<ParsedStatement> {
  const parsed = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: false, mergeAttrs: true });

  // Walk: Document > BkToCstmrStmt > Stmt
  const doc = parsed.Document || parsed['Document'] || parsed['camt:Document'];
  if (!doc) throw new Error('Not a CAMT.053 document (missing <Document> root)');
  const root = doc.BkToCstmrStmt || doc['camt:BkToCstmrStmt'];
  if (!root) throw new Error('Missing <BkToCstmrStmt>');
  const stmt = Array.isArray(root.Stmt) ? root.Stmt[0] : root.Stmt;
  if (!stmt) throw new Error('Missing <Stmt>');

  const acct = stmt.Acct || {};
  const acctId = acct.Id || {};
  const iban = acctId.IBAN || (acctId.Othr?.Id) || null;
  const account_number = (acctId.Othr?.Id) || iban || null;
  const currency = acct.Ccy || stmt.Ccy || 'CZK';

  // Period
  const period = stmt.FrToDt || {};
  const period_from = period.FrDtTm ? String(period.FrDtTm).substring(0, 10) : null;
  const period_to = period.ToDtTm ? String(period.ToDtTm).substring(0, 10) : null;

  // Balances
  let opening_balance: number | null = null;
  let closing_balance: number | null = null;
  const balances = Array.isArray(stmt.Bal) ? stmt.Bal : (stmt.Bal ? [stmt.Bal] : []);
  for (const bal of balances) {
    const code = bal.Tp?.CdOrPrtry?.Cd;
    const amt = parseFloat(bal.Amt?._ || bal.Amt || '0');
    const sign = (bal.CdtDbtInd === 'CRDT') ? 1 : -1;
    if (code === 'OPBD' || code === 'PRCD') opening_balance = amt * sign;
    if (code === 'CLBD') closing_balance = amt * sign;
  }

  // Entries (transactions)
  const entries = Array.isArray(stmt.Ntry) ? stmt.Ntry : (stmt.Ntry ? [stmt.Ntry] : []);
  const transactions: ParsedTransaction[] = [];

  for (const entry of entries) {
    const amt = parseFloat(entry.Amt?._ || entry.Amt || '0');
    const cdtDbt = entry.CdtDbtInd; // 'CRDT' = credit (income), 'DBIT' = debit (expense)
    const signed = cdtDbt === 'CRDT' ? amt : -amt;
    const date = (entry.BookgDt?.Dt || entry.ValDt?.Dt || '').substring(0, 10);
    const txCurrency = entry.Amt?.Ccy || currency;

    // Counterparty extraction (different paths in CAMT)
    let counterparty: string | null = null;
    let description = '';
    let reference: string | null = null;

    const dtls = entry.NtryDtls;
    const txDetails = dtls?.TxDtls;
    const tx = Array.isArray(txDetails) ? txDetails[0] : txDetails;
    if (tx) {
      const relParties = tx.RltdPties;
      const isCredit = cdtDbt === 'CRDT';
      // For credits: counterparty = debtor (who paid us)
      // For debits: counterparty = creditor (who we paid)
      const party = isCredit ? (relParties?.Dbtr) : (relParties?.Cdtr);
      counterparty = party?.Nm || null;
      description = tx.RmtInf?.Ustrd || tx.AddtlTxInf || '';
      reference = tx.Refs?.EndToEndId || tx.Refs?.AcctSvcrRef || entry.AcctSvcrRef || null;
    }
    if (!description) description = entry.AddtlNtryInf || '';

    transactions.push({
      date, amount: signed, currency: txCurrency,
      counterparty, description: String(description).trim(), reference,
    });
  }

  return { iban, account_number, currency, opening_balance, closing_balance, period_from, period_to, transactions };
}

// ─────────────────────────────────────────────────────────────────
// CSV parser (KB format)
// ─────────────────────────────────────────────────────────────────

export function parseKbCsv(csv: string): ParsedStatement {
  // KB CSV: ';' separator, header row, fields like:
  //   "Datum splatnosti";"Částka";"Měna";"Protiúčet";"Popis";"Symbol";...
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { iban: null, account_number: null, currency: 'CZK', opening_balance: null, closing_balance: null, period_from: null, period_to: null, transactions: [] };

  const header = lines[0].split(';').map((h) => h.replace(/"/g, '').trim().toLowerCase());
  const idxDate = header.findIndex((h) => h.includes('datum'));
  const idxAmount = header.findIndex((h) => h.includes('částka') || h.includes('castka') || h.includes('amount'));
  const idxCurrency = header.findIndex((h) => h.includes('měna') || h.includes('mena') || h.includes('currency'));
  const idxCounterparty = header.findIndex((h) => h.includes('protiúčet') || h.includes('protiuc') || h.includes('název') || h.includes('nazev'));
  const idxDescription = header.findIndex((h) => h.includes('popis') || h.includes('description') || h.includes('zpráva'));

  const transactions: ParsedTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map((c) => c.replace(/^"|"$/g, '').trim());
    const date = cols[idxDate >= 0 ? idxDate : 0]?.split(/[./]/).reverse().join('-') || '';
    const amountRaw = (cols[idxAmount >= 0 ? idxAmount : 1] || '0').replace(/\s/g, '').replace(',', '.');
    const amount = parseFloat(amountRaw);
    if (!isFinite(amount)) continue;
    transactions.push({
      date, amount, currency: cols[idxCurrency >= 0 ? idxCurrency : 2] || 'CZK',
      counterparty: cols[idxCounterparty] || null,
      description: cols[idxDescription] || '',
      reference: null,
    });
  }
  return { iban: null, account_number: null, currency: 'CZK', opening_balance: null, closing_balance: null, period_from: null, period_to: null, transactions };
}

// ─────────────────────────────────────────────────────────────────
// IMAP fetcher
// ─────────────────────────────────────────────────────────────────

export interface BankInboxConfig {
  id: string;
  organization_id: string;
  name: string;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password_encrypted: string;
  imap_folder: string;
  use_tls: number;
  sender_filter: string | null;
  subject_filter: string | null;
  attachment_format: string;
  last_uid: number | null;
  is_active: number;
}

export interface CheckResult {
  newEmails: number;
  imported: number;
  errors: string[];
  unmatched: number;  // statements where IBAN didn't match any account
}

export async function checkInbox(db: any, inbox: BankInboxConfig): Promise<CheckResult> {
  const result: CheckResult = { newEmails: 0, imported: 0, errors: [], unmatched: 0 };
  const password = decryptPassword(inbox.imap_password_encrypted);

  const client = new ImapFlow({
    host: inbox.imap_host,
    port: inbox.imap_port,
    secure: !!inbox.use_tls,
    auth: { user: inbox.imap_user, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(inbox.imap_folder);
    try {
      const since = inbox.last_uid ? `${inbox.last_uid + 1}:*` : '1:*';
      let maxUid = inbox.last_uid || 0;

      for await (const msg of client.fetch(since, { uid: true, source: true, envelope: true }, { uid: true })) {
        if (!msg.uid || msg.uid <= (inbox.last_uid || 0)) continue;
        maxUid = Math.max(maxUid, msg.uid);

        const fromAddr = msg.envelope?.from?.[0]?.address || '';
        const subject = msg.envelope?.subject || '';

        // Apply filters
        if (inbox.sender_filter && !fromAddr.toLowerCase().includes(inbox.sender_filter.toLowerCase())) continue;
        if (inbox.subject_filter && !subject.toLowerCase().includes(inbox.subject_filter.toLowerCase())) continue;

        result.newEmails++;

        try {
          const parsed = await simpleParser(msg.source as Buffer);
          const attachments: Attachment[] = parsed.attachments || [];
          for (const att of attachments) {
            const filename = (att.filename || '').toLowerCase();
            const isXml = filename.endsWith('.xml') || att.contentType === 'application/xml' || att.contentType === 'text/xml';
            const isCsv = filename.endsWith('.csv') || att.contentType === 'text/csv';
            const isPdf = filename.endsWith('.pdf') || att.contentType === 'application/pdf';
            if (!isXml && !isCsv && !isPdf) continue;

            let stmt: ParsedStatement;
            try {
              if (isXml) {
                stmt = await parseCamt053Xml(att.content.toString('utf8'));
              } else if (isCsv) {
                stmt = parseKbCsv(att.content.toString('utf8'));
              } else {
                // PDF — LLM-based extractor (works for any bank format).
                // If OPENAI_API_KEY is missing or LLM fails, fall back to
                // the legacy KB-specific regex parser as a last resort.
                if (process.env.OPENAI_API_KEY) {
                  try {
                    stmt = await parseStatementWithLlm(att.content as Buffer, filename, msg.uid);
                  } catch (llmErr: any) {
                    console.log(`[BankInbox] LLM extractor failed (${llmErr.message}), falling back to regex parser`);
                    stmt = await parseKbPdf(att.content as Buffer);
                  }
                } else {
                  stmt = await parseKbPdf(att.content as Buffer);
                }
              }
            } catch (e: any) {
              const reason = `parse failed — ${e.message}`;
              result.errors.push(`Email UID ${msg.uid}, attach ${filename}: ${reason}`);
              await notifyParseFailure(inbox.name, filename, reason).catch(() => {});
              continue;
            }

            // Health-check: opening + Σ(transactions) must match closing.
            // If KB tweaks the PDF layout (renames a header, splits a column,
            // etc.) the parser may still extract some text but get the
            // numbers wrong — catch that here before posting bad data.
            const validationIssue = validateParsedStatement(stmt);
            if (validationIssue) {
              const reason = `validation failed — ${validationIssue}`;
              result.errors.push(`Email UID ${msg.uid}, attach ${filename}: ${reason}`);
              await notifyParseFailure(inbox.name, filename, reason).catch(() => {});
              continue;
            }

            const importedCount = importStatement(db, inbox, stmt, msg.uid, msg.envelope?.date || new Date());
            if (importedCount === -1) result.unmatched++;
            else result.imported += importedCount;
          }
        } catch (e: any) {
          result.errors.push(`Email UID ${msg.uid}: ${e.message}`);
        }
      }

      // Update inbox state
      db.prepare(`
        UPDATE fin_bank_inboxes
        SET last_uid = ?, last_synced_at = datetime('now'),
            last_error = ?,
            emails_processed = emails_processed + ?,
            operations_imported = operations_imported + ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        maxUid,
        result.errors.length > 0 ? result.errors.slice(0, 5).join(' | ').slice(0, 1000) : null,
        result.newEmails,
        result.imported,
        inbox.id,
      );
      if (result.newEmails > 0) {
        db.prepare("UPDATE fin_bank_inboxes SET last_email_at = datetime('now') WHERE id = ?").run(inbox.id);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Import statement → bank_transactions + auto-rules → fin_operations
// Returns: number of operations imported, or -1 if account not matched
// ─────────────────────────────────────────────────────────────────

function normalizeIban(s: string | null): string {
  return (s || '').replace(/[\s\-/]/g, '').toUpperCase();
}

function findAccountByIban(db: any, orgId: string, statement: ParsedStatement): string | null {
  const iban = normalizeIban(statement.iban);
  const acctNum = normalizeIban(statement.account_number);
  if (!iban && !acctNum) return null;

  // Try exact IBAN match first
  if (iban) {
    const row = db.prepare(`
      SELECT id FROM finance_accounts
      WHERE organization_id = ? AND iban IS NOT NULL
        AND REPLACE(REPLACE(REPLACE(UPPER(iban), ' ', ''), '-', ''), '/', '') = ?
    `).get(orgId, iban) as { id: string } | undefined;
    if (row) return row.id;
  }
  // Fall back to account_number suffix match (for KB CZ format like "12345-6789012345/0100")
  if (acctNum) {
    const row = db.prepare(`
      SELECT id FROM finance_accounts
      WHERE organization_id = ? AND iban IS NOT NULL
        AND REPLACE(REPLACE(REPLACE(UPPER(iban), ' ', ''), '-', ''), '/', '') LIKE '%' || ? || '%'
    `).get(orgId, acctNum) as { id: string } | undefined;
    if (row) return row.id;
  }
  return null;
}

export function importStatement(db: any, inbox: BankInboxConfig, stmt: ParsedStatement, uid: number, emailDate: Date): number {
  const accountId = findAccountByIban(db, inbox.organization_id, stmt);
  if (!accountId) return -1; // unmatched — don't import

  // Create bank_statement record
  const stmtId = `stmt_inbox_${Date.now()}_${uid}_${Math.random().toString(36).slice(2, 5)}`;
  const fileName = `inbox-${inbox.imap_user}-uid${uid}.xml`;
  db.prepare(`
    INSERT INTO bank_statements (id, organization_id, file_name, bank_name, account_number, period_from, period_to, total_transactions, status)
    VALUES (?, ?, ?, 'KB (auto)', ?, ?, ?, ?, 'done')
  `).run(stmtId, inbox.organization_id, fileName, stmt.iban || stmt.account_number || '', stmt.period_from || '', stmt.period_to || '', stmt.transactions.length);

  // Insert bank_transactions + auto-rules → fin_operations
  const insTx = db.prepare(`
    INSERT INTO bank_transactions (id, statement_id, organization_id, transaction_date, amount, counterparty, description, reference, matched_operation_id, match_status, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const activeRules = loadActiveRules(db, inbox.organization_id);
  let imported = 0;

  const tx = db.transaction(() => {
    for (let i = 0; i < stmt.transactions.length; i++) {
      const t = stmt.transactions[i];
      const txId = `btx_inbox_${Date.now()}_${uid}_${i}_${Math.random().toString(36).slice(2, 4)}`;

      // Create fin_operation: positive = income (account_to), negative = expense (account_from)
      const isIncome = t.amount > 0;
      const opId = createOperationInTx(db, inbox.organization_id, {
        op_type: isIncome ? 'income' : 'expense',
        account_from_id: isIncome ? null : accountId,
        account_to_id: isIncome ? accountId : null,
        amount: Math.abs(t.amount),
        currency: t.currency,
        paid_at: t.date,
        comment: [t.counterparty, t.description, t.reference ? `Ref: ${t.reference}` : null].filter(Boolean).join(' · '),
        method: 'bank_transfer',
        source: 'bank_import',
        source_ref: `inbox:${inbox.id}:${uid}:${i}`,
        status: 'completed',
      });

      // Apply auto-rules to the new operation
      if (activeRules.length > 0) {
        const newOp = db.prepare("SELECT * FROM fin_operations WHERE id = ?").get(opId) as any;
        if (newOp) applyRulesToOperation(db, newOp, activeRules, inbox.organization_id);
      }

      // PR #16: try to settle any matching channel receivables (Booking
      // payout group, VRBO single-row). Income operations only.
      if (isIncome) {
        try {
          tryMatchBankOpToReceivables(db, inbox.organization_id, opId, Math.abs(t.amount), t.currency, t.date);
        } catch (e: any) { console.log('[BankInbox] receivable match error:', e.message); }
      }

      // PR #26: tag op with a recurring template suggestion if one looks like
      // a likely match (rent / utilities / salary). User confirms in UI.
      try {
        const newOp = db.prepare("SELECT op_type, amount, currency, counterparty_id, paid_at FROM fin_operations WHERE id = ?").get(opId) as any;
        if (newOp) {
          tagOpWithRecurringSuggestion(db, inbox.organization_id, opId, newOp);
        }
      } catch (e: any) { console.log('[BankInbox] recurring suggestion error:', e.message); }

      insTx.run(
        txId, stmtId, inbox.organization_id, t.date, t.amount,
        t.counterparty || null, t.description || null, t.reference || null,
        opId, 'auto_matched', 1.0,
      );
      imported++;
    }
  });
  tx();

  db.prepare("UPDATE bank_statements SET matched_transactions = ? WHERE id = ?").run(imported, stmtId);
  return imported;
}

// ─────────────────────────────────────────────────────────────────
// Rate-limited tick (called from getDb)
// ─────────────────────────────────────────────────────────────────

export async function runBankInboxTickIfDue(db: any): Promise<boolean> {
  const lastRow = db.prepare("SELECT value FROM fin_system_state WHERE key = 'last_bank_inbox_tick'").get() as { value: string } | undefined;
  const now = Date.now();
  if (lastRow?.value) {
    const last = new Date(lastRow.value).getTime();
    if (now - last < 15 * 60 * 1000) return false; // < 15 min
  }
  // Mark immediately to prevent concurrent runs
  db.prepare(`
    INSERT INTO fin_system_state (key, value) VALUES ('last_bank_inbox_tick', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(new Date().toISOString());

  // Run async (don't block getDb)
  setImmediate(async () => {
    try {
      const inboxes = db.prepare("SELECT * FROM fin_bank_inboxes WHERE is_active = 1").all() as BankInboxConfig[];
      for (const inbox of inboxes) {
        try {
          const r = await checkInbox(db, inbox);
          if (r.newEmails > 0 || r.errors.length > 0 || r.unmatched > 0) {
            console.log(`[BankInbox] ${inbox.name}: ${r.newEmails} new emails, ${r.imported} ops, ${r.unmatched} unmatched, ${r.errors.length} errors`);
          }
        } catch (e: any) {
          console.error(`[BankInbox] ${inbox.name} failed:`, e.message);
          db.prepare("UPDATE fin_bank_inboxes SET last_error = ?, updated_at = datetime('now') WHERE id = ?").run(e.message, inbox.id);
        }
      }
    } catch (e: any) {
      console.error('[BankInbox] tick error:', e.message);
    }
  });
  return true;
}
