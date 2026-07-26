import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parseMessageText, parseVoice, parsePhoto, type ParsedEntry } from '../domain/parse-entry';
import { insertEntry } from '../data/daylog.repo';
import { sendToChat, downloadFile } from '../domain/telegram';
import { formatConfirmation } from '../domain/format';

// POST /api/daylog/telegram — called by the @kemptimebot Python poller for every
// message in Andrey's day-log chat. Auth: shared secret header. This add-on is
// isolated: it writes only to daylog_entries and never touches finance/CRM.

const MEDIA_DIR = path.join(process.cwd(), 'data', 'daylog-media');

function pragueDate(unixSeconds?: number): string {
  const d = unixSeconds ? new Date(unixSeconds * 1000) : new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' }); // YYYY-MM-DD
}

export async function ingestTelegram(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.DAYLOG_BRIDGE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'DAYLOG_BRIDGE_SECRET not configured on server' }, { status: 503 });
  }
  if (request.headers.get('x-daylog-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const msg = body?.message ?? body;
  const chatId = String(msg?.chat?.id ?? '');
  const messageId: number | null = msg?.message_id ?? null;
  const author = [msg?.from?.first_name, msg?.from?.last_name].filter(Boolean).join(' ')
    || msg?.from?.username || null;
  const entryDate = pragueDate(msg?.date);

  try {
    let inputType: 'text' | 'voice' | 'photo' = 'text';
    let rawText: string | null = null;
    let entries: ParsedEntry[] = [];
    let mediaFileId: string | null = null;
    let mediaPath: string | null = null;

    if (msg?.voice?.file_id || msg?.audio?.file_id) {
      inputType = 'voice';
      mediaFileId = msg.voice?.file_id || msg.audio?.file_id;
      const dl = await downloadFile(mediaFileId!);
      if (!dl) throw new Error('Не вдалося завантажити голосове');
      const { transcript, entries: parsed } = await parseVoice(dl.buffer);
      rawText = transcript;
      entries = parsed;
      mediaPath = await saveMedia(dl.buffer, mediaFileId!, 'ogg');
    } else if (Array.isArray(msg?.photo) && msg.photo.length) {
      inputType = 'photo';
      const largest = msg.photo[msg.photo.length - 1];
      mediaFileId = largest.file_id;
      const caption: string | undefined = msg.caption || undefined;
      rawText = caption || null;
      const dl = await downloadFile(mediaFileId!);
      if (!dl) throw new Error('Не вдалося завантажити фото');
      entries = await parsePhoto(dl.buffer, 'image/jpeg', caption);
      mediaPath = await saveMedia(dl.buffer, mediaFileId!, 'jpg');
    } else {
      const text: string = msg?.text || msg?.caption || '';
      if (!text.trim()) return NextResponse.json({ ok: true, skipped: 'empty' });
      rawText = text;
      entries = await parseMessageText(text);
    }

    for (const e of entries) {
      insertEntry({
        ...e,
        entry_date: entryDate,
        chat_id: chatId || null,
        telegram_message_id: messageId,
        author,
        input_type: inputType,
        raw_text: rawText,
        media_file_id: mediaFileId,
        media_path: mediaPath,
        parsed_json: JSON.stringify(e),
      });
    }

    const reply = formatConfirmation(entries);
    if (chatId) await sendToChat(chatId, reply);

    return NextResponse.json({ ok: true, stored: entries.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[daylog] ingest error:', message);
    if (chatId) await sendToChat(chatId, `⚠️ Не зміг обробити повідомлення (${message}). Спробуй ще раз або напиши текстом.`);
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
