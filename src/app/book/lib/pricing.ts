/**
 * Kemp Carlsbad — Client-side Pricing Engine
 * Rates loaded from /api/widget/prices (widget_price_list table)
 * Fallback to hardcoded defaults if API unavailable
 */

// ─── Holiday List ────────────────────────────────────
const HOLIDAYS: string[] = [
  // 2026
  '2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05',
  '2026-02-23','2026-03-08',
  '2026-06-28','2026-06-29','2026-06-30','2026-07-01','2026-07-02','2026-07-03','2026-07-04','2026-07-05',
  '2026-12-23','2026-12-24','2026-12-25','2026-12-26','2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31',
  // 2027
  '2027-01-01','2027-01-02','2027-01-03','2027-01-04','2027-01-05',
  '2027-02-23','2027-03-08',
  '2027-07-02','2027-07-03','2027-07-04','2027-07-05','2027-07-06','2027-07-07','2027-07-08','2027-07-09',
  '2027-12-23','2027-12-24','2027-12-25','2027-12-26','2027-12-27','2027-12-28','2027-12-29','2027-12-30','2027-12-31',
];
const HOLIDAY_SET = new Set(HOLIDAYS);

export function isHoliday(dateStr: string): boolean { return HOLIDAY_SET.has(dateStr); }
export function isWeekendNight(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00'); const day = d.getDay();
  return day === 0 || day === 5 || day === 6;
}
export function isHolidayOrWeekend(dateStr: string): boolean { return isHoliday(dateStr) || isWeekendNight(dateStr); }

export type Season = 'main' | 'side';
export function getSeason(dateStr: string): Season {
  const m = parseInt(dateStr.substring(5, 7));
  return m >= 5 && m <= 9 ? 'main' : 'side';
}

export function fmtDate(d: Date): string { return d.toISOString().split('T')[0]; }

export function getNightDates(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const ci = new Date(checkIn + 'T00:00:00');
  const co = new Date(checkOut + 'T00:00:00');
  const cur = new Date(ci);
  while (cur < co) { dates.push(fmtDate(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}

export function formatPrice(n: number): string {
  return new Intl.NumberFormat('cs-CZ').format(Math.round(n));
}

// ─── Price List Type ─────────────────────────────────
export interface PriceItem {
  id: string;
  category: string;
  item_code: string;
  item_name: string;
  rate_standard: number;
  rate_holiday: number | null;
  rate_side_season: number | null;
  unit_label: string;
  notes: string | null;
  sort_order: number;
  is_active: number;
}

// Cache loaded rates
let _priceListCache: PriceItem[] | null = null;
let _priceListCacheTime = 0;

export async function loadPriceList(): Promise<PriceItem[]> {
  const now = Date.now();
  if (_priceListCache && now - _priceListCacheTime < 5 * 60 * 1000) return _priceListCache;
  try {
    const res = await fetch('/api/widget/prices');
    if (res.ok) {
      _priceListCache = await res.json();
      _priceListCacheTime = now;
      return _priceListCache!;
    }
  } catch { /* fallback */ }
  return [];
}

export function getRate(prices: PriceItem[], code: string): PriceItem | undefined {
  return prices.find(p => p.item_code === code && p.is_active);
}

// ─── Glamping Pricing ────────────────────────────────
export type GlampingUnit = 'tiny' | 'barn';

export interface NightBreakdown { date: string; type: 'standard' | 'holiday'; price: number; }

export function calcGlampingPrice(unit: GlampingUnit, checkIn: string, checkOut: string, prices: PriceItem[], adults = 2) {
  const code = unit === 'tiny' ? 'tiny_house' : 'barn_house';
  const item = getRate(prices, code);
  const std = item?.rate_standard ?? (unit === 'tiny' ? 3900 : 5000);
  const hol = item?.rate_holiday ?? (unit === 'tiny' ? 5500 : 7000);
  const maxGuests = unit === 'tiny' ? 2 : 6;
  const taxItem = getRate(prices, 'tourist_tax');
  const taxRate = taxItem?.rate_standard ?? 25;

  const nights = getNightDates(checkIn, checkOut);
  const breakdown: NightBreakdown[] = nights.map(date => {
    const isHol = isHolidayOrWeekend(date);
    return { date, type: isHol ? 'holiday' : 'standard', price: isHol ? hol : std };
  });
  const accommodationTotal = breakdown.reduce((s, n) => s + n.price, 0);
  const touristTax = adults * taxRate * nights.length;
  const total = accommodationTotal + touristTax;
  const deposit = Math.round(total * 0.3);
  return {
    breakdown, total, accommodationTotal, touristTax, taxRate, adults,
    deposit, remaining: total - deposit, nights: nights.length, maxGuests,
  };
}

// ─── Buildings Pricing ───────────────────────────────
export type BuildingType = 'budova_d' | 'budova_f';
export type BookingMode = 'shared' | 'non_shared' | 'buyout';

export function calcBuildingPrice(
  building: BuildingType, mode: BookingMode,
  adults: number, childrenU15: number,
  checkIn: string, checkOut: string,
  ownSleepingBag: boolean, prices: PriceItem[],
) {
  const prefix = building === 'budova_d' ? 'budova_d' : 'budova_f';
  const capacity = building === 'budova_d' ? 48 : 51;
  const bed1Item = getRate(prices, `${prefix}_bed_1night`);
  const bed2Item = getRate(prices, `${prefix}_bed_2plus`);
  const roomItem = getRate(prices, `${prefix}_room`);

  const bed1 = { standard: bed1Item?.rate_standard ?? 420, holiday: bed1Item?.rate_holiday ?? 520 };
  const bed2 = { standard: bed2Item?.rate_standard ?? 390, holiday: bed2Item?.rate_holiday ?? 470 };
  const roomRate = { standard: roomItem?.rate_standard ?? 690, holiday: roomItem?.rate_holiday ?? null };

  const nightDates = getNightDates(checkIn, checkOut);
  const numNights = nightDates.length;
  const is1Night = numNights === 1;
  const isGroup = (adults + childrenU15) >= 15;
  const K = isGroup ? 0.88 : 1;

  if (mode === 'non_shared') {
    const stdNights = nightDates.filter(d => !isHoliday(d)).length;
    const holNights = nightDates.filter(d => isHoliday(d)).length;
    const hasHolidayNonShared = holNights > 0 && roomRate.holiday === null;
    const stdTotal = stdNights * roomRate.standard;
    return { total: stdTotal, deposit: Math.round(stdTotal * 0.3), remaining: stdTotal - Math.round(stdTotal * 0.3), nights: numNights, isGroup, hasHolidayNonShared, breakdown: [] as NightBreakdown[], K };
  }

  if (mode === 'buyout') {
    const stdNights = nightDates.filter(d => !isHoliday(d)).length;
    const holNights = nightDates.filter(d => isHoliday(d)).length;
    const bedRate = is1Night ? bed1 : bed2;
    const buyoutStd = capacity * bedRate.standard * stdNights * K;
    const buyoutHol = capacity * bedRate.holiday * holNights * K;
    const subtotal = Math.round(buyoutStd + buyoutHol);
    const kauce = 5000;
    const total = subtotal + kauce;
    const depositPct = isGroup ? 0.5 : 0.3;
    const deposit = Math.round(subtotal * depositPct);
    return { total, deposit, remaining: total - deposit, nights: numNights, isGroup, hasHolidayNonShared: false, breakdown: [] as NightBreakdown[], K, kauce, subtotal };
  }

  // Shared mode
  const bedRate = is1Night ? bed1 : bed2;
  const stdNights = nightDates.filter(d => !isHoliday(d)).length;
  const holNights = nightDates.filter(d => isHoliday(d)).length;

  const adultStd = adults * bedRate.standard * stdNights * K;
  const adultHol = adults * bedRate.holiday * holNights * K;
  const childStd = childrenU15 * (bedRate.standard * 0.9) * stdNights * K;
  const childHol = childrenU15 * (bedRate.holiday * 0.9) * holNights * K;
  const persons = adults + childrenU15;
  const sleepingBagDiscount = ownSleepingBag ? persons * 100 * numNights : 0;
  const kauce = isGroup ? 5000 : 0;

  const accommodationSubtotal = Math.round(adultStd + adultHol + childStd + childHol - sleepingBagDiscount);
  const taxItem = getRate(prices, 'tourist_tax');
  const taxRate = taxItem?.rate_standard ?? 25;
  const touristTax = adults * taxRate * numNights;
  const subtotal = accommodationSubtotal + touristTax;
  const total = subtotal + kauce;
  const depositPct = isGroup ? 0.5 : 0.3;
  const deposit = Math.round(subtotal * depositPct);

  return {
    total, deposit, remaining: total - deposit, nights: numNights, isGroup,
    hasHolidayNonShared: false, breakdown: [] as NightBreakdown[], K, kauce, subtotal,
    accommodationSubtotal, sleepingBagDiscount, touristTax, taxRate,
    adults, persons,
  };
}

// ─── Camping Pricing (multi-select) ──────────────────
export type CampingItemCode = 'small_tent' | 'large_tent' | 'car' | 'minibus' | 'caravan' | 'motorhome' | 'motorcycle' | 'svc_test_stone';

export const CAMPING_ITEMS: { code: CampingItemCode; label: string; emoji: string }[] = [
  { code: 'small_tent', label: 'Small tent', emoji: '⛺' },
  { code: 'large_tent', label: 'Large tent', emoji: '🏕️' },
  { code: 'car', label: 'Car', emoji: '🚗' },
  { code: 'minibus', label: 'Minibus / Van', emoji: '🚐' },
  { code: 'caravan', label: 'Caravan', emoji: '🚙' },
  { code: 'motorhome', label: 'Motorhome', emoji: '🚌' },
  { code: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' },
  { code: 'svc_test_stone', label: 'Test Stone (1 Kč)', emoji: '🪨' },
];

export function calcCampingPrice(
  selectedItems: CampingItemCode[],
  adults: number, childrenU15: number,
  electricity: boolean, pets: number,
  motorhomeService: boolean,
  checkIn: string, checkOut: string,
  prices: PriceItem[],
) {
  const nightDates = getNightDates(checkIn, checkOut);

  // Get rates from price list
  const adultItem = getRate(prices, 'adult_person');
  const childItem = getRate(prices, 'child_person');
  const elecItem = getRate(prices, 'electricity');
  const petItem = getRate(prices, 'pet');
  const taxItem = getRate(prices, 'tourist_tax');
  const mhSvcItem = getRate(prices, 'motorhome_service');

  let total = 0;

  for (const date of nightDates) {
    const season = getSeason(date);
    let perNight = 0;

    // Sum all selected equipment items
    for (const code of selectedItems) {
      const item = getRate(prices, code);
      if (item) {
        const rate = season === 'side' && item.rate_side_season != null ? item.rate_side_season : item.rate_standard;
        perNight += rate;
      }
    }

    // Persons
    const adultRate = season === 'side' && adultItem?.rate_side_season != null ? adultItem.rate_side_season : (adultItem?.rate_standard ?? 150);
    const childRate = season === 'side' && childItem?.rate_side_season != null ? childItem.rate_side_season : (childItem?.rate_standard ?? 100);
    perNight += adults * adultRate;
    perNight += childrenU15 * childRate;

    // Extras
    if (electricity) perNight += elecItem?.rate_standard ?? 120;
    perNight += pets * (petItem?.rate_standard ?? 50);
    perNight += adults * (taxItem?.rate_standard ?? 25);

    total += perNight;
  }

  // One-time motorhome service
  if (motorhomeService && selectedItems.includes('motorhome')) {
    total += mhSvcItem?.rate_standard ?? 100;
  }

  const isGroup = (adults + childrenU15) >= 15;
  const depositPct = isGroup ? 0.5 : 0.3;
  const deposit = Math.round(total * depositPct);

  return { total, deposit, remaining: total - deposit, nights: nightDates.length };
}
