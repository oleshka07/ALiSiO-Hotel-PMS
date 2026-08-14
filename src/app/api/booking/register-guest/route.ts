/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { ocrDocument } from '@/lib/ai/ocr-document';
import { saveRegistrations } from '@/modules/guests/data/registration.repo';
import { publicMessage } from '@core/security/public-error';
import fs from 'fs';
import path from 'path';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
};

/** A local upload path becomes the bytes themselves; anything else is passed through. */
function toOcrSource(docUrl: string): string {
  if (docUrl.startsWith('data:') || docUrl.startsWith('http')) return docUrl;

  const rel = docUrl.replace(/^\/api\/uploads\//, '');
  const resolved = path.resolve(path.join(UPLOAD_DIR, rel));
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) {
    throw new Error('Document path outside the upload directory');
  }
  if (!fs.existsSync(resolved)) throw new Error(`Document not found: ${docUrl}`);

  const mime = MIME[path.extname(resolved).toLowerCase()] || 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(resolved).toString('base64')}`;
}

/**
 * POST /api/booking/register-guest
 * Body: { reservation_id: string, document_urls: string[] }
 * Runs GPT-4o OCR on each document, registers guests in PMS.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reservation_id, document_urls } = body;

    if (!reservation_id || !document_urls?.length) {
      return NextResponse.json(
        { error: 'reservation_id and document_urls[] are required' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const db = getDb();

    // Resolve reservation
    const reservation = db.prepare(`
      SELECT r.id, r.adults, p.organization_id,
             g.first_name as booking_first_name, g.last_name as booking_last_name
      FROM reservations r
      JOIN properties p ON r.property_id = p.id
      JOIN guests g ON r.guest_id = g.id
      WHERE r.id = ?
    `).get(reservation_id) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404, headers: CORS_HEADERS });
    }

    // OCR each document.
    //
    // A relative /api/uploads/... path is read off disk and handed to the model
    // as bytes. Turning it into an absolute link, as this did, produced a URL
    // the model could not fetch: /api/uploads is not public in the request
    // gate, so it answers 401 to anyone without a session — and OCR never has
    // one. Nothing here needs the file to be reachable from the internet.
    const ocrResults = [];
    for (const docUrl of document_urls) {
      try {
        const result = await ocrDocument(toOcrSource(docUrl));
        if (result.confidence > 15) {
          ocrResults.push(result);
        }
        console.log(`[OCR] ${result.firstName} ${result.lastName} (confidence: ${result.confidence})`);
      } catch (err: any) {
        console.error('[OCR] Failed:', docUrl, err.message);
      }
    }

    // If OCR found nothing usable, don't save incomplete records
    if (ocrResults.length === 0) {
      return NextResponse.json(
        { error: 'Could not read document data. Please register manually through the guest page.', ocr_failed: true },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    // Validate that OCR results have required fields before saving
    const validResults = ocrResults.filter(r =>
      r.firstName && r.lastName && r.dateOfBirth && r.documentNumber
    );

    if (validResults.length === 0) {
      return NextResponse.json(
        { error: 'Document was read but required fields are missing (name, date of birth, document number). Please register manually.', ocr_failed: true },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    // Save to PMS guests + reservation_guests + guest_registrations
    const saved = saveRegistrations(
      reservation_id,
      reservation.organization_id,
      validResults.map(r => ({
        firstName: r.firstName,
        lastName: r.lastName,
        dateOfBirth: r.dateOfBirth ?? undefined,
        documentNumber: r.documentNumber ?? undefined,
        documentType: r.documentType,
        nationality: r.nationality ?? undefined,
        address: r.address ?? undefined,
      }))
    );

    // Log document activity
    try {
      db.prepare(`
        INSERT INTO reservation_activity (id, reservation_id, type, description, created_by, created_at)
        VALUES (lower(hex(randomblob(16))), ?, 'document_upload', ?, 'guest', datetime('now'))
      `).run(reservation_id, JSON.stringify({ document_urls, guests_registered: ocrResults.length }));
    } catch { /* table may not exist */ }

    return NextResponse.json({
      success: true,
      guests_registered: saved.length,
      ocr_results: ocrResults,
    }, { headers: CORS_HEADERS });

  } catch (err: any) {
    console.error('[register-guest]', err.message);
    return NextResponse.json({ error: publicMessage(err) }, { status: 500, headers: CORS_HEADERS });
  }
}
