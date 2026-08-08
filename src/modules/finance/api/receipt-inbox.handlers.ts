/* eslint-disable @typescript-eslint/no-explicit-any */
//
// API handlers for the email-forward receipts inbox (PR #27).
//
// CRUD for fin_receipt_inboxes (IMAP credentials, encrypted password)
// + list/attach/archive for fin_pending_receipts.
//
// Reuses encryption + check engine from bank-inbox infrastructure.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { encryptPassword } from '../data/bank-inbox-engine';
import { checkReceiptInbox } from '../data/receipt-inbox-engine';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { publicMessage } from '@core/security/public-error';

const DATA_DIR = path.join(process.cwd(), 'data');

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  const sessionId = store.get('session_id')?.value;
  return getSessionUser(sessionId)?.id || null;
}

function maskedRow(row: any): any {
  if (!row) return row;
  const { imap_password_encrypted: _ignore, ...safe } = row;
  return safe;
}

// ─── Receipt inbox CRUD ──────────────────────────────────

export async function listReceiptInboxes(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const rows = db.prepare(
      "SELECT * FROM fin_receipt_inboxes WHERE organization_id = ? ORDER BY created_at DESC"
    ).all(orgId) as any[];
    return NextResponse.json({ items: rows.map(maskedRow) });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function createReceiptInbox(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    const {
      name, imap_host, imap_port = 993, imap_user, imap_password,
      imap_folder = 'INBOX', use_tls = 1,
      sender_filter = null, subject_filter = null,
      auto_match_threshold_pct = 1.0,
    } = body;

    if (!name || !imap_host || !imap_user || !imap_password) {
      return NextResponse.json({ error: 'name, imap_host, imap_user, imap_password are required' }, { status: 400 });
    }

    let encrypted: string;
    try { encrypted = encryptPassword(imap_password); }
    catch (e: any) { return NextResponse.json({ error: `Encryption failed: ${e.message}` }, { status: 500 }); }

    const id = `rinbox_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO fin_receipt_inboxes
        (id, organization_id, name, imap_host, imap_port, imap_user,
         imap_password_encrypted, imap_folder, use_tls,
         sender_filter, subject_filter, auto_match_threshold_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, orgId, name, imap_host, imap_port, imap_user, encrypted,
      imap_folder, use_tls ? 1 : 0, sender_filter, subject_filter, auto_match_threshold_pct,
    );

    const row = db.prepare("SELECT * FROM fin_receipt_inboxes WHERE id = ?").get(id);
    return NextResponse.json(maskedRow(row), { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function updateReceiptInbox(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const body = await request.json();

    const fields: string[] = [];
    const params: any[] = [];
    const allowed: Record<string, boolean> = {
      name: true, imap_host: true, imap_port: true, imap_user: true,
      imap_folder: true, use_tls: true,
      sender_filter: true, subject_filter: true, auto_match_threshold_pct: true,
      is_active: true,
    };
    for (const [k, v] of Object.entries(body)) {
      if (allowed[k]) { fields.push(`${k} = ?`); params.push(v); }
    }
    if (body.imap_password) {
      try { fields.push('imap_password_encrypted = ?'); params.push(encryptPassword(body.imap_password as string)); }
      catch (e: any) { return NextResponse.json({ error: `Encryption failed: ${e.message}` }, { status: 500 }); }
    }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE fin_receipt_inboxes SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare("SELECT * FROM fin_receipt_inboxes WHERE id = ?").get(id);
    return NextResponse.json(maskedRow(row));
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function deleteReceiptInbox(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM fin_receipt_inboxes WHERE id = ?").run(id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

export async function runReceiptInboxNow(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const inbox = db.prepare("SELECT * FROM fin_receipt_inboxes WHERE id = ?").get(id) as any;
    if (!inbox) return NextResponse.json({ error: 'Inbox not found' }, { status: 404 });
    const result = await checkReceiptInbox(db, inbox);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

// ─── Pending receipts ──────────────────────────────────

export async function listPendingReceipts(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const status = sp.get('status');
    const limit = Math.min(500, parseInt(sp.get('limit') || '100', 10));

    const where: string[] = ['p.organization_id = ?'];
    const params: any[] = [orgId];
    if (status) { where.push('p.status = ?'); params.push(status); }

    const rows = db.prepare(`
      SELECT
        p.*,
        o.id AS matched_op_id,
        o.amount AS matched_op_amount,
        o.currency AS matched_op_currency,
        o.paid_at AS matched_op_paid_at,
        o.comment AS matched_op_comment,
        cp.name AS matched_op_counterparty
      FROM fin_pending_receipts p
      LEFT JOIN fin_operations o ON o.id = p.auto_matched_operation_id
      LEFT JOIN finance_counterparties cp ON cp.id = o.counterparty_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.received_at DESC, p.created_at DESC
      LIMIT ${limit}
    `).all(...params) as any[];
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/finance/receipts/[id]/attach
 * Body: { operation_id }
 *
 * Moves the pending receipt's file into fin_operation_attachments
 * targeting the given operation, marks pending row as 'attached'.
 */
export async function attachPendingReceipt(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { id } = await context.params;
    const { operation_id } = await request.json();

    if (!operation_id) return NextResponse.json({ error: 'operation_id is required' }, { status: 400 });

    const pending = db.prepare(
      "SELECT * FROM fin_pending_receipts WHERE id = ? AND organization_id = ?"
    ).get(id, orgId) as any;
    if (!pending) return NextResponse.json({ error: 'Pending receipt not found' }, { status: 404 });
    if (pending.status === 'attached') {
      return NextResponse.json({ error: 'Already attached' }, { status: 400 });
    }

    const op = db.prepare(
      "SELECT id FROM fin_operations WHERE id = ? AND organization_id = ?"
    ).get(operation_id, orgId) as any;
    if (!op) return NextResponse.json({ error: 'Operation not found' }, { status: 404 });

    const attachmentId = `att_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const userId = await getCurrentUserId();

    db.prepare(`
      INSERT INTO fin_operation_attachments
        (id, organization_id, operation_id, file_name, storage_path,
         mime_type, size_bytes, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attachmentId, orgId, operation_id,
      pending.file_name, pending.storage_path,
      pending.mime_type, pending.size_bytes, userId,
    );

    db.prepare(`
      UPDATE fin_pending_receipts
      SET status = 'attached', attached_attachment_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(attachmentId, id);

    return NextResponse.json({ ok: true, attachment_id: attachmentId });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/finance/receipts/[id]/archive
 * Marks pending receipt as archived (won't show in default list).
 */
export async function archivePendingReceipt(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { id } = await context.params;
    db.prepare(
      "UPDATE fin_pending_receipts SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND organization_id = ?"
    ).run(id, orgId);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/finance/receipts/[id]/file — stream the pending receipt's file
 * (preview/download before attaching).
 */
export async function downloadPendingReceipt(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { id } = await context.params;
    const row = db.prepare(
      "SELECT * FROM fin_pending_receipts WHERE id = ? AND organization_id = ?"
    ).get(id, orgId) as any;
    if (!row) return NextResponse.json({ error: 'Pending receipt not found' }, { status: 404 });

    const fullPath = path.join(DATA_DIR, row.storage_path);
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'File missing on disk' }, { status: 410 });
    }
    const buf = fs.readFileSync(fullPath);
    const inline = row.mime_type?.startsWith('image/') || row.mime_type === 'application/pdf';
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': row.mime_type || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(row.file_name)}"`,
        'Content-Length': String(buf.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
