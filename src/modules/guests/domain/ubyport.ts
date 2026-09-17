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

/** §2.7 Bydliště: one component — street or city — cleaned to the allowed set. */
function addressPart(raw: string): string {
  return raw
    .replace(ADDRESS_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 42);
}

export interface Residence {
  value: string;
  /** Why the field came out empty or shorter than the address we hold. */
  note?: string;
}

/**
 * §2.7 Trvalé bydliště v zahraničí — a composite of street, city and state,
 * components separated by ", " (§3.3 field 11), the state written as the
 * three-letter code, a hyphen and its Czech name from the codebook.
 *
 * "Pokud je uvedena ulice, musí být uvedeno město a stát. Pokud je uvedeno
 * město, musí být uveden stát." We hold a single free-text address, so the
 * state has to be recognised in it. When it cannot be, the field goes out
 * EMPTY — §3.3 allows 0 characters — rather than as free text that would have
 * the whole record rejected. The operator is told, so the address can be
 * completed and the guest re-sent.
 */
export function buildResidence(raw: string | null | undefined): Residence {
  const text = String(raw ?? '').replace(/[\r\n]+/g, ', ').trim();
  if (!text) return { value: '' };

  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { value: '' };

  const stateCode = toUbyportState(parts[parts.length - 1]);
  if (!stateCode) {
    return { value: '', note: `у адресі «${text}» не розпізнано державу — поле лишено порожнім` };
  }

  const state = `${stateCode}-${UBYPORT_STATES[stateCode]}`;
  const rest = parts.slice(0, -1).map(addressPart).filter((p) => p && !/^\d+$/.test(p));

  // Street and city only; anything further (region, postcode) has no field of
  // its own and would push the state out of last position.
  const head = rest.slice(0, 2);
  const dropped = rest.length - head.length;

  const value = [...head, state].join(', ').slice(0, 255);
  return dropped > 0
    ? { value, note: `з адреси взято вулицю й місто, відкинуто зайві частини (${dropped})` }
    : { value };
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

/**
 * The police's own `Staty` codebook, read from the web service
 * (`DejMiCiselnik('X', 'Staty')`) on 17.09.2026 — 256 entries, Kod3 and TextCZ.
 *
 * Kod3 is ISO 3166-1 alpha-3, so the mapping above agrees with it everywhere
 * except CZE, which is absent: this is a codebook of foreign nationalities and
 * a Czech is never reported to the foreign police. Nine codes are theirs
 * alone — XXA stateless, XXB/XXC refugee, XXK Kosovo, YUG, UNA/UNO, XGG, XMR.
 *
 * Their Kod2 is NOT ISO alpha-2 — SK is Saint Kitts there, SI the Solomon
 * Islands, GE Equatorial Guinea. Nothing here may use it.
 *
 * The Czech names are needed verbatim: §2.7 spells the state inside Bydliště
 * as the three-letter code, a hyphen, and the name from this codebook.
 */
const UBYPORT_STATES: Record<string, string> = {
  ABW: 'Aruba',
  AFG: 'Afghánská islámská republika',
  AGO: 'Angolská republika',
  AIA: 'Anguilla',
  ALA: 'Provincie Alandy',
  ALB: 'Albánská republika',
  AND: 'Andorrské knížectví',
  ARE: 'Stát Spojené arabské emiráty',
  ARG: 'Argentinská republika',
  ARM: 'Arménská republika',
  ASM: 'Území Americká Samoa',
  ATF: 'Teritorium Francouzská jižní a antarktická území',
  ATG: 'Antigua a Barbuda',
  AUS: 'Australské společenství',
  AUT: 'Rakouská republika',
  AZE: 'Ázerbájdžánská republika',
  BDI: 'Burundská republika',
  BEL: 'Belgické království',
  BEN: 'Beninská republika',
  BES: 'Bonaire, Svatý Eustach a Saba',
  BFA: 'Burkina Faso',
  BGD: 'Bangladéšská lidová republika',
  BGR: 'Bulharská republika',
  BHR: 'Království Bahrajn',
  BHS: 'Bahamské společenství',
  BIH: 'Bosna a Hercegovina',
  BLM: 'Společenství Svatý Bartoloměj',
  BLR: 'Běloruská republika',
  BLZ: 'Belize',
  BMU: 'Bermudy',
  BOL: 'Mnohonárodní stát Bolívie',
  BRA: 'Brazilská federativní republika',
  BRB: 'Barbados',
  BRN: 'Stát Brunej Darussalam',
  BTN: 'Bhútánské království',
  BVT: 'Bouvetův ostrov',
  BWA: 'Botswanská republika',
  CAF: 'Středoafrická republika',
  CAN: 'Kanada',
  CCK: 'Území Kokosové (Keelingovy) ostrovy',
  CHE: 'Švýcarská konfederace',
  CHL: 'Chilská republika',
  CHN: 'Čínská lidová republika',
  CIV: 'Republika Pobřeží slonoviny',
  CMR: 'Kamerunská republika',
  COD: 'Demokratická republika Kongo',
  COG: 'Konžská republika',
  COK: 'Cookovy ostrovy',
  COL: 'Kolumbijská republika',
  COM: 'Komorský svaz',
  CPV: 'Kapverdská republika',
  CRI: 'Kostarická republika',
  CUB: 'Kubánská republika',
  CUW: 'Curaçao',
  CXR: 'Území Vánoční ostrov',
  CYM: 'Kajmanské ostrovy',
  CYP: 'Kyperská republika',
  DEU: 'Spolková republika Německo',
  DJI: 'Džibutská republika',
  DMA: 'Dominické společenství',
  DNK: 'Dánské království',
  DOM: 'Dominikánská republika',
  DZA: 'Alžírská demokratická a lidová republika',
  ECU: 'Ekvádorská republika',
  EGY: 'Egyptská arabská republika',
  ERI: 'Stát Eritrea',
  ESH: 'Saharská arabská demokratická republika',
  ESP: 'Španělské království',
  EST: 'Estonská republika',
  ETH: 'Etiopská federativní demokratická republika',
  FIN: 'Finská republika',
  FJI: 'Fidžijská republika',
  FLK: 'Falklandské ostrovy',
  FRA: 'Francouzská republika',
  FRO: 'Faerské ostrovy',
  FSM: 'Federativní státy Mikronésie',
  GAB: 'Gabonská republika',
  GBR: 'Spojené království Velké Británie a Severního Irska',
  GEO: 'Gruzie',
  GGY: 'Bailiwick Guernsey',
  GHA: 'Ghanská republika',
  GIB: 'Gibraltar',
  GIN: 'Guinejská republika',
  GLP: 'Region Guadeloupe',
  GMB: 'Gambijská republika',
  GNB: 'Republika Guinea-Bissau',
  GNQ: 'Republika Rovníková Guinea',
  GRC: 'Řecká republika',
  GRD: 'Grenadský stát',
  GRL: 'Grónsko',
  GTM: 'Guatemalská republika',
  GUF: 'Region Francouzská Guayana',
  GUM: 'Teritorium Guam',
  GUY: 'Guyanská kooperativní republika',
  HKG: 'Zvláštní administrativní oblast Čínské lidové rep. Hongkong',
  HMD: 'Heardův ostrov a MacDonaldovy ostrovy',
  HND: 'Honduraská republika',
  HRV: 'Chorvatská republika',
  HTI: 'Republika Haiti',
  HUN: 'Maďarsko',
  IDN: 'Indonéská republika',
  IMN: 'Ostrov Man',
  IND: 'Indická republika',
  IOT: 'Britské území v Indickém oceánu',
  IRL: 'Irsko',
  IRN: 'Íránská islámská republika',
  IRQ: 'Irácká republika',
  ISL: 'Islandská republika',
  ISR: 'Stát Izrael',
  ITA: 'Italská republika',
  JAM: 'Jamajka',
  JEY: 'Bailiwick Jersey',
  JOR: 'Jordánské hášimovské království',
  JPN: 'Japonsko',
  KAZ: 'Republika Kazachstán',
  KEN: 'Keňská republika',
  KGZ: 'Kyrgyzská republika',
  KHM: 'Kambodžské království',
  KIR: 'Republika Kiribati',
  KNA: 'Federace Svatý Kryštof a Nevis',
  KOR: 'Korejská republika',
  KWT: 'Kuvajtský stát',
  LAO: 'Laoská lidově demokratická republika',
  LBN: 'Libanonská republika',
  LBR: 'Liberijská republika',
  LBY: 'Libyjský stát',
  LCA: 'Svatá Lucie',
  LIE: 'Lichtenštejnské knížectví',
  LKA: 'Šrílanská demokratická socialistická republika',
  LSO: 'Lesothské království',
  LTU: 'Litevská republika',
  LUX: 'Lucemburské velkovévodství',
  LVA: 'Lotyšská republika',
  MAC: 'Zvláštní administrativní oblast Čínské lidové rep. Macao',
  MAF: 'Společenství Svatý Martin',
  MAR: 'Marocké království',
  MCO: 'Monacké knížectví',
  MDA: 'Moldavská republika',
  MDG: 'Madagaskarská republika',
  MDV: 'Maledivská republika',
  MEX: 'Spojené státy mexické',
  MHL: 'Republika Marshallovy ostrovy',
  MKD: 'Bývalá jugoslávská republika Makedonie',
  MLI: 'Republika Mali',
  MLT: 'Maltská republika',
  MMR: 'Republika Myanmarský svaz',
  MNE: 'Černá Hora',
  MNG: 'Mongolsko',
  MNP: 'Společenství Severní Mariany',
  MOZ: 'Mosambická republika',
  MRT: 'Mauritánská islámská republika',
  MSR: 'Montserrat',
  MTQ: 'Region Martinik',
  MUS: 'Mauricijská republika',
  MWI: 'Malawská republika',
  MYS: 'Malajsie',
  MYT: 'Departementní společenství Mayotte',
  NAM: 'Namibijská republika',
  NCL: 'Nová Kaledonie',
  NER: 'Nigerská republika',
  NFK: 'Území Norfolk',
  NGA: 'Nigerijská federativní republika',
  NIC: 'Nikaragujská republika',
  NIU: 'Niue',
  NLD: 'Nizozemsko',
  NOR: 'Norské království',
  NPL: 'Nepálská federativní demokratická republika',
  NRU: 'Republika Nauru',
  NZL: 'Nový Zéland',
  OMN: 'Sultanát Omán',
  PAK: 'Pákistánská islámská republika',
  PAN: 'Panamská republika',
  PCN: 'Pitcairnovy ostrovy',
  PER: 'Peruánská republika',
  PHL: 'Filipínská republika',
  PLW: 'Republika Palau',
  PNG: 'Nezávislý stát Papua Nová Guinea',
  POL: 'Polská republika',
  PRI: 'Portorické společenství',
  PRK: 'Korejská lidově demokratická republika',
  PRT: 'Portugalská republika',
  PRY: 'Paraguayská republika',
  PSE: 'Palestinská autonomní území',
  PYF: 'Francouzská Polynésie',
  QAT: 'Stát Katar',
  REU: 'Region Réunion',
  ROU: 'Rumunsko',
  RUS: 'Ruská federace',
  RWA: 'Rwandská republika',
  SAU: 'Království Saúdská Arábie',
  SDN: 'Súdánská republika',
  SEN: 'Senegalská republika',
  SGP: 'Singapurská republika',
  SGS: 'Jižní Georgie a Jižní Sandwichovy ostrovy',
  SHN: 'Svatá Helena,Ascension a Tristan da Cunha',
  SJM: 'Špicberky a Jan Mayen',
  SLB: 'Šalomounovy ostrovy',
  SLE: 'Republika Sierra Leone',
  SLV: 'Salvadorská republika',
  SMR: 'Republika San Marino',
  SOM: 'Somálská federativní republika',
  SPM: 'Územní společenství Saint Pierre a Miquelon',
  SRB: 'Srbská republika',
  SSD: 'Jihosúdanská republika',
  STP: 'Demokratická republika Svatý Tomáš a Princův ostrov',
  SUR: 'Surinamská republika',
  SVK: 'Slovenská republika',
  SVN: 'Slovinská republika',
  SWE: 'Švédské království',
  SWZ: 'Svazijské království',
  SXM: 'Svatý Martin (NL)',
  SYC: 'Seychelská republika',
  SYR: 'Syrská arabská republika',
  TCA: 'Ostrovy Turks a Caicos',
  TCD: 'Čadská republika',
  TGO: 'Tožská republika',
  THA: 'Thajské království',
  TJK: 'Republika Tádžikistán',
  TKL: 'Tokelau',
  TKM: 'Turkmenistán',
  TLS: 'Demokratická republika Východní Timor',
  TON: 'Království Tonga',
  TTO: 'Republika Trinidad a Tobago',
  TUN: 'Tuniská republika',
  TUR: 'Turecká republika',
  TUV: 'Tuvalu',
  TWN: 'Čínská republika (Tchaj-wan)',
  TZA: 'Tanzanská sjednocená republika',
  UGA: 'Ugandská republika',
  UKR: 'Ukrajina',
  UMI: 'Menší odlehlé ostrovy USA',
  UNA: 'Agentura spojených národů',
  UNO: 'Organizace spojených národů',
  URY: 'Uruguayská východní republika',
  USA: 'Spojené státy americké',
  UZB: 'Republika Uzbekistán',
  VAT: 'Vatikánský městský stát',
  VCT: 'Svatý Vincenc a Grenadiny',
  VEN: 'Bolívarovská republika Venezuela',
  VGB: 'Britské Panenské ostrovy',
  VIR: 'Americké Panenské ostrovy',
  VNM: 'Vietnamská socialistická republika',
  VUT: 'Republika Vanuatu',
  WLF: 'Teritorium Wallisovy ostrovy a Futuna',
  WSM: 'Nezávislý stát Samoa',
  XGG: 'Guernsey',
  XMR: 'Řád Maltézských Rytířů',
  XXA: 'Bez státní příslušnosti - dle OSN',
  XXB: 'uprchlík dle konvence 1951',
  XXC: 'uprchlík ostatní',
  XXK: 'Kosovská republika',
  YEM: 'Jemenská republika',
  YUG: 'Svazová republika Jugoslávie',
  ZAF: 'Jihoafrická republika',
  ZMB: 'Zambijská republika',
  ZWE: 'Zimbabwská republika'
};

const ALPHA3 = new Set(Object.values(ALPHA2_TO_ALPHA3));

/**
 * Vehicle oval codes. Guests write "D" on the check-in form and OCR reads it
 * off a German plate or an old ID; a bare "D" is not a nationality anywhere in
 * ISO 3166 and the web service answers E_NATI_INVALID.
 */
const OVAL_CODES: Record<string, string> = {
  XK:'XXK', KOSOVO:'XXK', RKS:'XXK',
  A:'AUT', B:'BEL', D:'DEU', E:'ESP', F:'FRA', H:'HUN', I:'ITA', L:'LUX', N:'NOR', P:'PRT', S:'SWE',
  UK:'GBR', SLO:'SVN', GBZ:'GIB', IRL:'IRL', RSM:'SMR', MNE:'MNE', BIH:'BIH', SRB:'SRB',
};

/** Spellings we see in this database, in cs / en / de / uk / ru. */
const NAME_ALIASES: Record<string, string> = {
  cesko:'CZE', ceskarepublika:'CZE', czechia:'CZE', czechrepublic:'CZE', czech:'CZE', cechia:'CZE',
  chekhia:'CZE', chekhyia:'CZE', chekhiia:'CZE', cheska:'CZE', cheskarespublika:'CZE',
  nemecko:'DEU', germany:'DEU', deutschland:'DEU', german:'DEU', nimechchyna:'DEU', germaniya:'DEU',
  deutsch:'DEU', deutsche:'DEU', nemecka:'DEU', nemec:'DEU',
  nizozemsko:'NLD', netherlands:'NLD', holland:'NLD', holandsko:'NLD', niderlandy:'NLD', gollandiya:'NLD',
  nederland:'NLD', nederlands:'NLD', nederlandse:'NLD', dutch:'NLD', niderlandska:'NLD',
  polsko:'POL', poland:'POL', polska:'POL', polshcha:'POL', polsha:'POL', polish:'POL', polskie:'POL',
  slovensko:'SVK', slovakia:'SVK', slovachchyna:'SVK', slovakiya:'SVK',
  rakousko:'AUT', austria:'AUT', osterreich:'AUT', avstriya:'AUT',
  ukrajina:'UKR', ukraine:'UKR', ukraina:'UKR',
  rusko:'RUS', russia:'RUS', rossiya:'RUS', rosiya:'RUS',
  velkabritanie:'GBR', unitedkingdom:'GBR', greatbritain:'GBR', england:'GBR', britain:'GBR',
  italie:'ITA', italy:'ITA', italia:'ITA', italiya:'ITA', italiana:'ITA', italiano:'ITA', italian:'ITA',
  francie:'FRA', france:'FRA', frantsiya:'FRA', francais:'FRA', francaise:'FRA', french:'FRA',
  spanelsko:'ESP', spain:'ESP', espana:'ESP', ispaniya:'ESP',
  espanol:'ESP', espanola:'ESP', spanish:'ESP', ispanska:'ESP',
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
  kosovo:'XXK', kosova:'XXK',
  // Not countries, but the codebook carries them and real guests have them.
  bezstatniprislusnosti:'XXA', stateless:'XXA', apatrid:'XXA', bezgromadyanstva:'XXA',
  uprchlik:'XXB', refugee:'XXB', bizhenets:'XXB',
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
const NOT_A_NATIONALITY = new Set(['null', 'undefined', 'none', 'nan', 'n/a', 'na', '-', '?']);

export function toIso3(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (NOT_A_NATIONALITY.has(String(raw).trim().toLowerCase())) return null;
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

/**
 * The code that actually goes into the file. Anything the police codebook does
 * not contain comes back null so the guest is listed as a problem instead of
 * being submitted with a code that will be rejected.
 */
export function toUbyportState(raw: string | null | undefined): string | null {
  const code = toIso3(raw);
  return code && UBYPORT_STATES[code] ? code : null;
}

// ─── §3.3 field 14 — účel pobytu ──────────────────────
//
// purpose_of_stay is free text in this database ('Tourism' by default). These
// are the codes the reporting bot has been sending, and batches carrying them
// were accepted by Ubyport up to 26.07.2026 — so they are verified against the
// číselník by practice, not guessed.

/**
 * `UcelyPobytu`, read from the service on 17.09.2026. The codes are NOT a
 * round decade scale — there is no 20, 30, 40, 50, 60, 70 or 80. Tourism is
 * 10, employment is 27, study is 11, business is 01.
 */
const UBYPORT_PURPOSES: Record<string, string> = {
  '00': 'ZDRAVOTNÍ',
  '01': 'OBCHODNÍ',
  '02': 'KULTURNÍ',
  '03': 'NÁVŠTĚVA RODINY NEBO PŘÁTEL',
  '04': 'POZVÁNÍ',
  '05': 'OFICIÁLNÍ (POLITICKÝ)',
  '06': 'PODNIKÁNÍ-OSVČ',
  '07': 'SPORTOVNÍ',
  '10': 'TURISTIKA',
  '11': 'STUDIUM (školení, stáž)',
  '12': 'TRANZIT (průjezd)',
  '13': 'LETIŠTNÍ TRANZIT (průjezd)',
  '27': 'ZAMĚSTNÁNÍ',
  '38': 'ZÁCVIK',
  '52': 'SEZÓNNÍ ZAMĚSTNÁNÍ',
  '93': 'ADS VÍZUM — MEMORANDUM O POROZUMĚNÍ',
  '99': 'JINÉ / OSTATNÍ',
};

export function isKnownPurpose(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(UBYPORT_PURPOSES, code);
}

/** Free text in `purpose_of_stay` → a code that exists in the codebook. */
const PURPOSE_TEXT: Record<string, string> = {
  tourism: '10', turistika: '10', turyzm: '10', turizm: '10', holiday: '10', vacation: '10',
  business: '01', obchod: '01', obchodni: '01', commercial: '01',
  podnikani: '06', selfemployed: '06', osvc: '06',
  study: '11', studium: '11', navchannia: '11', school: '11', training: '11', staz: '11',
  work: '27', employment: '27', zamestnani: '27', robota: '27', job: '27',
  seasonalwork: '52', sezonnizamestnani: '52',
  health: '00', zdravotni: '00', medical: '00', lecba: '00',
  culture: '02', kulturni: '02', kultura: '02',
  family: '03', navstevarodiny: '03', visitingfamily: '03', friends: '03',
  invitation: '04', pozvani: '04',
  official: '05', oficialni: '05', political: '05',
  sport: '07', sportovni: '07',
  transit: '12', tranzit: '12',
  airporttransit: '13', letistnitranzit: '13',
  other: '99', ostatni: '99', jine: '99', religion: '99', nabozenstvi: '99',
};

/** Free text or a bare code → two-digit code; `fallback` is the property default. */
export function toPurposeCode(raw: string | null | undefined, fallback: string): string {
  const text = String(raw ?? '').trim();
  if (/^\d{1,2}$/.test(text)) {
    const padded = text.padStart(2, '0');
    if (isKnownPurpose(padded)) return padded;
  }
  return PURPOSE_TEXT[fold(text)] ?? fallback;
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
  /** Records that go out, but with something worth telling the operator. */
  warnings: UnlProblem[];
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

function recordU(g: UnlGuest, p: UnlProvider, problems: UnlProblem[], warnings: UnlProblem[]): string | null {
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

  const stat = toUbyportState(g.nationality);
  if (!stat) {
    const iso = toIso3(g.nationality);
    if (iso === 'CZE') {
      fail('Státní příslušnost', 'громадянин ЧР — до cizinecké policie не подається');
    } else {
      fail('Státní příslušnost', `не розпізнано «${g.nationality ?? ''}» — немає в číselníku Stát`);
    }
  }

  const doklad = sanitizeDoc(g.document_number, 30);
  if (doklad.length < 6) fail('Číslo dokladu', `потрібно 6–30 символів A–Z/0–9, є «${g.document_number ?? ''}»`);

  const vizum = sanitizeDoc(g.visa_number, 15);

  const residence = buildResidence(g.address);
  if (residence.note) warnings.push({ id: g.id, name: label, field: 'Bydliště', message: residence.note });

  const ucel = toPurposeCode(g.purpose_of_stay, p.ucelPobytu);
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
    residence.value,
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
  const warnings: UnlProblem[] = [];
  const lines = [recordA(provider, exportedAt)];

  for (const g of guests) {
    const line = recordU(g, provider, problems, warnings);
    if (line) lines.push(line);
  }

  // A warning on a guest that never made it into the file is noise.
  const emitted = new Set(guests.filter((g) => !problems.some((p) => p.id === g.id)).map((g) => g.id));

  return {
    content: lines.join('\r\n') + '\r\n',
    records: lines.length - 1,
    problems,
    warnings: warnings.filter((w) => emitted.has(w.id)),
  };
}
