/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import {
  parseBookingCsv, parseVrboCsv, parseAirbnbCsv, applyStatementToReceivables,
  detectChannelFromCsv, type StatementChannel,
} from '../data/statement-parsers';
import { publicMessage } from '@core/security/public-error';

function orgId(db: any): string {
  const row = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
  if (!row) throw new Error('No organization found');
  return row.id;
}

/**
 * POST /api/finance/clearing/statements
 * Multipart form-data: file=<csv>, channel=auto|booking|vrbo|airbnb
 * Returns parse + match outcomes (per row).
 */
export async function uploadStatement(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);

    const form = await request.formData();
    const file = form.get('file');
    const channelHint = (form.get('channel') as string) || 'auto';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    const text = await file.text();

    let channel: StatementChannel | null = null;
    if (channelHint === 'auto') {
      channel = detectChannelFromCsv(text);
      if (!channel) {
        return NextResponse.json({
          error: 'Could not auto-detect statement format. Please pick channel manually.',
        }, { status: 400 });
      }
    } else if (['booking', 'vrbo', 'airbnb'].includes(channelHint)) {
      channel = channelHint as StatementChannel;
    } else {
      return NextResponse.json({ error: 'channel must be auto|booking|vrbo|airbnb' }, { status: 400 });
    }

    let rows;
    if (channel === 'booking') rows = parseBookingCsv(text);
    else if (channel === 'vrbo')    rows = parseVrboCsv(text);
    else if (channel === 'airbnb')  rows = parseAirbnbCsv(text);
    else {
      return NextResponse.json({ error: `Parser for ${channel} not implemented yet` }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows parsed from file. Check format.' }, { status: 400 });
    }

    const result = applyStatementToReceivables(db, org, channel, rows);

    // Persist upload record (orphans counted as applied for activity log purposes)
    const uploadId = `upl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO fin_statement_uploads
        (id, organization_id, channel, file_name, row_count, applied_count, cancelled_count, unmatched_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uploadId, org, channel, file.name,
      rows.length,
      result.applied + result.orphans_created,
      result.cancelled,
      result.unmatched,
    );

    return NextResponse.json({
      ok: true,
      upload_id: uploadId,
      channel,
      file_name: file.name,
      total_rows: rows.length,
      applied: result.applied,
      orphans_created: result.orphans_created,
      cancelled: result.cancelled,
      unmatched: result.unmatched,
      outcomes: result.outcomes,
    });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}

/**
 * GET /api/finance/clearing/statements
 * List recent uploads (for the reconcile page activity log).
 */
export async function listStatementUploads(_request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const org = orgId(db);
    const rows = db.prepare(`
      SELECT id, channel, file_name, row_count, applied_count, cancelled_count,
             unmatched_count, created_at
      FROM fin_statement_uploads
      WHERE organization_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(org);
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
