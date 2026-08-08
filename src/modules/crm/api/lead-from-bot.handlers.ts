/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { generateAutoResponse } from '@/lib/ai/auto-response'; // TODO: replace with eventBus
import crypto from 'crypto';
import { publicMessage } from '@core/security/public-error';

export async function createLeadFromBot(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();

    const {
      firstName = 'Невідомий',
      lastName = '',
      email = '',
      phone = '',
      source = 'chat-bot',
      notes = '',
      checkInDate = '',
      checkOutDate = '',
      adults = 0,
      children = 0,
      type = 'unknown',
      language = 'en',
    } = body;

    console.log(`[Lead from Bot] Creating lead: ${firstName} ${lastName}, source: ${source}, type: ${type}`);

    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 500 });
    }

    let existingLeadId: string | null = null;
    if (email) {
      const dup = db.prepare('SELECT id FROM crm_leads WHERE email = ? COLLATE NOCASE').get(email) as any;
      if (dup) existingLeadId = dup.id;
    }
    if (!existingLeadId && phone) {
      const normPhone = phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+');
      const dup = db.prepare('SELECT id FROM crm_leads WHERE phone = ? OR phone = ?').get(normPhone, phone) as any;
      if (dup) existingLeadId = dup.id;
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let leadId: string;

    if (existingLeadId) {
      leadId = existingLeadId;
      console.log(`[Lead from Bot] Duplicate found: ${leadId}, adding new message`);
      db.prepare(`UPDATE crm_leads SET notes = ?, updated_at = ? WHERE id = ?`).run(notes.substring(0, 2000), now, leadId);
    } else {
      leadId = crypto.randomBytes(8).toString('hex');

      db.prepare(`
        INSERT INTO crm_leads (
          id, organization_id, first_name, last_name, email, phone,
          source, stage, priority,
          check_in_date, check_out_date, adults, children,
          notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, 'new', 'normal',
          ?, ?, ?, ?,
          ?, ?, ?
        )
      `).run(
        leadId, org.id, firstName, lastName || null, email || null, phone || null,
        source || 'chat-bot',
        checkInDate || null, checkOutDate || null, adults || 0, children || 0,
        notes.substring(0, 2000) || null, now, now
      );

      const histId = crypto.randomBytes(8).toString('hex');
      db.prepare(`
        INSERT INTO crm_stage_history (id, lead_id, from_stage, to_stage, trigger, notes, created_at)
        VALUES (?, ?, NULL, 'new', 'bot', 'Лід створено через Telegram бот', ?)
      `).run(histId, leadId, now);

      console.log(`[Lead from Bot] Lead created: ${leadId}`);
    }

    let conv = db.prepare(`
      SELECT id FROM crm_conversations WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(leadId) as any;

    if (!conv) {
      const convId = crypto.randomBytes(8).toString('hex');
      db.prepare(`
        INSERT INTO crm_conversations (id, lead_id, subject, status, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?)
      `).run(convId, leadId, `${firstName} ${lastName} — ${source}`, now, now);
      conv = { id: convId };
    }

    const msgId = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO crm_messages (
        id, conversation_id, channel_type, direction, sender_type, sender_name,
        content, content_type, status, metadata_json
      ) VALUES (?, ?, 'bot', 'inbound', 'guest', ?, ?, 'text', 'delivered', ?)
    `).run(
      msgId, conv.id, `${firstName} ${lastName}`.trim(),
      notes.substring(0, 10000),
      JSON.stringify({ source, type, language, via: 'telegram-bot' }),
    );

    db.prepare(`UPDATE crm_conversations SET last_message_at = ?, updated_at = ? WHERE id = ?`).run(now, now, conv.id);

    const accountId = type === 'glamping' ? 'gmail' : 'gmail';

    const draftId = await generateAutoResponse({
      messageId: msgId,
      conversationId: conv.id,
      leadId,
      accountId,
      guestName: `${firstName} ${lastName}`.trim(),
      guestEmail: email || '',
      subject: `Inquiry from ${firstName} ${lastName} (${source})`.trim(),
      content: notes.substring(0, 2000),
      language,
    });

    console.log(`[Lead from Bot] Auto-response draft: ${draftId || 'none'}`);

    return NextResponse.json({
      ok: true,
      leadId,
      draftId: draftId || null,
      duplicate: !!existingLeadId,
    }, { status: existingLeadId ? 200 : 201 });
  } catch (error: any) {
    console.error('[Lead from Bot] Error:', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
