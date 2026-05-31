/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CRM Stage Transitions — Central module for automatic lead stage changes
 * 
 * All stage transitions should go through this module to ensure:
 * 1. Transition validity (no downgrades except to lost/spam)
 * 2. Stage history recording
 * 3. Telegram notifications for key transitions
 * 
 * See TELEGRAM_BOT_BRIDGE.md for Telegram integration details.
 */
import { getDb } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/channels/telegram-bot';
import { maskLastName, maskEmail } from '@core/security/pii-mask';

/* ────────────────────────────────────────────────────────
   Stage ordering — higher index = further in pipeline
   ──────────────────────────────────────────────────────── */
const STAGE_ORDER: Record<string, number> = {
  'new': 0,
  'inquiry': 1,
  'info_needed': 2,
  'quote_sent': 3,
  'negotiation': 4,
  'deposit_paid': 5,
  'booked': 6,
  'pre_stay': 7,
  'check_in': 8,
  'in_stay': 9,
  'check_out': 10,
  'post_stay': 11,
  // These can be set from any stage:
  'lost': -1,
  'spam': -2,
};

/* ────────────────────────────────────────────────────────
   Check if transition is allowed
   ──────────────────────────────────────────────────────── */
export function canTransition(fromStage: string, toStage: string): boolean {
  // Same stage — no-op
  if (fromStage === toStage) return false;

  // Can always go to lost/spam from any stage
  if (toStage === 'lost' || toStage === 'spam') return true;

  // Can't go backwards (except to lost/spam)
  const fromOrder = STAGE_ORDER[fromStage] ?? -99;
  const toOrder = STAGE_ORDER[toStage] ?? -99;

  // If already lost/spam, only manual can move forwards
  if (fromStage === 'lost' || fromStage === 'spam') return true;

  return toOrder > fromOrder;
}

/* ────────────────────────────────────────────────────────
   Update lead stage with history and notifications
   ──────────────────────────────────────────────────────── */
export function updateLeadStage(
  leadId: string,
  fromStage: string,
  toStage: string,
  trigger: 'auto' | 'manual' | 'auto_sync' | 'payment' | 'email_reply',
  notes: string,
): boolean {
  if (!canTransition(fromStage, toStage)) {
    console.log(`[Stage] Skip transition ${fromStage} → ${toStage} for ${leadId} (not allowed)`);
    return false;
  }

  const db = getDb();

  // Update lead stage
  db.prepare(`
    UPDATE crm_leads SET stage = ?, updated_at = datetime('now') WHERE id = ?
  `).run(toStage, leadId);

  // Record in stage history
  const histId = `sh_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  db.prepare(`
    INSERT INTO crm_stage_history (id, lead_id, from_stage, to_stage, trigger, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(histId, leadId, fromStage, toStage, trigger, notes);

  console.log(`[Stage] ✅ ${fromStage} → ${toStage} | lead=${leadId} | trigger=${trigger} | ${notes}`);

  // Telegram notifications for key transitions
  notifyStageChange(db, leadId, fromStage, toStage, notes);

  return true;
}

/* ────────────────────────────────────────────────────────
   Determine next stage based on event
   ──────────────────────────────────────────────────────── */
type StageEvent = 
  | 'guest_message'      // Guest sent a message
  | 'staff_reply'        // We replied to guest
  | 'quote_sent'         // Price/quote included in reply
  | 'payment_link_sent'  // Payment link sent to guest
  | 'deposit_received'   // Partial payment received
  | 'full_payment'       // Full payment / booking confirmed
  | 'reservation_created'; // Reservation created in system

export function getNextStage(currentStage: string, event: StageEvent): string | null {
  const transitions: Record<string, Partial<Record<StageEvent, string>>> = {
    'new': {
      'guest_message': 'inquiry',
      'staff_reply': 'info_needed',
    },
    'inquiry': {
      'staff_reply': 'info_needed',
      'quote_sent': 'quote_sent',
    },
    'info_needed': {
      'quote_sent': 'quote_sent',
      'payment_link_sent': 'negotiation',
    },
    'quote_sent': {
      'payment_link_sent': 'negotiation',
      'deposit_received': 'deposit_paid',
      'full_payment': 'booked',
      'reservation_created': 'booked',
    },
    'negotiation': {
      'deposit_received': 'deposit_paid',
      'full_payment': 'booked',
      'reservation_created': 'booked',
    },
    'deposit_paid': {
      'full_payment': 'booked',
      'reservation_created': 'booked',
    },
  };

  return transitions[currentStage]?.[event] || null;
}

/* ────────────────────────────────────────────────────────
   Detect if content contains a price quote
   ──────────────────────────────────────────────────────── */
export function contentContainsQuote(content: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();

  // Price patterns: numbers with currency
  const pricePatterns = [
    /\d+\s*(kč|czk|eur|€|usd|\$)/i,
    /\d+\s*,-/,           // Czech price format: 3500,-
    /cena|price|cost|rate|tarif|ціна|вартість|стоимость/i,
    /за ніч|per night|pro noc|за ночь/i,
    /total|celkem|разом|итого|gesamt/i,
    /deposit|záloha|завдаток|аванс/i,
  ];

  return pricePatterns.some(p => p.test(lower));
}

/* ────────────────────────────────────────────────────────
   Detect if content contains a payment link
   ──────────────────────────────────────────────────────── */
export function contentContainsPaymentLink(content: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();

  return /payment|platba|оплат|bank\s*account|банк|iban|číslo\s*účtu|реквізит/i.test(lower) ||
    /https?:\/\/.*pay/i.test(content);
}

/* ────────────────────────────────────────────────────────
   Auto-transition on new inbound message
   Called from email poll when existing lead gets a message
   ──────────────────────────────────────────────────────── */
export function onInboundMessage(leadId: string, currentStage: string): void {
  const nextStage = getNextStage(currentStage, 'guest_message');
  if (nextStage) {
    updateLeadStage(leadId, currentStage, nextStage, 'auto', 'Guest sent message');
  }
}

/* ────────────────────────────────────────────────────────
   Auto-transition on outbound reply (staff)
   Called after AI draft is approved and sent
   ──────────────────────────────────────────────────────── */
export function onOutboundReply(leadId: string, currentStage: string, content: string): void {
  // Check if reply contains a price quote
  if (contentContainsQuote(content)) {
    const nextStage = getNextStage(currentStage, 'quote_sent');
    if (nextStage) {
      updateLeadStage(leadId, currentStage, nextStage, 'email_reply', 'Quote/price sent to guest');
      return;
    }
  }

  // Check if reply contains payment info
  if (contentContainsPaymentLink(content)) {
    const nextStage = getNextStage(currentStage, 'payment_link_sent');
    if (nextStage) {
      updateLeadStage(leadId, currentStage, nextStage, 'email_reply', 'Payment details sent to guest');
      return;
    }
  }

  // Generic staff reply
  const nextStage = getNextStage(currentStage, 'staff_reply');
  if (nextStage) {
    updateLeadStage(leadId, currentStage, nextStage, 'email_reply', 'Staff replied to guest');
  }
}

/* ────────────────────────────────────────────────────────
   Auto-transition on payment received (Teya webhook)
   ──────────────────────────────────────────────────────── */
export function onPaymentReceived(leadId: string, currentStage: string, isFullPayment: boolean): void {
  const event = isFullPayment ? 'full_payment' : 'deposit_received';
  const nextStage = getNextStage(currentStage, event);
  if (nextStage) {
    updateLeadStage(
      leadId, currentStage, nextStage, 'payment',
      isFullPayment ? 'Full payment received' : 'Deposit payment received',
    );
  }
}

/* ────────────────────────────────────────────────────────
   Telegram notification for important transitions
   ──────────────────────────────────────────────────────── */
function notifyStageChange(db: any, leadId: string, fromStage: string, toStage: string, notes: string): void {
  // Only notify for key stages
  const notifyStages = ['deposit_paid', 'booked'];
  if (!notifyStages.includes(toStage)) return;

  const lead = db.prepare(`
    SELECT first_name, last_name, email, check_in_date, check_out_date, estimated_value, currency
    FROM crm_leads WHERE id = ?
  `).get(leadId) as any;

  if (!lead) return;

  const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const stageLabels: Record<string, string> = {
    'deposit_paid': '💳 Передплата отримана',
    'booked': '✅ Заброньовано',
  };

  const text = [
    `${stageLabels[toStage] || toStage}`,
    ``,
    `👤 <b>${esc(lead.first_name)} ${esc(maskLastName(lead.last_name))}</b>`,
    lead.email ? `📧 ${esc(maskEmail(lead.email))}` : '',
    lead.check_in_date ? `📅 ${lead.check_in_date} — ${lead.check_out_date || '?'}` : '',
    lead.estimated_value ? `💰 ${lead.estimated_value} ${lead.currency || 'CZK'}` : '',
    ``,
    `📋 ${notes}`,
  ].filter(Boolean).join('\n');

  sendTelegramMessage(text).catch(() => {});
}
