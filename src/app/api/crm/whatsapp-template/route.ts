/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { sendWhatsAppTemplate } from '@/lib/channels/whatsapp';
import crypto from 'crypto';

/**
 * POST /api/crm/whatsapp-template
 * Send a pre-approved WhatsApp template to a lead.
 *
 * Body: { leadId, conversationId, templateName, languageCode, parameters?: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, conversationId, templateName, languageCode, parameters } = body;

    if (!leadId || !templateName || !languageCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb();

    // Get lead's WhatsApp number
    const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(leadId) as any;
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const phone = lead.whatsapp || lead.phone;
    if (!phone) {
      return NextResponse.json({ error: 'Lead has no WhatsApp/phone number' }, { status: 400 });
    }

    // Clean phone: remove +, spaces, dashes
    const cleanPhone = phone.replace(/[+\s\-()]/g, '');

    // Send template via WhatsApp API
    const result = await sendWhatsAppTemplate({
      to: cleanPhone,
      templateName,
      languageCode,
      parameters: parameters || [],
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Save as outbound message in CRM
    let convId = conversationId;
    if (!convId) {
      // Find or create conversation
      const existing = db.prepare(
        'SELECT id FROM crm_conversations WHERE lead_id = ? LIMIT 1'
      ).get(leadId) as any;

      if (existing) {
        convId = existing.id;
      } else {
        convId = crypto.randomBytes(8).toString('hex');
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.prepare(`
          INSERT INTO crm_conversations (id, lead_id, channel_type, status, created_at, updated_at, last_message_at)
          VALUES (?, ?, 'whatsapp', 'active', ?, ?, ?)
        `).run(convId, leadId, now, now, now);
      }
    }

    // Build readable template text for CRM message
    let templateText = `[WhatsApp шаблон: ${templateName}]`;
    if (parameters && parameters.length > 0) {
      templateText += `\nПараметри: ${parameters.join(', ')}`;
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const msgId = crypto.randomBytes(8).toString('hex');

    db.prepare(`
      INSERT INTO crm_messages (
        id, conversation_id, channel_type, direction, sender_type,
        sender_name, content, content_type, external_id, status, is_ai_generated,
        metadata_json, created_at
      ) VALUES (?, ?, 'whatsapp', 'outbound', 'staff', 'WhatsApp Template',
        ?, 'text', ?, 'sent', 0, ?, ?)
    `).run(
      msgId, convId, templateText,
      result.messageId || null,
      JSON.stringify({ templateName, languageCode, parameters }),
      now
    );

    // Update conversation
    db.prepare(`
      UPDATE crm_conversations SET last_message_at = ?, last_channel = 'whatsapp', updated_at = ? WHERE id = ?
    `).run(now, now, convId);

    // Update lead
    db.prepare(`
      UPDATE crm_leads SET last_message_at = ?, last_message_preview = ?, updated_at = ? WHERE id = ?
    `).run(now, templateText.substring(0, 100), now, leadId);

    console.log(`[WhatsApp Template] Sent ${templateName} (${languageCode}) to ${cleanPhone}`);

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      templateName,
      languageCode,
    });
  } catch (error: any) {
    console.error('[WhatsApp Template API]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
