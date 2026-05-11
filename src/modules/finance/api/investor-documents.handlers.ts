/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Investor Portal v2 — Documents Vault.
//
// Stores files on local VPS filesystem under data/uploads/investor-documents/.
// Each file gets a UUID-prefixed name to prevent collisions and path traversal.
// DB row tracks metadata; physical file lives next to data/alisio.db.
//
// Endpoints (admin-only, gated by manage_investors):
//   GET    /api/finance/investor-documents?investor_id=&business_unit_id=
//   POST   /api/finance/investor-documents      (multipart/form-data upload)
//   DELETE /api/finance/investor-documents/[id]
//
// Public download for investor:
//   GET    /api/finance/investor-documents/[id]/download
//

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_ROOT = path.join(process.cwd(), 'data', 'uploads', 'investor-documents');

function ensureUploadRoot(): void {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
}

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

const ALLOWED_TYPES = ['agreement', 'monthly_report', 'tax_statement', 'bank_statement', 'other'] as const;

export async function listDocuments(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const sp = request.nextUrl.searchParams;
    const investorId = sp.get('investor_id');
    const buId = sp.get('business_unit_id');

    const where: string[] = ['d.organization_id = ?', 'd.is_archived = 0'];
    const params: any[] = [orgId];
    if (investorId) { where.push('d.investor_id = ?'); params.push(investorId); }
    if (buId)       { where.push('d.business_unit_id = ?'); params.push(buId); }

    const rows = db.prepare(`
      SELECT d.*, i.name AS investor_name, bu.name AS business_unit_name
      FROM investor_documents d
      LEFT JOIN investors i        ON i.id = d.investor_id
      LEFT JOIN business_units bu  ON bu.id = d.business_unit_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.uploaded_at DESC
    `).all(...params);

    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/investor-documents
 * multipart/form-data:
 *   file:            File (required)
 *   type:            agreement | monthly_report | tax_statement | bank_statement | other
 *   name:            string (optional, defaults to original filename)
 *   investor_id:     optional
 *   business_unit_id: optional
 *   period_start:    YYYY-MM-DD optional
 *   period_end:      YYYY-MM-DD optional
 *   uploaded_by:     optional user name
 */
export async function uploadDocument(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

    const type = (form.get('type') as string) || 'other';
    if (!ALLOWED_TYPES.includes(type as any)) {
      return NextResponse.json({ error: `type must be one of ${ALLOWED_TYPES.join(', ')}` }, { status: 400 });
    }

    const investorId = (form.get('investor_id') as string) || null;
    const buId       = (form.get('business_unit_id') as string) || null;
    const periodStart = (form.get('period_start') as string) || null;
    const periodEnd   = (form.get('period_end') as string) || null;
    const uploadedBy  = (form.get('uploaded_by') as string) || null;
    const displayName = (form.get('name') as string) || file.name;

    ensureUploadRoot();

    const id = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    // Sanitise filename: keep only safe characters, prefix with id for uniqueness
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
    const physName = `${id}-${safeName}`;
    const physPath = path.join(UPLOAD_ROOT, physName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(physPath, buffer);

    db.prepare(`
      INSERT INTO investor_documents
        (id, organization_id, investor_id, business_unit_id, type, name, file_path,
         file_size, mime_type, period_start, period_end, uploaded_by, is_archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id, orgId, investorId, buId, type, displayName, physName,
      buffer.length, file.type || null, periodStart, periodEnd, uploadedBy,
    );

    return NextResponse.json({ id, ok: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function deleteDocument(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;

    const row = db.prepare("SELECT file_path FROM investor_documents WHERE id = ?").get(id) as { file_path: string } | undefined;
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Best-effort delete physical file; ignore if missing
    try {
      const physPath = path.join(UPLOAD_ROOT, row.file_path);
      if (fs.existsSync(physPath)) fs.unlinkSync(physPath);
    } catch (e: any) { console.log('[investor-documents] delete physical:', e.message); }

    db.prepare("DELETE FROM investor_documents WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/investor-documents/[id]/download
 * Returns the file binary with Content-Disposition: attachment.
 */
export async function downloadDocument(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  try {
    const db = getDb();
    const { id } = await context.params;
    const row = db.prepare("SELECT name, file_path, mime_type FROM investor_documents WHERE id = ?").get(id) as { name: string; file_path: string; mime_type: string | null } | undefined;
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const physPath = path.join(UPLOAD_ROOT, row.file_path);
    if (!fs.existsSync(physPath)) {
      return NextResponse.json({ error: 'File missing on disk' }, { status: 410 });
    }
    const buf = fs.readFileSync(physPath);
    return new Response(buf as any, {
      headers: {
        'Content-Type': row.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(row.name)}"`,
        'Content-Length': String(buf.length),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
