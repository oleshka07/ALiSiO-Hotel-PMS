/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { checkRateLimit } from '@/lib/rate-limit';
import path from 'path';
import fs from 'fs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'guest-docs');

/**
 * POST /api/guest/[token]/doc-upload
 * Accepts a document photo, saves it locally, runs OCR, returns parsed fields.
 * Acts as a secure proxy to /api/bookings/ocr (which has no auth on its own).
 * Does NOT auto-save — just returns OCR result for user confirmation.
 */
export async function uploadGuestDoc(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    const db = getDb();

    // Rate limit: 5 OCR requests per 10 min per token
    const rl = checkRateLimit(token, 'registration', 5, 10);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many upload requests. Please wait.' },
        { status: 429, headers: CORS_HEADERS },
      );
    }

    // Verify token belongs to a valid reservation
    const reservation = db.prepare(`
      SELECT r.id FROM reservations r
      WHERE r.guest_page_token = ? AND r.status NOT IN ('cancelled', 'no_show')
    `).get(token) as any;

    if (!reservation) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // Parse multipart form
    const formData = await request.formData();
    const file = formData.get('photo') as File | null;
    const guestIndex = formData.get('guestIndex');

    if (!file) {
      return NextResponse.json(
        { error: 'No photo provided. Use field name "photo".' },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type "${file.type}". Allowed: jpg, png, webp, heic` },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Max 10MB.' },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Save file locally
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const ext = path.extname(file.name) || '.jpg';
    const filename = `${reservation.id}_guest${guestIndex ?? 0}_${Date.now()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const docUrl = `/api/uploads/guest-docs/${filename}`;

    // Convert to base64 for OCR
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    // Run OCR via existing ocrDocument function
    const { ocrDocument } = require('@/lib/ai/ocr-document');
    let ocrResult: any = null;
    try {
      ocrResult = await ocrDocument(dataUrl);
      
      // ── Telegram notification ──────────────────────────────────
      try {
        const { sendTelegramMessage } = require('@/lib/channels/telegram-bot');
        const text = [
          `📄 <b>Завантажено документ (Скан/Фото)</b>`,
          `📋 <b>Reservation:</b> <code>${reservation.id}</code>`,
          ocrResult?.firstName || ocrResult?.lastName ? `👤 <b>Розпізнано:</b> ${ocrResult.firstName || ''} ${ocrResult.lastName || ''}`.trim() : null
        ].filter(Boolean).join('\n');
        sendTelegramMessage(text).catch(() => {});
      } catch { /* non-critical */ }
      
    } catch (ocrErr: any) {
      console.error('[DocUpload] OCR failed:', ocrErr.message);
      // Still return the saved URL even if OCR fails
      return NextResponse.json({
        success: true,
        docUrl,
        ocrFailed: true,
        message: 'Document saved but OCR failed. Please fill fields manually.',
      }, { status: 200, headers: CORS_HEADERS });
    }

    return NextResponse.json({
      success: true,
      docUrl,
      ocr: {
        firstName: ocrResult.firstName || null,
        lastName: ocrResult.lastName || null,
        dateOfBirth: ocrResult.dateOfBirth || null,
        documentType: ocrResult.documentType || null,
        documentNumber: ocrResult.documentNumber || null,
        nationality: ocrResult.nationality || null,
        address: ocrResult.address || null,
        confidence: ocrResult.confidence ?? 0,
      },
    }, { status: 200, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[DocUpload] POST error:', error?.message);
    return NextResponse.json(
      { error: error?.message || 'Upload failed' },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export function handleOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
