/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { dispatchMessage } from '@/lib/channels/dispatcher'; // TODO: replace with eventBus
import { editTelegramMessage } from '@/lib/channels/telegram-bot';
import { onOutboundReply } from '@/lib/crm/stage-transitions';
import crypto from 'crypto';

export async function executeCreateMessage(db: any, conversationId: string, body: any) {
  const {
    channelType = 'manual',
    direction = 'outbound',
    senderType = 'staff',
    senderId,
    senderName,
    content,
    contentType = 'text',
    metadataJson,
    isAiGenerated = false,
  } = body;

  if (!content) {
    throw new Error('Content is required');
  }

  const conv = db.prepare('SELECT * FROM crm_conversations WHERE id = ?').get(conversationId) as any;
  if (!conv) {
    throw new Error('Conversation not found');
  }

  let externalId: string | undefined;
  let status = 'sent';
  if (direction === 'outbound' && (channelType === 'email' || channelType === 'whatsapp')) {
    const result = await dispatchMessage({
      channelType,
      leadId: conv.lead_id,
      conversationId,
      content,
      senderName: senderName || undefined,
    });
    if (!result.success) {
      console.error('[CRM Message] Dispatch failed:', result.error);
      status = 'failed';
    } else {
      externalId = result.externalId;
      status = 'delivered';
    }
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const msgId = crypto.randomBytes(8).toString('hex');

  db.prepare(`
    INSERT INTO crm_messages (
      id, conversation_id, channel_type, direction, sender_type,
      sender_id, sender_name, content, content_type, metadata_json,
      is_ai_generated, external_id, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    msgId, conversationId, channelType, direction, senderType,
    senderId || null, senderName || null, content, contentType,
    metadataJson || null, isAiGenerated ? 1 : 0,
    externalId || null, status, now
  );

  db.prepare(`
    UPDATE crm_conversations SET
      last_message_at = ?,
      last_channel = ?,
      unread_count = CASE WHEN ? = 'inbound' THEN unread_count + 1 ELSE unread_count END,
      updated_at = ?
    WHERE id = ?
  `).run(now, channelType, direction, now, conversationId);

  const preview = content.substring(0, 100);
  db.prepare(`
    UPDATE crm_leads SET
      last_message_at = ?,
      last_message_preview = ?,
      unread_count = CASE WHEN ? = 'inbound' THEN unread_count + 1 ELSE unread_count END,
      updated_at = ?
    WHERE id = ?
  `).run(now, preview, direction, now, conv.lead_id);

  // ── Auto-close pending Telegram drafts when replied from CRM ──
  if (direction === 'outbound' && status === 'delivered') {
    closePendingDrafts(db, conv.lead_id, channelType).catch(err =>
      console.error('[CRM Message] Draft close error:', err.message)
    );
  }

  // ── Auto-transition lead stage on outbound reply ──
  if (direction === 'outbound' && (status === 'delivered' || status === 'sent')) {
    try {
      const lead = db.prepare('SELECT stage FROM crm_leads WHERE id = ?').get(conv.lead_id) as any;
      if (lead) {
        onOutboundReply(conv.lead_id, lead.stage, content);
      }
    } catch (stageErr: any) {
      console.error('[CRM Message] Stage transition error:', stageErr.message);
    }
  }

  return db.prepare('SELECT * FROM crm_messages WHERE id = ?').get(msgId);
}

export async function sendMessage(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const db = getDb();
    const body = await request.json();

    const message = await executeCreateMessage(db, conversationId, body);
    return NextResponse.json(message, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Content is required') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error.message === 'Conversation not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('[CRM Message POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── Auto-close pending Telegram drafts ─────────────────────
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function closePendingDrafts(db: any, leadId: string, channel: string) {
  try {
    // Ensure drafts table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_auto_drafts (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        lead_id TEXT NOT NULL,
        account_id TEXT,
        original_query TEXT NOT NULL,
        draft_content_uk TEXT NOT NULL,
        draft_content_translated TEXT,
        target_language TEXT,
        status TEXT DEFAULT 'pending',
        telegram_message_id INTEGER,
        reply_subject TEXT,
        reply_to_email TEXT,
        in_reply_to TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    const pendingDrafts = db.prepare(`
      SELECT id, telegram_message_id, reply_to_email, reply_subject, draft_content_uk
      FROM crm_auto_drafts
      WHERE lead_id = ? AND status IN ('pending', 'translated', 'editing')
    `).all(leadId) as any[];

    if (!pendingDrafts.length) return;

    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'Email';

    for (const draft of pendingDrafts) {
      // Mark draft as handled from CRM
      db.prepare(`
        UPDATE crm_auto_drafts 
        SET status = 'sent_from_crm', updated_at = datetime('now') 
        WHERE id = ?
      `).run(draft.id);

      // Update Telegram message
      if (draft.telegram_message_id) {
        const text = [
          `✅ <b>Відповідь надіслана з CRM</b> (${channelLabel})`,
          `📧 ${escapeHtml(draft.reply_to_email || '')}`,
          `📋 ${escapeHtml(draft.reply_subject || '')}`,
          ``,
          `<i>${escapeHtml((draft.draft_content_uk || '').substring(0, 200))}...</i>`,
        ].join('\n');

        await editTelegramMessage(draft.telegram_message_id, text, [], draft.id);
      }

      console.log(`[CRM→TG] Closed draft ${draft.id} (replied from CRM via ${channelLabel})`);
    }
  } catch (err: any) {
    console.error('[closePendingDrafts]', err.message);
  }
}
