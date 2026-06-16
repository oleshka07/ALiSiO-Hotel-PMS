/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WhatsApp Cloud API — Send Messages
 *
 * Uses the Meta Graph API v22.0 to send text messages via WhatsApp Business.
 * Called by the channel dispatcher for outbound WhatsApp messages.
 */

const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';

const API_BASE = `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

export async function sendWhatsAppMessage(opts: {
  to: string;       // phone number in international format (no +, no spaces)
  content: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.warn('[WhatsApp Send] Not configured — missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: opts.to,
        type: 'text',
        text: {
          preview_url: false,
          body: opts.content,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      console.error('[WhatsApp Send] API error:', errMsg, data);
      return { success: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    console.log('[WhatsApp Send] Message sent to', opts.to, '→', messageId);
    return { success: true, messageId };
  } catch (err: any) {
    console.error('[WhatsApp Send] Error:', err.message);
    return { success: false, error: err.message };
  }
}
