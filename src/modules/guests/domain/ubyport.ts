/**
 * UNL export for Ubyport (Ředitelství služby cizinecké policie).
 *
 * Implements "Popis položek ubytovacího zařízení, údajů o cizinci a formát UNL
 * souboru" — Příloha č. 3 Provozního řádu Internetové aplikace Ubyport,
 * aktualizace k 22.02.2018. Section numbers below refer to that document.
 *
 * The web service and this file carry the same items, so a record the police
 * rejects over SOAP is a record they reject here too. We therefore validate
 * every field up front and refuse to emit a half-valid batch: a file that
 * silently drops people is exactly how the July–September gap happened.
 */

// ─── §3.1 CP1250 ──────────────────────────────────────
//
// The allowed-character sets in §2.4.1 are literally the CP1250 letter
// repertoire, so anything that survives sanitisation is encodable. Node has no
// built-in CP1250, and the file must not be UTF-8.

const CP1250_HIGH =
  '\u20AC\u0081\u201A\u0083\u201E\u2026\u2020\u2021\u0088\u2030\u0160\u2039\u015A\u0164\u017D\u0179' +
  '\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u0098\u2122\u0161\u203A\u015B\u0165\u017E\u017A' +
  '\u00A0\u02C7\u02D8\u0141\u00A4\u0104\u00A6\u00A7\u00A8\u00A9\u015E\u00AB\u00AC\u00AD\u00AE\u017B' +
  '\u00B0\u00B1\u02DB\u0142\u00B4\u00B5\u00B6\u00B7\u00B8\u0105\u015F\u00BB\u013D\u02DD\u013E\u017C' +
  '\u0154\u00C1\u00C2\u0102\u00C4\u0139\u0106\u00C7\u010C\u00C9\u0118\u00CB\u011A\u00CD\u00CE\u010E' +
  '\u0110\u0143\u0147\u00D3\u00D4\u0150\u00D6\u00D7\u0158\u016E\u00DA\u0170\u00DC\u00DD\u0162\u00DF' +
  '\u0155\u00E1\u00E2\u0103\u00E4\u013A\u0107\u00E7\u010D\u00E9\u0119\u00EB\u011B\u00ED\u00EE\u010F' +
  '\u0111\u0144\u0148\u00F3\u00F4\u0151\u00F6\u00F7\u0159\u016F\u00FA\u0171\u00FC\u00FD\u0163\u02D9';

export function encodeCp1250(text: string): Buffer {
  const out = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    if (cp < 0x80) { out[i] = cp; continue; }
    const idx = CP1250_HIGH.indexOf(text[i]);
    out[i] = idx >= 0 ? 0x80 + idx : 0x3f; // '?' — unreachable after sanitisation
  }
  return out;
}

// ─── §2.4.1 character sets ────────────────────────────

const NAME_CHARS =
  "a-zA-Z" +
  "\u0104\u0141\u013D\u015A\u0160\u015E\u0164\u0179\u017D\u017B" +
  "\u0105\u0142\u013E\u015B\u0161\u015F\u0165\u017A\u017E\u017C" +
  "\u0154\u00C1\u00C2\u0102\u00C4\u0139\u0106\u00C7\u010C\u00C9\u0118\u00CB\u011A\u00CD\u00CE\u010E" +
  "\u0110\u0143\u0147\u00D3\u00D4\u0150\u00D6\u0158\u016E\u00DA\u0170\u00DC\u00DD\u0162" +
  "\u0155\u00E1\u00E2\u0103\u00E4\u013A\u0107\u00E7\u010D\u00E9\u0119\u00EB\u011B\u00ED\u00EE\u010F" +
  "\u0111\u0144\u0148\u00F3\u00F4\u0151\u00F6\u0159\u016F\u00FA\u0171\u00FC\u00FD\u0163\u00DF";

const NAME_RE = new RegExp(`[^${NAME_CHARS}\\s'-]`, 'g');
const ADDRESS_RE = new RegExp(`[^${NAME_CHARS}0-9\\s'\\-/.,;:()&#@]`, 'g');

/**
 * §2.7 Příjmení / Jméno: trim, collapse runs of spaces, upper-case, drop
 * everything outside the allowed set.
 */
export function sanitizeName(raw: string | null | undefined, max: number): string {
  if (!raw) return '';
  return String(raw)
    .replace(NAME_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

/** §2.7 Číslo dokladu / víza: spaces dropped, upper-case, only A–Z and 0–9. */
export function sanitizeDoc(raw: string | null | undefined, max: number): string {
  if (!raw) return '';
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);
}

/** §2.7 Bydliště: components joined by ", " (§3.3 field 11), max 255. */
export function sanitizeAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[\r\n]+/g, ', ')
    .replace(ADDRESS_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}

/** §3.3 Poznámka: any characters, "|" becomes "\". */
export function sanitizeNote(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/\|/g, '\\').replace(/[\r\n]+/g, ', ').trim().slice(0, 255);
}

/** 'YYYY-MM-DD' (and 'YYYY-MM-DDTHH:MM:SS') → 'DD.MM.YYYY'. */
export function toUbyDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

// ─── §3.3 field 10 — státní příslušnost, three letters ────

const ALPHA2_TO_ALPHA3: Record<string, string> = {
  AD:'AND',AE:'ARE',AF:'AFG',AG:'ATG',AI:'AIA',AL:'ALB',AM:'ARM',AO:'AGO',AQ:'ATA',AR:'ARG',
  AS:'ASM',AT:'AUT',AU:'AUS',AW:'ABW',AX:'ALA',AZ:'AZE',BA:'BIH',BB:'BRB',BD:'BGD',BE:'BEL',
  BF:'BFA',BG:'BGR',BH:'BHR',BI:'BDI',BJ:'BEN',BL:'BLM',BM:'BMU',BN:'BRN',BO:'BOL',BQ:'BES',
  BR:'BRA',BS:'BHS',BT:'BTN',BV:'BVT',BW:'BWA',BY:'BLR',BZ:'BLZ',CA:'CAN',CC:'CCK',CD:'COD',
  CF:'CAF',CG:'COG',CH:'CHE',CI:'CIV',CK:'COK',CL:'CHL',CM:'CMR',CN:'CHN',CO:'COL',CR:'CRI',
  CU:'CUB',CV:'CPV',CW:'CUW',CX:'CXR',CY:'CYP',CZ:'CZE',DE:'DEU',DJ:'DJI',DK:'DNK',DM:'DMA',
  DO:'DOM',DZ:'DZA',EC:'ECU',EE:'EST',EG:'EGY',EH:'ESH',ER:'ERI',ES:'ESP',ET:'ETH',FI:'FIN',
  FJ:'FJI',FK:'FLK',FM:'FSM',FO:'FRO',FR:'FRA',GA:'GAB',GB:'GBR',GD:'GRD',GE:'GEO',GF:'GUF',
  GG:'GGY',GH:'GHA',GI:'GIB',GL:'GRL',GM:'GMB',GN:'GIN',GP:'GLP',GQ:'GNQ',GR:'GRC',GS:'SGS',
  GT:'GTM',GU:'GUM',GW:'GNB',GY:'GUY',HK:'HKG',HM:'HMD',HN:'HND',HR:'HRV',HT:'HTI',HU:'HUN',
  ID:'IDN',IE:'IRL',IL:'ISR',IM:'IMN',IN:'IND',IO:'IOT',IQ:'IRQ',IR:'IRN',IS:'ISL',IT:'ITA',
  JE:'JEY',JM:'JAM',JO:'JOR',JP:'JPN',KE:'KEN',KG:'KGZ',KH:'KHM',KI:'KIR',KM:'COM',KN:'KNA',
  KP:'PRK',KR:'KOR',KW:'KWT',KY:'CYM',KZ:'KAZ',LA:'LAO',LB:'LBN',LC:'LCA',LI:'LIE',LK:'LKA',
  LR:'LBR',LS:'LSO',LT:'LTU',LU:'LUX',LV:'LVA',LY:'LBY',MA:'MAR',MC:'MCO',MD:'MDA',ME:'MNE',
  MF:'MAF',MG:'MDG',MH:'MHL',MK:'MKD',ML:'MLI',MM:'MMR',MN:'MNG',MO:'MAC',MP:'MNP',MQ:'MTQ',
  MR:'MRT',MS:'MSR',MT:'MLT',MU:'MUS',MV:'MDV',MW:'MWI',MX:'MEX',MY:'MYS',MZ:'MOZ',NA:'NAM',
  NC:'NCL',NE:'NER',NF:'NFK',NG:'NGA',NI:'NIC',NL:'NLD',NO:'NOR',NP:'NPL',NR:'NRU',NU:'NIU',
  NZ:'NZL',OM:'OMN',PA:'PAN',PE:'PER',PF:'PYF',PG:'PNG',PH:'PHL',PK:'PAK',PL:'POL',PM:'SPM',
  PN:'PCN',PR:'PRI',PS:'PSE',PT:'PRT',PW:'PLW',PY:'PRY',QA:'QAT',RE:'REU',RO:'ROU',RS:'SRB',
  RU:'RUS',RW:'RWA',SA:'SAU',SB:'SLB',SC:'SYC',SD:'SDN',SE:'SWE',SG:'SGP',SH:'SHN',SI:'SVN',
  SJ:'SJM',SK:'SVK',SL:'SLE',SM:'SMR',SN:'SEN',SO:'SOM',SR:'SUR',SS:'SSD',ST:'STP',SV:'SLV',
  SX:'SXM',SY:'SYR',SZ:'SWZ',TC:'TCA',TD:'TCD',TF:'ATF',TG:'TGO',TH:'THA',TJ:'TJK',TK:'TKL',
  TL:'TLS',TM:'TKM',TN:'TUN',TO:'TON',TR:'TUR',TT:'TTO',TV:'TUV',TW:'TWN',TZ:'TZA',UA:'UKR',
  UG:'UGA',UM:'UMI',US:'USA',UY:'URY',UZ:'UZB',VA:'VAT',VC:'VCT',VE:'VEN',VG:'VGB',VI:'VIR',
  VN:'VNM',VU:'VUT',WF:'WLF',WS:'WSM',YE:'YEM',YT:'MYT',ZA:'ZAF',ZM:'ZMB',ZW:'ZWE',
};

const ALPHA3 = new Set(Object.values(ALPHA2_TO_ALPHA3));

/**
 * Vehicle oval codes. Guests write "D" on the check-in form and OCR reads it
 * off a German plate or an old ID; a bare "D" is not a nationality anywhere in
 * ISO 3166 and the web service answers E_NATI_INVALID.
 */
const OVAL_CODES: Record<string, string> = {
  A:'AUT', B:'BEL', D:'DEU', E:'ESP', F:'FRA', H:'HUN', I:'ITA', L:'LUX', N:'NOR', P:'PRT', S:'SWE',
  UK:'GBR', SLO:'SVN', GBZ:'GIB', IRL:'IRL', RSM:'SMR', MNE:'MNE', BIH:'BIH', SRB:'SRB',
};

/** Spellings we see in this database, in cs / en / de / uk / ru. */
const NAME_ALIASES: Record<string, string> = {
  cesko:'CZE', ceskarepublika:'CZE', czechia:'CZE', czechrepublic:'CZE', czech:'CZE', cechia:'CZE',
  chekhia:'CZE', chekhyia:'CZE', chekhiia:'CZE', cheska:'CZE', cheskarespublika:'CZE',
  nemecko:'DEU', germany:'DEU', deutschland:'DEU', german:'DEU', nimechchyna:'DEU', germaniya:'DEU',
  nizozemsko:'NLD', netherlands:'NLD', holland:'NLD', holandsko:'NLD', niderlandy:'NLD', gollandiya:'NLD',
  polsko:'POL', poland:'POL', polska:'POL', polshcha:'POL', polsha:'POL',
  slovensko:'SVK', slovakia:'SVK', slovachchyna:'SVK', slovakiya:'SVK',
  rakousko:'AUT', austria:'AUT', osterreich:'AUT', avstriya:'AUT',
  ukrajina:'UKR', ukraine:'UKR', ukraina:'UKR',
  rusko:'RUS', russia:'RUS', rossiya:'RUS', rosiya:'RUS',
  velkabritanie:'GBR', unitedkingdom:'GBR', greatbritain:'GBR', england:'GBR', britain:'GBR',
  italie:'ITA', italy:'ITA', italia:'ITA', italiya:'ITA',
  francie:'FRA', france:'FRA', frantsiya:'FRA',
  spanelsko:'ESP', spain:'ESP', espana:'ESP', ispaniya:'ESP',
  madarsko:'HUN', hungary:'HUN', ugorshchyna:'HUN', vengriya:'HUN',
  belgie:'BEL', belgium:'BEL', belgiya:'BEL',
  svycarsko:'CHE', switzerland:'CHE', schweiz:'CHE', shveytsariya:'CHE',
  dansko:'DNK', denmark:'DNK', daniya:'DNK',
  svedsko:'SWE', sweden:'SWE', shvetsiya:'SWE',
  norsko:'NOR', norway:'NOR', norvegiya:'NOR',
  rumunsko:'ROU', romania:'ROU', rumuniya:'ROU',
  bulharsko:'BGR', bulgaria:'BGR', bolgariya:'BGR',
  litva:'LTU', lithuania:'LTU', lotyssko:'LVA', latvia:'LVA', latviya:'LVA',
  estonsko:'EST', estonia:'EST', estoniya:'EST',
  usa:'USA', unitedstates:'USA', america:'USA', spojenestaty:'USA', ssha:'USA',
  izrael:'ISR', israel:'ISR', turecko:'TUR', turkey:'TUR', turkiye:'TUR', turechchyna:'TUR',
  belarus:'BLR', bilorus:'BLR', bielorusko:'BLR', belorussiya:'BLR',
  moldavsko:'MDA', moldova:'MDA', portugalsko:'PRT', portugal:'PRT',
  finsko:'FIN', finland:'FIN', irsko:'IRL', ireland:'IRL',
  chorvatsko:'HRV', croatia:'HRV', slovinsko:'SVN', slovenia:'SVN',
  recko:'GRC', greece:'GRC', srbsko:'SRB', serbia:'SRB',
};

function fold(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z\u0400-\u04FF]/g, '')
    .toLowerCase();
}

const CYR_TO_LAT: Record<string, string> = {
  а:'a', б:'b', в:'v', г:'h', ґ:'g', д:'d', е:'e', є:'ie', ж:'zh', з:'z', и:'y', і:'i', ї:'i',
  й:'i', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'kh',
  ц:'ts', ч:'ch', ш:'sh', щ:'shch', ь:'', ю:'iu', я:'ia', ы:'y', э:'e', ё:'e', ъ:'',
};

/** Latin transliteration of a Cyrillic string — a suggestion for the operator, never used verbatim in the file. */
export function transliterate(raw: string): string {
  return Array.from(String(raw))
    .map((ch) => {
      const lower = ch.toLowerCase();
      const lat = CYR_TO_LAT[lower];
      if (lat === undefined) return ch;
      return ch === lower ? lat : lat.charAt(0).toUpperCase() + lat.slice(1);
    })
    .join('')
    .toUpperCase();
}

export function hasCyrillic(raw: string | null | undefined): boolean {
  return /[\u0400-\u04FF]/.test(String(raw ?? ''));
}

/** Free-text nationality → three-letter code, or null when we cannot tell. */
export function toIso3(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const upper = String(raw).trim().toUpperCase();
  if (ALPHA3.has(upper)) return upper;
  if (ALPHA2_TO_ALPHA3[upper]) return ALPHA2_TO_ALPHA3[upper];
  if (OVAL_CODES[upper]) return OVAL_CODES[upper];

  const folded = fold(String(raw));
  if (NAME_ALIASES[folded]) return NAME_ALIASES[folded];

  const latin = Array.from(folded).map((c) => CYR_TO_LAT[c] ?? c).join('');
  if (NAME_ALIASES[latin]) return NAME_ALIASES[latin];
  return null;
}

// ─── Records ──────────────────────────────────────────

export interface UnlProvider {
  idub: string;        // §3.2 field 3 — 12–14 chars, assigned by SCP
  zkratka: string;     // §3.2 field 4 — exactly 5 chars, assigned by SCP
  ubytovatel: string;  // §3.2 field 5 — 1–35 chars
  kontakt?: string;
  okres?: string;
  obec?: string;
  castObce?: string;
  ulice?: string;
  cisloDomovni?: string;
  cisloOrientacni?: string;
  psc?: string;
  ucelPobytu: string;  // §3.3 field 14 — two digits from the účel pobytu codebook
}

export interface UnlGuest {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  document_number: string | null;
  visa_number: string | null;
  address: string | null;
  purpose_of_stay: string | null;
  check_in: string;
  check_out: string;
}

export interface UnlProblem {
  id: string;
  name: string;
  field: string;
  message: string;
}

export interface UnlResult {
  content: string;
  records: number;
  problems: UnlProblem[];
}

const PIPE_OR_BREAK = /[|\r\n]/g;

function field(value: string | null | undefined): string {
  return String(value ?? '').replace(PIPE_OR_BREAK, ' ').trim();
}

function recordA(p: UnlProvider, exportedAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${exportedAt.getFullYear()}.${pad(exportedAt.getMonth() + 1)}.${pad(exportedAt.getDate())} ` +
    `${pad(exportedAt.getHours())}:${pad(exportedAt.getMinutes())}:${pad(exportedAt.getSeconds())}`;

  return [
    'A',
    '2',                                    // §3.2 field 2 — formát dat 2, od UbyPrototype_7
    field(p.idub),
    field(p.zkratka),
    field(p.ubytovatel).slice(0, 35),
    field(p.kontakt).slice(0, 50),
    field(p.okres).slice(0, 32),
    field(p.obec).slice(0, 48),
    field(p.castObce).slice(0, 48),
    field(p.ulice).slice(0, 48),
    field(p.cisloDomovni).slice(0, 5),
    field(p.cisloOrientacni).slice(0, 4),
    field(p.psc).replace(/\D/g, '').slice(0, 5),
    stamp,
    '',                                     // rezerva 1
    '',                                     // rezerva 2
  ].join('|');
}

function recordU(g: UnlGuest, p: UnlProvider, problems: UnlProblem[]): string | null {
  const label = `${g.last_name || ''} ${g.first_name || ''}`.trim() || g.id;
  const before = problems.length;
  const fail = (f: string, m: string) => problems.push({ id: g.id, name: label, field: f, message: m });

  const od = toUbyDate(g.check_in);
  const doDate = toUbyDate(g.check_out);
  if (!od) fail('Pobyt od', 'немає дати заїзду');
  if (!doDate) fail('Pobyt do', 'немає дати виїзду');
  if (od && doDate && g.check_out <= g.check_in) fail('Pobyt do', 'дата виїзду має бути пізніше за дату заїзду');

  const cyrillicName = hasCyrillic(g.last_name) || hasCyrillic(g.first_name);
  if (cyrillicName) {
    const suggestion = `${transliterate(g.last_name || '')} ${transliterate(g.first_name || '')}`.trim();
    fail('Příjmení / Jméno', `ім'я кирилицею — потрібна латиниця з паспорта (напр. ${suggestion})`);
  }

  const prijmeni = sanitizeName(g.last_name, 50);
  if (!cyrillicName && prijmeni.length < 1) fail('Příjmení', 'порожнє або недопустимі символи');
  const jmeno = sanitizeName(g.first_name, 24);

  const narozeni = toUbyDate(g.date_of_birth);
  if (!narozeni) fail('Datum narození', 'немає дати народження');
  else if (g.date_of_birth! < '1900-01-01') fail('Datum narození', 'раніше за 31.12.1899');
  else if (g.date_of_birth! > g.check_in) fail('Datum narození', 'пізніше за дату заїзду');

  const stat = toIso3(g.nationality);
  if (!stat) fail('Státní příslušnost', `не розпізнано «${g.nationality ?? ''}» — потрібен 3-літерний код`);

  const doklad = sanitizeDoc(g.document_number, 30);
  if (doklad.length < 6) fail('Číslo dokladu', `потрібно 6–30 символів A–Z/0–9, є «${g.document_number ?? ''}»`);

  const vizum = sanitizeDoc(g.visa_number, 15);

  const bydliste = sanitizeAddress(g.address);
  if (bydliste && /^\d+$/.test(bydliste.replace(/[\s,]/g, ''))) {
    fail('Bydliště', 'адреса не може складатися лише з цифр');
  }

  // purpose_of_stay is free text for most rows ('Tourism'); only a bare code
  // overrides the property default, otherwise every guest would get "00".
  const raw = field(g.purpose_of_stay);
  const ucel = /^\d{1,2}$/.test(raw) ? raw.padStart(2, '0') : p.ucelPobytu;
  if (!/^\d{2}$/.test(ucel)) fail('Účel pobytu', 'потрібен двоцифровий код з číselníku');

  if (problems.length > before) return null;

  return [
    'U',
    od!,
    doDate!,
    prijmeni,
    jmeno,
    '',            // rezerva 1
    narozeni!,
    '',            // rezerva 2
    '',            // rezerva 3
    stat!,
    bydliste,
    doklad,
    vizum,
    ucel,
    '',            // rezerva 7
    '',            // poznámka
  ].join('|');
}

/**
 * §3.1 — first record type A, the rest type U, each line closed with CRLF.
 * Returns the problems instead of quietly dropping the guests that caused them.
 */
export function buildUnl(guests: UnlGuest[], provider: UnlProvider, exportedAt = new Date()): UnlResult {
  const problems: UnlProblem[] = [];
  const lines = [recordA(provider, exportedAt)];

  for (const g of guests) {
    const line = recordU(g, provider, problems);
    if (line) lines.push(line);
  }

  return {
    content: lines.join('\r\n') + '\r\n',
    records: lines.length - 1,
    problems,
  };
}
