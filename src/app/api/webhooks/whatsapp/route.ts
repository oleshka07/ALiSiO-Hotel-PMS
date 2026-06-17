/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * WhatsApp Cloud API — Webhook Handler
 *
 * GET  → Webhook verification (hub.verify_token challenge)
 * POST → Incoming messages & status updates from WhatsApp
 *
 * This route must be PUBLIC (no auth middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { sendWhatsAppTemplate, detectTemplateLanguage } from '@/lib/channels/whatsapp';

// ─── Helpers ──────────────────────────────────────────────────
function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function nowFormatted(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// ─── GET: Webhook Verification ────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp Webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] Verification failed — token mismatch');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ─── POST: Incoming Messages & Status Updates ─────────────────
export async function POST(request: NextRequest) {
  // Always respond 200 immediately to WhatsApp (we process async below)
  // But we need the body first, so we do everything synchronously in try/catch
  try {
    const rawBody = await request.text();

    // ── Verify signature ──────────────────────────────────────
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
      const signature = request.headers.get('x-hub-signature-256');
      if (!signature) {
        console.warn('[WhatsApp Webhook] Missing X-Hub-Signature-256 header');
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }

      const expectedSig = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(rawBody, 'utf8')
        .digest('hex');

      if (signature !== expectedSig) {
        console.warn('[WhatsApp Webhook] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);

    // ── Process each entry ────────────────────────────────────
    const entries = body?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;

        // Handle incoming messages
        const messages = value.messages || [];
        const contacts = value.contacts || [];
        for (const message of messages) {
          try {
            await processIncomingMessage(message, contacts, value.metadata);
          } catch (err: any) {
            console.error('[WhatsApp Webhook] Error processing message:', err.message);
          }
        }

        // Handle message status updates (sent, delivered, read, failed)
        const statuses = value.statuses || [];
        for (const status of statuses) {
          console.log(
            `[WhatsApp Webhook] Status update: ${status.id} → ${status.status}`,
            status.recipient_id ? `(to: ${status.recipient_id})` : ''
          );
        }
      }
    }
  } catch (err: any) {
    console.error('[WhatsApp Webhook] Error processing webhook:', err.message);
  }

  // Always return 200 to acknowledge receipt
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

// ─── Process a Single Incoming Message ────────────────────────
async function processIncomingMessage(
  message: any,
  contacts: any[],
  _metadata: any,
) {
  const db = getDb();
  const now = nowFormatted();

  // Extract message data
  const senderPhone = message.from;               // e.g. "420723565616"
  const messageId = message.id;                    // WhatsApp message ID
  const timestamp = message.timestamp;             // Unix timestamp
  const messageType = message.type;                // text, image, document, audio, etc.

  // Contact profile name
  const contact = contacts.find((c: any) => c.wa_id === senderPhone);
  const senderName = contact?.profile?.name || senderPhone;

  // Determine content and content_type based on message type
  let content: string;
  let contentType: string;
  let metadataJson: string | null = null;

  switch (messageType) {
    case 'text':
      content = message.text?.body || '';
      contentType = 'text';
      break;
    case 'image':
      content = message.image?.caption || '📷 Фото';
      contentType = 'image';
      metadataJson = JSON.stringify({
        media_id: message.image?.id,
        mime_type: message.image?.mime_type,
        sha256: message.image?.sha256,
        caption: message.image?.caption,
      });
      break;
    case 'document':
      content = message.document?.caption || '📎 Документ';
      contentType = 'file';
      metadataJson = JSON.stringify({
        media_id: message.document?.id,
        mime_type: message.document?.mime_type,
        sha256: message.document?.sha256,
        filename: message.document?.filename,
        caption: message.document?.caption,
      });
      break;
    case 'audio':
      content = '🎵 Аудіо';
      contentType = 'file';
      metadataJson = JSON.stringify({
        media_id: message.audio?.id,
        mime_type: message.audio?.mime_type,
        sha256: message.audio?.sha256,
        voice: message.audio?.voice,
      });
      break;
    case 'video':
      content = message.video?.caption || '🎬 Відео';
      contentType = 'file';
      metadataJson = JSON.stringify({
        media_id: message.video?.id,
        mime_type: message.video?.mime_type,
        sha256: message.video?.sha256,
        caption: message.video?.caption,
      });
      break;
    case 'location':
      content = '📍 Локація';
      contentType = 'text';
      metadataJson = JSON.stringify({
        latitude: message.location?.latitude,
        longitude: message.location?.longitude,
        name: message.location?.name,
        address: message.location?.address,
      });
      break;
    case 'sticker':
      content = '🏷️ Стікер';
      contentType = 'image';
      metadataJson = JSON.stringify({
        media_id: message.sticker?.id,
        mime_type: message.sticker?.mime_type,
        animated: message.sticker?.animated,
      });
      break;
    default:
      content = `[${messageType}]`;
      contentType = 'text';
      break;
  }

  console.log(
    `[WhatsApp Webhook] Message from ${senderName} (${senderPhone}): ${content.substring(0, 100)}`
  );

  // ── 1. Find or create CRM lead ────────────────────────────
  // Use the first organization (single-tenant system)
  const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
  const orgId = org?.id || 'org_alisio_001';

  let lead = db.prepare(
    'SELECT id FROM crm_leads WHERE whatsapp = ? AND organization_id = ?'
  ).get(senderPhone, orgId) as any;

  if (!lead) {
    // Parse first/last name from profile
    const nameParts = senderName.split(' ');
    const firstName = nameParts[0] || senderPhone;
    const lastName = nameParts.slice(1).join(' ') || null;

    const leadId = generateId();
    db.prepare(`
      INSERT INTO crm_leads (
        id, organization_id, first_name, last_name, whatsapp, phone,
        source, stage, last_message_at, last_message_preview, unread_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'whatsapp', 'new', ?, ?, 1, ?, ?)
    `).run(
      leadId, orgId, firstName, lastName, senderPhone, senderPhone,
      now, content.substring(0, 200), now, now
    );

    lead = { id: leadId };
    console.log(`[WhatsApp Webhook] Created new lead ${leadId} for ${senderName}`);

    // Auto-send welcome template to new WhatsApp leads
    const lang = detectTemplateLanguage(content);
    const templateName = `welcome_inquiry_${lang}`;
    const guestFirstName = nameParts[0] || 'Guest';
    sendWhatsAppTemplate({
      to: senderPhone,
      templateName,
      languageCode: lang,
      parameters: [guestFirstName],
    }).then(result => {
      if (result.success) {
        console.log(`[WhatsApp Webhook] Auto-sent ${templateName} to ${senderPhone}`);
      } else {
        console.warn(`[WhatsApp Webhook] Failed to auto-send template: ${result.error}`);
      }
    }).catch(err => {
      console.warn(`[WhatsApp Webhook] Template send error:`, err.message);
    });
  }

  // ── 2. Find or create conversation ────────────────────────
  let conversation = db.prepare(
    "SELECT id FROM crm_conversations WHERE lead_id = ? AND status IN ('active', 'waiting')"
  ).get(lead.id) as any;

  if (!conversation) {
    const convId = generateId();
    db.prepare(`
      INSERT INTO crm_conversations (
        id, lead_id, subject, status, last_message_at, last_channel,
        unread_count, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, 'whatsapp', 1, ?, ?)
    `).run(
      convId, lead.id, `WhatsApp: ${senderName}`, now, now, now
    );

    conversation = { id: convId };
    console.log(`[WhatsApp Webhook] Created new conversation ${convId}`);
  }

  // ── 3. Insert message ─────────────────────────────────────
  const msgId = generateId();
  db.prepare(`
    INSERT INTO crm_messages (
      id, conversation_id, channel_type, direction, sender_type,
      sender_name, content, content_type, metadata_json,
      external_id, status, created_at
    ) VALUES (?, ?, 'whatsapp', 'inbound', 'guest', ?, ?, ?, ?, ?, 'delivered', ?)
  `).run(
    msgId, conversation.id, senderName, content, contentType,
    metadataJson, messageId, now
  );

  // ── 4. Update conversation ────────────────────────────────
  db.prepare(`
    UPDATE crm_conversations
    SET last_message_at = ?, last_channel = 'whatsapp',
        unread_count = unread_count + 1, status = 'active',
        updated_at = ?
    WHERE id = ?
  `).run(now, now, conversation.id);

  // ── 5. Update lead ────────────────────────────────────────
  db.prepare(`
    UPDATE crm_leads
    SET last_message_at = ?, last_message_preview = ?,
        unread_count = unread_count + 1, updated_at = ?
    WHERE id = ?
  `).run(now, content.substring(0, 200), now, lead.id);

  console.log(
    `[WhatsApp Webhook] Stored message ${msgId} in conversation ${conversation.id}`,
    `(lead: ${lead.id}, ts: ${timestamp})`
  );
}
