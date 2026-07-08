/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDb } from '@core/db';
import type { TeyaCredentials } from '../domain/types';
import { resolveSiteCredentials } from './site-credentials.repo';

/**
 * Resolve per-site Teya credentials for a given reservation.
 *
 * Looks up the reservation's `source` field:
 *   - Format `widget:<siteId>` → looks up booking_sites.payment_config
 *   - Other formats → returns undefined (caller falls back to ENV globals)
 *
 * This is used by guest-page payment handlers (pay-booking, pay services)
 * so that payments from guests booked through a specific site go to that
 * site's Teya store — matching the store used during initial checkout.
 */
export function resolveCredentialsForReservation(reservationId: string): TeyaCredentials | undefined {
  try {
    const db = getDb();
    const row = db.prepare('SELECT source FROM reservations WHERE id = ?').get(reservationId) as any;
    if (!row?.source) return undefined;

    // Extract site_id from "widget:<siteId>" format
    const match = row.source.match(/^widget:(.+)$/);
    if (!match) return undefined;

    const siteId = match[1];
    const resolved = resolveSiteCredentials({ id: siteId });
    return resolved?.credentials ?? undefined;
  } catch (e: any) {
    console.error('[payments] resolveCredentialsForReservation error:', e.message);
    return undefined;
  }
}
