/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function validatePromoOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function validatePromo(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get('code') || '').toUpperCase().trim();
    const serviceId = searchParams.get('serviceId') || '';
    const unitId = searchParams.get('unitId') || '';
    const siteId = searchParams.get('siteId') || '';

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Code is required' }, { status: 400, headers: CORS_HEADERS });
    }

    const db = getDb();
    let offer = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(code) as any;
    let isBundle = false;

    if (!offer) {
      offer = db.prepare('SELECT * FROM gift_card_bundles WHERE coupon_code = ? AND is_active = 1').get(code) as any;
      if (offer) isBundle = true;
    }

    if (!offer) {
      return NextResponse.json({ valid: false, error: 'Invalid Coupon code' }, { headers: CORS_HEADERS });
    }

    if (isBundle) {
      if (offer.site_id && offer.site_id !== siteId) {
        return NextResponse.json({ valid: false, error: 'Coupon code not valid for this site' }, { headers: CORS_HEADERS });
      }
      if (offer.redemption_limit !== null && offer.current_uses >= offer.redemption_limit) {
        return NextResponse.json({ valid: false, error: 'Coupon code usage limit reached' }, { headers: CORS_HEADERS });
      }
      if (unitId && offer.applied_listings) {
        try {
          const appliedListings = JSON.parse(offer.applied_listings) as string[];
          if (appliedListings.length > 0 && !appliedListings.includes(unitId)) {
            return NextResponse.json({ valid: false, error: 'Цей пакет недоступний для обраного будиночка' }, { headers: CORS_HEADERS });
          }
        } catch { /* treat as applicable to all */ }
      }
      return NextResponse.json({
        valid: true,
        code: offer.coupon_code,
        discount_type: 'package',
        offer_amount: offer.price,
        description: offer.name,
        bundle: {
          price: offer.price,
          nights_included: offer.nights_included,
          included_services: offer.included_services ? JSON.parse(offer.included_services) : [],
          allowed_days: offer.allowed_days ? JSON.parse(offer.allowed_days) : null,
          applied_listings: offer.applied_listings ? JSON.parse(offer.applied_listings) : [],
          allowed_promo_codes: offer.allowed_promo_codes ? JSON.parse(offer.allowed_promo_codes) : [],
        }
      }, { headers: CORS_HEADERS });
    }

    // Normal Coupon code validation
    const now = new Date().toISOString();
    if (offer.valid_from && now < offer.valid_from) {
      return NextResponse.json({ valid: false, error: 'Coupon code not yet active' }, { headers: CORS_HEADERS });
    }
    if (offer.valid_until && now > offer.valid_until) {
      return NextResponse.json({ valid: false, error: 'Coupon code has expired' }, { headers: CORS_HEADERS });
    }

    if (offer.max_uses !== null && offer.current_uses >= offer.max_uses) {
      return NextResponse.json({ valid: false, error: 'Coupon code usage limit reached' }, { headers: CORS_HEADERS });
    }

    if (offer.site_id && offer.site_id !== siteId) {
      return NextResponse.json({ valid: false, error: 'Coupon code not valid for this site' }, { headers: CORS_HEADERS });
    }

    const appliesTo = offer.applies_to || 'services';

    if (unitId) {
      if (appliesTo === 'services') {
        return NextResponse.json({ valid: false, error: 'Coupon code is only for services' }, { headers: CORS_HEADERS });
      }
      if (offer.applied_listings) {
        try {
          const appliedListings = JSON.parse(offer.applied_listings) as string[];
          if (appliedListings.length > 0 && !appliedListings.includes(unitId)) {
            return NextResponse.json({ valid: false, error: 'Coupon code not valid for this unit' }, { headers: CORS_HEADERS });
          }
        } catch { /* treat as applicable to all */ }
      }
    } else if (serviceId) {
      if (appliesTo === 'listings') {
        return NextResponse.json({ valid: false, error: 'Coupon code is only for listings' }, { headers: CORS_HEADERS });
      }
      if (offer.applicable_services) {
        try {
          const applicable = JSON.parse(offer.applicable_services) as string[];
          if (applicable.length > 0 && !applicable.includes(serviceId)) {
            return NextResponse.json({ valid: false, error: 'Coupon code not valid for this service' }, { headers: CORS_HEADERS });
          }
        } catch { /* treat as applicable to all */ }
      }
    }

    return NextResponse.json({
      valid: true,
      code: offer.code,
      discount_type: offer.discount_type,
      offer_amount: offer.offer_amount,
      description: offer.description,
    }, { headers: CORS_HEADERS });

  } catch (error: any) {
    console.error('GET /api/booking/Coupon error:', error?.message || error);
    return NextResponse.json({ valid: false, error: 'Server error' }, { status: 500, headers: CORS_HEADERS });
  }
}
