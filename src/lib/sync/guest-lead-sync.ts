/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Guest ↔ Lead Sync Module
 * Ensures data consistency between crm_leads and guests tables.
 * 
 * Key principle: Guest record is the "source of truth" for identity data.
 * Lead record is the CRM wrapper (stage, conversations, AI context).
 * Both stay in sync via these functions.
 */
import { getDb } from '@/lib/db';
import { updateLeadStage } from '@/lib/crm/stage-transitions';

/* ────────────────────────────────────────────────────────
   Find or create a guest from lead data
   Called when a new lead is created (email poll, manual, etc.)
   Returns the guest_id
   ──────────────────────────────────────────────────────── */
export function findOrCreateGuestForLead(leadId: string): string | null {
  const db = getDb();
  
  const lead = db.prepare(`
    SELECT id, organization_id, guest_id, first_name, last_name, 
           email, phone, whatsapp, country, language
    FROM crm_leads WHERE id = ?
  `).get(leadId) as any;
  
  if (!lead) return null;
  
  // Already linked to a guest
  if (lead.guest_id) return lead.guest_id;
  
  // Try to find existing guest by email or phone
  let guest: any = null;
  
  if (lead.email) {
    guest = db.prepare(
      'SELECT id FROM guests WHERE email = ? AND organization_id = ? LIMIT 1'
    ).get(lead.email, lead.organization_id);
  }
  
  if (!guest && lead.phone) {
    guest = db.prepare(
      'SELECT id FROM guests WHERE phone = ? AND organization_id = ? LIMIT 1'
    ).get(lead.phone, lead.organization_id);
  }
  
  if (guest) {
    // Link existing guest
    db.prepare('UPDATE crm_leads SET guest_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(guest.id, leadId);
    
    // Sync lead data to guest (fill gaps)
    syncLeadToGuest(leadId);
    return guest.id;
  }
  
  // Create new guest
  const guestId = `g_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  db.prepare(`
    INSERT INTO guests (id, organization_id, first_name, last_name, email, phone, whatsapp, country, language)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guestId, lead.organization_id,
    lead.first_name, lead.last_name || '',
    lead.email || null, lead.phone || null,
    lead.whatsapp || null, lead.country || null, lead.language || null,
  );
  
  // Link to lead
  db.prepare('UPDATE crm_leads SET guest_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(guestId, leadId);
  
  return guestId;
}

/* ────────────────────────────────────────────────────────
   Sync Lead → Guest (after lead update)
   Only fills empty guest fields, never overwrites existing data
   ──────────────────────────────────────────────────────── */
export function syncLeadToGuest(leadId: string): void {
  const db = getDb();
  
  const lead = db.prepare(`
    SELECT guest_id, first_name, last_name, email, phone, whatsapp, country, language, notes
    FROM crm_leads WHERE id = ?
  `).get(leadId) as any;
  
  if (!lead?.guest_id) return;
  
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(lead.guest_id) as any;
  if (!guest) return;
  
  const updates: string[] = [];
  const values: any[] = [];
  
  // Sync fields — fill gaps (don't overwrite existing)
  const syncFields = [
    { leadField: 'first_name', guestField: 'first_name' },
    { leadField: 'last_name', guestField: 'last_name' },
    { leadField: 'email', guestField: 'email' },
    { leadField: 'phone', guestField: 'phone' },
    { leadField: 'whatsapp', guestField: 'whatsapp' },
    { leadField: 'country', guestField: 'country' },
    { leadField: 'language', guestField: 'language' },
  ];
  
  for (const { leadField, guestField } of syncFields) {
    if (lead[leadField] && !guest[guestField]) {
      updates.push(`${guestField} = ?`);
      values.push(lead[leadField]);
    }
  }
  
  // Always update name if lead has newer data
  if (lead.first_name && lead.first_name !== guest.first_name) {
    updates.push('first_name = ?');
    values.push(lead.first_name);
  }
  if (lead.last_name && lead.last_name !== guest.last_name) {
    updates.push('last_name = ?');
    values.push(lead.last_name);
  }
  
  if (updates.length > 0) {
    updates.push('updated_at = datetime(\'now\')');
    values.push(lead.guest_id);
    db.prepare(`UPDATE guests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
}

/* ────────────────────────────────────────────────────────
   Sync Guest → Lead (after guest update)
   Updates lead contact data from guest
   ──────────────────────────────────────────────────────── */
export function syncGuestToLead(guestId: string): void {
  const db = getDb();
  
  const guest = db.prepare(
    'SELECT first_name, last_name, email, phone, whatsapp, country, language FROM guests WHERE id = ?'
  ).get(guestId) as any;
  
  if (!guest) return;
  
  // Find all leads linked to this guest
  const leads = db.prepare(
    'SELECT id FROM crm_leads WHERE guest_id = ?'
  ).all(guestId) as any[];
  
  for (const lead of leads) {
    db.prepare(`
      UPDATE crm_leads SET 
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        whatsapp = COALESCE(?, whatsapp),
        country = COALESCE(?, country),
        language = COALESCE(?, language),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      guest.first_name, guest.last_name,
      guest.email, guest.phone, guest.whatsapp,
      guest.country, guest.language,
      lead.id,
    );
  }
}

/* ────────────────────────────────────────────────────────
   Sync Reservation Status → Lead Stage
   Called by cron every 5 minutes
   ──────────────────────────────────────────────────────── */
export function syncReservationStages(): { updated: number } {
  const db = getDb();
  let updated = 0;
  
  // Map: reservation.status → lead.stage
  const statusToStage: Record<string, string> = {
    'checked_in': 'in_stay',
    'checked_out': 'post_stay',
    'cancelled': 'lost',
    'no_show': 'lost',
  };
  
  // Find leads with linked reservations where status changed
  const leads = db.prepare(`
    SELECT l.id as lead_id, l.stage as current_stage, 
           r.id as res_id, r.status as res_status, r.check_in
    FROM crm_leads l
    JOIN reservations r ON r.id = l.reservation_id
    WHERE l.stage NOT IN ('lost', 'spam', 'post_stay')
  `).all() as any[];
  
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  
  for (const lead of leads) {
    let newStage: string | null = null;
    
    // Check reservation status mapping
    if (statusToStage[lead.res_status] && lead.current_stage !== statusToStage[lead.res_status]) {
      newStage = statusToStage[lead.res_status];
    }
    
    // Pre-stay: 3 days before check-in
    if (!newStage && lead.res_status === 'confirmed' && lead.check_in) {
      const checkInDate = new Date(lead.check_in);
      if (checkInDate <= threeDaysFromNow && checkInDate > now && lead.current_stage === 'booked') {
        newStage = 'pre_stay';
      }
    }
    
    // Check-in day
    if (!newStage && lead.res_status === 'confirmed' && lead.check_in) {
      const checkInDate = new Date(lead.check_in);
      const isToday = checkInDate.toISOString().split('T')[0] === now.toISOString().split('T')[0];
      if (isToday && ['booked', 'pre_stay'].includes(lead.current_stage)) {
        newStage = 'check_in';
      }
    }
    
    if (newStage) {
      const transitioned = updateLeadStage(
        lead.lead_id,
        lead.current_stage,
        newStage,
        'auto_sync',
        `Reservation status sync: ${lead.res_status}`,
      );
      if (transitioned) updated++;
    }
  }
  
  return { updated };
}

/* ────────────────────────────────────────────────────────
   Migrate existing leads — create guest records for 
   leads that don't have guest_id
   ──────────────────────────────────────────────────────── */
export function migrateLeadsWithoutGuests(): number {
  const db = getDb();
  
  const orphanLeads = db.prepare(
    "SELECT id FROM crm_leads WHERE guest_id IS NULL"
  ).all() as any[];
  
  let migrated = 0;
  for (const lead of orphanLeads) {
    const guestId = findOrCreateGuestForLead(lead.id);
    if (guestId) migrated++;
  }
  
  return migrated;
}
