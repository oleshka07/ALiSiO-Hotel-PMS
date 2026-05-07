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

    // Extract base64 data (remove data URL prefix if present)
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const result = await ocrDocument(base64Data);

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[OCR] Error:', err?.message);
    return NextResponse.json(
      { success: false, error: err?.message || 'OCR processing failed' },
      { status: 500 }
    );
  }
}
