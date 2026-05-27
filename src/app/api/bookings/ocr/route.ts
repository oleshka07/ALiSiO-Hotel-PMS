/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { ocrDocument } from '@/lib/ai/ocr-document';

/**
 * POST /api/bookings/ocr
 * Body: { image: "data:image/...;base64,..." }
 * Runs GPT-4o vision OCR on the document image and returns extracted fields.
 */
export async function POST(req: Request) {
  try {
    const { image } = await req.json();
    if (!image) {
      return NextResponse.json({ error: 'Missing image' }, { status: 400 });
    }

    const dataUrl = image.includes('base64,') ? image : `data:image/jpeg;base64,${image}`;
    const result = await ocrDocument(dataUrl);

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[OCR Admin] Error:', err?.message);
    return NextResponse.json(
      { success: false, error: err?.message || 'OCR processing failed' },
      { status: 500 }
    );
  }
}
