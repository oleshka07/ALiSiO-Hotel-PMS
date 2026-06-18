/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { translateDraft, regenerateDraft } from '@/lib/ai/auto-response'; // TODO: replace with eventBus
import { editTelegramMessage, answerCallbackQuery } from '@/lib/channels/telegram-bot'; // TODO: replace with eventBus
import { sendEmail } from '@/lib/channels/email'; // TODO: replace with eventBus
import { onOutboundReply } from '@/lib/crm/stage-transitions'; // TODO: replace with eventBus
import crypto from 'crypto';

export async function handleTelegramCallback(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, draftId, callbackQueryId, correctionText, targetLang } = body;

    if (!action || !draftId) {
      return NextResponse.json({ error: 'Missing action or draftId' }, { status: 400 });
    }

    const db = getDb();

    // Ensure drafts table exists (it's created dynamically by auto-response)
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

    const draft = db.prepare('SELECT * FROM crm_auto_drafts WHERE id = ?').get(draftId) as any;
    if (!draft) {
      // Tell Telegram user the draft is gone
      if (callbackQueryId) {
        await answerCallbackQuery(callbackQueryId, '⚠️ Чернетку не знайдено — можливо вона застаріла');
      }
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    switch (action) {
      case 'translate':
        return await handleTranslate(db, draft, callbackQueryId);
      case 'translate_to':
        return await handleTranslate(db, draft, callbackQueryId, targetLang);
      case 'approve':
        return await handleApprove(db, draft, callbackQueryId, false);
      case 'approve_translated':
        return await handleApprove(db, draft, callbackQueryId, true);
      case 'reject':
        return await handleReject(db, draft, callbackQueryId);
      case 'edit':
        return await handleEdit(db, draft, callbackQueryId);
      case 'apply_correction':
        return await handleApplyCorrection(db, draft, correctionText, callbackQueryId);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[TG Callback]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function handleTranslate(db: any, draft: any, callbackQueryId?: string, overrideLang?: string) {
  const langLabels: Record<string, string> = { cs: '🇨🇿 CZ', de: '🇩🇪 DE', en: '🇬🇧 EN' };
  const langHint = overrideLang ? (langLabels[overrideLang] || overrideLang.toUpperCase()) : '🌍';
  if (callbackQueryId) await answerCallbackQuery(callbackQueryId, `${langHint} Перекладаю...`);

  const translated = await translateDraft(draft.id, overrideLang);
  if (!translated) {
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }

  // Re-read draft to get updated target_language
  const updatedDraft = db.prepare('SELECT target_language FROM crm_auto_drafts WHERE id = ?').get(draft.id) as any;
  const langCode = updatedDraft?.target_language || overrideLang || draft.target_language;

  if (draft.telegram_message_id) {
    const langLabel = langCode?.toUpperCase() || '??';
    const text = [
      `📩 <b>Запит від</b> ${escapeHtml(draft.reply_to_email)}`,
      `📋 <b>Тема:</b> ${escapeHtml(draft.reply_subject || '')}`,
      ``,
      `━━━ Оригінал (UK) ━━━`,
      `<i>${escapeHtml(draft.draft_content_uk.substring(0, 800))}</i>`,
      ``,
      `━━━ Переклад (${langLabel}) ━━━`,
      escapeHtml(translated.substring(0, 2000)),
    ].join('\n');

    const keyboard = [
      [
        { text: '✅ Підтвердити', callback_data: `crm_approve_translated_${draft.id}` },
        { text: '✏️ Змінити', callback_data: `crm_edit_${draft.id}` },
      ],
      [
        { text: '🇨🇿 CZ', callback_data: `crm_translate_cs_${draft.id}` },
        { text: '🇩🇪 DE', callback_data: `crm_translate_de_${draft.id}` },
        { text: '🇬🇧 EN', callback_data: `crm_translate_en_${draft.id}` },
      ],
      [
        { text: '❌ Відхилити', callback_data: `crm_reject_${draft.id}` },
      ],
    ];

    await editTelegramMessage(draft.telegram_message_id, text, keyboard, draft.id);
  }

  return NextResponse.json({ ok: true, translated: translated.substring(0, 100) });
}

async function handleEdit(db: any, draft: any, callbackQueryId?: string) {
  if (callbackQueryId) await answerCallbackQuery(callbackQueryId, '✏️ Напишіть правку...');

  db.prepare("UPDATE crm_auto_drafts SET status = 'editing', updated_at = datetime('now') WHERE id = ?")
    .run(draft.id);

  if (draft.telegram_message_id) {
    const currentContent = draft.draft_content_translated || draft.draft_content_uk;
    const text = [
      `✏️ <b>Редагування відповіді</b>`,
      `📧 ${escapeHtml(draft.reply_to_email)}`,
      ``,
      `━━━ Поточний текст ━━━`,
      `<i>${escapeHtml(currentContent.substring(0, 1000))}</i>`,
      ``,
      `📝 <b>Напишіть що потрібно змінити</b> (відповіддю на це повідомлення).`,
      `<i>Наприклад: "Заміни ціну на 3500 Kč" або "Додай інформацію про сніданки"</i>`,
    ].join('\n');

    const keyboard = [
      [
        { text: '↩️ Скасувати', callback_data: `crm_translate_${draft.id}` },
      ],
    ];

    await editTelegramMessage(draft.telegram_message_id, text, keyboard, draft.id);
  }

  return NextResponse.json({ ok: true, editing: true, draftId: draft.id });
}

async function handleApplyCorrection(db: any, draft: any, correctionText?: string, _callbackQueryId?: string) {
  if (!correctionText) {
    return NextResponse.json({ error: 'No correction text' }, { status: 400 });
  }

  console.log(`[TG Callback] Applying correction to draft ${draft.id}: ${correctionText.substring(0, 100)}`);

  const originalDraft = draft.draft_content_translated || draft.draft_content_uk;

  const regenerated = await regenerateDraft(draft.id, correctionText);
  if (!regenerated) {
    return NextResponse.json({ error: 'Regeneration failed' }, { status: 500 });
  }

  try {
    db.prepare(`
      INSERT INTO crm_ai_training
      (conversation_id, guest_message, guest_language, lead_stage, ai_draft, final_response, was_approved, was_edited, edit_reason)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)
    `).run(
      draft.conversation_id,
      draft.original_query?.substring(0, 5000) || '',
      draft.target_language || 'en',
      'new',
      originalDraft.substring(0, 5000),
      regenerated.substring(0, 5000),
      correctionText.substring(0, 1000),
    );
  } catch (e: any) {
    console.error('[TG Callback] Training data save error:', e.message);
  }

  if (draft.telegram_message_id) {
    const text = [
      `📩 <b>Запит від</b> ${escapeHtml(draft.reply_to_email)}`,
      `📋 <b>Тема:</b> ${escapeHtml(draft.reply_subject || '')}`,
      `✏️ <b>Правка:</b> <i>${escapeHtml(correctionText.substring(0, 200))}</i>`,
      ``,
      `━━━ Оновлена відповідь (UK) ━━━`,
      escapeHtml(regenerated.substring(0, 2000)),
    ].join('\n');

    const keyboard = [
      [
        { text: '🌍 Перекласти', callback_data: `crm_translate_${draft.id}` },
        { text: '✏️ Змінити ще', callback_data: `crm_edit_${draft.id}` },
      ],
      [
        { text: '🇨🇿 CZ', callback_data: `crm_translate_cs_${draft.id}` },
        { text: '🇩🇪 DE', callback_data: `crm_translate_de_${draft.id}` },
        { text: '🇬🇧 EN', callback_data: `crm_translate_en_${draft.id}` },
      ],
      [
        { text: '✅ Відправити як є (UK)', callback_data: `crm_approve_${draft.id}` },
        { text: '❌ Відхилити', callback_data: `crm_reject_${draft.id}` },
      ],
    ];

    await editTelegramMessage(draft.telegram_message_id, text, keyboard, draft.id);
  }

  return NextResponse.json({ ok: true, regenerated: true });
}

async function handleApprove(db: any, draft: any, callbackQueryId?: string, useTranslated = false) {
  if (draft.status === 'sent') {
    if (callbackQueryId) await answerCallbackQuery(callbackQueryId, '⚠️ Вже відправлено');
    return NextResponse.json({ ok: true, sent: true, alreadySent: true });
  }

  if (callbackQueryId) await answerCallbackQuery(callbackQueryId, '✅ Відправляю...');

  db.prepare("UPDATE crm_auto_drafts SET status = 'sending', updated_at = datetime('now') WHERE id = ?")
    .run(draft.id);

  const content = useTranslated && draft.draft_content_translated
    ? draft.draft_content_translated
    : draft.draft_content_uk;

  const isGlamping = draft.account_id === 'emailcz';
  const brandName = isGlamping ? 'QA Glamping' : 'Carlsbad Wellness & Camping Resort';
  const brandUrl = isGlamping ? 'https://qa-glamping.eu/' : 'https://kemp-carlsbad.cz/';
  const brandPhone = '+420 723 565 616';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
      ${content.replace(/\n/g, '<br>')}
      <br><br>
      <div style="color: #888; font-size: 12px; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px;">
        ${brandName}<br>
        <a href="${brandUrl}" style="color: #6366f1;">${brandUrl.replace('https://', '')}</a><br>
        ${brandPhone}
      </div>
    </div>
  `;

  const result = await sendEmail({
    to: draft.reply_to_email,
    subject: draft.reply_subject || 'Re: Your inquiry',
    text: content,
    html: htmlBody,
    inReplyTo: draft.in_reply_to,
    references: draft.in_reply_to,
    accountId: draft.account_id,
  });

  if (!result.success) {
    db.prepare("UPDATE crm_auto_drafts SET status = 'pending', updated_at = datetime('now') WHERE id = ?")
      .run(draft.id);
    if (draft.telegram_message_id) {
      await editTelegramMessage(draft.telegram_message_id,
        `❌ <b>Помилка відправки!</b>\n${escapeHtml(draft.reply_to_email)}\nСпробуйте через Inbox.`, [], draft.id);
    }
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }

  const msgId = crypto.randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO crm_messages
    (id, conversation_id, channel_type, direction, sender_type, sender_name,
     content, content_type, external_id, status, is_ai_generated, metadata_json)
    VALUES (?, ?, 'email', 'outbound', 'staff', 'AI Assistant', ?, 'text', ?, 'sent', 1, ?)
  `).run(
    msgId, draft.conversation_id, content.substring(0, 10000),
    result.messageId || null,
    JSON.stringify({ accountId: draft.account_id, autoApproved: true }),
  );

  try {
    db.prepare(`
      INSERT INTO crm_ai_training
      (conversation_id, guest_message, guest_language, lead_stage, ai_draft, final_response, was_approved, was_edited)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0)
    `).run(
      draft.conversation_id,
      draft.original_query?.substring(0, 5000) || '',
      draft.target_language || 'en',
      'new',
      draft.draft_content_uk.substring(0, 5000),
      content.substring(0, 5000),
    );
  } catch (e: any) {
    console.error('[TG Callback] Training data error:', e.message);
  }

  db.prepare("UPDATE crm_auto_drafts SET status = 'sent', updated_at = datetime('now') WHERE id = ?")
    .run(draft.id);

  db.prepare(`
    UPDATE crm_conversations
    SET last_message_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(draft.conversation_id);

  if (draft.telegram_message_id) {
    await editTelegramMessage(draft.telegram_message_id,
      `✅ <b>Відправлено!</b>\n📤 → ${escapeHtml(draft.reply_to_email)}\n📋 ${escapeHtml(draft.reply_subject || '')}\n\n${escapeHtml(content.substring(0, 200))}...`, [], draft.id);
  }

  try {
    const lead = db.prepare('SELECT stage FROM crm_leads WHERE id = ?').get(draft.lead_id) as any;
    if (lead) {
      onOutboundReply(draft.lead_id, lead.stage, content);
    }
  } catch (stageErr: any) {
    console.error('[Stage Transition] Non-fatal:', stageErr.message);
  }

  return NextResponse.json({ ok: true, sent: true });
}

async function handleReject(db: any, draft: any, callbackQueryId?: string) {
  if (callbackQueryId) await answerCallbackQuery(callbackQueryId, '❌ Відхилено');

  db.prepare("UPDATE crm_auto_drafts SET status = 'rejected', updated_at = datetime('now') WHERE id = ?")
    .run(draft.id);

  if (draft.telegram_message_id) {
    await editTelegramMessage(draft.telegram_message_id,
      `❌ <b>Відхилено</b>\n📧 ${escapeHtml(draft.reply_to_email)}\n📋 ${escapeHtml(draft.reply_subject || '')}\n\n<s>${escapeHtml(draft.draft_content_uk.substring(0, 100))}...</s>`, [], draft.id);
  }

  return NextResponse.json({ ok: true, rejected: true });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
