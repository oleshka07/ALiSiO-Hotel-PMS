/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { ocrDocument } from '@/lib/ai/ocr-document';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const rl = checkRateLimit(token, 'ocr' as any, 5, 10); // 5 requests per 10 minutes max
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many OCR attempts. Please try again later.' }, { status: 429 });
  }

  try {
    const bodyStr = await request.text();
    // Prevent gigabyte payload attacks (limit to 10MB)
    if (bodyStr.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 413 });
    }

    const { image } = JSON.parse(bodyStr);
    if (!image) return NextResponse.json({ error: 'Missing image' }, { status: 400 });

    // Pass the full data URL (data:image/...;base64,...) to OCR
    const dataUrl = image.includes('base64,') ? image : `data:image/jpeg;base64,${image}`;
    const result = await ocrDocument(dataUrl);

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[OCR] Error:', err?.message);
    return NextResponse.json(
      { success: false, error: err?.message || 'OCR processing failed' },
      { status: 500 }
    );
  }
}
