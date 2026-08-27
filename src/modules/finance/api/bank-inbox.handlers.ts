/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { encryptPassword, decryptPassword, checkInbox, listSkipped, diagnoseInboxCrypto, type BankInboxConfig } from '../data/bank-inbox-engine';
import { ImapFlow } from 'imapflow';
import { publicMessage } from '@core/security/public-error';

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function maskedRow(row: any) {
  if (!row) return row;
  const { imap_password_encrypted: _omit, ...rest } = row;
  return { ...rest, has_password: !!_omit };
}

export async function listBankInboxes(_req: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const rows = db.prepare(`
      SELECT * FROM fin_bank_inboxes WHERE organization_id = ?
      ORDER BY created_at DESC
    `).all(orgId);
    return NextResponse.json(rows.map(maskedRow));
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function createBankInbox(req: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await req.json();
    const {
      name, imap_host, imap_port = 993, imap_user, imap_password,
      imap_folder = 'INBOX', use_tls = true,
      sender_filter, subject_filter, attachment_format = 'auto',
      is_active = true,
    } = body;

    if (!name?.trim() || !imap_host || !imap_user || !imap_password) {
      return NextResponse.json({ error: 'name, imap_host, imap_user, imap_password are required' }, { status: 400 });
    }

    let encrypted: string;
    try { encrypted = encryptPassword(imap_password); }
    catch (e: any) { return NextResponse.json({ error: `Encryption failed: ${e.message}` }, { status: 500 }); }

    const orgId = getOrgId(db);
    const id = `inbox_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO fin_bank_inboxes
        (id, organization_id, name, imap_host, imap_port, imap_user, imap_password_encrypted,
         imap_folder, use_tls, sender_filter, subject_filter, attachment_format, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, orgId, name.trim(), imap_host, imap_port, imap_user, encrypted,
      imap_folder, use_tls ? 1 : 0,
      sender_filter || null, subject_filter || null, attachment_format,
      is_active ? 1 : 0,
    );
    const row = db.prepare("SELECT * FROM fin_bank_inboxes WHERE id = ?").get(id);
    return NextResponse.json(maskedRow(row), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function updateBankInbox(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const existing = db.prepare("SELECT id FROM fin_bank_inboxes WHERE id = ?").get(id);
    if (!existing) return NextResponse.json({ error: 'Inbox not found' }, { status: 404 });

    const fields: string[] = [];
    const params: any[] = [];
    const allowed = ['name', 'imap_host', 'imap_port', 'imap_user', 'imap_folder', 'use_tls',
      'sender_filter', 'subject_filter', 'attachment_format', 'is_active'];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        fields.push(`${k} = ?`);
        const v = body[k];
        params.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v === '' ? null : v));
      }
    }
    if (body.imap_password) {
      fields.push('imap_password_encrypted = ?');
      params.push(encryptPassword(body.imap_password));
    }
    fields.push("updated_at = datetime('now')");
    if (fields.length === 1) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    params.push(id);

    db.prepare(`UPDATE fin_bank_inboxes SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare("SELECT * FROM fin_bank_inboxes WHERE id = ?").get(id);
    return NextResponse.json(maskedRow(row));
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function deleteBankInbox(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    db.prepare("DELETE FROM fin_bank_inboxes WHERE id = ?").run(id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function toggleBankInbox(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    const row = db.prepare("SELECT is_active FROM fin_bank_inboxes WHERE id = ?").get(id) as any;
    if (!row) return NextResponse.json({ error: 'Inbox not found' }, { status: 404 });
    db.prepare("UPDATE fin_bank_inboxes SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(row.is_active ? 0 : 1, id);
    const updated = db.prepare("SELECT * FROM fin_bank_inboxes WHERE id = ?").get(id);
    return NextResponse.json(maskedRow(updated));
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function testBankInbox(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    const inbox = db.prepare("SELECT * FROM fin_bank_inboxes WHERE id = ?").get(id) as BankInboxConfig | undefined;
    if (!inbox) return NextResponse.json({ error: 'Inbox not found' }, { status: 404 });

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
      await client.mailboxOpen(inbox.imap_folder);
      const status = await client.status(inbox.imap_folder, { messages: true, recent: true, unseen: true });
      await client.logout();
      return NextResponse.json({
        ok: true,
        message: 'Connection OK',
        mailbox: { messages: status.messages, recent: status.recent, unseen: status.unseen },
      });
    } catch (e: any) {
      await client.logout().catch(() => {});
      return NextResponse.json({ ok: false, error: publicMessage(e) }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function runBankInboxNow(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    const inbox = db.prepare("SELECT * FROM fin_bank_inboxes WHERE id = ?").get(id) as BankInboxConfig | undefined;
    if (!inbox) return NextResponse.json({ error: 'Inbox not found' }, { status: 404 });
    const result = await checkInbox(db, inbox);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

/**
 * Re-read a mailbox from an earlier point.
 *
 * The poller advances last_uid past every message it reads, including the ones
 * it could not turn into operations — a statement that would not parse, would
 * not validate, or arrived for an IBAN no account here matches. Those were
 * skipped and never revisited, which is how a week of statements can go
 * missing while the poll itself reports success every fifteen minutes.
 *
 * Nothing was lost: this code never deletes or flags a message, so they are all
 * still sitting in IMAP. This re-reads them.
 *
 * Safe to run repeatedly. importStatement now skips any transaction whose
 * source_ref is already posted, so a re-read tops up what is missing instead of
 * doubling what is there.
 *
 * Body (all optional):
 *   from_uid       start here instead of after last_uid
 *   days           start from the oldest still-skipped email, or that many days
 *                  of UIDs back if none are recorded
 *   retry_skipped  default true — start at the lowest UID in the skipped list
 */
export async function rescanBankInbox(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    const inbox = db.prepare("SELECT * FROM fin_bank_inboxes WHERE id = ?").get(id) as BankInboxConfig | undefined;
    if (!inbox) return NextResponse.json({ error: 'Inbox not found' }, { status: 404 });

    const body = await req.json().catch(() => ({} as any));
    const skipped = listSkipped(db, id);

    let fromUid: number | undefined;
    if (typeof body.from_uid === 'number' && body.from_uid > 0) {
      fromUid = Math.floor(body.from_uid);
    } else if (body.retry_skipped !== false && skipped.length > 0) {
      fromUid = Math.min(...skipped.map(r => r.uid));
    } else if (typeof body.days === 'number' && body.days > 0) {
      // UIDs are not dates, so this is deliberately blunt: step back a
      // generous number of them and let the duplicate check absorb the
      // overlap. Re-reading too much costs a little IMAP traffic; re-reading
      // too little leaves the statement missing.
      fromUid = Math.max(1, (inbox.last_uid || 0) - Math.ceil(body.days) * 20);
    }

    if (fromUid == null) {
      return NextResponse.json({
        ok: true,
        rescanned: false,
        message: 'Nothing recorded as skipped. Pass from_uid or days to re-read anyway.',
        last_uid: inbox.last_uid,
      });
    }

    const before = listSkipped(db, id).length;
    const result = await checkInbox(db, inbox, { fromUid });
    const after = listSkipped(db, id).length;

    return NextResponse.json({
      ok: true,
      rescanned: true,
      from_uid: fromUid,
      last_uid_before: inbox.last_uid,
      emails_read: result.newEmails,
      imported: result.imported,
      already_posted: result.skippedDuplicates,
      still_unmatched: result.unmatched,
      skipped_before: before,
      skipped_after: after,
      errors: result.errors,
    });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

/** What the poller read but could not import — the recoverable backlog. */
export async function listSkippedEmails(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    return NextResponse.json({ ok: true, skipped: listSkipped(db, id) });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

/** Why the mailboxes stopped: a broken .env, or a replaced secret. */
export async function diagnoseBankInboxes(_req: NextRequest): Promise<NextResponse> {
  try {
    return NextResponse.json({ ok: true, ...diagnoseInboxCrypto(getDb()) });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

export async function runAllInboxes(_req: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const inboxes = db.prepare("SELECT * FROM fin_bank_inboxes WHERE is_active = 1").all() as BankInboxConfig[];
    const results = [];
    for (const inbox of inboxes) {
      try {
        const r = await checkInbox(db, inbox);
        results.push({ inbox: inbox.name, ...r });
      } catch (e: any) {
        results.push({ inbox: inbox.name, error: publicMessage(e) });
      }
    }
    return NextResponse.json({ ok: true, count: inboxes.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}
