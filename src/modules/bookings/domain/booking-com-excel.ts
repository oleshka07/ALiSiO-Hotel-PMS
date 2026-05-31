/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from 'xlsx';

export interface BookingComRow {
  bookNumber: string;
  guestName: string;
  bookedBy: string | null;
  checkIn: string;
  checkOut: string;
  bookedAt: string | null;
  status: string;
  rooms: number;
  persons: number;
  adults: number;
  children: number;
  childrenAges: string | null;
  priceMajor: number;
  currency: string;
  commissionPct: number;
  commissionMajor: number;
  unitTypeRaw: string;
  unitTypes: string[];
  duration: number;
  cancellationDate: string | null;
  remarks: string | null;
  bookerCountry: string | null;
  travelPurpose: string | null;
  device: string | null;
  address: string | null;
  phone: string | null;
}

export interface ParseError {
  rowIndex: number;
  field: string;
  reason: string;
  raw: any;
}

export interface ParseResult {
  rows: BookingComRow[];
  errors: ParseError[];
  totalRowsInFile: number;
}

const REQUIRED_COLS = [
  'Book number',
  'Guest name(s)',
  'Check-in',
  'Check-out',
  'Status',
  'Duration (nights)',
  'Adults',
  'Children',
  'Persons',
  'Price',
] as const;

/**
 * Booking.com Extranet exports columns in the user's UI language.
 * Map known translations → canonical English names.
 */
const COLUMN_ALIASES: Record<string, string> = {
  // Ukrainian (UA)
  'Номер бронювання': 'Book number',
  "Ім'я гостя": 'Guest name(s)',
  "Ім'я гостя(ів)": 'Guest name(s)',
  'Імена гостей': 'Guest name(s)',
  'Ким заброньовано': 'Booked by',
  'Заїзд': 'Check-in',
  'Виїзд': 'Check-out',
  'Заброньовано': 'Booked on',
  'Статус': 'Status',
  'Назва помешкання': 'Unit type',
  'Тип номера': 'Unit type',
  'Тривалість (ночі)': 'Duration (nights)',
  'Тривалість (ночей)': 'Duration (nights)',
  'Дорослі': 'Adults',
  'Діти': 'Children',
  'Вік дітей': "Children's age(s)",
  'Осіб': 'Persons',
  'Персони': 'Persons',
  'Ціна': 'Price',
  'Всього до сплати': 'Price',
  'Комісія': 'Commission amount',
  'Сума комісії': 'Commission amount',
  'Комісія %': 'Commission %',
  '% комісії': 'Commission %',
  'Валюта': 'Currency',
  'Номери': 'Rooms',
  'Кімнати': 'Rooms',
  'Примітки': 'Remarks',
  'Зауваження': 'Remarks',
  'Країна гостя': 'Booker country',
  'Мета поїздки': 'Travel purpose',
  'Пристрій': 'Device',
  'Адреса': 'Address',
  'Номер телефону': 'Phone number',
  'Телефон': 'Phone number',
  'Дата скасування': 'Cancellation date',
  'Розташування': 'Location',
  'Мандрівник Genius': 'Genius traveler',
  // Czech (CS)
  'Číslo rezervace': 'Book number',
  'Jméno hosta': 'Guest name(s)',
  'Jména hostů': 'Guest name(s)',
  'Rezervoval': 'Booked by',
  'Příjezd': 'Check-in',
  'Odjezd': 'Check-out',
  'Rezervováno': 'Booked on',
  'Typ pokoje': 'Unit type',
  'Název ubytování': 'Unit type',
  'Délka pobytu (nocí)': 'Duration (nights)',
  'Dospělí': 'Adults',
  'Děti': 'Children',
  'Věk dětí': "Children's age(s)",
  'Osoby': 'Persons',
  'Cena': 'Price',
  'Celkem k úhradě': 'Price',
  'Provize': 'Commission amount',
  'Výše provize': 'Commission amount',
  'Měna': 'Currency',
  'Pokoje': 'Rooms',
  'Poznámky': 'Remarks',
  'Země hosta': 'Booker country',
  'Účel cesty': 'Travel purpose',
  'Zařízení': 'Device',
  'Adresa': 'Address',
  'Telefonní číslo': 'Phone number',
  'Datum zrušení': 'Cancellation date',
  // Russian (RU)
  'Номер брони': 'Book number',
  'Имя гостя': 'Guest name(s)',
  'Имена гостей': 'Guest name(s)',
  'Кем забронировано': 'Booked by',
  'Заезд': 'Check-in',
  'Выезд': 'Check-out',
  'Забронировано': 'Booked on',
  'Название размещения': 'Unit type',
  'Продолжительность (ночей)': 'Duration (nights)',
  'Взрослые': 'Adults',
  'Цена': 'Price',
  'Итого к оплате': 'Price',
  'Комиссия': 'Commission amount',
  'Сумма комиссии': 'Commission amount',
  'Комнаты': 'Rooms',
  'Замечания': 'Remarks',
  'Страна гостя': 'Booker country',
  'Цель поездки': 'Travel purpose',
  'Устройство': 'Device',
  'Номер телефона': 'Phone number',
  'Дата отмены': 'Cancellation date',
};

/**
 * Strip invisible / BOM / control characters from a column-name string.
 * Booking.com exports sometimes contain BOM (\uFEFF), zero-width spaces
 * (\u200B), non-breaking spaces (\u00A0), or Unicode apostrophes (ʼ U+02BC).
 */
function sanitizeKey(k: string): string {
  return k
    .replace(/[\uFEFF\u200B\u200C\u200D\u2060\u00A0]/g, ' ')  // invisible → regular space
    .replace(/[\u02BC\u2019\u2018\u0060\u00B4]/g, "'")          // Unicode apostrophes → ASCII
    .replace(/\s+/g, ' ')                                        // collapse whitespace
    .trim();
}

/**
 * Normalize a row object: rename localized column names to their
 * canonical English equivalents so the rest of the parser is locale-agnostic.
 */
function normalizeHeaders(rows: Record<string, any>[]): Record<string, any>[] {
  if (rows.length === 0) return rows;

  // Build sanitized alias lookup once
  const sanitizedAliases: Record<string, string> = {};
  for (const [alias, canonical] of Object.entries(COLUMN_ALIASES)) {
    sanitizedAliases[sanitizeKey(alias)] = canonical;
  }

  const sampleKeys = Object.keys(rows[0]);
  const needsRemap = sampleKeys.some((k) => {
    const clean = sanitizeKey(k);
    return clean in sanitizedAliases || k in COLUMN_ALIASES;
  });
  if (!needsRemap) return rows; // already English

  return rows.map((row) => {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      const clean = sanitizeKey(key);
      const canonical = COLUMN_ALIASES[key] || sanitizedAliases[clean] || clean;
      if (!(canonical in out)) {
        out[canonical] = value;
      }
    }
    return out;
  });
}

// Month name → number mapping for text-based date parsing
const MONTH_NAMES: Record<string, number> = {
  // English
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  // Ukrainian
  'січ': 1, 'січня': 1, 'лют': 2, 'лютого': 2, 'бер': 3, 'березня': 3,
  'кві': 4, 'квітня': 4, 'тра': 5, 'травня': 5, 'чер': 6, 'червня': 6,
  'лип': 7, 'липня': 7, 'сер': 8, 'серпня': 8, 'вер': 9, 'вересня': 9,
  'жов': 10, 'жовтня': 10, 'лис': 11, 'листопада': 11, 'гру': 12, 'грудня': 12,
  // Czech
  'led': 1, 'ledna': 1, 'úno': 2, 'února': 2, 'bře': 3, 'března': 3,
  'dub': 4, 'dubna': 4, 'kvě': 5, 'května': 5, 'čvn': 6, 'června': 6, 'čer': 6,
  'čvc': 7, 'července': 7, 'srp': 8, 'srpna': 8, 'zář': 9, 'září': 9,
  'říj': 10, 'října': 10, 'lis': 11, 'listopadu': 11, 'pro': 12, 'prosince': 12,
  // Russian
  'янв': 1, 'января': 1, 'фев': 2, 'февраля': 2, 'мар': 3, 'марта': 3,
  'апр': 4, 'апреля': 4, 'мая': 5, 'май': 5, 'июн': 6, 'июня': 6,
  'июл': 7, 'июля': 7, 'авг': 8, 'августа': 8, 'сен': 9, 'сентября': 9,
  'окт': 10, 'октября': 10, 'ноя': 11, 'ноября': 11, 'дек': 12, 'декабря': 12,
  // German
  'jän': 1, 'mär': 3, 'mai': 5, 'okt': 10, 'dez': 12,
};

function resolveMonth(token: string): number | null {
  const key = token.toLowerCase().replace(/\.$/, ''); // strip trailing dot
  return MONTH_NAMES[key] ?? null;
}

function parseDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  // XLSX cellDates:true → Date objects
  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  // Excel serial number (e.g. 45835)
  if (typeof value === 'number' && value > 10000 && value < 100000) {
    const d = new Date((value - 25569) * 86400000);
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
  }
  const s = String(value).trim();
  // YYYY-MM-DD (ISO)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (European)
  const eu = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})/);
  if (eu) return `${eu[3]}-${eu[2].padStart(2, '0')}-${eu[1].padStart(2, '0')}`;
  // MM/DD/YYYY (US — fallback, only if month ≤ 12)
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us && parseInt(us[1]) <= 12) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  // Text month: "22 May 2026", "May 22, 2026", "22 трав. 2026", "22. května 2026"
  const tokens = s.replace(/,/g, '').split(/[\s.]+/).filter(Boolean);
  if (tokens.length >= 3) {
    // Try "DD Month YYYY" or "Month DD YYYY"
    const m1 = resolveMonth(tokens[1]);
    if (m1 && /^\d{1,2}$/.test(tokens[0]) && /^\d{4}$/.test(tokens[2])) {
      return `${tokens[2]}-${String(m1).padStart(2, '0')}-${tokens[0].padStart(2, '0')}`;
    }
    const m0 = resolveMonth(tokens[0]);
    if (m0 && /^\d{1,2}$/.test(tokens[1]) && /^\d{4}$/.test(tokens[2])) {
      return `${tokens[2]}-${String(m0).padStart(2, '0')}-${tokens[1].padStart(2, '0')}`;
    }
  }
  // Last resort: try native Date.parse
  const nativeDate = new Date(s);
  if (!isNaN(nativeDate.getTime()) && nativeDate.getFullYear() > 2000) {
    return `${nativeDate.getFullYear()}-${String(nativeDate.getMonth() + 1).padStart(2, '0')}-${String(nativeDate.getDate()).padStart(2, '0')}`;
  }
  return null;
}

function parseDateTime(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19);
  const s = String(value).trim();
  return s.length >= 10 ? s : null;
}

function parsePrice(value: unknown): { amount: number; currency: string } {
  if (value == null || value === '') return { amount: 0, currency: 'EUR' };
  const s = String(value).trim();
  const m = s.match(/([\d.,\s]+)\s*([A-Z]{3})?/);
  if (!m) return { amount: 0, currency: 'EUR' };
  let numStr = m[1].trim();
  // Detect European format: 1.234,56 (dot=thousands, comma=decimal)
  if (numStr.includes(',') && numStr.indexOf(',') > numStr.lastIndexOf('.')) {
    numStr = numStr.replace(/\./g, '').replace(',', '.');
  } else {
    numStr = numStr.replace(/,/g, '');
  }
  const amount = parseFloat(numStr);
  const currency = (m[2] || 'EUR').toUpperCase();
  return { amount: isFinite(amount) ? amount : 0, currency };
}

function parseInt0(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = parseInt(String(value), 10);
  return isFinite(n) ? n : 0;
}

function parseFloat0(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

function splitUnitTypes(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseBookingComExcel(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [{ rowIndex: 0, field: 'workbook', reason: 'No sheets found', raw: null }], totalRowsInFile: 0 };
  }

  const sheet = workbook.Sheets[sheetName];
  let json = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false }) as Record<string, any>[];

  const errors: ParseError[] = [];

  if (json.length === 0) {
    return { rows: [], errors: [], totalRowsInFile: 0 };
  }

  // Log raw column names BEFORE normalization for debugging
  const rawColumns = Object.keys(json[0]);
  console.log(`[Import Booking.com] Raw columns (${rawColumns.length}):`, JSON.stringify(rawColumns));
  // Hex dump first 3 column names to detect invisible chars
  rawColumns.slice(0, 3).forEach((col, i) => {
    const hex = [...col].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
    console.log(`[Import Booking.com] Col[${i}] hex: ${hex} = "${col}"`);
  });

  // Normalize localized column names to English
  json = normalizeHeaders(json);

  // Log normalized columns
  const normalizedColumns = Object.keys(json[0]);
  console.log(`[Import Booking.com] Normalized columns (${normalizedColumns.length}):`, JSON.stringify(normalizedColumns));

  // If 'Guest name(s)' is still missing but 'Booked by' exists, use it as fallback
  const headerRow = json[0];
  if (!('Guest name(s)' in headerRow) && ('Booked by' in headerRow)) {
    json = json.map((r) => ({ ...r, 'Guest name(s)': r['Guest name(s)'] || r['Booked by'] }));
  }

  // Duration can be calculated from dates if missing
  if (!('Duration (nights)' in headerRow)) {
    json = json.map((r) => {
      const ci = parseDate(r['Check-in']);
      const co = parseDate(r['Check-out']);
      if (ci && co) {
        const nights = Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000);
        return { ...r, 'Duration (nights)': nights > 0 ? nights : 1 };
      }
      return { ...r, 'Duration (nights)': 1 };
    });
  }

  // Adults/Children/Persons fallback — set defaults if columns missing
  if (!('Adults' in headerRow)) {
    json = json.map((r) => ({ ...r, 'Adults': r['Adults'] || r['Persons'] || 1 }));
  }
  if (!('Children' in headerRow)) {
    json = json.map((r) => ({ ...r, 'Children': r['Children'] || 0 }));
  }
  if (!('Persons' in headerRow)) {
    json = json.map((r) => ({ ...r, 'Persons': r['Persons'] || r['Adults'] || 1 }));
  }
  // Unit type may be absent in some Booking.com export variants
  if (!('Unit type' in json[0])) {
    console.log('[Import Booking.com] "Unit type" column missing — using empty default');
    json = json.map((r) => ({ ...r, 'Unit type': '' }));
  }

  const missing = REQUIRED_COLS.filter((c) => !(c in json[0]));
  // Fuzzy fallback: if some required columns are still missing,
  // try case-insensitive substring matching against available columns
  if (missing.length > 0) {
    const availKeys = Object.keys(json[0]);
    const FUZZY_MAP: Record<string, string[]> = {
      'Book number': ['book', 'reserv', 'номер', 'číslo', 'брон'],
      'Guest name(s)': ['guest', 'name', 'гост', 'host', 'ім\'я', 'имя'],
      'Check-in': ['check-in', 'checkin', 'arrival', 'заїзд', 'заезд', 'příjezd'],
      'Check-out': ['check-out', 'checkout', 'departure', 'виїзд', 'выезд', 'odjezd'],
      'Status': ['status', 'статус', 'stav'],
      'Unit type': ['unit type', 'room type', 'помешк', 'тип номер', 'pokoj', 'ubytov', 'размещен'],
      'Duration (nights)': ['duration', 'night', 'ніч', 'ноч', 'noc', 'тривал', 'продолж', 'délka'],
      'Adults': ['adult', 'дорос', 'взрос', 'dospěl'],
      'Children': ['child', 'дит', 'děti', 'діт'],
      'Persons': ['person', 'осіб', 'персон', 'osoby', 'людей'],
      'Price': ['price', 'total', 'цін', 'ціна', 'всього', 'итого', 'cena', 'celkem', 'сплат', 'úhrad'],
    };
    for (const col of [...missing]) {
      const patterns = FUZZY_MAP[col];
      if (!patterns) continue;
      const matched = availKeys.find(k => {
        const lower = k.toLowerCase();
        return patterns.some(p => lower.includes(p));
      });
      if (matched && !(col in json[0])) {
        console.log(`[Import Booking.com] Fuzzy match: "${matched}" → "${col}"`);
        json = json.map(r => ({ ...r, [col]: r[matched] }));
        missing.splice(missing.indexOf(col), 1);
      }
    }
  }
  if (missing.length > 0) {
    console.error(`[Import Booking.com] Still missing after fuzzy: ${missing.join(', ')}. Available: ${Object.keys(json[0]).join(', ')}`);
    return {
      rows: [],
      errors: [{ rowIndex: 0, field: 'headers', reason: `відсутні обов'язкові колонки: ${missing.join(', ')}`, raw: Object.keys(json[0]) }],
      totalRowsInFile: json.length,
    };
  }

  const rows: BookingComRow[] = [];

  json.forEach((r, idx) => {
    const bookNumber = r['Book number'] != null ? String(r['Book number']).trim() : '';
    if (!bookNumber) {
      errors.push({ rowIndex: idx, field: 'Book number', reason: 'empty', raw: r });
      return;
    }

    const rawIn = r['Check-in'];
    const rawOut = r['Check-out'];
    const checkIn = parseDate(rawIn);
    const checkOut = parseDate(rawOut);
    if (!checkIn || !checkOut) {
      if (idx === 0) {
        console.error(`[Import Booking.com] Date parse FAILED for row 0. Raw Check-in: '${rawIn}' (${typeof rawIn}), Raw Check-out: '${rawOut}' (${typeof rawOut})`);
      }
      errors.push({ rowIndex: idx, field: 'Check-in/out', reason: `invalid date (raw: "${rawIn}" → "${rawOut}")`, raw: { in: rawIn, out: rawOut } });
      return;
    }

    const guestName = r['Guest name(s)'] != null ? String(r['Guest name(s)']).trim() : '';
    if (!guestName) {
      errors.push({ rowIndex: idx, field: 'Guest name(s)', reason: 'empty', raw: r });
      return;
    }

    const status = r['Status'] != null ? String(r['Status']).trim() : '';
    const unitTypeRaw = r['Unit type'] != null ? String(r['Unit type']).trim() : '';
    const unitTypes = splitUnitTypes(unitTypeRaw);
    const price = parsePrice(r['Price']);

    rows.push({
      bookNumber,
      guestName,
      bookedBy: r['Booked by'] != null ? String(r['Booked by']).trim() : null,
      checkIn,
      checkOut,
      bookedAt: parseDateTime(r['Booked on']),
      status,
      rooms: parseInt0(r['Rooms']) || 1,
      persons: parseInt0(r['Persons']),
      adults: parseInt0(r['Adults']),
      children: parseInt0(r['Children']),
      childrenAges: r["Children's age(s)"] != null ? String(r["Children's age(s)"]).trim() : null,
      priceMajor: price.amount,
      currency: price.currency,
      commissionPct: parseFloat0(r['Commission %']),
      commissionMajor: parseFloat0(String(r['Commission amount'] || '').replace(/[^\d.,]/g, '')),
      unitTypeRaw,
      unitTypes,
      duration: parseInt0(r['Duration (nights)']),
      cancellationDate: parseDateTime(r['Cancellation date']),
      remarks: r['Remarks'] != null ? String(r['Remarks']).trim() : null,
      bookerCountry: r['Booker country'] != null ? String(r['Booker country']).trim().toUpperCase() : null,
      travelPurpose: r['Travel purpose'] != null ? String(r['Travel purpose']).trim() : null,
      device: r['Device'] != null ? String(r['Device']).trim() : null,
      address: r['Address'] != null ? String(r['Address']).trim() : null,
      phone: r['Phone number'] != null ? String(r['Phone number']).trim() : null,
    });
  });

  return { rows, errors, totalRowsInFile: json.length };
}

/**
 * Booking.com type-name → number of guests the room is sold for.
 * "Single Room" → 1, "Double Room" → 2, "Triple Room" → 3, "Quadruple Room" → 4,
 * "Quintuple Room" → 5, "Sextuple Room" → 6.
 *
 * Returns null when the name doesn't carry a clear capacity hint (we leave
 * that to the caller to surface as a warning instead of guessing).
 */
export function parseCapacityFromUnitTypeName(raw: string): number | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  // Plain digit (rare but possible: "Room for 3 people")
  const m = lower.match(/(\d+)\s*(?:guest|person|people|pax)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) return n;
  }
  if (lower.includes('single')) return 1;
  if (lower.includes('double')) return 2;
  if (lower.includes('twin')) return 2;
  if (lower.includes('triple')) return 3;
  if (lower.includes('quadruple') || lower.includes('quad ')) return 4;
  if (lower.includes('quintuple') || lower.includes('5-bed')) return 5;
  if (lower.includes('sextuple') || lower.includes('6-bed')) return 6;
  if (lower.includes('mixed dormitory')) return 1; // hostel bed — counted as one slot
  return null;
}

/**
 * Split "Last, First" → "First Last", or pass through if already "First Last".
 * Booking exports typically use "Last, First" in the "Booked by" field.
 */
export function normalizeName(raw: string): { firstName: string; lastName: string } {
  const trimmed = raw.trim();
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx > 0) {
    const last = trimmed.slice(0, commaIdx).trim();
    const first = trimmed.slice(commaIdx + 1).trim();
    return { firstName: first, lastName: last };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
