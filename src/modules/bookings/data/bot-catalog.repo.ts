/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * What the bot can sell, and what it costs.
 *
 * Reception does not pick "BB — Between Pitch" from a list of four near-identical
 * pitch types; they pick "camping" and the system finds a free spot. So the bot's
 * catalogue is not the unit_types table — it is a short list of things the camp
 * actually sells, each tied to an entry in the price list.
 *
 * Prices come from widget_price_list, the page the owner edits, and from the same
 * functions the website widget calls. price_calendar is deliberately not read
 * here: it holds rows only for the two houses PriceLabs writes, and those are not
 * for sale at the moment.
 */
import {
  calcCampingBreakdown, calcBuildingPrice, type PriceItem, type CampingItemCode,
} from '@pricing';

export type BotRateCode = 'camping' | 'budova_d' | 'budova_f';
/** Buildings are sold by the bed; a whole room to one person costs more. */
export type BuildingMode = 'bed' | 'room';

export interface BotGroup {
  code: BotRateCode;
  name: string;
  isCamping: boolean;
  unitsFree: number;
}

const GROUP_NAMES: Record<BotRateCode, string> = {
  camping: '⛺ Кемпінг',
  budova_d: '🏠 Budova D',
  budova_f: '🏠 Budova F',
};

const FREE_UNITS_SQL = `
  SELECT ut.bot_rate_code AS code, COUNT(u.id) AS units_free
  FROM unit_types ut
  JOIN units u ON u.unit_type_id = ut.id AND COALESCE(u.is_active, 1) = 1
  WHERE ut.bot_rate_code IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.unit_id = u.id
        AND r.status NOT IN ('cancelled','no_show')
        AND date(r.check_in) < date(?) AND date(?) < date(r.check_out)
    )
  GROUP BY ut.bot_rate_code
`;

export function listBotGroups(db: any, checkIn: string, checkOut: string): BotGroup[] {
  const rows = db.prepare(FREE_UNITS_SQL).all(checkOut, checkIn) as any[];
  return rows
    .filter((r) => r.units_free > 0 && GROUP_NAMES[r.code as BotRateCode])
    .map((r) => ({
      code: r.code as BotRateCode,
      name: GROUP_NAMES[r.code as BotRateCode],
      isCamping: r.code === 'camping',
      unitsFree: r.units_free,
    }))
    .sort((a, b) => (a.code === 'camping' ? -1 : b.code === 'camping' ? 1 : a.name.localeCompare(b.name)));
}

/** First free unit in the group — the bot never names a specific pitch or room. */
export function findFreeUnit(db: any, code: BotRateCode, checkIn: string, checkOut: string): any {
  return db.prepare(`
    SELECT u.id, u.code, u.name, u.property_id, u.unit_type_id
    FROM units u
    JOIN unit_types ut ON ut.id = u.unit_type_id
    WHERE ut.bot_rate_code = ? AND COALESCE(u.is_active, 1) = 1
      AND NOT EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.unit_id = u.id
          AND r.status NOT IN ('cancelled','no_show')
          AND date(r.check_in) < date(?) AND date(?) < date(r.check_out)
      )
    ORDER BY u.sort_order, u.code
    LIMIT 1
  `).get(code, checkOut, checkIn);
}

export interface BotPriceInput {
  code: BotRateCode;
  checkIn: string;
  checkOut: string;
  adults: number;
  children?: number;
  mode?: BuildingMode;
  campingItems?: CampingItemCode[];
  electricity?: boolean;
  pets?: number;
  motorhomeService?: boolean;
}

export function priceBotBooking(prices: PriceItem[], input: BotPriceInput) {
  const { code, checkIn, checkOut, adults, children = 0 } = input;

  if (code === 'camping') {
    return calcCampingBreakdown(
      input.campingItems || [], adults, children,
      !!input.electricity, input.pets || 0, !!input.motorhomeService,
      checkIn, checkOut, prices,
    );
  }

  // 'shared' is the per-bed rate — cheaper per person, and what reception sells
  // by default. 'non_shared' is the whole room, which one guest alone pays more
  // for than a single bed.
  const q = calcBuildingPrice(
    code, input.mode === 'room' ? 'non_shared' : 'shared',
    adults, children, checkIn, checkOut, false, prices,
  ) as any;
  return { total: q.total, deposit: q.deposit, remaining: q.remaining, nights: q.nights, lines: [] };
}
