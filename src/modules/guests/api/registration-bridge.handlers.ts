/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Registration Telegram Bridge
 *
 * Allows the Python bot (kemptimebot) to:
 *  - POST photos of passports/IDs → OCR → register guests
 *  - GET today's check-ins to show as inline keyboard
 *
 * Auth: Bearer <TELEGRAM_BRIDGE_TOKEN> (same as finance bridge)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { ocrDocument } from '@/lib/ai/ocr-document';
import { saveRegistrations } from '@/modules/guests/data/registration.repo';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';
import fs from 'fs';
import path from 'path';

// ── Auth ──────────────────────────────────────────────────────────

function authorizeBridge(request: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
  const expected = process.env.TELEGRAM_BRIDGE_TOKEN;
  if (!expected) {
    return { ok: false, response: NextResponse.json({ error: 'Bridge not configured' }, { status: 503 }) };
  }
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.substring(7) : '';
  if (!token || token !== expected) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid bridge token' }, { status: 401 }) };
  }
  return { ok: true };
}

// ── GET: Today's check-ins (for bot inline keyboard) ─────────────

export async function getTodayCheckIns(request: NextRequest) {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const rows = db.prepare(`
    SELECT r.id, r.check_in, r.check_out, r.adults, r.children,
           r.registration_status, r.status,
           g.first_name, g.last_name,
           u.code as unit_code, u.name as unit_name
    FROM reservations r
    JOIN guests g ON r.guest_id = g.id
    JOIN units u ON r.unit_id = u.id
    WHERE r.check_in = ?
      AND r.status IN ('confirmed', 'checked_in')
    ORDER BY u.code ASC
  `).all(today) as any[];

  return NextResponse.json({
    date: today,
    reservations: rows.map(r => ({
      id: r.id,
      guest: `${r.first_name} ${r.last_name}`,
      unit: r.unit_code || r.unit_name,
      checkIn: r.check_in,
      checkOut: r.check_out,
      adults: r.adults,
      children: r.children,
      registrationStatus: r.registration_status,
      // Short label for inline button: "ST4 · John Doe (2 guests)"
      label: `${r.unit_code} · ${r.first_name} ${r.last_name} (${r.adults}${r.children ? '+' + r.children : ''})`,
    })),
  });
}

// ── POST: Register guests from passport photos ───────────────────

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'registrations');

export async function registerFromPhotos(request: NextRequest) {
  const auth = authorizeBridge(request);
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    const reservationId = formData.get('reservation_id') as string;
    const chatId = formData.get('chat_id') as string;

    if (!reservationId) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const db = getDb();

    // Verify reservation exists
    const reservation = db.prepare(`
      SELECT r.id, r.adults, r.children, r.check_in, r.check_out,
             p.organization_id,
             g.first_name as booking_first_name, g.last_name as booking_last_name,
             u.code as unit_code, u.name as unit_name
      FROM reservations r
      JOIN properties p ON r.property_id = p.id
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      WHERE r.id = ?
    `).get(reservationId) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // Collect uploaded photos
    const photos: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'photos' && value instanceof File) {
        photos.push(value);
      }
    }

    // Also support photos_0, photos_1, ... (Python requests may send indexed)
    for (let i = 0; i < 30; i++) {
      const f = formData.get(`photos_${i}`) as File | null;
      if (f) photos.push(f);
      else if (i > 0) break; // stop after first gap
    }

    // Also support single 'photo' field
    const singlePhoto = formData.get('photo') as File | null;
    if (singlePhoto) photos.push(singlePhoto);

    if (photos.length === 0) {
      return NextResponse.json({ error: 'No photos provided' }, { status: 400 });
    }

    if (photos.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 photos per request' }, { status: 400 });
    }

    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    // Save photos to disk and OCR each one
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || 'localhost:3000';
    const baseUrl = `${proto}://${host}`;

    const ocrResults: any[] = [];
    const errors: string[] = [];
    const savedPaths: string[] = [];

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      try {
        // Save to disk
        const ext = path.extname(photo.name || '.jpg') || '.jpg';
        const filename = `reg_${reservationId}_${Date.now()}_${i}${ext}`;
        const filePath = path.join(UPLOAD_DIR, filename);
        const buffer = Buffer.from(await photo.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        savedPaths.push(filePath);

        // OCR via URL (the file is served by /api/uploads/...)
        const photoUrl = `${baseUrl}/api/uploads/registrations/${filename}`;
        console.log(`[TG Registration] OCR photo ${i + 1}/${photos.length}: ${filename}`);
        const result = await ocrDocument(photoUrl);
        
        if (result.confidence > 15) {
          ocrResults.push(result);
          console.log(`[TG Registration] ✅ ${result.firstName} ${result.lastName} (confidence: ${result.confidence})`);
        } else {
          errors.push(`Photo ${i + 1}: low confidence (${result.confidence}), skipped`);
          console.log(`[TG Registration] ⚠️ Photo ${i + 1}: low confidence ${result.confidence}`);
        }
      } catch (err: any) {
        errors.push(`Photo ${i + 1}: ${err.message}`);
        console.error(`[TG Registration] ❌ Photo ${i + 1}:`, err.message);
      }
    }

    if (ocrResults.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not extract data from any photos',
        details: errors,
        photos_received: photos.length,
      }, { status: 422 });
    }

    // Save registrations
    const saved = saveRegistrations(
      reservationId,
      reservation.organization_id,
      ocrResults.map(r => ({
        firstName: r.firstName,
        lastName: r.lastName,
        dateOfBirth: r.dateOfBirth ?? undefined,
        documentNumber: r.documentNumber ?? undefined,
        documentType: r.documentType,
        nationality: r.nationality ?? undefined,
        address: r.address ?? undefined,
      }))
    );

    // Send TG notification
    const guestList = ocrResults.map((r, i) => 
      `  ${i + 1}. ${r.firstName} ${r.lastName}${r.nationality ? ` (${r.nationality})` : ''}${r.documentNumber ? ` · ${r.documentNumber}` : ''}`
    ).join('\n');

    const notifLines = [
      `📋 <b>Реєстрація гостей</b>`,
      ``,
      `🏠 ${reservation.unit_code} · ${reservation.booking_first_name} ${reservation.booking_last_name}`,
      `📅 ${reservation.check_in} → ${reservation.check_out}`,
      ``,
      `✅ <b>Зареєстровано ${ocrResults.length}/${photos.length} гостей:</b>`,
      guestList,
    ];

    if (errors.length > 0) {
      notifLines.push(``, `⚠️ Проблеми: ${errors.length}`);
      for (const e of errors.slice(0, 3)) {
        notifLines.push(`  · ${e}`);
      }
    }

    sendTelegramMessage(notifLines.join('\n')).catch(() => {});

    return NextResponse.json({
      success: true,
      guests_registered: ocrResults.length,
      photos_received: photos.length,
      errors: errors.length > 0 ? errors : undefined,
      guests: ocrResults.map(r => ({
        firstName: r.firstName,
        lastName: r.lastName,
        dateOfBirth: r.dateOfBirth,
        nationality: r.nationality,
        documentNumber: r.documentNumber,
        documentType: r.documentType,
        confidence: r.confidence,
      })),
    });

  } catch (err: any) {
    console.error('[TG Registration] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const runtime = 'nodejs';
