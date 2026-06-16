/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

// Module-level state: survives between requests in the same process
let lastOffset = 0;

export async function pollTelegram() {
  if (!BOT_TOKEN) {
    return NextResponse.json({ skipped: true, reason: 'No bot token' });
  }

  try {
    const res = await fetch(`${API_BASE}/getUpdates?offset=${lastOffset}&timeout=1&allowed_updates=["callback_query"]`);
    const data = await res.json();

    if (!data.ok || !data.result?.length) {
      return NextResponse.json({ ok: true, updates: 0 });
    }

    let processed = 0;

    for (const update of data.result) {
      lastOffset = update.update_id + 1;

      const cbq = update.callback_query;
      if (!cbq?.data?.startsWith('crm_')) continue;

      const parts = cbq.data.replace('crm_', '').split('_');
      let action: string;
      let draftId: string;
      let targetLang: string | undefined;

      if (parts.length >= 3 && parts[0] === 'approve' && parts[1] === 'translated') {
        action = 'approve_translated';
        draftId = parts.slice(2).join('_');
      } else if (parts.length >= 3 && parts[0] === 'translate' && ['cs', 'de', 'en', 'ru', 'sk', 'pl', 'fr', 'it', 'es'].includes(parts[1])) {
        // Language-specific translate: crm_translate_cs_DRAFTID
        action = 'translate_to';
        targetLang = parts[1];
        draftId = parts.slice(2).join('_');
      } else if (parts.length >= 2) {
        action = parts[0];
        draftId = parts.slice(1).join('_');
      } else {
        continue;
      }

      console.log(`[TG Poll] Callback: ${action}${targetLang ? ` (${targetLang})` : ''} for draft ${draftId}`);

      try {
        await fetch(`${BASE_URL}/api/crm/channels/telegram/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, draftId, callbackQueryId: cbq.id, targetLang }),
        });
        processed++;
      } catch (err: any) {
        console.error('[TG Poll] Callback forward error:', err.message);
      }
    }

    return NextResponse.json({ ok: true, updates: data.result.length, processed });
  } catch (err: any) {
    console.error('[TG Poll] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
