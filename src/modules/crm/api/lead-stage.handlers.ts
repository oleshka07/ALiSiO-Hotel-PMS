/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import crypto from 'crypto';
import { publicMessage } from '@core/security/public-error';

export async function changeLeadStage(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const { stage, changedBy, trigger = 'manual', notes } = body;

    if (!stage) {
      return NextResponse.json({ error: 'Stage is required' }, { status: 400 });
    }

    const validStages = [
      'new', 'inquiry', 'info_needed', 'quote_sent', 'negotiation',
      'deposit_paid', 'booked', 'pre_stay', 'check_in', 'in_stay',
      'check_out', 'post_stay', 'lost', 'spam',
    ];
    if (!validStages.includes(stage)) {
      return NextResponse.json({ error: `Invalid stage: ${stage}` }, { status: 400 });
    }

    const lead = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(id) as any;
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (lead.stage === stage) {
      return NextResponse.json({ error: 'Already in this stage' }, { status: 400 });
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    db.prepare(`UPDATE crm_leads SET stage = ?, updated_at = ? WHERE id = ?`).run(stage, now, id);

    const histId = crypto.randomBytes(8).toString('hex');
    db.prepare(`
      INSERT INTO crm_stage_history (id, lead_id, from_stage, to_stage, changed_by, trigger, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(histId, id, lead.stage, stage, changedBy || null, trigger, notes || null, now);

    const conv = db.prepare(
      'SELECT id FROM crm_conversations WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(id) as any;

    if (conv) {
      const stageLabels: Record<string, string> = {
        new: '🆕 Новий', inquiry: '❓ Запит', info_needed: '📋 Уточнення',
        quote_sent: '💰 Ціна відправлена', negotiation: '🤝 Переговори',
        deposit_paid: '💳 Передплата', booked: '✅ Заброньовано',
        pre_stay: '📋 До заїзду', check_in: '🏠 Заселення',
        in_stay: '🛏️ Перебування', check_out: '👋 Виселення',
        post_stay: '⭐ Після', lost: '❌ Втрачено', spam: '🚫 Спам',
      };

      const msgId = crypto.randomBytes(8).toString('hex');
      const content = `Етап змінено: ${stageLabels[lead.stage] || lead.stage} → ${stageLabels[stage] || stage}${notes ? ` — ${notes}` : ''}`;

      db.prepare(`
        INSERT INTO crm_messages (id, conversation_id, channel_type, direction, sender_type, sender_name, content, content_type, status, created_at)
        VALUES (?, ?, 'manual', 'outbound', 'system', 'System', ?, 'system', 'sent', ?)
      `).run(msgId, conv.id, content, now);
    }

    const updated = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(id);
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[CRM Stage PATCH]', error);
    return NextResponse.json({ error: publicMessage(error) }, { status: 500 });
  }
}
