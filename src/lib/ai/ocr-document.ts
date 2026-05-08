import OpenAI from 'openai';

export interface OcrResult {
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string | null;
  documentNumber: string | null;
  documentType: 'id_card' | 'passport' | 'driving_license' | 'other';
  nationality: string | null;
  address: string | null;
  confidence: number; // 0-100
}

// Lazy singleton — instantiated on first call so `next build` (which loads
// every server module during "Collecting page data") does not crash when
// OPENAI_API_KEY is absent in the build environment.
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT = `You are an OCR assistant that extracts personal data from ID cards and passports.
Return ONLY valid JSON (no markdown, no extra text) with this exact structure:
{
  "firstName": "string",
  "lastName": "string",
  "dateOfBirth": "YYYY-MM-DD or null",
  "documentNumber": "string or null",
  "documentType": "id_card|passport|driving_license|other",
  "nationality": "ISO 3166-1 alpha-2 code or null",
  "address": "string or null",
  "confidence": 0-100
}
Rules:
- firstName and lastName are required, never null
- Use the official name exactly as shown on document
- dateOfBirth must be in YYYY-MM-DD format
- confidence: 90+ if you can clearly read all fields, 50-89 if partially readable, below 50 if very unclear
- If the image is not a document, return confidence: 0 with empty strings`;

export async function ocrDocument(imageUrl: string): Promise<OcrResult> {
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 300,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the personal data from this ID document.' },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() || '{}';

  // Strip markdown fences if model adds them
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();

  const parsed = JSON.parse(cleaned);
  const firstName = parsed.firstName || 'Unknown';
  const lastName = parsed.lastName || '';
  console.log(`[OCR] Extracted: ${firstName} ${lastName} | confidence: ${parsed.confidence} | doc: ${parsed.documentType}`);
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    dateOfBirth: parsed.dateOfBirth || null,
    documentNumber: parsed.documentNumber || null,
    documentType: parsed.documentType || 'other',
    nationality: parsed.nationality || null,
    address: parsed.address || null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
  };
}
