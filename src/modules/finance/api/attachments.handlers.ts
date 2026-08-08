/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Finance operation attachments — invoices, receipts, photos linked to
// individual fin_operations rows. Storage is local filesystem under
// data/attachments/<orgId>/<YYYY-MM>/<id>_<safeName>.
//
// Files are stored next to the SQLite DB (data/), excluded from git, and
// served back via the download endpoint with content-type sniffing.
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { publicMessage } from '@core/security/public-error';

const DATA_DIR = path.join(process.cwd(), 'data');
const ATTACH_ROOT = path.join(DATA_DIR, 'attachments');

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'application/vnd.', 'application/zip', 'text/'];

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  const sessionId = store.get('session_id')?.value;
  const user = getSessionUser(sessionId);
  return user?.id || null;
}

function isMimeAllowed(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

/**
 * POST /api/finance/operations/[id]/attachments
 * Multipart form-data: file=<file>
 *
 * Stores file under data/attachments/<orgId>/<YYYY-MM>/<id>_<safeName>
 * and inserts metadata row.
 */
export async function uploadAttachment(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { id: operationId } = await context.params;

    const op = db.prepare("SELECT id FROM fin_operations WHERE id = ? AND organization_id = ?")
      .get(operationId, orgId) as { id: string } | undefined;
    if (!op) return NextResponse.json({ error: 'Operation not found' }, { status: 404 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 413 });
    }
    const mime = file.type || 'application/octet-stream';
    if (!isMimeAllowed(mime)) {
      return NextResponse.json({ error: `MIME type not allowed: ${mime}` }, { status: 415 });
    }

    const attachmentId = `att_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const yearMonth = new Date().toISOString().substring(0, 7);
    const orgDir = path.join(ATTACH_ROOT, orgId, yearMonth);
    ensureDir(orgDir);

    const cleanName = safeFileName(file.name);
    const storedFileName = `${attachmentId}_${cleanName}`;
    const fullPath = path.join(orgDir, storedFileName);
    const relPath = path.relative(DATA_DIR, fullPath).replace(/\\/g, '/');

    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(fullPath, buf);

    const userId = await getCurrentUserId();
    db.prepare(`
      INSERT INTO fin_operation_attachments
        (id, organization_id, operation_id, file_name, storage_path,
         mime_type, size_bytes, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(attachmentId, orgId, operationId, file.name, relPath, mime, file.size, userId);

    const row = db.prepare("SELECT * FROM fin_operation_attachments WHERE id = ?").get(attachmentId);
    return NextResponse.json({ ok: true, attachment: row }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/finance/operations/[id]/attachments
 * Returns metadata list for the operation. No file contents.
 */
export async function listOperationAttachments(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { id: operationId } = await context.params;

    const rows = db.prepare(`
      SELECT a.id, a.file_name, a.mime_type, a.size_bytes, a.uploaded_by,
             a.created_at, u.full_name AS uploaded_by_name
      FROM fin_operation_attachments a
      LEFT JOIN app_users u ON u.id = a.uploaded_by
      WHERE a.organization_id = ? AND a.operation_id = ?
      ORDER BY a.created_at DESC
    `).all(orgId, operationId);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/finance/attachments/[id]
 * Streams the file content with the original filename + sniffed mime.
 * Inline disposition for PDFs/images, attachment for everything else.
 */
export async function downloadAttachment(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { id } = await context.params;

    const row = db.prepare(`
      SELECT * FROM fin_operation_attachments
      WHERE id = ? AND organization_id = ?
    `).get(id, orgId) as any;
    if (!row) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

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

/**
 * DELETE /api/finance/attachments/[id]
 * Removes the file from disk + DB row. Best-effort: if file is already
 * gone, still removes the DB row.
 */
export async function deleteAttachment(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const { id } = await context.params;

    const row = db.prepare(`
      SELECT storage_path FROM fin_operation_attachments
      WHERE id = ? AND organization_id = ?
    `).get(id, orgId) as { storage_path: string } | undefined;
    if (!row) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

    const fullPath = path.join(DATA_DIR, row.storage_path);
    try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch { /* ignore disk error */ }

    db.prepare("DELETE FROM fin_operation_attachments WHERE id = ?").run(id);
    return NextResponse.json({ ok: true, deleted_id: id });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/finance/operations/attachment-counts?ids=op1,op2,...
 * Bulk endpoint for the operations list — returns { [opId]: count } for
 * displaying the 📎 badge without making N requests.
 */
export async function getAttachmentCounts(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const idsParam = request.nextUrl.searchParams.get('ids') || '';
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 500);
    if (ids.length === 0) return NextResponse.json({ counts: {} });

    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT operation_id, COUNT(*) AS cnt FROM fin_operation_attachments
      WHERE organization_id = ? AND operation_id IN (${placeholders})
      GROUP BY operation_id
    `).all(orgId, ...ids) as { operation_id: string; cnt: number }[];

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.operation_id] = r.cnt;
    return NextResponse.json({ counts });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
