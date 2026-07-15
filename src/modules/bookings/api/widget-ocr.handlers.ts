import { NextRequest, NextResponse } from 'next/server';
import { ocrDocument } from '@/lib/ai/ocr-document';
import { checkRateLimit } from '@/lib/rate-limit';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function processWidgetOcrOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function processWidgetOcr(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';
    
    // Strict rate limit: 5 requests per hour per IP to prevent OCR abuse
    const rateLimit = checkRateLimit(`widget_ocr_${ip}`, 'registration', 5, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: CORS_HEADERS });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400, headers: CORS_HEADERS });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const result = await ocrDocument(dataUrl);
    
    return NextResponse.json({
      success: true,
      data: {
        firstName: result.firstName,
        lastName: result.lastName,
        documentNumber: result.documentNumber,
        documentType: result.documentType,
        dateOfBirth: result.dateOfBirth,
        countryCode: result.nationality,
        confidence: result.confidence,
      }
    }, { headers: CORS_HEADERS });
    
  } catch (error: any) {
    console.error('Widget OCR error:', error);
    return NextResponse.json({ error: 'Failed to process document' }, { status: 500, headers: CORS_HEADERS });
  }
}
