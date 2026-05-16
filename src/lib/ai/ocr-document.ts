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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set on the server');
    _client = new OpenAI({ apiKey });
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
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the personal data from this ID document. Respond with JSON only.' },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() || '{}';

  // response_format=json_object guarantees pure JSON, but stay defensive in case
  // the model wraps it in markdown fences on edge inputs.
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[OCR] Failed to parse model response:', raw);
    throw new Error(`OCR returned invalid JSON: ${(err as Error).message}`);
  }

  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const firstName = str(parsed.firstName) || 'Unknown';
  const lastName = str(parsed.lastName) || '';
  const docType = str(parsed.documentType);
  const allowedDocTypes = ['id_card', 'passport', 'driving_license', 'other'] as const;
  const documentType: OcrResult['documentType'] =
    (allowedDocTypes as readonly string[]).includes(docType || '')
      ? (docType as OcrResult['documentType'])
      : 'other';

  console.log(`[OCR] Extracted: ${firstName} ${lastName} | confidence: ${parsed.confidence} | doc: ${documentType}`);
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    dateOfBirth: str(parsed.dateOfBirth),
    documentNumber: str(parsed.documentNumber),
    documentType,
    nationality: str(parsed.nationality),
    address: str(parsed.address),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
  };
}
