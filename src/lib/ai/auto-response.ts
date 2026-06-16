/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI Auto-Response Generator
 * After new guest email arrives → generates AI draft in Ukrainian → sends to Telegram for approval
 */
import OpenAI from 'openai';
import { getDb } from '@/lib/db';
import { sendDraftApproval } from '@/lib/channels/telegram-bot';
import { searchKnowledge, buildKnowledgeContext, assessQuestionConfidence } from '@/lib/crm/knowledge-base';
import crypto from 'crypto';

/* ────────────────────────────────────────────────────────
   Generate Auto-Response draft for new inbound message
   ──────────────────────────────────────────────────────── */
export async function generateAutoResponse(opts: {
  messageId: string;
  conversationId: string;
  leadId: string;
  accountId: string;
  guestName: string;
  guestEmail: string;
  subject: string;
  content: string;
  language: string;
}): Promise<string | null> {
  const db = getDb();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[AutoResponse] No OpenAI key — skipping');
    return null;
  }

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

    // Get lead context for better response
    const lead = db.prepare(`
      SELECT l.*, 
        r.status as reservation_status, r.payment_status, r.total_price,
        r.check_in, r.check_out
      FROM crm_leads l
      LEFT JOIN reservations r ON r.id = l.reservation_id
      WHERE l.id = ?
    `).get(opts.leadId) as any;

    // Get MASTER prompt (stage='new') — always contains all pricing & rules
    const masterPrompt = db.prepare(`
      SELECT system_prompt, context_instructions
      FROM crm_prompt_configs
      WHERE stage = 'new' AND is_active = 1
      ORDER BY version DESC LIMIT 1
    `).get() as any;

    // Get STAGE-SPECIFIC prompt (supplementary instructions for current stage)
    const currentStage = lead?.stage || 'new';
    const stagePrompt = currentStage !== 'new' ? db.prepare(`
      SELECT system_prompt, context_instructions
      FROM crm_prompt_configs
      WHERE stage = ? AND is_active = 1
      ORDER BY version DESC LIMIT 1
    `).get(currentStage) as any : null;

    // Get property info
    const property = db.prepare('SELECT name, city, country, check_in_time, check_out_time FROM properties LIMIT 1').get() as any;

    // Get conversation history
    const history = db.prepare(`
      SELECT direction, sender_name, content, created_at
      FROM crm_messages WHERE conversation_id = ?
      ORDER BY created_at DESC LIMIT 10
    `).all(opts.conversationId) as any[];
    history.reverse();

    const historyText = history.map(m => {
      const role = m.direction === 'inbound' ? 'Гість' : 'Ми';
      return `${role}: ${m.content}`;
    }).join('\n');

    // Search knowledge base for relevant articles
    const knowledgeArticles = searchKnowledge(opts.content);
    const knowledgeContext = buildKnowledgeContext(knowledgeArticles);

    // Assess question confidence
    const hasPriceData = !!(lead?.check_in_date && lead?.adults);
    const confidence = assessQuestionConfidence(opts.content, knowledgeArticles.length, hasPriceData);

    // Build prompt
    const systemPrompt = buildAutoResponsePrompt({
      property,
      lead,
      masterPrompt,
      stagePrompt,
      knowledgeContext,
      history: historyText,
      language: opts.language,
    });

    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Гість написав:\n\nТема: ${opts.subject}\n\n${opts.content.substring(0, 1500)}` },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const draftUk = response.choices[0]?.message?.content;
    if (!draftUk) return null;

    // Save draft
    const draftId = crypto.randomBytes(8).toString('hex');
    const replySubject = opts.subject.startsWith('Re:') ? opts.subject : `Re: ${opts.subject}`;

    db.prepare(`
      INSERT INTO crm_auto_drafts 
      (id, message_id, conversation_id, lead_id, account_id,
       original_query, draft_content_uk, target_language,
       status, reply_subject, reply_to_email, in_reply_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      draftId, opts.messageId, opts.conversationId, opts.leadId, opts.accountId,
      opts.content.substring(0, 2000), draftUk, opts.language,
      replySubject, opts.guestEmail, opts.messageId,
    );

    // Send to Telegram for approval
    const accountLabel = opts.accountId === 'gmail' ? 'Gmail' : opts.accountId === 'web_form' ? '🌐 Форма на сайті' : 'Email.cz';
    const confidenceLabel = confidence === 'unknown' ? '⚠️ НЕСТАНДАРТНЕ ПИТАННЯ — перевірте відповідь!' 
      : confidence === 'uncertain' ? '🔶 Часткова відповідність — рекомендую перевірити'
      : '';
    const tgMsgId = await sendDraftApproval({
      draftId,
      guestName: opts.guestName,
      guestEmail: opts.guestEmail,
      subject: opts.subject,
      originalQuery: opts.content.substring(0, 500),
      proposedResponse: draftUk,
      language: opts.language,
      accountLabel,
      confidenceLabel,
    });

    if (tgMsgId) {
      db.prepare('UPDATE crm_auto_drafts SET telegram_message_id = ? WHERE id = ?')
        .run(tgMsgId, draftId);
    }

    console.log(`[AutoResponse] Draft ${draftId} created and sent to Telegram`);
    return draftId;
  } catch (err: any) {
    console.error('[AutoResponse] Error:', err.message);
    return null;
  }
}

/* ────────────────────────────────────────────────────────
   Build prompt — Master Quote (prices) + Stage supplement
   
   Architecture:
   1. System context (property, date, language rules)
   2. MASTER PROMPT — full pricing & calculation rules (always)
   3. STAGE PROMPT — behavioral instructions for current stage (if available)
   4. Lead context (name, dates, reservation)
   5. Conversation history
   ──────────────────────────────────────────────────────── */
function buildAutoResponsePrompt(opts: {
  property: any;
  lead: any;
  masterPrompt: any;
  stagePrompt: any;
  knowledgeContext: string;
  history: string;
  language: string;
}): string {
  const { property, lead, masterPrompt, stagePrompt, knowledgeContext, history } = opts;
  const today = new Date().toISOString().split('T')[0];

  // Determine property name based on lead context
  const notes = (lead?.notes || '').toLowerCase();
  let propertyName = property?.name || 'Kemp Carlsbad';
  if (notes.includes('tiny') || notes.includes('barn') || notes.includes('glamping') || notes.includes('domek')) {
    propertyName = 'QA Glamping';
  } else if (notes.includes('budov') || notes.includes('wellness') || notes.includes('rezort')) {
    propertyName = 'Wellness Resort & Camping Kemp Carlsbad';
  } else {
    propertyName = 'Camping Kemp Carlsbad';
  }

  // --- 1. System context ---
  const systemContext = `Ти — професійний рецепціоніст "${propertyName}".
Розташування: ${property?.city || 'Luhačovice'}, ${property?.country || 'Czech Republic'}.
Check-in: ${property?.check_in_time || '14:00'}, Check-out: ${property?.check_out_time || '11:00'}.
Сьогодні: ${today}.

## ВАЖЛИВО
- Напиши відповідь **УКРАЇНСЬКОЮ мовою**. Переклад буде зроблено пізніше.
- Пиши від імені готелю ("ми", не "вони").
- Будь ввічливим, професійним і доброзичливим.
- Відповідь має бути ПОВНОЮ — з детальним розрахунком ціни, якщо є дані.
- НЕ обрізай відповідь на середині речення.
- НЕ додавай привітання типу "Шановний..." — це буде додано потім.
- НЕ додавай підпис — він додається автоматично.
- Якщо пишуть про ціни — відповідай конкретно, якщо є дані.
- Якщо питають про наявність — відповідай що перевіриш та зв'яжешся.`;

  // --- 2. Master prompt (pricing & rules) — ALWAYS included ---
  const masterSection = masterPrompt?.system_prompt
    ? `\n## ПРАЙСИ ТА ПРАВИЛА РОЗРАХУНКУ\n${masterPrompt.system_prompt}\n`
    : '';

  const masterContext = masterPrompt?.context_instructions
    ? `\n## SELF-CHECK\n${masterPrompt.context_instructions}\n`
    : '';

  // --- 3. Stage-specific supplement (behavioral) ---
  const stageSection = stagePrompt?.system_prompt
    ? `\n## ІНСТРУКЦІЇ ДЛЯ ПОТОЧНОГО ЕТАПУ (${lead?.stage || 'new'})\n${stagePrompt.system_prompt}\n`
    : '';

  const stageContext = stagePrompt?.context_instructions
    ? `\n## ДОДАТКОВИЙ КОНТЕКСТ ЕТАПУ\n${stagePrompt.context_instructions}\n`
    : '';

  // --- 4. Lead context ---
  const leadContext = `
## Контекст ліда
- Ім'я: ${lead?.first_name || 'Невідомий'} ${lead?.last_name || ''}
- Email: ${lead?.email || 'N/A'}
- Етап: ${lead?.stage || 'new'}
- Заїзд: ${lead?.check_in_date || 'Не вказано'}
- Виїзд: ${lead?.check_out_date || 'Не вказано'}
- Дорослих: ${lead?.adults || 0}, Дітей: ${lead?.children || 0}
${lead?.reservation_status ? `- Статус бронювання: ${lead.reservation_status}, Оплата: ${lead.payment_status}, Ціна: ${lead.total_price}` : ''}`;

  // --- 5. History + task ---
  const historySection = `
## Історія переписки
${history || 'Це перше повідомлення від гостя.'}

## ЗАДАЧА
Згенеруй ПОВНУ відповідь на повідомлення гостя УКРАЇНСЬКОЮ мовою. Не обрізай текст.
Якщо питання виходить за межі наявної інформації (прайси, база знань) — НЕ ВИГАДУЙ. Скажи що уточниш у адміністратора і зв'яжешся.`;

  return [systemContext, masterSection, knowledgeContext, stageSection, stageContext, leadContext, masterContext, historySection]
    .filter(Boolean)
    .join('\n');
}

/* ────────────────────────────────────────────────────────
   Translate draft to guest language
   ──────────────────────────────────────────────────────── */
export async function translateDraft(draftId: string, overrideLang?: string): Promise<string | null> {
  const db = getDb();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const draft = db.prepare('SELECT * FROM crm_auto_drafts WHERE id = ?').get(draftId) as any;
  if (!draft) return null;

  const langMap: Record<string, string> = {
    cs: 'Czech', en: 'English', de: 'German', ru: 'Russian',
    uk: 'Ukrainian', sk: 'Slovak', pl: 'Polish', fr: 'French',
    it: 'Italian', es: 'Spanish', nl: 'Dutch', hu: 'Hungarian',
  };

  // Use override language if provided, otherwise fall back to draft's target_language
  const langCode = overrideLang || draft.target_language || 'en';
  const targetLang = langMap[langCode] || langCode || 'English';

  // If target is Ukrainian, no need to translate
  if (langCode === 'uk') {
    db.prepare("UPDATE crm_auto_drafts SET draft_content_translated = draft_content_uk, target_language = 'uk', status = 'translated', updated_at = datetime('now') WHERE id = ?")
      .run(draftId);
    return draft.draft_content_uk;
  }

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Translate the following hotel response from Ukrainian to ${targetLang}. 
Keep the same tone, meaning, and formatting. Do not add or remove information.`,
      },
      { role: 'user', content: draft.draft_content_uk },
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  const translated = response.choices[0]?.message?.content;
  if (!translated) return null;

  db.prepare(`
    UPDATE crm_auto_drafts 
    SET draft_content_translated = ?, target_language = ?, status = 'translated', updated_at = datetime('now')
    WHERE id = ?
  `).run(translated, langCode, draftId);

  return translated;
}

/* ────────────────────────────────────────────────────────
   Regenerate draft with user correction
   ──────────────────────────────────────────────────────── */
export async function regenerateDraft(draftId: string, correctionText: string): Promise<string | null> {
  const db = getDb();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const draft = db.prepare('SELECT * FROM crm_auto_drafts WHERE id = ?').get(draftId) as any;
  if (!draft) return null;

  const currentContent = draft.draft_content_translated || draft.draft_content_uk;

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Ти — асистент менеджера готелю. Тобі дано поточну відповідь гостю та інструкцію від менеджера що потрібно змінити.
Внеси правку і поверни ПОВНИЙ оновлений текст відповіді УКРАЇНСЬКОЮ мовою.
НЕ додавай пояснень — тільки оновлений текст.
НЕ обрізай текст на середині.`,
      },
      {
        role: 'user',
        content: `Поточна відповідь:\n${currentContent}\n\nПравка від менеджера:\n${correctionText}`,
      },
    ],
    temperature: 0.5,
    max_tokens: 1500,
  });

  const regenerated = response.choices[0]?.message?.content;
  if (!regenerated) return null;

  // Update draft with regenerated content
  db.prepare(`
    UPDATE crm_auto_drafts 
    SET draft_content_uk = ?, draft_content_translated = NULL, status = 'pending', updated_at = datetime('now')
    WHERE id = ?
  `).run(regenerated, draftId);

  return regenerated;
}
