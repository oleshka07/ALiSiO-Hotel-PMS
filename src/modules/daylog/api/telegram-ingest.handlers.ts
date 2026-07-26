import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parseMessageText, parseVoice, parsePhoto, type ParsedEntry } from '../domain/parse-entry';
import {
  insertEntry, findPendingByQuestion, markQuestionAsked, deleteEntries,
} from '../data/daylog.repo';
import { sendToChat, downloadFile } from '../domain/telegram';
import { formatConfirmation, mentionUser } from '../domain/format';
import { DAYLOG_CHAT_ID } from '../domain/config';
import { authorizeDaylog } from '../domain/auth';
import { loadReference } from '../data/reference';

// POST /api/daylog/telegram — called by the @kemptimebot Python poller for every
// message in Andrey's day-log chat. Auth: bridge token. This add-on is
// isolated: it writes only to daylog_entries and never touches finance/CRM.
//
// Clarification loop: when an entry stays unclear the bot tags the author and
// remembers its own question. A Telegram reply to that question is re-parsed
// together with the original message, replacing the incomplete entry.

const MEDIA_DIR = path.join(process.cwd(), 'data', 'daylog-media');

function pragueDate(unixSeconds?: number): string {
  const d = unixSeconds ? new Date(unixSeconds * 1000) : new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' }); // YYYY-MM-DD
}

export async function ingestTelegram(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeDaylog(request);
  if (!auth.ok) return auth.response;

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const msg = body?.message ?? body;
  const chatId = String(msg?.chat?.id ?? '');

  // Isolation: only the configured day-log chat is processed, even if the bot
  // forwards other chats by mistake.
  if (DAYLOG_CHAT_ID && chatId !== String(DAYLOG_CHAT_ID)) {
    return NextResponse.json({ ok: true, skipped: 'other_chat' });
  }

  const messageId: number | null = msg?.message_id ?? null;
  const userId = msg?.from?.id != null ? String(msg.from.id) : null;
  const username: string | null = msg?.from?.username ?? null;
  const author = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(' ')
    || username || null;
  const entryDate = pragueDate(msg?.date);

  try {
    const ref = loadReference();

    // Is this a reply to one of our own clarification questions?
    const replyToId: number | null = msg?.reply_to_message?.message_id ?? null;
    const pending = replyToId ? findPendingByQuestion(replyToId) : [];

    let inputType: 'text' | 'voice' | 'photo' = 'text';
    let rawText: string | null = null;
    let entries: ParsedEntry[] = [];
    let mediaFileId: string | null = null;
    let mediaPath: string | null = null;

    // Prepend the original message so the clarification is parsed in context.
    const priorContext = pending.length
      ? pending.map((p) => p.raw_text).filter(Boolean).join('\n')
      : '';
    const withContext = (t: string) =>
      priorContext ? `Попереднє повідомлення: "${priorContext}"\nУточнення: "${t}"` : t;

    if (msg?.voice?.file_id || msg?.audio?.file_id) {
      inputType = 'voice';
      mediaFileId = msg.voice?.file_id || msg.audio?.file_id;
      const dl = await downloadFile(mediaFileId!);
      if (!dl) throw new Error('Не вдалося завантажити голосове');
      const { transcript, entries: parsed } = await parseVoice(dl.buffer, ref);
      rawText = transcript;
      entries = priorContext && transcript
        ? await parseMessageText(withContext(transcript), ref)
        : parsed;
      mediaPath = await saveMedia(dl.buffer, mediaFileId!, 'ogg');
    } else if (Array.isArray(msg?.photo) && msg.photo.length) {
      inputType = 'photo';
      const largest = msg.photo[msg.photo.length - 1];
      mediaFileId = largest.file_id;
      const caption: string | undefined = msg.caption || undefined;
      rawText = caption || null;
      const dl = await downloadFile(mediaFileId!);
      if (!dl) throw new Error('Не вдалося завантажити фото');
      entries = await parsePhoto(dl.buffer, 'image/jpeg', caption, ref);
      mediaPath = await saveMedia(dl.buffer, mediaFileId!, 'jpg');
    } else {
      const text: string = msg?.text || msg?.caption || '';
      if (!text.trim()) return NextResponse.json({ ok: true, skipped: 'empty' });
      rawText = text;
      entries = await parseMessageText(withContext(text), ref);
    }

    // A clarification supersedes the incomplete entry it answers.
    if (pending.length && entries.length) {
      deleteEntries(pending.map((p) => p.id));
    }

    const storedIds: string[] = [];
    for (const e of entries) {
      storedIds.push(insertEntry({
        ...e,
        entry_date: pending.length ? pending[0].entry_date : entryDate,
        chat_id: chatId || null,
        telegram_message_id: messageId,
        author,
        input_type: inputType,
        raw_text: priorContext && rawText ? `${priorContext} | ${rawText}` : rawText,
        media_file_id: mediaFileId,
        media_path: mediaPath,
        parsed_json: JSON.stringify(e),
      }));
    }

    const mention = mentionUser(userId, author, username);
    const reply = formatConfirmation(entries, mention);
    const sentId = chatId ? await sendToChat(chatId, reply, messageId) : null;

    // Remember the question so a reply to it lands back on these entries.
    const stillUnclear = entries.some((e) => e.needs_review) || entries.length === 0;
    if (sentId && stillUnclear && storedIds.length) {
      markQuestionAsked(storedIds, sentId, userId, author);
    }

    return NextResponse.json({
      ok: true,
      stored: entries.length,
      clarified: pending.length > 0,
      awaiting_reply: stillUnclear,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[daylog] ingest error:', message);
    if (chatId) await sendToChat(chatId, `⚠️ Не зміг обробити повідомлення (${message}). Спробуй ще раз або напиши текстом.`, messageId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function saveMedia(buffer: Buffer, fileId: string, ext: string): Promise<string | null> {
  try {
    await fs.mkdir(MEDIA_DIR, { recursive: true });
    const safe = fileId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const p = path.join(MEDIA_DIR, `${safe}.${ext}`);
    await fs.writeFile(p, buffer);
    return p;
  } catch (e) {
    console.error('[daylog] saveMedia failed:', (e as Error).message);
    return null;
  }
}
