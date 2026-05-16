/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Read-only preview of PriceLabs nightly prices for the 6 glamping houses.
// No DB writes — UI shows what PriceLabs currently has so the admin can
// compare against the PriceLabs dashboard before we wire production sync.
//
// GET /api/pricing/pricelabs-preview?days=30
// GET /api/pricing/pricelabs-preview?listing_id=20345_12446083_house&days=14
//

import { NextRequest, NextResponse } from 'next/server';
import { getListings, getListingPrices } from '@/lib/pricelabs';
import { getEurCzkRate } from '@/lib/hostex';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';

async function requirePricingPerm(): Promise<NextResponse | null> {
  const store = await cookies();
  const user = await getSessionUser(store.get('session_id')?.value);
  if (!user) return NextResponse.json({ error: 'Не авторизовано' }, { status: 401 });
  if (!hasPermission(user.permissions, 'manage_pricing')) {
    return NextResponse.json({ error: 'Потрібен дозвіл manage_pricing' }, { status: 403 });
  }
  return null;
}

function isoDate(d: Date): string {
  return d.toISOString().substring(0, 10);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const guard = await requirePricingPerm();
  if (guard) return guard;

  try {
    const { searchParams } = new URL(request.url);
    const daysAhead = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '30', 10)));
    const filterId = searchParams.get('listing_id');

    // Listings — keep only PMS-connected ones (filter out OTA-direct duplicates).
    const allListings = await getListings();
    let listings = allListings.filter((l) => l.pms === 'hostex');
    if (filterId) {
      listings = listings.filter((l) => l.id === filterId);
    }
    if (listings.length === 0) {
      return NextResponse.json({ error: 'No matching listings', allListings }, { status: 404 });
    }

    const from = isoDate(new Date());
    const to = isoDate(new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000));

    const eurToCzk = await getEurCzkRate();

    const pricesByListing = await getListingPrices(
      listings.map((l) => ({ id: l.id, pms: l.pms })),
      from,
      to,
    );

    // Annotate every daily price with the CZK equivalent so the UI can show
    // both numbers side by side. PriceLabs returns EUR for our listings;
    // PMS reports default to CZK.
    const enriched = pricesByListing.map((p) => ({
      listing_id: p.id,
      listing_name: listings.find((l) => l.id === p.id)?.name || p.id,
      pms: p.pms,
      currency: p.currency,
      last_refreshed_at: p.last_refreshed_at,
      days: (p.data || []).map((d) => ({
        date: d.date,
        price_eur: p.currency === 'EUR' ? d.price : null,
        price_czk: p.currency === 'EUR' ? Math.round(d.price * eurToCzk) : d.price,
        user_override_eur: d.user_price > 0 ? d.user_price : null,
        algo_eur: d.uncustomized_price,
        booking_status: d.booking_status || null,
        unbookable: d.unbookable === 1,
        min_stay: d.min_stay > 0 ? d.min_stay : null,
        demand: d.demand_desc || null,
      })),
    }));

    return NextResponse.json({
      from, to, daysAhead,
      eurToCzk,
      listings: enriched,
      listingsSummary: listings.map((l) => ({
        id: l.id, name: l.name, pms: l.pms,
        min: l.min, base: l.base, max: l.max,
        push_enabled: l.push_enabled, last_refreshed_at: l.last_refreshed_at,
      })),
    });
  } catch (e: any) {
    console.error('[PriceLabs Preview] error:', e?.message, e?.stack);
    return NextResponse.json({ error: 'PriceLabs request failed', detail: e?.message }, { status: 500 });
  }
}
