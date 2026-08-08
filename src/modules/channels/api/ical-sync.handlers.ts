/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateGuestToken } from '@core/db';
import { parseICal, extractGuestName } from '@/lib/ical'; // TODO: move to @core/ical
import { notifyReservationCreated } from '@bookings';
import { publicMessage } from '@core/security/public-error';

export async function syncIcal(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json().catch(() => ({}));
    const { channel_id } = body as { channel_id?: string };

    let channels: any[];
    if (channel_id) {
      const ch = db.prepare('SELECT * FROM ical_channels WHERE id = ? AND is_active = 1').get(channel_id) as any;
      if (!ch) return NextResponse.json({ error: 'Channel not found or inactive' }, { status: 404 });
      channels = [ch];
    } else {
      channels = db.prepare('SELECT * FROM ical_channels WHERE is_active = 1 AND ical_url IS NOT NULL').all() as any[];
    }

    const results: any[] = [];
    for (const channel of channels) {
      const result = await syncChannel(db, channel);
      results.push(result);
    }

    return NextResponse.json({ synced: results.length, results });
  } catch (e: any) {
    console.error('[iCal Sync] Error:', e);
    return NextResponse.json({ error: publicMessage(e) }, { status: 500 });
  }
}

async function syncChannel(db: any, channel: any) {
  const logId = `isl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  try {
    if (!channel.ical_url) throw new Error('No iCal URL configured');

    const response = await fetch(channel.ical_url, {
      headers: { 'User-Agent': 'ALiSiO-PMS/1.0 iCal-Sync' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const icalText = await response.text();
    const events = parseICal(icalText);

    let eventsCreated = 0;
    let eventsUpdated = 0;

    const unitIds = getChannelUnitIds(db, channel);
    if (unitIds.length === 0) throw new Error('No units found for this channel');

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;

    for (const event of events) {
      const externalUid = `ical_${channel.id}_${event.uid}`;
      const existing = db.prepare(
        'SELECT id, check_in, check_out FROM reservations WHERE external_uid = ?'
      ).get(externalUid) as any;

      if (existing) {
        const nights = Math.max(1, Math.round(
          (new Date(event.dtend).getTime() - new Date(event.dtstart).getTime()) / 86400000
        ));
        if (existing.check_in !== event.dtstart || existing.check_out !== event.dtend) {
          db.prepare(`
            UPDATE reservations SET check_in = ?, check_out = ?, nights = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(event.dtstart, event.dtend, nights, existing.id);
          eventsUpdated++;
        }
      } else {
        const guestName = extractGuestName(event.summary);
        const firstName = guestName || 'OTA';
        const lastName = guestName ? channel.source_code.toUpperCase() : 'Blocked';

        const guestId = `g_ical_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        db.prepare('INSERT INTO guests (id, organization_id, first_name, last_name) VALUES (?, ?, ?, ?)')
          .run(guestId, org.id, firstName, lastName);

        const nights = Math.max(1, Math.round(
          (new Date(event.dtend).getTime() - new Date(event.dtstart).getTime()) / 86400000
        ));

        const targetUnitId = channel.channel_type === 'unit'
          ? channel.unit_id
          : findAvailableUnit(db, unitIds, event.dtstart, event.dtend);

        const resId = `r_ical_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const guestPageToken = generateGuestToken();
        const unit = db.prepare('SELECT property_id FROM units WHERE id = ?').get(targetUnitId) as any;

        db.prepare(`
          INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights,
            adults, children, status, payment_status, source, total_price, commission_amount,
            guest_page_token, external_uid, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          resId, unit?.property_id || channel.property_id, targetUnitId, guestId,
          event.dtstart, event.dtend, nights,
          1, 0, 'confirmed', 'paid', channel.source_code, 0, 0,
          guestPageToken, externalUid,
          `iCal import: ${event.summary}`,
        );

        // Skip TG for "Blocked" iCal entries (no guest name) — those are owner closures, not real bookings
        if (guestName) {
          notifyReservationCreated(resId, {
            sourceLabel: `iCal · ${channel.source_code || 'channel'}`,
            emoji: '📆',
          });
        }

        eventsCreated++;
      }
    }

    db.prepare("UPDATE ical_channels SET last_synced_at = datetime('now') WHERE id = ?").run(channel.id);
    db.prepare(`
      INSERT INTO ical_sync_log (id, channel_id, status, events_found, events_created, events_updated)
      VALUES (?, ?, 'success', ?, ?, ?)
    `).run(logId, channel.id, events.length, eventsCreated, eventsUpdated);

    return { channel_id: channel.id, status: 'success', events_found: events.length, events_created: eventsCreated, events_updated: eventsUpdated };
  } catch (e: any) {
    db.prepare(`INSERT INTO ical_sync_log (id, channel_id, status, error_message) VALUES (?, ?, 'error', ?)`)
      .run(logId, channel.id, e.message);
    return { channel_id: channel.id, status: 'error', error: publicMessage(e) };
  }
}

function getChannelUnitIds(db: any, channel: any): string[] {
  if (channel.channel_type === 'unit') return [channel.unit_id];
  const units = db.prepare('SELECT id FROM units WHERE building_id = ?').all(channel.building_id) as any[];
  return units.map((u: any) => u.id);
}

function findAvailableUnit(db: any, unitIds: string[], checkIn: string, checkOut: string): string {
  for (const uid of unitIds) {
    const overlap = db.prepare(`
      SELECT id FROM reservations
      WHERE unit_id = ? AND status NOT IN ('cancelled', 'no_show')
        AND check_in < ? AND check_out > ?
    `).get(uid, checkOut, checkIn);
    if (!overlap) return uid;
  }
  return unitIds[0];
}
