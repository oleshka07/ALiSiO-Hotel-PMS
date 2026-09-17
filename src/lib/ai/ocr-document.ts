import OpenAI from 'openai';
import { createCanvas, loadImage } from '@napi-rs/canvas';
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

function runTesseract(file: string, psm: string): Promise<string | null> {
  return new Promise((resolve) => {
    const args = [file, 'stdout', '-l', 'eng', '--psm', psm,
                  '-c', `tessedit_char_whitelist=${MRZ_CHARS}`];

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

/**
 * Candidate images to try, best first.
 *
 * A phone photograph of a passport is mostly face and background; the strip is
 * a thin band along the bottom, often a tenth of the frame. Handed the whole
 * picture the engine has no reason to treat those two lines as a text block,
 * which is why a full-frame pass that reads a rendered specimen perfectly
 * finds nothing on a real photo.
 *
 * Measured over five degraded renders, counting wrong characters against the
 * known strip: cropping to the bottom third and enlarging beat the full frame
 * by a wide margin. Stretching the contrast made it worse — the percentiles
 * are set by the background, not the strip — and so did --psm 4, so neither
 * is here. Grey and bigger, nothing else.
 */
const OCR_TARGET_WIDTH = 2400;

async function candidates(file: string): Promise<string[]> {
  const img = await loadImage(file);
  const out: string[] = [];

  // Bottom third first: on a passport page and on the back of an identity card
  // that is where the strip sits, and it is the crop that reads cleanest.
  for (const [top, label] of [[0.72, 'bottom'], [0.55, 'lower'], [0, 'full']] as const) {
    const sy = Math.round(img.height * top);
    const sh = img.height - sy;
    if (sh < 40) continue;

    // Tesseract wants roughly 30px-tall glyphs; below that accuracy collapses.
    const scale = Math.max(1, Math.min(4, OCR_TARGET_WIDTH / img.width));
    const w = Math.round(img.width * scale);
    const h = Math.round(sh * scale);

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, sy, img.width, sh, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = px[i + 1] = px[i + 2] =
        (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
    }
    ctx.putImageData(data, 0, 0);

    const target = path.join(os.tmpdir(), `pms-ocr-${label}-${randomBytes(6).toString('hex')}.png`);
    fs.writeFileSync(target, canvas.toBuffer('image/png'));
    out.push(target);
  }
  return out;
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
  const temps: string[] = [];
  let best: Partial<OcrResult> | null = null;

  try {
    const images = await candidates(file);
    temps.push(...images);

    // 6 treats the crop as one block, 4 as columns — between them they cover a
    // strip photographed straight on and one sitting at a slight angle.
    search:
    for (const image of images) {
      {
      const text = await runTesseract(image, '6');
      if (!text) continue;

      const parsed = parseMrz(text);
      if (!parsed?.lastName) continue;

      // 95 means the check digits verified — no reason to keep looking.
      if (parsed.confidence === 95) { best = parsed; break search; }
      best = best ?? parsed;
      }
    }
  } catch (e) {
    console.error('[OCR] local pass failed:', (e as Error).message);
  } finally {
    cleanup();
    for (const t of temps) { try { fs.unlinkSync(t); } catch { /* already gone */ } }
  }

  if (best) {
    console.log(
      `[OCR] MRZ read locally, confidence ${best.confidence} — nothing sent to OpenAI`,
    );
    return best as OcrResult;
  }

  // Passport scans do not go to a third party unless somebody deliberately
  // turns it on. Every foreigner who has to be reported carries a document
  // with a machine-readable zone — a passport on the photo page, an identity
  // card on the back — so the answer to a failed read is a better photograph,
  // not a copy of the document in somebody else's data centre.
  if (process.env.OCR_CLOUD_FALLBACK !== '1') {
    console.log('[OCR] No MRZ found; cloud fallback is off — document not read');
    return {
      firstName: '',
      lastName: '',
      fullName: '',
      dateOfBirth: null,
      documentNumber: null,
      documentType: 'other',
      nationality: null,
      address: null,
      confidence: 0,
    };
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
