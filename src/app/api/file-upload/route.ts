/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

// POST /api/upload — upload a file
export async function POST(request: NextRequest) {
  try {
    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'general';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type — accept iPhone HEIC/HEIF too (the booking widget
    // resizes them to JPEG client-side, but admin uploads via /settings may
    // skip that step).
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
      'image/heic', 'image/heif',
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type "${file.type}". Allowed: jpg, png, webp, gif, svg, heic` }, { status: 400 });
    }

    // Max size 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 10MB' }, { status: 400 });
    }

    // Create subfolder
    const folderPath = path.join(UPLOAD_DIR, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Generate unique filename
    const ext = path.extname(file.name) || '.jpg';
    const baseName = path.basename(file.name, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
    const timestamp = Date.now();
    const filename = `${baseName}_${timestamp}${ext}`;
    const filePath = path.join(folderPath, filename);

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Return URL
    const url = `/api/uploads/${folder}/${filename}`;
    return NextResponse.json({ url, filename, size: file.size });
  } catch (error: any) {
    console.error('POST /api/upload error:', error?.message);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}
