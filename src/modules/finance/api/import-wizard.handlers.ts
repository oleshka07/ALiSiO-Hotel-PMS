/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import {
  parseUploadedFile, suggestFieldMapping,
  findFormatBySignature, listSavedFormats, saveFormat,
  SUPPORTED_FIELDS,
} from '../data/import-wizard-engine';
import { buildEntityCandidates, saveResolutions, type EntityType } from '../data/entity-matcher';
import { processRowsForReview, commitApprovedRows } from '../data/import-commit-engine';
import { publicMessage } from '@core/security/public-error';

const ENTITY_FIELD_MAP: Record<EntityType, string[]> = {
  account:      ['account_from', 'account_to'],
  category:     ['category'],
  project:      ['project'],
  counterparty: ['counterparty'],
};

function getOrgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

/**
 * POST /api/finance/import/parse
 * Multipart: file=<xlsx|csv>
 *
 * Stage 1 of the wizard: parse the uploaded file, return:
 *   - headers + sample rows (first 20 for preview)
 *   - row_count
 *   - signature (sha256 of normalised headers)
 *   - matched_format (if a saved format with this signature exists)
 *   - suggested_mapping (heuristic field guess for first-time formats)
 *   - supported_fields (list of PMS field names UI uses for dropdowns)
 *   - rows_payload (full parsed data, base64-zipped for next stage)
 *
 * No DB writes — purely parsing for UI to show the wizard.
 */
export async function parseImportFile(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseUploadedFile(buffer, file.name);

    if (parsed.headers.length === 0) {
      return NextResponse.json({ error: 'No columns detected — empty file?' }, { status: 400 });
    }

    const matchedFormat = findFormatBySignature(db, orgId, parsed.signature);
    const suggestedMapping = matchedFormat
      ? safeJsonParse(matchedFormat.field_mappings_json, {})
      : suggestFieldMapping(parsed.headers);

    return NextResponse.json({
      ok: true,
      file_name: file.name,
      headers: parsed.headers,
      sample_rows: parsed.rows.slice(0, 20),
      row_count: parsed.row_count,
      signature: parsed.signature,
      matched_format: matchedFormat ? {
        id: matchedFormat.id,
        name: matchedFormat.name,
        description: matchedFormat.description,
      } : null,
      suggested_mapping: suggestedMapping,
      supported_fields: SUPPORTED_FIELDS,
      // Send full rows back so the wizard's next stage doesn't need to re-upload
      all_rows: parsed.rows,
    });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/finance/import/formats
 * List all saved import formats for the org.
 */
export async function listImportFormats(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const items = listSavedFormats(db, orgId).map((r: any) => ({
      ...r,
      field_mappings: safeJsonParse(r.field_mappings_json, {}),
    }));
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/finance/import/formats
 * Body: { id?, name, description?, signature, field_mappings: {colIdx: fieldName} }
 *
 * Creates or updates a saved format. The next time a file with the same
 * header signature is parsed, this format will auto-match.
 */
export async function saveImportFormat(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.name || !body.signature || !body.field_mappings) {
      return NextResponse.json({ error: 'name, signature, field_mappings required' }, { status: 400 });
    }
    const id = saveFormat(db, orgId, {
      id: body.id, name: body.name, description: body.description,
      signature: body.signature, field_mappings: body.field_mappings,
    });
    const row = db.prepare("SELECT * FROM import_formats WHERE id = ?").get(id) as any;
    return NextResponse.json({ ok: true, id, format: { ...row, field_mappings: safeJsonParse(row.field_mappings_json, {}) } });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/finance/import/formats/[id]
 */
export async function deleteImportFormat(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const db = getDb();
    const { id } = await context.params;
    db.prepare("DELETE FROM import_formats WHERE id = ?").run(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/finance/import/runs
 * Recent import runs (audit log).
 */
export async function listImportRuns(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const items = db.prepare(`
      SELECT r.*, f.name AS format_name
      FROM import_runs r
      LEFT JOIN import_formats f ON f.id = r.format_id
      WHERE r.organization_id = ?
      ORDER BY r.created_at DESC LIMIT 50
    `).all(orgId);
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

function safeJsonParse(s: string | null, fallback: any): any {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

/**
 * POST /api/finance/import/resolve
 * Body: { format_id, field_mappings: {colIdx: fieldName}, all_rows: any[][] }
 *
 * Stage 2 of the wizard: extracts unique values for each entity-typed
 * column (account_from/account_to, category, project, counterparty),
 * runs fuzzy matching against existing PMS entities, and returns
 * candidate suggestions plus any previously-saved resolutions for this
 * format. UI then shows dropdowns for the user to confirm/override.
 */
export async function resolveEntities(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    const { format_id, field_mappings, all_rows } = body;
    if (!field_mappings || !Array.isArray(all_rows)) {
      return NextResponse.json({ error: 'field_mappings and all_rows required' }, { status: 400 });
    }

    // Build a reverse index: PMS field name → list of source column indices
    const fieldToCols: Record<string, number[]> = {};
    for (const [colIdx, fieldName] of Object.entries(field_mappings)) {
      const f = String(fieldName);
      if (!fieldToCols[f]) fieldToCols[f] = [];
      fieldToCols[f].push(parseInt(colIdx, 10));
    }

    const result: Record<EntityType, any> = {} as any;
    for (const entityType of Object.keys(ENTITY_FIELD_MAP) as EntityType[]) {
      const cols: number[] = [];
      for (const fieldName of ENTITY_FIELD_MAP[entityType]) {
        if (fieldToCols[fieldName]) cols.push(...fieldToCols[fieldName]);
      }
      if (cols.length === 0) {
        result[entityType] = { source_values_count: 0, items: [] };
        continue;
      }

      // Collect unique non-empty values across all the columns assigned to this entity
      const uniqueValues = new Set<string>();
      for (const row of all_rows) {
        for (const col of cols) {
          const v = row[col];
          if (v != null && String(v).trim()) uniqueValues.add(String(v).trim());
        }
      }
      const candidates = buildEntityCandidates(db, orgId, format_id || null, entityType, [...uniqueValues]);
      result[entityType] = { source_values_count: uniqueValues.size, items: candidates };
    }

    return NextResponse.json({ ok: true, resolutions: result });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/finance/import/review
 * Body: { format_id, field_mappings, all_rows }
 *
 * Stage 3 prep: applies field mapping + saved resolutions to every row,
 * checks each against existing fin_operations for duplicates (date ±2d
 * + amount ±0.01 + same op_type/currency). Returns row-by-row decision
 * data the UI uses to render the review table.
 */
export async function reviewRows(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.format_id || !body.field_mappings || !Array.isArray(body.all_rows)) {
      return NextResponse.json({ error: 'format_id, field_mappings, all_rows required' }, { status: 400 });
    }
    const result = processRowsForReview(db, orgId, body.format_id, body.field_mappings, body.all_rows);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/finance/import/commit
 * Body: { format_id, file_name, approved_rows: ProcessedRow[] }
 *
 * Final write: creates fin_operations from each approved row, auto-
 * creating any entities still in 'create_new' state (cached per source
 * value within the batch so duplicates aren't spawned). Persists an
 * import_runs audit row.
 */
export async function commitImport(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const orgId = getOrgId(db);
    const body = await request.json();
    if (!body.format_id || !Array.isArray(body.approved_rows)) {
      return NextResponse.json({ error: 'format_id and approved_rows required' }, { status: 400 });
    }
    const result = commitApprovedRows(db, orgId, {
      formatId: body.format_id,
      fileName: body.file_name || 'unnamed',
      approvedRows: body.approved_rows,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * POST /api/finance/import/save-resolutions
 * Body: { format_id, resolutions: { account: [...], category: [...], ... } }
 *
 * Persists user's entity resolution choices. On future imports of the
 * same format, these auto-apply (no re-mapping needed).
 */
export async function saveEntityResolutions(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const body = await request.json();
    const { format_id, resolutions } = body;
    if (!format_id || !resolutions) {
      return NextResponse.json({ error: 'format_id and resolutions required' }, { status: 400 });
    }
    let total = 0;
    for (const entityType of Object.keys(resolutions) as EntityType[]) {
      const list = resolutions[entityType] as any[];
      if (!Array.isArray(list)) continue;
      total += saveResolutions(db, format_id, entityType, list);
    }
    return NextResponse.json({ ok: true, total_saved: total });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
