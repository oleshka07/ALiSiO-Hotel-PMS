import OpenAI from 'openai';
import { spawn } from 'child_process';
import path from 'path';
import { parseMrz } from './mrz-parser';

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

async function runLocalTesseract(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const cwd = process.cwd();
      const scriptPath = `${cwd}/scripts/run-tesseract.js`;
      
      // Prevent Turbopack from tracing spawn arguments
      const runCmd = eval('require("child_process").spawn');
      const child = runCmd('node', [scriptPath]);
      let stdout = '';

      child.stdout.on('data', (data: any) => { stdout += data.toString(); });
      child.stderr.on('data', (data: any) => { console.error('[Tesseract STDERR]', data.toString()); });

      child.on('close', (code: any) => {
        if (code !== 0) {
          console.error('[Tesseract] exited with code', code);
          return resolve(null);
        }
        try {
          const result = JSON.parse(stdout);
          if (result.success) return resolve(result.text);
          console.error('[Tesseract JSON Error]', result.error);
          return resolve(null);
        } catch {
          return resolve(null);
        }
      });

      child.stdin.write(imageUrl);
      child.stdin.end();
    } catch (e) {
      console.error('[Tesseract Run Error]', e);
      resolve(null);
    }
  });
}

export async function ocrDocument(imageUrl: string): Promise<OcrResult> {
  console.log('[OCR] Starting local Tesseract OCR...');
  const text = await runLocalTesseract(imageUrl);
  
  if (text) {
    const mrzData = parseMrz(text);
    if (mrzData && mrzData.firstName && mrzData.lastName && mrzData.firstName !== 'Unknown') {
      console.log('[OCR] Successfully parsed MRZ from local OCR.');
      return mrzData as OcrResult;
    }
    console.log('[OCR] MRZ parse failed or missing fields. Falling back to OpenAI...');
  } else {
    console.log('[OCR] Local OCR failed entirely. Falling back to OpenAI...');
  }

  // Fallback to OpenAI
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

  console.log(`[OCR] Fallback Extracted: ${firstName} ${lastName} | confidence: ${parsed.confidence} | doc: ${documentType}`);
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
