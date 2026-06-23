/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Email Channel Client (IMAP + SMTP)
 * Multi-account support: email.cz (Seznam) + Gmail + any IMAP/SMTP provider.
 */
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import OpenAI from 'openai';

/* ────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────── */
export interface EmailAccountConfig {
  id: string;         // e.g. 'emailcz', 'gmail'
  label: string;      // e.g. 'Email.cz', 'Gmail'
  user: string;
  password: string;
  imap: { host: string; port: number };
  smtp: { host: string; port: number };
  folder: string;
  fromName?: string;
}

export interface IncomingEmail {
  uid: number;
  messageId: string;
  from: { name: string; address: string };
  to: string;
  subject: string;
  date: Date;
  textBody: string;
  htmlBody?: string;
  accountId: string;   // which account received this
}

export interface EmailClassification {
  category: 'guest' | 'uncertain' | 'not_guest';
  confidence: number;
  reason: string;
  guestName?: string;
  guestEmail?: string;
  language?: string;
}

/* ────────────────────────────────────────────────────────
   Account Registry — reads all configured accounts from env
   ──────────────────────────────────────────────────────── */
export function getEmailAccounts(): EmailAccountConfig[] {
  const accounts: EmailAccountConfig[] = [];

  // Account 1: Gmail (kempcarlsbad@gmail.com) — PRIMARY / DEFAULT
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    accounts.push({
      id: 'gmail',
      label: 'Gmail',
      user: process.env.GMAIL_USER,
      password: process.env.GMAIL_APP_PASSWORD,
      imap: { host: 'imap.gmail.com', port: 993 },
      smtp: { host: 'smtp.gmail.com', port: 587 },
      folder: 'INBOX',
      fromName: 'Carlsbad Wellness & Camping Resort',
    });
  }

  // Account 2: email.cz (QA Glamping) — secondary, used only when explicitly selected
  if (process.env.EMAIL_CZ_USER && process.env.EMAIL_CZ_PASSWORD) {
    accounts.push({
      id: 'emailcz',
      label: 'Email.cz',
      user: process.env.EMAIL_CZ_USER,
      password: process.env.EMAIL_CZ_PASSWORD,
      imap: {
        host: process.env.EMAIL_CZ_IMAP_HOST || 'imap.seznam.cz',
        port: parseInt(process.env.EMAIL_CZ_IMAP_PORT || '993'),
      },
      smtp: {
        host: process.env.EMAIL_CZ_SMTP_HOST || 'smtp.seznam.cz',
        port: parseInt(process.env.EMAIL_CZ_SMTP_PORT || '587'),
      },
      folder: process.env.EMAIL_POLL_FOLDER || 'INBOX',
      fromName: 'QA Glamping',
    });
  }

  return accounts;
}

/** Get a specific account by ID */
export function getAccountById(accountId: string): EmailAccountConfig | undefined {
  return getEmailAccounts().find(a => a.id === accountId);
}

/** Get an account by email address (for routing replies) */
export function getAccountByAddress(address: string): EmailAccountConfig | undefined {
  return getEmailAccounts().find(a => a.user.toLowerCase() === address.toLowerCase());
}

/* ────────────────────────────────────────────────────────
   IMAP — Fetch new emails from a specific account
   ──────────────────────────────────────────────────────── */
export async function fetchNewEmails(account: EmailAccountConfig, sinceDate?: Date): Promise<IncomingEmail[]> {
  const client = new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: true,
    auth: { user: account.user, pass: account.password },
    logger: false,
  });

  const emails: IncomingEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(account.folder);

    try {
      const since = sinceDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const searchCriteria = { seen: false, since };

      const messages = client.fetch(searchCriteria, {
        uid: true,
        envelope: true,
        source: true,
        bodyStructure: true,
      });

      for await (const msg of messages) {
        try {
          const envelope = msg.envelope;
          if (!envelope) continue;

          const fromAddr = envelope.from?.[0];
          if (!fromAddr?.address) continue;

          let textBody = '';
          let htmlBody = '';

          if (msg.source) {
            const sourceStr = msg.source.toString();
            textBody = extractTextFromSource(sourceStr);
            if (sourceStr.includes('<html')) {
              htmlBody = extractHtmlFromSource(sourceStr);
            }
          }

          emails.push({
            uid: msg.uid,
            messageId: envelope.messageId || `uid-${msg.uid}`,
            from: {
              name: fromAddr.name || fromAddr.address.split('@')[0],
              address: fromAddr.address,
            },
            to: envelope.to?.[0]?.address || account.user,
            subject: envelope.subject || '(no subject)',
            date: envelope.date || new Date(),
            textBody: textBody || envelope.subject || '',
            htmlBody: htmlBody || undefined,
            accountId: account.id,
          });
        } catch (e) {
          console.error(`[Email:${account.id}] Error parsing message:`, e);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error(`[Email:${account.id}] IMAP connection error:`, e);
    try { await client.logout(); } catch { /* */ }
    throw e;
  }

  return emails;
}

/** Fetch from ALL configured accounts */
export async function fetchNewEmailsAllAccounts(sinceDate?: Date): Promise<IncomingEmail[]> {
  const accounts = getEmailAccounts();
  const allEmails: IncomingEmail[] = [];

  for (const account of accounts) {
    try {
      console.log(`[Email:${account.id}] Polling ${account.user}...`);
      const emails = await fetchNewEmails(account, sinceDate);
      allEmails.push(...emails);
      console.log(`[Email:${account.id}] Got ${emails.length} new emails`);
    } catch (err: any) {
      console.error(`[Email:${account.id}] Failed to poll:`, err.message);
    }
  }

  return allEmails;
}

/* ────────────────────────────────────────────────────────
   Mark email as read on a specific account
   ──────────────────────────────────────────────────────── */
export async function markEmailAsRead(uid: number, account: EmailAccountConfig): Promise<void> {
  const client = new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: true,
    auth: { user: account.user, pass: account.password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(account.folder);
    try {
      await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error(`[Email:${account.id}] Error marking as read:`, e);
    try { await client.logout(); } catch { /* */ }
  }
}

/* ────────────────────────────────────────────────────────
   SMTP — Send email from a specific account
   ──────────────────────────────────────────────────────── */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  accountId?: string;   // send from this account (defaults to first)
}): Promise<{ messageId: string; success: boolean }> {
  // Find the right account
  let account: EmailAccountConfig | undefined;
  if (opts.accountId) {
    account = getAccountById(opts.accountId);
  }
  if (!account) {
    const accounts = getEmailAccounts();
    account = accounts[0]; // Default to first configured
  }
  if (!account) {
    throw new Error('No email accounts configured');
  }

  const port = account.smtp.port === 465 ? 587 : account.smtp.port; // Force 587 for Seznam to avoid Vercel drop
  const isPort465 = port === 465;
  const transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: port,
    secure: isPort465,  // true for 465 (SSL), false for 587 (STARTTLS)
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    auth: { user: account.user, pass: account.password },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${account.fromName || 'ALiSiO Resort'}" <${account.user}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      inReplyTo: opts.inReplyTo,
      references: opts.references,
    });

    console.log(`[Email:${account.id}] Successfully sent email to ${opts.to} (MessageID: ${info.messageId})`);
    return { messageId: info.messageId, success: true };
  } catch (err) {
    console.error(`[Email:${account.id}] SMTP send error:`, err);
    return { messageId: '', success: false };
  }
}

/* ────────────────────────────────────────────────────────
   Blacklist filter
   ──────────────────────────────────────────────────────── */
export function isBlacklisted(email: IncomingEmail): boolean {
  const blacklistStr = process.env.EMAIL_BLACKLIST_DOMAINS || '';
  const blacklist = blacklistStr.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

  const senderDomain = email.from.address.split('@')[1]?.toLowerCase() || '';
  const senderAddr = email.from.address.toLowerCase();

  for (const rule of blacklist) {
    if (senderDomain.includes(rule) || senderAddr.includes(rule)) return true;
  }

  // Whitelist: OTA platforms that send from noreply@ addresses (booking.com filtered upstream)
  const whitelistedDomains = ['airbnb.com', 'expedia.com', 'agoda.com'];
  const isWhitelisted = whitelistedDomains.some(d => senderDomain.includes(d));

  // Skip obvious system emails (but NOT whitelisted OTA platforms)
  if (!isWhitelisted) {
    const systemPatterns = [
      'mailer-daemon', 'postmaster', 'no-reply', 'noreply',
      'donotreply', 'notifications@', 'alert@', 'newsletter',
    ];
    for (const p of systemPatterns) {
      if (senderAddr.includes(p)) return true;
    }
  }

  // Skip emails FROM our own accounts (self-sent)
  const ownAddresses = getEmailAccounts().map(a => a.user.toLowerCase());
  if (ownAddresses.includes(senderAddr)) return true;

  return false;
}

/* ────────────────────────────────────────────────────────
   AI Classification
   ──────────────────────────────────────────────────────── */
export async function classifyEmail(email: IncomingEmail): Promise<EmailClassification> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { category: 'uncertain', confidence: 0.5, reason: 'No AI key', guestName: email.from.name, guestEmail: email.from.address };
  }

  const client = new OpenAI({ apiKey });

  const prompt = `Classify this incoming email to a hotel/resort (Carlsbad Wellness & Camping Resort / QA Glamping in Luhačovice, Czech Republic).

FROM: ${email.from.name} <${email.from.address}>
SUBJECT: ${email.subject}
BODY (first 500 chars):
${email.textBody.substring(0, 500)}

Classify into ONE category:
- "guest" = This is from a potential or existing guest (booking inquiry, reservation question, check-in info, complaint, review, availability request, price question)
- "uncertain" = Unclear if guest or not (could be either)
- "not_guest" = Definitely NOT a guest (supplier invoice, newsletter, system notification, spam, marketing, internal communication, service provider)

Respond ONLY with valid JSON:
{
  "category": "guest" | "uncertain" | "not_guest",
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "guestName": "extracted guest name if available",
  "language": "detected language code (cs/en/de/uk/ru/etc)"
}`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { category: 'uncertain', confidence: 0.5, reason: 'Empty AI response', guestEmail: email.from.address };

    const parsed = JSON.parse(content) as EmailClassification;
    parsed.guestEmail = email.from.address;
    if (!parsed.guestName) parsed.guestName = email.from.name;
    return parsed;
  } catch (err) {
    console.error('[Email AI] Classification error:', err);
    return { category: 'uncertain', confidence: 0.3, reason: 'AI error', guestName: email.from.name, guestEmail: email.from.address };
  }
}

/* ────────────────────────────────────────────────────────
   Helpers — extract text from raw email source (MIME-aware)
   ──────────────────────────────────────────────────────── */

/** Parse a MIME part: extract headers (charset, CTE) and body after the blank line */
function extractMimePart(source: string, contentType: 'text/plain' | 'text/html'): { body: string; charset: string; encoding: string } | null {
  // Find the Content-Type header for this type
  const ctRegex = new RegExp(`Content-Type:\\s*${contentType.replace('/', '\\/')}[^\\r\\n]*(?:\\r?\\n[ \\t]+[^\\r\\n]*)*`, 'i');
  const ctMatch = source.match(ctRegex);
  if (!ctMatch) return null;

  const ctHeader = ctMatch[0];
  const ctPos = source.indexOf(ctHeader);

  // Extract charset from Content-Type
  const charsetMatch = ctHeader.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  const charset = charsetMatch?.[1]?.toLowerCase() || 'utf-8';

  // From the Content-Type position, find the blank line that separates MIME headers from body.
  // MIME part headers may include Content-Transfer-Encoding, Content-Disposition, etc.
  const afterCt = source.substring(ctPos);
  const blankLineIdx = afterCt.search(/\r?\n\r?\n/);
  if (blankLineIdx < 0) return null;

  // Read all MIME part headers (from Content-Type to blank line)
  const mimeHeaders = afterCt.substring(0, blankLineIdx);

  // Extract Content-Transfer-Encoding
  const cteMatch = mimeHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i);
  const encoding = cteMatch?.[1]?.toLowerCase() || '7bit';

  // Body starts after the blank line
  const bodyStartOffset = blankLineIdx + (afterCt[blankLineIdx] === '\r' ? 4 : 2);
  const bodyRaw = afterCt.substring(bodyStartOffset);

  // Find end of this MIME part (next boundary or end of source)
  const boundaryEnd = bodyRaw.search(/\r?\n--/);
  const body = boundaryEnd > 0 ? bodyRaw.substring(0, boundaryEnd) : bodyRaw;

  return { body, charset, encoding };
}

function extractTextFromSource(source: string): string {
  // Try text/plain first
  const textPart = extractMimePart(source, 'text/plain');
  if (textPart) {
    return decodeMimeBody(textPart.body, textPart.encoding, textPart.charset);
  }

  // Fallback: try text/html → strip tags
  const htmlPart = extractMimePart(source, 'text/html');
  if (htmlPart) {
    const decoded = decodeMimeBody(htmlPart.body, htmlPart.encoding, htmlPart.charset);
    return decoded.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  // Last resort: skip top-level headers, take raw body
  const headerEnd = source.indexOf('\r\n\r\n');
  if (headerEnd > 0) {
    return source.substring(headerEnd + 4, headerEnd + 2000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return '';
}

function extractHtmlFromSource(source: string): string {
  const htmlPart = extractMimePart(source, 'text/html');
  if (!htmlPart) return '';
  return decodeMimeBody(htmlPart.body, htmlPart.encoding, htmlPart.charset);
}

/**
 * Decode MIME body based on Content-Transfer-Encoding and charset.
 * Supports: base64, quoted-printable, 7bit/8bit (passthrough).
 */
function decodeMimeBody(body: string, encoding: string, charset: string = 'utf-8'): string {
  if (encoding === 'base64') {
    try {
      const cleaned = body.replace(/\s/g, '');
      const buf = Buffer.from(cleaned, 'base64');
      return decodeBuffer(buf, charset);
    } catch {
      return body; // fallback: return raw
    }
  }

  if (encoding === 'quoted-printable') {
    // Remove soft line breaks, then decode hex sequences to bytes
    const unfolded = body.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    let i = 0;
    while (i < unfolded.length) {
      if (unfolded[i] === '=' && i + 2 < unfolded.length && /[0-9A-Fa-f]{2}/.test(unfolded.substring(i + 1, i + 3))) {
        bytes.push(parseInt(unfolded.substring(i + 1, i + 3), 16));
        i += 3;
      } else {
        bytes.push(unfolded.charCodeAt(i));
        i++;
      }
    }
    return decodeBuffer(Buffer.from(bytes), charset);
  }

  // 7bit, 8bit, binary — return as-is
  return body;
}

/** Decode a Buffer using the specified charset (utf-8, iso-8859-2, windows-1250, etc.) */
function decodeBuffer(buf: Buffer, charset: string): string {
  try {
    const decoder = new TextDecoder(charset);
    return decoder.decode(buf);
  } catch {
    // Fallback to utf-8 if charset is not recognized
    return buf.toString('utf-8');
  }
}
