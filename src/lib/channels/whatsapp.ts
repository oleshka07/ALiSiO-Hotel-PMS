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

/**
 * Send a pre-approved WhatsApp Template Message.
 * Templates work outside the 24h messaging window.
 * 
 * @param opts.to - Phone number (international, no +/spaces)
 * @param opts.templateName - Template name as registered in Meta (e.g. 'welcome_inquiry_cs')
 * @param opts.languageCode - Language code (cs, en, de)
 * @param opts.parameters - Array of parameter values for {{1}}, {{2}}, etc.
 */
export async function sendWhatsAppTemplate(opts: {
  to: string;
  templateName: string;
  languageCode: string;
  parameters?: string[];
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.warn('[WhatsApp Template] Not configured');
    return { success: false, error: 'WhatsApp not configured' };
  }

  // Map short codes to Meta language codes
  const langMap: Record<string, string> = {
    cs: 'cs', en: 'en_US', de: 'de', uk: 'uk',
  };

  const components: any[] = [];
  if (opts.parameters && opts.parameters.length > 0) {
    components.push({
      type: 'body',
      parameters: opts.parameters.map(val => ({
        type: 'text',
        text: val,
      })),
    });
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
        type: 'template',
        template: {
          name: opts.templateName,
          language: { code: langMap[opts.languageCode] || opts.languageCode },
          components,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.error?.message || `HTTP ${res.status}`;
      console.error('[WhatsApp Template] API error:', errMsg, data);
      return { success: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    console.log('[WhatsApp Template] Sent', opts.templateName, 'to', opts.to, '→', messageId);
    return { success: true, messageId };
  } catch (err: any) {
    console.error('[WhatsApp Template] Error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Detect language from guest name or message for template selection.
 * Returns 'cs' | 'de' | 'en'
 */
export function detectTemplateLanguage(text: string): string {
  const lower = (text || '').toLowerCase();
  // German indicators
  if (/\b(ich|wir|möchte|anfrage|buchung|verfügbar|platz|preis|guten|danke|bitte)\b/.test(lower)) return 'de';
  // Czech indicators
  if (/\b(dobrý|prosím|chtěl|dotaz|rezervace|volný|místo|cena|děkuji|stan|karavan)\b/.test(lower)) return 'cs';
  // Default to English
  return 'en';
}
