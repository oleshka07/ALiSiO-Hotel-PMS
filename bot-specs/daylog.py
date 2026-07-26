"""
daylog.py — Telegram bot handler for Andrey's free-form day-log chat.

PMS API spec:
  Base URL: http://localhost:3001  (PMS_BRIDGE_URL env var)
  Auth: Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>   ← already in bot config

Endpoint used:
  POST /api/daylog/telegram   — forward one Telegram message (text / voice / photo)

─── What this does ────────────────────────────────────────────

Andrey writes/dictates/photographs whatever happened during the day in a closed
group chat (accommodation taken, camping fee, salary paid out, materials bought).
The bot does NOT parse anything — it just forwards the raw message to PMS. PMS
transcribes voice (Whisper), reads receipt photos (vision), extracts amounts and
categories (gpt-4o), stores the entries and replies into the same chat with a
short confirmation. At 22:00 Prague, PMS posts a daily summary by itself.

Only messages from DAYLOG_CHAT_ID are forwarded. Everything else is ignored, so
this handler never interferes with existing bot flows.

─── Install ───────────────────────────────────────────────────

1. Copy this file into the bot: src/bot/handlers/daylog.py
2. Register the router BEFORE other message handlers so free-form text in this
   chat isn't swallowed by a menu/FSM handler:

       from bot.handlers import daylog
       dp.include_router(daylog.router)

3. Restart the bot:  systemctl restart alisio-bot

No new environment variables are needed — TELEGRAM_BRIDGE_TOKEN and
PMS_BRIDGE_URL are already configured for the finance/registration bridges.
"""

import os
import logging

import aiohttp
from aiogram import Router, types

log = logging.getLogger(__name__)
router = Router()

DAYLOG_CHAT_ID = int(os.getenv("DAYLOG_CHAT_ID", "-5407249737"))
PMS_BRIDGE_URL = os.getenv("PMS_BRIDGE_URL", "http://localhost:3001")
BRIDGE_TOKEN = os.getenv("TELEGRAM_BRIDGE_TOKEN", "")


@router.message()
async def forward_daylog(message: types.Message) -> None:
    """Forward every message from the day-log chat to PMS. Ignore all other chats."""
    if message.chat.id != DAYLOG_CHAT_ID:
        return  # not our chat — let other handlers deal with it

    try:
        payload = {"message": message.model_dump(mode="json")}  # aiogram v3
    except AttributeError:  # aiogram v2 fallback
        payload = {"message": message.to_python()}

    try:
        timeout = aiohttp.ClientTimeout(total=120)  # transcription/vision can be slow
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{PMS_BRIDGE_URL}/api/daylog/telegram",
                json=payload,
                headers={"Authorization": f"Bearer {BRIDGE_TOKEN}"},
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    log.warning("daylog forward failed: %s %s", resp.status, body[:200])
    except Exception as e:  # never crash the bot on a logging side-feature
        log.warning("daylog forward error: %s", e)
