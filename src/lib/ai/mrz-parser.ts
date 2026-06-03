import { parse } from 'mrz';
import type { OcrResult } from './ocr-document';

function cleanMrzLines(rawText: string): string[] {
  const lines = rawText.split('\n')
    .map(line => line.replace(/\s+/g, '').replace(/«/g, '<').toUpperCase())
    .filter(line => line.includes('<') && line.length > 20);

  // Take the last 2 or 3 valid MRZ lines
  if (lines.length > 3) return lines.slice(-3);
  return lines;
}

function formatDateOfBirth(mrzDate: string): string | null {
  if (!mrzDate || mrzDate.length !== 6) return null;
  const year = parseInt(mrzDate.substring(0, 2), 10);
  const month = mrzDate.substring(2, 4);
  const day = mrzDate.substring(4, 6);
  // Assume > 50 means 19xx, else 20xx
  const fullYear = year > 50 ? 1900 + year : 2000 + year;
  return `${fullYear}-${month}-${day}`;
}

export function parseMrz(text: string): Partial<OcrResult> | null {
  const lines = cleanMrzLines(text);
  if (lines.length < 2) return null; // Not enough lines

  try {
    const result = parse(lines);
    
    // Check if result is valid
    if (!result || !result.fields) return null;

    const f = result.fields;
    
    const docTypeRaw = f.documentCode?.toLowerCase() || '';
    let docType: OcrResult['documentType'] = 'other';
    if (docTypeRaw.includes('p')) docType = 'passport';
    else if (docTypeRaw.includes('i') || docTypeRaw.includes('c') || docTypeRaw.includes('a')) docType = 'id_card';

    return {
      firstName: f.firstName || 'Unknown',
      lastName: f.lastName || '',
      fullName: `${f.firstName || ''} ${f.lastName || ''}`.trim() || 'Unknown',
      documentNumber: f.documentNumber || null,
      documentType: docType,
      nationality: f.nationality || null,
      dateOfBirth: f.birthDate ? formatDateOfBirth(f.birthDate) : null,
      confidence: 90, // If MRZ parsed successfully, confidence is high
    };
  } catch (err) {
    console.error('MRZ parsing failed:', err);
    return null;
  }
}
