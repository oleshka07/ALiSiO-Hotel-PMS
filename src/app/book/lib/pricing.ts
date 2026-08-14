/**
 * Kemp Carlsbad — widget pricing entry point.
 *
 * The rules moved into the pricing module so the server can price a camping
 * stay too. This file keeps the widget's imports working and holds the one
 * browser-only piece: fetching the price list.
 *
 * Reaches the rate card directly rather than through '@pricing': that barrel
 * also exports the route handlers, which pull better-sqlite3 in behind them.
 * The rate card is pure — no db, no fetch — so it is the half that can ship to
 * a browser.
 */
export * from '@/modules/pricing/domain/rate-card';
import type { PriceItem } from '@/modules/pricing/domain/rate-card';

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

