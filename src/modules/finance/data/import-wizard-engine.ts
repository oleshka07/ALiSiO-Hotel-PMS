/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Generic spreadsheet import wizard engine (PR #33-#35).
//
// 3-stage flow:
//   1. PARSE — accept XLSX/CSV, return column headers + sample rows + raw
//      data buffer. Try to auto-match a saved import_format by header
//      signature (sha256 of normalised headers).
//   2. RESOLVE — for each unique value in entity columns, look up
//      import_entity_mappings; for unresolved values UI prompts user.
//   3. COMMIT — apply field mapping + entity mapping to every row,
//      detect duplicates against existing fin_operations, write the
//      ones user approves.
//
// PR #33 covers stage 1 (parse + format CRUD) plus the schema. Stages
// 2 + 3 in PR #34, #35.
//

import * as crypto from 'crypto';
import ExcelJS from 'exceljs';

// ─── Field mapping schema ───────────────────────────────

export const SUPPORTED_FIELDS = [
  'paid_at',          // required
  'accrued_at',
  'period_from',
  'period_to',
  'amount',           // required (signed or unsigned)
  'amount_company',
  'currency',
  'account_from',
  'account_to',
  'category',
  'subcategory',
  'counterparty',
  'subcounterparty',
  'project',
  'subproject',
  'tags',
  'comment',
  'op_type',          // optional explicit override (income/expense/transfer)
] as const;

export type FieldName = typeof SUPPORTED_FIELDS[number];

export interface FieldMapping {
  /** Source column index (0-based) → PMS field name. Source columns not
   *  in this map are ignored. */
  [sourceColIndex: number]: FieldName;
}

// ─── Parsing ────────────────────────────────────────────

export interface ParsedSpreadsheet {
  headers: string[];
  rows: any[][];                 // raw cell values
  row_count: number;
  signature: string;             // sha256 of normalised headers, used for format detection
}

export async function parseUploadedFile(buffer: Buffer, filename: string): Promise<ParsedSpreadsheet> {
  const isCsv = /\.csv$/i.test(filename);
  if (isCsv) return parseCsv(buffer.toString('utf-8'));
  return parseXlsx(buffer);
}

async function parseXlsx(buffer: Buffer): Promise<ParsedSpreadsheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [], row_count: 0, signature: '' };

  const headers: string[] = [];
  const headerRow = ws.getRow(1);
  for (let c = 1; c <= ws.columnCount; c++) {
    headers.push(String(headerRow.getCell(c).value ?? '').trim());
  }

  const rows: any[][] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: any[] = [];
    let allEmpty = true;
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value;
      if (v != null && v !== '') allEmpty = false;
      cells.push(normaliseCell(v));
    }
    if (!allEmpty) rows.push(cells);
  }

  return {
    headers,
    rows,
    row_count: rows.length,
    signature: signatureOf(headers),
  };
}

function parseCsv(text: string): ParsedSpreadsheet {
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);

  const allRows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(cell); allRows.push(row); row = []; cell = ''; i++; continue; }
    cell += c; i++;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); allRows.push(row); }

  const filtered = allRows.filter((r) => r.some((c) => c.trim().length > 0));
  if (filtered.length === 0) return { headers: [], rows: [], row_count: 0, signature: '' };

  const headers = filtered[0].map((h) => h.trim());
  const rows = filtered.slice(1);
  return {
    headers,
    rows,
    row_count: rows.length,
    signature: signatureOf(headers),
  };
}

function normaliseCell(v: any): any {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  if (typeof v === 'object' && 'text' in v) return String(v.text);   // ExcelJS rich text
  if (typeof v === 'object' && 'result' in v) return v.result;        // ExcelJS formula
  return v;
}

function signatureOf(headers: string[]): string {
  const norm = headers.map((h) => h.toLowerCase().replace(/\s+/g, '').replace(/["()'.]/g, '')).join('|');
  return crypto.createHash('sha256').update(norm).digest('hex').substring(0, 16);
}

// ─── Field mapping suggestions ──────────────────────────

/**
 * Heuristic: guess which source column corresponds to each PMS field
 * based on header text (Ukrainian/Russian/English). Returns a partial
 * FieldMapping the UI can present as defaults — user adjusts.
 */
export function suggestFieldMapping(headers: string[]): FieldMapping {
  const result: FieldMapping = {};
  const used = new Set<number>();

  const patterns: Array<[FieldName, RegExp[]]> = [
    ['paid_at',         [/дата.*платеж/i, /paid.?at/i, /payment.?date/i, /дата.*оплат/i]],
    ['accrued_at',      [/дата.*нарах/i, /accrued/i, /accrual.?date/i]],
    ['period_from',     [/період.*з/i, /period.*from/i, /period.*start/i]],
    ['period_to',       [/період.*по/i, /period.*to/i, /period.*end/i]],
    ['amount',          [/сума.*валюті.?рахунка/i, /^amount$/i, /^сума$/i, /^summa$/i]],
    ['amount_company',  [/сума.*валюті.?компанії/i, /amount.?company/i, /czk/i]],
    ['currency',        [/валюта/i, /currency/i]],
    ['account_from',    [/з.?рахунку/i, /from.?account/i, /account.?from/i]],
    ['account_to',      [/на.?рахунок/i, /to.?account/i, /account.?to/i]],
    ['category',        [/^категорі/i, /^category$/i]],
    ['subcategory',     [/підкатегор/i, /subcategory/i]],
    ['counterparty',    [/^контрагент$/i, /^counterparty$/i, /^vendor$/i]],
    ['subcounterparty', [/підконтрагент/i, /subcounterparty/i]],
    ['project',         [/^проект/i, /^project$/i]],
    ['subproject',      [/підпроект/i, /subproject/i]],
    ['tags',            [/^теги$/i, /^tags$/i]],
    ['comment',         [/коментар/i, /^comment$/i, /^note/i, /опис/i]],
    ['op_type',         [/^тип/i, /^type$/i, /^op.?type$/i]],
  ];

  for (const [field, regexes] of patterns) {
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const h = headers[i] || '';
      if (regexes.some((re) => re.test(h))) {
        result[i] = field;
        used.add(i);
        break;
      }
    }
  }

  return result;
}

// ─── Format auto-detection ──────────────────────────────

export function findFormatBySignature(db: any, orgId: string, signature: string): any | null {
  const row = db.prepare(
    "SELECT * FROM import_formats WHERE organization_id = ? AND detector_signature = ? LIMIT 1"
  ).get(orgId, signature);
  return row || null;
}

export function listSavedFormats(db: any, orgId: string): any[] {
  return db.prepare(
    "SELECT * FROM import_formats WHERE organization_id = ? ORDER BY updated_at DESC"
  ).all(orgId);
}

export function saveFormat(
  db: any, orgId: string,
  input: { id?: string; name: string; description?: string; signature: string; field_mappings: FieldMapping },
): string {
  const json = JSON.stringify(input.field_mappings);
  if (input.id) {
    db.prepare(`
      UPDATE import_formats
      SET name = ?, description = ?, detector_signature = ?, field_mappings_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(input.name, input.description || null, input.signature, json, input.id);
    return input.id;
  }
  const id = `imfmt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  db.prepare(`
    INSERT INTO import_formats (id, organization_id, name, description, detector_signature, field_mappings_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, orgId, input.name, input.description || null, input.signature, json);
  return id;
}
