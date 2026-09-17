import OpenAI from 'openai';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import fs from 'fs';
import os from 'os';
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

// ─── Local OCR ────────────────────────────────────────
//
// Passport and ID photographs are read on this machine first. Only when the
// machine-readable zone cannot be recovered does the image go to OpenAI — so
// for a passport, which always has an MRZ, the scan never leaves the server.
//
// This used to call tesseract.js through a helper script. That package was
// never in package.json, so the helper threw MODULE_NOT_FOUND on its first
// line and every document silently fell through to OpenAI. The system binary
// needs no npm dependency, keeps its language data on disk, and is a fraction
// of the memory of the WASM build.
//
//   apt install tesseract-ocr tesseract-ocr-eng
//
const TESSERACT_BIN = process.env.TESSERACT_BIN || 'tesseract';

// The MRZ alphabet, ICAO 9303: capitals, digits and the filler.
const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

let missingBinaryReported = false;

function runTesseract(file: string, mrzOnly: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const args = [file, 'stdout', '-l', 'eng', '--psm', '6'];
    if (mrzOnly) args.push('-c', `tessedit_char_whitelist=${MRZ_CHARS}`);

    let child;
    try {
      child = spawn(TESSERACT_BIN, args);
    } catch {
      return resolve(null);
    }

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' && !missingBinaryReported) {
        missingBinaryReported = true;
        console.error(
          '[OCR] tesseract is not installed — every document will be sent to OpenAI. ' +
          'Install it with: apt install tesseract-ocr tesseract-ocr-eng',
        );
      } else if (err.code !== 'ENOENT') {
        console.error('[OCR] tesseract failed to start:', err.message);
      }
      resolve(null);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error('[OCR] tesseract exited with', code, stderr.trim().slice(0, 200));
        return resolve(null);
      }
      resolve(stdout);
    });
  });
}

/** Write a data: URL to a temp file; a path is passed through unchanged. */
function materialise(imageUrl: string): { file: string; cleanup: () => void } {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(imageUrl);
  if (!m) return { file: imageUrl, cleanup: () => {} };

  const ext = (m[1] || 'image/jpeg').split('/')[1]?.split('+')[0] || 'jpg';
  const file = path.join(os.tmpdir(), `pms-ocr-${randomBytes(8).toString('hex')}.${ext}`);
  const body = m[3];
  fs.writeFileSync(file, Buffer.from(body, m[2] ? 'base64' : 'utf8'));
  return {
    file,
    // A passport scan must not linger in /tmp once it has been read.
    cleanup: () => { try { fs.unlinkSync(file); } catch { /* already gone */ } },
  };
}

export async function ocrDocument(imageUrl: string): Promise<OcrResult> {
  const { file, cleanup } = materialise(imageUrl);
  try {
    // The whitelisted pass first: it is the one that reads the MRZ cleanly.
    // The unrestricted pass is only worth its second or two when that fails.
    for (const mrzOnly of [true, false]) {
      const text = await runTesseract(file, mrzOnly);
      if (!text) break;

      const mrzData = parseMrz(text);
      if (mrzData && mrzData.firstName && mrzData.lastName && mrzData.firstName !== 'Unknown') {
        console.log(
          `[OCR] MRZ read locally (${mrzOnly ? 'whitelisted' : 'plain'} pass), ` +
          `confidence ${mrzData.confidence} — nothing sent to OpenAI`,
        );
        return mrzData as OcrResult;
      }
    }
  } finally {
    cleanup();
  }

  console.log('[OCR] No MRZ recovered locally. Falling back to OpenAI...');

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
