/**
 * PriceLabs Customer API client.
 * Endpoint reference: https://api.pricelabs.co/v1
 * Auth header: X-API-Key
 */

const BASE = 'https://api.pricelabs.co/v1';

export interface PriceLabsListing {
  id: string;
  pms: string;
  name: string;
  group?: string | null;
  subgroup?: string | null;
  min?: number;
  base?: number;
  max?: number;
  push_enabled?: boolean;
  last_refreshed_at?: string;
  occupancy_next_7?: string;
  occupancy_next_30?: string;
  occupancy_next_60?: string;
}

export interface PriceLabsDailyPrice {
  date: string;            // YYYY-MM-DD
  price: number;           // final recommended price (in listing currency)
  user_price: number;      // user override (-1 when none)
  uncustomized_price: number;
  min_stay: number;        // -1 when unset
  booking_status: string;  // 'Booked' | 'Booked (Check-In)' | ''
  unbookable: number;      // 0/1
  extra_person_fee: number;
  demand_color: string;
  demand_desc: string;
}

export interface PriceLabsListingPrices {
  id: string;
  pms: string;
  group: string;
  currency: string;
  last_refreshed_at: string;
  data: PriceLabsDailyPrice[];
}

function apiKey(): string {
  const key = process.env.PRICELABS_API_KEY;
  if (!key) throw new Error('PRICELABS_API_KEY not configured');
  return key;
}

function headers(): Record<string, string> {
  return {
    'X-API-Key': apiKey(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/** GET /v1/listings — every listing visible to this API key. */
export async function getListings(): Promise<PriceLabsListing[]> {
  const res = await fetch(`${BASE}/listings`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`PriceLabs /listings ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  return Array.isArray(body) ? body : body.listings || body.data || [];
}

/** POST /v1/listing_prices — nightly prices for one or more listings. */
export async function getListingPrices(
  listings: Array<{ id: string; pms: string }>,
  dateFrom: string,
  dateTo: string,
): Promise<PriceLabsListingPrices[]> {
  const res = await fetch(`${BASE}/listing_prices`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ listings, dateFrom, dateTo }),
  });
  if (!res.ok) {
    throw new Error(`PriceLabs /listing_prices ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  return Array.isArray(body) ? body : body.data || [];
}
