/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import * as portalRepo from '../data/guest-portal.repo';
// TODO: replace with @shared/translate when shared module exists
import { extractTexts, extractServiceTexts, getStoredTranslations } from '@/lib/translate';
import { translateContent, CONTENT_LANGS } from '@/lib/content-translations';
import { sendAbandonNotifications } from './cart.handlers';

export async function getGuestPortal(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;

    const reservation = portalRepo.getReservationByToken(token);
    if (!reservation) {
      // Tell apart "no such token" from "token exists but refs are broken"
      // so the client can show a useful message and we can find the row in
      // /finance / room-allocation manually.
      const stub = portalRepo.getReservationStubByToken(token);
      if (stub) {
        console.warn(`[GuestPortal] Token resolves to reservation ${stub.id} but full JOIN failed`);
        return NextResponse.json(
          { error: 'Booking data incomplete', code: 'JOIN_FAILED', reservation_id: stub.id },
          { status: 502 },
        );
      }
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const now = new Date();
    const checkOut = new Date(reservation.check_out + 'T00:00:00');
    const expiryDate = reservation.guest_page_expires_at
      ? new Date(reservation.guest_page_expires_at)
      : new Date(checkOut.getTime() + 2 * 24 * 60 * 60 * 1000);
    const isExpired = now > expiryDate;

    if (isExpired) {
      const unitTypes = portalRepo.getUnitTypesForRebooking();
      return NextResponse.json({
        expired: true,
        guestName: reservation.first_name,
        brandName: reservation.category_type === 'glamping' ? 'QA Glamping' : 'Kemp Carlsbad',
        propertyName: reservation.property_name,
        propertyEmail: reservation.property_email,
        propertyPhone: reservation.property_phone,
        unitTypes,
        stayDates: { checkIn: reservation.check_in, checkOut: reservation.check_out },
      });
    }

    const checkIn = new Date(reservation.check_in + 'T00:00:00');
    const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
    let phase: 'pre_arrival' | 'checked_in' | 'post_checkout' = 'pre_arrival';
    if (today >= checkIn && today <= checkOut) phase = 'checked_in';
    else if (today > checkOut) phase = 'post_checkout';

    const registeredGuests = portalRepo.getRegisteredGuests(reservation.id);
    const payments = portalRepo.getPaymentsSummary(reservation.id);
    const unitTypePhotos = portalRepo.getUnitTypePhotos(reservation.unit_type_id);
    const propertyPhotos = portalRepo.getPropertyPhotos(reservation.property_id);
    const services = portalRepo.getAvailableServices(reservation.property_id, reservation.category_type);
    const orderedServices = portalRepo.getOrderedServices(reservation.id);
    const guestPageConfig = portalRepo.getGuestPageConfig(reservation.unit_type_id, reservation.property_id, reservation.unit_id);

    const propertyName = reservation.property_name || 'Kemp Carlsbad';

    // ── Variant B: send abandon notifications if >30min pending ──────────
    // Fire-and-forget — does not block the page response
    sendAbandonNotifications(token, propertyName).catch(() => {});

    return NextResponse.json({
      expired: false,
      phase,
      reservation,
      registeredGuests,
      payments: {
        totalPaid: payments?.total_paid || 0,
        totalRefunded: payments?.total_refunded || 0,
        remaining: reservation.total_price - (payments?.total_paid || 0) + (payments?.total_refunded || 0),
      },
      photos: { unitType: unitTypePhotos, property: propertyPhotos },
      services,
      orderedServices,
      guestPageConfig,
      translations: (() => {
        try {
          const cfgTexts = extractTexts(guestPageConfig || {});
          const svcTexts = extractServiceTexts(services as any[]);
          const allTexts = [...new Set([...cfgTexts, ...svcTexts])];
          const result = getStoredTranslations(allTexts);
          // Fill any gaps with the static dictionary so the client never falls back to Ukrainian
          // for known standard content, even when OpenAI translations aren't in the DB yet.
          for (const text of allTexts) {
            if (!result[text]) result[text] = {};
            for (const lang of CONTENT_LANGS) {
              if (!result[text][lang]) {
                const staticT = translateContent(text, lang);
                if (staticT !== text) result[text][lang] = staticT;
              }
            }
          }
          return result;
        } catch { return {}; }
      })(),
    });
  } catch (error: any) {
    console.error('GET /api/guest/[token] error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch booking data' }, { status: 500 });
  }
}
