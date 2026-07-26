// Minimal Telegram helpers for the day-log add-on. Reuses the existing bot
// token. We only ever call sendMessage + getFile/download — never getUpdates
// (the Python bot owns the single poller).

function botToken(): string {
  return (
    process.env.TELEGRAM_BOT_TOKEN_DEV ||
    process.env.TELEGRAM_BOT_TOKEN ||
    ''
  );
}

/** Send a message; returns its message_id so replies to it can be tracked. */
export async function sendToChat(
  chatId: string,
  text: string,
  replyToMessageId?: number | null,
): Promise<number | null> {
  const token = botToken();
  if (!token || !chatId) return null;
  try {
    const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' };
    if (replyToMessageId) {
      body.reply_to_message_id = replyToMessageId;
      body.allow_sending_without_reply = true;
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data?.result?.message_id ?? null;
  } catch (e) {
    console.error('[daylog] sendToChat failed:', (e as Error).message);
    return null;
  }
}

/** Download a Telegram file (voice / photo) by file_id. Returns bytes + path. */
export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; filePath: string } | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const info = await infoRes.json();
    const filePath: string | undefined = info?.result?.file_path;
    if (!filePath) return null;
    const dl = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    const buffer = Buffer.from(await dl.arrayBuffer());
    return { buffer, filePath };
  } catch (e) {
    console.error('[daylog] downloadFile failed:', (e as Error).message);
    return null;
  }
}
