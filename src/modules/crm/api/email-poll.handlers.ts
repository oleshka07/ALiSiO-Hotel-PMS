/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { fetchNewEmailsAllAccounts, isBlacklisted, classifyEmail, markEmailAsRead, getAccountById } from '@/lib/channels/email'; // TODO: eventBus
import type { IncomingEmail } from '@/lib/channels/email';
import { parseBookingComEmail, cleanBookingComBody } from '@/lib/channels/booking-com-parser';
import { parseVrboEmail } from '@/lib/channels/vrbo-parser';
import { generateAutoResponse } from '@/lib/ai/auto-response';
import { findOrCreateGuestForLead } from '@/lib/sync/guest-lead-sync';
import { onInboundMessage } from '@/lib/crm/stage-transitions';
import { notifyReservationCreated } from '@bookings';
import crypto from 'crypto';

export async function pollEmails(req: NextRequest) {
  const results = {
    fetched: 0, blacklisted: 0,
    classified_guest: 0, classified_uncertain: 0, classified_not_guest: 0,
    leads_created: 0, leads_linked: 0, messages_added: 0,
    booking_com_parsed: 0,
    errors: [] as string[],
  };

  try {
    const db = getDb();

    const lastPoll = db.prepare(
      "SELECT value FROM settings WHERE key = 'crm_email_last_poll'"
    ).get() as { value: string } | undefined;

    const sinceDate = lastPoll?.value
      ? new Date(lastPoll.value)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const emails = await fetchNewEmailsAllAccounts(sinceDate);
    results.fetched = emails.length;

    for (const email of emails) {
      try {
        await processEmail(email, db, results);
      } catch (err: any) {
        console.error(`[Email Poll] Error processing ${email.from.address}:`, err.message);
        results.errors.push(`${email.from.address}: ${err.message}`);
      }
    }

    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('crm_email_last_poll', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = datetime('now'), updated_at = datetime('now')
    `).run();

    console.log('[Email Poll] Results:', results);
    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[Email Poll] Fatal error:', err);
    return NextResponse.json({ error: err.message, results }, { status: 500 });
  }
}

async function processEmail(email: IncomingEmail, db: any, results: any) {
  const existing = db.prepare("SELECT id FROM crm_messages WHERE external_id = ?").get(email.messageId);
  if (existing) return;

  const alreadyProcessed = db.prepare("SELECT category FROM email_processed WHERE message_id = ?").get(email.messageId);
  if (alreadyProcessed) return;

  const account = getAccountById(email.accountId);

  if (isBlacklisted(email)) {
    results.blacklisted++;
    db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, 'blacklisted')").run(email.messageId);
    return;
  }

  // --- Booking.com domain-level filter (BEFORE parser) ---
  // Skip ALL emails from *@*.booking.com domains entirely.
  // The parser may return EMPTY for some (e.g. QA Glamping property filter),
  // which would bypass the isBookingCom check below and get AI-classified as guest.
  const senderDomain = email.from.address.split('@')[1]?.toLowerCase() || '';
  if (senderDomain.includes('booking.com')) {
    console.log(`[Email:${email.accountId}] Booking.com domain — skipping (${email.from.address}, subj: ${email.subject?.substring(0, 60)})`);
    results.booking_com_parsed++;
    db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, 'booking_skipped')").run(email.messageId);
    return;
  }

  const bookingData = parseBookingComEmail(email.textBody, email.from.address, email.subject);

  let classification;
  if (bookingData.isBookingCom) {
    // --- Booking.com: FULL SKIP ---
    // All Booking.com emails are filtered out completely.
    // We can't reply to them from CRM/Telegram, and they clutter the pipeline.
    // They stay UNREAD in the mailbox for manual handling via Booking.com extranet.
    console.log(`[Email:${email.accountId}] Booking.com email from ${email.from.address} — skipping entirely (subject: ${email.subject?.substring(0, 60)})`);
    results.booking_com_parsed++;
    // Don't mark as read — leave in mailbox. Only record in email_processed to avoid re-processing.
    db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, 'booking_skipped')").run(email.messageId);
    return;
  } else {
    classification = await classifyEmail(email);
  }

  console.log(`[Email:${email.accountId}] ${email.from.address} → ${classification.category} (${classification.confidence}) — ${classification.reason}${bookingData.isBookingCom ? ' [Booking.com]' : ''}`);

  if (classification.category === 'not_guest') {
    results.classified_not_guest++;
    db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, 'not_guest')").run(email.messageId);
    return;
  }

  if (classification.category === 'uncertain') {
    results.classified_uncertain++;
  } else {
    results.classified_guest++;
  }

  const orgRow = db.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string };
  const orgId = orgRow.id;

  const lead = await findOrCreateLeadSmart(db, email, bookingData, classification, orgId, results);

  if (bookingData.isBookingCom && lead.id) {
    enrichLeadWithBookingData(db, lead.id, bookingData);
    
    // Auto-create reservation for any new Booking.com booking (any property type).
    // Until now this fired only for categoryType==='resort', leaving Booking
    // emails for camping/glamping/hostel as leads-only with no reservation row.
    if (bookingData.isBookingCom && bookingData.isNewReservation && !(lead as any).reservation_id && bookingData.checkIn && bookingData.checkOut) {
      autoCreateReservationFromEmail(db, lead.id, bookingData, email.textBody);
    }
  }

  // --- Vrbo / Homeaway (PowerBO) parsing ---
  const vrboData = parseVrboEmail(email.textBody, email.subject);
  if (vrboData.isVrbo && lead.id) {
    // Enrich lead with Vrbo data (parameterized to prevent SQL injection)
    if (vrboData.guestName) {
      const parts = vrboData.guestName.trim().split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';
      db.prepare(`UPDATE crm_leads SET first_name = ?, last_name = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(firstName, lastName, lead.id);
    }
    if (vrboData.guestPhone) {
      db.prepare(`UPDATE crm_leads SET phone = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(vrboData.guestPhone, lead.id);
    }

    // Auto-create reservation for Vrbo (Resort by default)
    if (vrboData.isNewReservation && !(lead as any).reservation_id && vrboData.checkIn && vrboData.checkOut) {
      const mappedData = {
        confirmationId: vrboData.confirmationId,
        checkIn: vrboData.checkIn,
        checkOut: vrboData.checkOut,
        totalGuests: vrboData.totalGuests,
        totalPrice: vrboData.totalPrice,
        currency: vrboData.currency,
        propertyName: vrboData.propertyName,
        source: 'vrbo',
      };
      autoCreateReservationFromEmail(db, lead.id, mappedData, email.textBody);
    }
  }

  let conv = db.prepare(
    "SELECT id FROM crm_conversations WHERE lead_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1"
  ).get(lead.id) as any;

  if (!conv) {
    const convId = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO crm_conversations (id, lead_id, subject, status, last_message_at, last_channel)
      VALUES (?, ?, ?, 'active', datetime('now'), 'email')
    `).run(convId, lead.id, email.subject);
    conv = { id: convId };
  }

  const msgId = crypto.randomBytes(16).toString('hex');
  let content = email.textBody || email.subject || '(empty)';

  if (bookingData.isBookingCom) {
    content = cleanBookingComBody(email.textBody, bookingData);
  }

  const accountLabel = email.accountId === 'gmail' ? '📧G' : '📧';

  db.prepare(`
    INSERT INTO crm_messages (id, conversation_id, channel_type, direction, sender_type, sender_name, content, content_type, external_id, status, created_at, metadata_json)
    VALUES (?, ?, 'email', 'inbound', 'guest', ?, ?, 'text', ?, 'delivered', ?, ?)
  `).run(
    msgId, conv.id,
    bookingData.guestName || email.from.name || email.from.address,
    content.substring(0, 10000),
    email.messageId,
    email.date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
    JSON.stringify({
      subject: email.subject, from: email.from.address, to: email.to,
      accountId: email.accountId, classification: classification.category,
      confidence: classification.confidence, language: classification.language,
      ...(bookingData.isBookingCom ? {
        bookingCom: true, confirmationId: bookingData.confirmationId,
        checkIn: bookingData.checkIn, checkOut: bookingData.checkOut,
        totalGuests: bookingData.totalGuests, propertyName: bookingData.propertyName,
      } : {}),
    }),
  );

  db.prepare(`
    UPDATE crm_conversations
    SET last_message_at = datetime('now'), last_channel = 'email',
        unread_count = unread_count + 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(conv.id);

  const previewPrefix = bookingData.isBookingCom ? '🅱️ ' : `${accountLabel} `;
  db.prepare(`
    UPDATE crm_leads
    SET last_message_at = datetime('now'),
        last_message_preview = ?,
        unread_count = unread_count + 1,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    `${previewPrefix}${bookingData.guestMessage || email.subject}`.substring(0, 100),
    lead.id,
  );

  if (!lead.isNew) {
    onInboundMessage(lead.id, lead.stage);
  }

  if (account) await markEmailAsRead(email.uid, account);
  results.messages_added++;

  try {
    await generateAutoResponse({
      messageId: msgId, conversationId: conv.id, leadId: lead.id,
      accountId: email.accountId,
      guestName: bookingData.guestName || email.from.name || email.from.address,
      guestEmail: email.from.address, subject: email.subject,
      content, language: classification.language || 'en',
    });
  } catch (autoErr: any) {
    console.error(`[AutoResponse] Non-fatal error:`, autoErr.message);
  }

  db.prepare("INSERT OR IGNORE INTO email_processed (message_id, category) VALUES (?, ?)").run(email.messageId, classification.category);
}

async function findOrCreateLeadSmart(
  db: any, email: IncomingEmail, bookingData: any,
  classification: any, orgId: string, results: any
): Promise<{ id: string; stage: string; isNew: boolean }> {
  if (bookingData.confirmationId) {
    const leadByBooking = db.prepare(
      "SELECT id, stage FROM crm_leads WHERE external_booking_id = ? AND organization_id = ? ORDER BY updated_at DESC LIMIT 1"
    ).get(bookingData.confirmationId, orgId) as any;

    if (leadByBooking) {
      console.log(`[Lead Match] Found lead by booking ID ${bookingData.confirmationId}: ${leadByBooking.id}`);
      return { id: leadByBooking.id, stage: leadByBooking.stage, isNew: false };
    }

    const reservation = db.prepare(
      "SELECT id, guest_id, status FROM reservations WHERE external_uid = ? OR bcom_reservation_id = ? LIMIT 1"
    ).get(bookingData.confirmationId, bookingData.confirmationId) as any;

    if (reservation) {
      console.log(`[Lead Match] Found reservation ${reservation.id} by booking ID ${bookingData.confirmationId}`);
      return linkOrCreateLeadForReservation(db, reservation, email, bookingData, classification, orgId, results);
    }
  }

  if (email.from.address) {
    const leadByEmail = db.prepare(
      "SELECT id, stage FROM crm_leads WHERE email = ? AND organization_id = ? ORDER BY updated_at DESC LIMIT 1"
    ).get(email.from.address, orgId) as any;

    if (leadByEmail) {
      if (bookingData.confirmationId && !db.prepare("SELECT external_booking_id FROM crm_leads WHERE id = ?").get(leadByEmail.id)?.external_booking_id) {
        db.prepare("UPDATE crm_leads SET external_booking_id = ?, updated_at = datetime('now') WHERE id = ?")
          .run(bookingData.confirmationId, leadByEmail.id);
      }
      return { id: leadByEmail.id, stage: leadByEmail.stage, isNew: false };
    }
  }

  if (bookingData.isBookingCom && bookingData.guestName && bookingData.checkIn) {
    const nameParts = bookingData.guestName.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    if (firstName && lastName) {
      const leadByName = db.prepare(
        "SELECT id, stage FROM crm_leads WHERE first_name = ? COLLATE NOCASE AND last_name = ? COLLATE NOCASE AND organization_id = ? AND check_in_date = ? LIMIT 1"
      ).get(firstName, lastName, orgId, bookingData.checkIn) as any;

      if (leadByName) {
        console.log(`[Lead Match] Found lead by name+date: ${firstName} ${lastName} @ ${bookingData.checkIn}`);
        return { id: leadByName.id, stage: leadByName.stage, isNew: false };
      }

      const guestReservation = db.prepare(`
        SELECT r.id, r.guest_id, r.status
        FROM reservations r
        JOIN guests g ON g.id = r.guest_id
        WHERE g.first_name = ? COLLATE NOCASE AND g.last_name = ? COLLATE NOCASE AND r.check_in = ?
        LIMIT 1
      `).get(firstName, lastName, bookingData.checkIn) as any;

      if (guestReservation) {
        console.log(`[Lead Match] Found reservation by guest name+date: ${firstName} ${lastName}`);
        return linkOrCreateLeadForReservation(db, guestReservation, email, bookingData, classification, orgId, results);
      }
    }
  }

  const leadId = crypto.randomBytes(16).toString('hex');
  const guestName = bookingData.guestName || classification.guestName || email.from.name || email.from.address.split('@')[0];
  const nameParts = guestName.split(/\s+/);
  const firstName = nameParts[0] || guestName;
  const lastName = nameParts.slice(1).join(' ') || null;

  const channelId = email.accountId === 'gmail' ? 'ch_gmail' : 'ch_email_main';
  const source = bookingData.isBookingCom ? 'booking_com' : 'email';

  db.prepare(`
    INSERT INTO crm_leads (id, organization_id, channel_id, first_name, last_name, email, source, stage, priority, language, external_booking_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
  `).run(
    leadId, orgId, channelId, firstName, lastName,
    email.from.address, source,
    classification.category === 'uncertain' ? 'low' : 'normal',
    classification.language || bookingData.language || null,
    bookingData.confirmationId || null,
  );

  findOrCreateGuestForLead(leadId);

  results.leads_created++;
  console.log(`[Lead] Created new lead: ${firstName} ${lastName || ''} (${source})${bookingData.confirmationId ? ` [Booking #${bookingData.confirmationId}]` : ''}`);

  return { id: leadId, stage: 'new', isNew: true };
}

function linkOrCreateLeadForReservation(
  db: any, reservation: any, email: IncomingEmail,
  bookingData: any, classification: any, orgId: string, results: any
): { id: string; stage: string; isNew: boolean } {
  const existingLead = db.prepare(
    "SELECT id, stage FROM crm_leads WHERE reservation_id = ? LIMIT 1"
  ).get(reservation.id) as any;

  if (existingLead) {
    console.log(`[Lead Link] Using existing lead ${existingLead.id} for reservation ${reservation.id}`);
    return { id: existingLead.id, stage: existingLead.stage, isNew: false };
  }

  const stageMap: Record<string, string> = {
    'confirmed': 'booked', 'checked_in': 'in_stay', 'checked_out': 'post_stay',
    'cancelled': 'lost', 'no_show': 'lost', 'pending': 'inquiry',
  };
  const stage = stageMap[reservation.status] || 'booked';

  const leadId = crypto.randomBytes(16).toString('hex');
  const guestName = bookingData.guestName || classification.guestName || email.from.name;
  const nameParts = (guestName || '').split(/\s+/);
  const firstName = nameParts[0] || email.from.address.split('@')[0];
  const lastName = nameParts.slice(1).join(' ') || null;

  const channelId = email.accountId === 'gmail' ? 'ch_gmail' : 'ch_email_main';
  const source = bookingData.isBookingCom ? 'booking_com' : 'email';

  db.prepare(`
    INSERT INTO crm_leads (id, organization_id, channel_id, first_name, last_name, email, source, stage, priority, language, external_booking_id, reservation_id, guest_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    leadId, orgId, channelId, firstName, lastName,
    email.from.address, source, stage, 'normal',
    classification.language || bookingData.language || null,
    bookingData.confirmationId || null,
    reservation.id, reservation.guest_id || null,
  );

  results.leads_created++;
  results.leads_linked++;
  console.log(`[Lead Link] Created lead ${leadId} linked to reservation ${reservation.id} (stage: ${stage})`);

  return { id: leadId, stage, isNew: true };
}

function enrichLeadWithBookingData(db: any, leadId: string, data: any): void {
  const updates: string[] = [];
  const values: any[] = [];

  if (data.checkIn) { updates.push('check_in_date = COALESCE(check_in_date, ?)'); values.push(data.checkIn); }
  if (data.checkOut) { updates.push('check_out_date = COALESCE(check_out_date, ?)'); values.push(data.checkOut); }
  if (data.totalGuests) { updates.push('adults = CASE WHEN adults = 0 OR adults IS NULL THEN ? ELSE adults END'); values.push(data.totalGuests); }
  if (data.confirmationId) { updates.push('external_booking_id = COALESCE(external_booking_id, ?)'); values.push(data.confirmationId); }
  if (data.categoryType) { updates.push('unit_type_preference = COALESCE(unit_type_preference, ?)'); values.push(data.categoryType); }
  if (data.firstName) { updates.push('first_name = COALESCE(NULLIF(first_name, \'\'), ?)'); values.push(data.firstName); }
  if (data.lastName) { updates.push('last_name = COALESCE(NULLIF(last_name, \'\'), ?)'); values.push(data.lastName); }

  if (updates.length > 0) {
    updates.push("source = CASE WHEN source = 'email' THEN 'booking_com' ELSE source END");
    updates.push("updated_at = datetime('now')");
    values.push(leadId);
    db.prepare(`UPDATE crm_leads SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    console.log(`[Lead Enrich] Updated lead ${leadId} with Booking.com data (${updates.length - 2} fields)`);
  }
}

function autoCreateReservationFromEmail(db: any, leadId: string, data: any, emailText: string): void {
  try {
    const lead = db.prepare("SELECT organization_id, guest_id FROM crm_leads WHERE id = ?").get(leadId) as any;
    if (!lead || !lead.guest_id) return;

    // Idempotency — bail out early if a reservation for this confirmation already exists.
    if (data.confirmationId) {
      const dup = db.prepare(
        "SELECT id FROM reservations WHERE bcom_reservation_id = ? OR external_uid = ? LIMIT 1"
      ).get(data.confirmationId, data.confirmationId) as any;
      if (dup) {
        console.log(`[AutoRes] Reservation already exists for ${data.confirmationId} → ${dup.id}, skipping`);
        return;
      }
    }

    // 1. Property — try by Camping name first; fall back to first property.
    const prop =
      (db.prepare("SELECT id FROM properties WHERE name LIKE '%Camping%' LIMIT 1").get() as any) ||
      (db.prepare("SELECT id FROM properties LIMIT 1").get() as any);
    if (!prop) {
      console.error("[AutoRes] No property in DB");
      return;
    }

    // 2. Decide target category. Booking.com / Vrbo emails for our setup are
    //    almost always resort (Wellness Hostel + Resort F both live under
    //    category type='resort'). categoryType is honoured if the parser
    //    extracted it; otherwise we default to resort and let fallback widen.
    const requestedCategory: string =
      (typeof data.categoryType === 'string' && data.categoryType) || 'resort';

    // 3. Building hint: emails mentioning "wellness hostel" → building D,
    //    otherwise the resort flow defaults to building F.
    const isBuildingD =
      emailText.toLowerCase().includes('wellness hostel') ||
      (data.propertyName || '').toLowerCase().includes('hostel');
    const buildingCode = isBuildingD ? 'D' : 'F';
    const buildingId = isBuildingD ? 'bldg_d' : 'bldg_f';

    // 4. Find a free unit in the preferred building first.
    let unit = db.prepare(`
      SELECT u.id, u.name
      FROM units u
      WHERE u.building_id = ?
        AND u.id NOT IN (
          SELECT unit_id FROM reservations
          WHERE status NOT IN ('cancelled', 'no_show')
            AND NOT (check_out <= ? OR check_in >= ?)
        )
      ORDER BY u.sort_order ASC LIMIT 1
    `).get(buildingId, data.checkIn, data.checkOut) as any;

    // 5. Widen to any free unit in the requested category.
    if (!unit) {
      unit = db.prepare(`
        SELECT u.id, u.name
        FROM units u
        JOIN categories c ON c.id = u.category_id
        WHERE c.type = ?
          AND u.id NOT IN (
            SELECT unit_id FROM reservations
            WHERE status NOT IN ('cancelled', 'no_show')
              AND NOT (check_out <= ? OR check_in >= ?)
          )
        ORDER BY u.sort_order ASC LIMIT 1
      `).get(requestedCategory, data.checkIn, data.checkOut) as any;
    }

    // 6. Final fallback: any free unit in resort. Matches the user's rule
    //    that hostel/resort all live under the resort umbrella for now.
    if (!unit && requestedCategory !== 'resort') {
      unit = db.prepare(`
        SELECT u.id, u.name
        FROM units u
        JOIN categories c ON c.id = u.category_id
        WHERE c.type = 'resort'
          AND u.id NOT IN (
            SELECT unit_id FROM reservations
            WHERE status NOT IN ('cancelled', 'no_show')
              AND NOT (check_out <= ? OR check_in >= ?)
          )
        ORDER BY u.sort_order ASC LIMIT 1
      `).get(data.checkIn, data.checkOut) as any;
    }

    if (!unit) {
      console.warn(`[AutoRes] No free units for ${requestedCategory} on ${data.checkIn} - ${data.checkOut}`);
      return;
    }

    // 4. Calculate nights
    const start = new Date(data.checkIn);
    const end = new Date(data.checkOut);
    const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

    // 7. Create reservation. source mirrors the actual channel (booking_com,
    //    vrbo, airbnb…) so reports and filters work correctly. We still write
    //    bcom_reservation_id alongside external_uid because the legacy dedup
    //    SQL searches both columns.
    const sourceCode = (data.source && String(data.source).toLowerCase().replace(/\./g, '_')) || 'booking_com';
    const resId = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO reservations (
        id, property_id, unit_id, guest_id, check_in, check_out,
        nights, adults, status, source, total_price, currency,
        external_uid, bcom_reservation_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?)
    `).run(
      resId, prop.id, unit.id, lead.guest_id, data.checkIn, data.checkOut,
      nights, data.totalGuests || 1, sourceCode, data.totalPrice || 0, data.currency || 'CZK',
      data.confirmationId, data.confirmationId,
      `Auto-created from ${data.source || 'Booking.com'} email (Building ${buildingCode}${isBuildingD ? ' - Wellness Hostel' : ''}, category ${requestedCategory})`,
    );

    // 6. Link lead to reservation
    db.prepare("UPDATE crm_leads SET reservation_id = ?, stage = 'booked', updated_at = datetime('now') WHERE id = ?")
      .run(resId, leadId);

    notifyReservationCreated(resId, {
      sourceLabel: `${data.source || 'Booking.com'} (email parser)`,
      emoji: '📧',
      extraFooter: `🔖 #${data.confirmationId}`,
    });

    console.log(`[AutoRes] Created reservation ${resId} for lead ${leadId} in unit ${unit.name} (Building ${buildingCode})`);
  } catch (err: any) {
    console.error(`[AutoRes] Error:`, err.message);
  }
}

/* ────────────────────────────────────────────────────────
   Detect Booking.com modification / cancellation / system emails
   These are NOT actionable from CRM (can't reply via Telegram).
   ──────────────────────────────────────────────────────── */
function isBookingComModification(subject: string, body: string): boolean {
  const s = (subject || '').toLowerCase();
  const b = (body || '').substring(0, 500).toLowerCase();

  const patterns = [
    // Modifications
    'зміна бронювання', 'modification', 'змінено', 'modified', 'änderung', 'změna',
    // Cancellations
    'скасування', 'скасовано', 'cancellation', 'cancelled', 'canceled', 'stornierung', 'zrušení',
    // Confirmations (not new — already confirmed)
    'підтвердження бронювання', 'confirmation of booking',
    // Reminders
    'нагадування', 'reminder', 'erinnerung', 'připomínka',
    // Reviews / feedback
    'відгук', 'review', 'bewertung', 'recenze', 'оцінка',
    // Payment / commission
    'комісія', 'commission', 'provision', 'invoice from booking',
    // No-show
    'незаїзд', 'no-show', 'no show',
    // Marketing
    'special offer', 'promotion', 'deal', 'партнерська програма',
    // System
    'rate plan', 'тарифний план', 'availability', 'extranet',
  ];

  return patterns.some(p => s.includes(p) || b.includes(p));
}
