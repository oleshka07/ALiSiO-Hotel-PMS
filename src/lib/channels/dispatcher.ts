/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Channel Dispatcher
 * Routes outbound messages through the appropriate channel (email, whatsapp, etc.)
 */
import { sendEmail } from '@/lib/channels/email';
import { sendWhatsAppMessage } from '@/lib/channels/whatsapp';
import { getDb } from '@/lib/db';

export interface DispatchResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

/**
 * Dispatch a message through the specified channel.
 */
export async function dispatchMessage(opts: {
  channelType: string;
  leadId: string;
  conversationId: string;
  content: string;
  senderName?: string;
}): Promise<DispatchResult> {
  const { channelType, leadId, content, senderName } = opts;
  const db = getDb();

  switch (channelType) {
    case 'email':
      return await dispatchEmail(db, leadId, opts.conversationId, content, senderName);
    case 'whatsapp':
      return await dispatchWhatsApp(db, leadId, content);
    case 'manual':
      return { success: true };
    case 'phone':
      return { success: true };
    default:
      return { success: true };
  }
}

/**
 * Dispatch via email (SMTP) — auto-routes to the correct account
 */
async function dispatchEmail(
  db: any,
  leadId: string,
  conversationId: string,
  content: string,
  senderName?: string,
): Promise<DispatchResult> {
  const lead = db.prepare(
    "SELECT email, first_name, last_name FROM crm_leads WHERE id = ?"
  ).get(leadId) as any;

  if (!lead?.email) {
    return { success: false, error: 'Lead has no email address' };
  }

  // Find the last inbound email to extract subject, reply headers, and accountId
  const lastInbound = db.prepare(`
    SELECT metadata_json, external_id FROM crm_messages 
    WHERE conversation_id = ? AND direction = 'inbound' AND channel_type = 'email'
    ORDER BY created_at DESC LIMIT 1
  `).get(conversationId) as any;

  let subject = 'Carlsbad Wellness & Camping Resort';
  let inReplyTo: string | undefined;
  let references: string | undefined;
  let accountId: string | undefined = 'gmail'; // Default: kempcarlsbad@gmail.com

  if (lastInbound?.metadata_json) {
    try {
      const meta = JSON.parse(lastInbound.metadata_json);
      if (meta.subject) {
        subject = meta.subject.startsWith('Re:') ? meta.subject : `Re: ${meta.subject}`;
      }
      // Route reply through the same account that received the message
      if (meta.accountId) {
        accountId = meta.accountId;
      }
    } catch { /* */ }
  }
  if (lastInbound?.external_id) {
    inReplyTo = lastInbound.external_id;
    references = lastInbound.external_id;
  }

  // Determine brand based on account
  const isGlamping = accountId === 'emailcz';
  const brandName = isGlamping ? 'QA Glamping' : 'Carlsbad Wellness & Camping Resort';
  const brandUrl = isGlamping ? 'https://qa-glamping.eu/' : 'https://kemp-carlsbad.cz/';
  const brandPhone = '+420 723 565 616';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
      ${content.replace(/\n/g, '<br>')}
      <br><br>
      <div style="color: #888; font-size: 12px; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px;">
        ${senderName || brandName}<br>
        <a href="${brandUrl}" style="color: #6366f1;">${brandUrl.replace('https://', '')}</a><br>
        ${brandPhone}
      </div>
    </div>
  `;

  const result = await sendEmail({
    to: lead.email,
    subject,
    text: content,
    html: htmlBody,
    inReplyTo,
    references,
    accountId,  // Routes to the correct SMTP account
  });

  if (result.success) {
    return { success: true, externalId: result.messageId };
  }
  return { success: false, error: 'SMTP send failed' };
}

/**
 * Dispatch via WhatsApp Cloud API
 */
async function dispatchWhatsApp(
  db: any,
  leadId: string,
  content: string,
): Promise<DispatchResult> {
  const lead = db.prepare(
    "SELECT whatsapp, phone, first_name FROM crm_leads WHERE id = ?"
  ).get(leadId) as any;

  const phoneNumber = lead?.whatsapp || lead?.phone;
  if (!phoneNumber) {
    return { success: false, error: 'Lead has no WhatsApp or phone number' };
  }

  // Normalize: remove spaces, dashes, and leading +
  const normalized = phoneNumber.replace(/[\s\-\+\(\)]/g, '');

  const result = await sendWhatsAppMessage({
    to: normalized,
    content,
  });

  if (result.success) {
    return { success: true, externalId: result.messageId };
  }
  return { success: false, error: result.error || 'WhatsApp send failed' };
}
