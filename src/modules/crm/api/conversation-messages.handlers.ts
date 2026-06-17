/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { dispatchMessage } from '@/lib/channels/dispatcher'; // TODO: replace with eventBus
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
