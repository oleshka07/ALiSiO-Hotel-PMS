/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { ocrDocument } from '@/lib/ai/ocr-document';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  try {
    const { image } = await request.json();
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
