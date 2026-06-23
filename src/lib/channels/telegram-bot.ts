/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Telegram Bot Client — sends CRM notifications via existing @kemptimebot
 * 
 * IMPORTANT: The bot is already running as a Python polling bot.
 * We ONLY use sendMessage/editMessageText API — never getUpdates.
 * Callback queries are handled by polling /api/crm/channels/telegram/poll
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const ADMIN_CHAT_IDS: string[] = (process.env.TELEGRAM_ADMIN_CHAT_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id.length > 0 && id !== CHAT_ID);

/** Map draftId → array of { chatId, messageId } for admin copies */
const adminMessageMap = new Map<string, { chatId: string; messageId: number }[]>();

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

interface TelegramResult {
  ok: boolean;
  result?: any;
  description?: string;
}

/* ────────────────────────────────────────────────────────
   Send Message with Inline Keyboard
   ──────────────────────────────────────────────────────── */
export async function sendTelegramMessage(
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][],
  options?: { ownerOnly?: boolean },
): Promise<number | null> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[Telegram] Bot not configured — skipping');
    return null;
  }

  // Send to primary CHAT_ID
  const primaryMsgId = await sendToChat(CHAT_ID, text, inlineKeyboard);

  // Send copies to admin chats (unless ownerOnly)
  if (!options?.ownerOnly) {
    for (const adminId of ADMIN_CHAT_IDS) {
      sendToChat(adminId, text, inlineKeyboard).catch(err =>
        console.error(`[Telegram] Admin send to ${adminId} failed:`, err.message)
      );
    }
  }

  return primaryMsgId;
}

/** Low-level: send a message to a specific chat ID */
async function sendToChat(
  chatId: string,
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][]
): Promise<number | null> {
  try {
    const body: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (inlineKeyboard) {
      body.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
    }

    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: TelegramResult = await res.json();
    if (!data.ok) {
      console.error(`[Telegram] sendMessage to ${chatId} failed:`, data.description);
      return null;
    }
    return data.result?.message_id || null;
  } catch (err: any) {
    console.error(`[Telegram] sendMessage to ${chatId} error:`, err.message);
    return null;
  }
}

/* ────────────────────────────────────────────────────────
   Edit Message (update text + keyboard after button press)
   ──────────────────────────────────────────────────────── */
export async function editTelegramMessage(
  messageId: number,
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][],
  draftId?: string
): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) return false;

  // Edit primary message
  const ok = await editInChat(CHAT_ID, messageId, text, inlineKeyboard);

  // Edit admin copies if we have them
  if (draftId) {
    const adminCopies = adminMessageMap.get(draftId) || [];
    for (const copy of adminCopies) {
      editInChat(copy.chatId, copy.messageId, text, inlineKeyboard).catch(err =>
        console.error(`[Telegram] Admin edit in ${copy.chatId} failed:`, err.message)
      );
    }
  }

  return ok;
}

/** Low-level: edit a message in a specific chat */
async function editInChat(
  chatId: string,
  messageId: number,
  text: string,
  inlineKeyboard?: { text: string; callback_data: string }[][]
): Promise<boolean> {
  try {
    const body: any = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    };
    if (inlineKeyboard) {
      body.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
    }

    const res = await fetch(`${API_BASE}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: TelegramResult = await res.json();
    if (!data.ok) {
      console.error(`[Telegram] editMessage in ${chatId} failed:`, data.description);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`[Telegram] editMessage in ${chatId} error:`, err.message);
    return false;
  }
}

/* ────────────────────────────────────────────────────────
   Answer Callback Query (removes loading spinner on button)
   ──────────────────────────────────────────────────────── */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`${API_BASE}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || '',
      }),
    });
  } catch { /* non-critical */ }
}

/* ────────────────────────────────────────────────────────
   Send CRM Draft Approval Message
   ──────────────────────────────────────────────────────── */
export async function sendDraftApproval(opts: {
  draftId: string;
  guestName: string;
  guestEmail: string;
  subject: string;
  originalQuery: string;
  proposedResponse: string;
  language: string;
  accountLabel: string;
  confidenceLabel?: string;
}): Promise<number | null> {
  const queryPreview = opts.originalQuery.substring(0, 500);
  const responsePreview = opts.proposedResponse.substring(0, 2000);

  const text = [
    `📩 <b>Новий запит</b> | ${opts.accountLabel}`,
    ...(opts.confidenceLabel ? [`\n${opts.confidenceLabel}\n`] : []),
    ``,
    `👤 <b>${escapeHtml(opts.guestName)}</b> (${escapeHtml(opts.guestEmail)})`,
    `📋 <b>Тема:</b> ${escapeHtml(opts.subject)}`,
    `🌐 <b>Мова:</b> ${opts.language}`,
    ``,
    `━━━ Запит ━━━`,
    `<i>${escapeHtml(queryPreview)}</i>`,
    ``,
    `━━━ Пропоную відповідь (UK) ━━━`,
    escapeHtml(responsePreview),
  ].join('\n');

  const keyboard = [
    [
      { text: '🌍 Перекласти', callback_data: `crm_translate_${opts.draftId}` },
      { text: '✏️ Змінити', callback_data: `crm_edit_${opts.draftId}` },
    ],
    [
      { text: '🇨🇿 CZ', callback_data: `crm_translate_cs_${opts.draftId}` },
      { text: '🇩🇪 DE', callback_data: `crm_translate_de_${opts.draftId}` },
      { text: '🇬🇧 EN', callback_data: `crm_translate_en_${opts.draftId}` },
    ],
    [
      { text: '✅ Відправити як є (UK)', callback_data: `crm_approve_${opts.draftId}` },
      { text: '❌ Відхилити', callback_data: `crm_reject_${opts.draftId}` },
    ],
  ];

  // Send to primary chat
  const primaryMsgId = await sendToChat(CHAT_ID, text, keyboard);

  // Send to admin chats and track message IDs for later editing
  const adminCopies: { chatId: string; messageId: number }[] = [];
  for (const adminId of ADMIN_CHAT_IDS) {
    try {
      const adminMsgId = await sendToChat(adminId, text, keyboard);
      if (adminMsgId) {
        adminCopies.push({ chatId: adminId, messageId: adminMsgId });
      }
    } catch (err: any) {
      console.error(`[Telegram] Admin draft send to ${adminId} failed:`, err.message);
    }
  }
  if (adminCopies.length > 0) {
    adminMessageMap.set(opts.draftId, adminCopies);
  }

  return primaryMsgId;
}

/* ────────────────────────────────────────────────────────
   Escape HTML for Telegram
   ──────────────────────────────────────────────────────── */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
