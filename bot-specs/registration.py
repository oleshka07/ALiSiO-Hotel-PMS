"""
registration.py — Telegram bot handler for group guest registration via passport photos.

PMS API spec:
  Base URL: http://localhost:3001  (PMS_BRIDGE_URL env var)
  Auth: Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>

Endpoints used:
  GET  /api/registration/telegram-bridge        — list today's check-ins
  POST /api/registration/telegram-bridge        — upload photos + OCR + register guests

─── Bot Flow ───────────────────────────────────────────────────

1. User presses "📋 Реєстрація" button (in main menu or check-in notification)
2. Bot: GET /api/registration/telegram-bridge → shows inline keyboard with today's check-ins
3. User selects a reservation → enters "photo collection" state
4. Bot: "Надішліть фото документів гостей (до 20 штук). Коли завершите — натисніть ✅ Готово"
5. User sends 1-20 photos → bot collects file_ids
6. User presses "✅ Готово" → bot downloads photos from Telegram, sends to PMS
7. Bot shows result: "✅ 5/5 гостей зареєстровано: ..."

─── Implementation Guide ──────────────────────────────────────
"""

import asyncio
import io
import aiohttp
from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from typing import List

router = Router()

# ── Config ────────────────────────────────────────────────────
PMS_URL = "http://localhost:3001"  # from env PMS_BRIDGE_URL
BRIDGE_TOKEN = ""                  # from env TELEGRAM_BRIDGE_TOKEN
MAX_PHOTOS = 20

# ── FSM States ────────────────────────────────────────────────

class RegistrationState(StatesGroup):
    choosing_reservation = State()
    collecting_photos = State()

# ── Helpers ───────────────────────────────────────────────────

def _headers():
    return {"Authorization": f"Bearer {BRIDGE_TOKEN}"}

async def _get_today_checkins() -> list:
    """Fetch today's check-ins from PMS."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{PMS_URL}/api/registration/telegram-bridge",
            headers=_headers(),
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data.get("reservations", [])
            return []

async def _register_photos(reservation_id: str, photos: List[bytes], chat_id: int, message_id: int) -> dict:
    """Upload photos to PMS for OCR + registration."""
    async with aiohttp.ClientSession() as session:
        form = aiohttp.FormData()
        form.add_field("reservation_id", reservation_id)
        form.add_field("chat_id", str(chat_id))
        form.add_field("message_id", str(message_id))

        for i, photo_bytes in enumerate(photos):
            form.add_field(
                f"photos_{i}",
                io.BytesIO(photo_bytes),
                filename=f"passport_{i}.jpg",
                content_type="image/jpeg",
            )

        async with session.post(
            f"{PMS_URL}/api/registration/telegram-bridge",
            headers=_headers(),
            data=form,
        ) as resp:
            return await resp.json()

# ── Command: /register ───────────────────────────────────────

@router.message(F.text == "/register")
@router.message(F.text == "📋 Реєстрація")
async def cmd_register(message: types.Message, state: FSMContext):
    """Start the registration flow: show today's check-ins."""
    checkins = await _get_today_checkins()

    if not checkins:
        await message.answer("📋 Сьогодні немає заїздів для реєстрації.")
        return

    # Build inline keyboard with reservation options
    buttons = []
    for r in checkins:
        status_icon = "✅" if r["registrationStatus"] == "registered" else "⏳"
        label = f"{status_icon} {r['label']}"
        buttons.append([
            types.InlineKeyboardButton(
                text=label,
                callback_data=f"reg_select_{r['id'][:40]}",  # Telegram limit: 64 bytes
            )
        ])

    keyboard = types.InlineKeyboardMarkup(inline_keyboard=buttons)
    await message.answer(
        "📋 <b>Реєстрація гостей</b>\n\n"
        "Оберіть бронювання для реєстрації:",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    await state.set_state(RegistrationState.choosing_reservation)

# ── Callback: Reservation selected ───────────────────────────

@router.callback_query(F.data.startswith("reg_select_"))
async def on_reservation_selected(callback: types.CallbackQuery, state: FSMContext):
    """User selected a reservation — enter photo collection mode."""
    reservation_id = callback.data.replace("reg_select_", "")

    await state.update_data(reservation_id=reservation_id, photos=[])
    await state.set_state(RegistrationState.collecting_photos)

    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="✅ Готово — зареєструвати", callback_data="reg_done")],
        [types.InlineKeyboardButton(text="❌ Скасувати", callback_data="reg_cancel")],
    ])

    await callback.message.edit_text(
        f"📷 <b>Надішліть фото документів</b>\n\n"
        f"Бронювання: <code>{reservation_id[:16]}...</code>\n\n"
        f"Надішліть до {MAX_PHOTOS} фото паспортів/ID-карток.\n"
        f"Коли всі фото надіслані — натисніть <b>✅ Готово</b>.",
        parse_mode="HTML",
        reply_markup=keyboard,
    )
    await callback.answer()

# ── Photo handler: Collect photos ─────────────────────────────

@router.message(RegistrationState.collecting_photos, F.photo)
async def on_photo_received(message: types.Message, state: FSMContext):
    """Collect incoming photos during registration flow."""
    data = await state.get_data()
    photos = data.get("photos", [])

    if len(photos) >= MAX_PHOTOS:
        await message.reply(f"⚠️ Максимум {MAX_PHOTOS} фото. Натисніть ✅ Готово.")
        return

    # Get the highest resolution photo
    photo = message.photo[-1]
    file = await message.bot.get_file(photo.file_id)
    photo_bytes = await message.bot.download_file(file.file_path)
    content = photo_bytes.read()

    photos.append(content)
    await state.update_data(photos=photos)

    count = len(photos)
    await message.reply(f"📷 Фото {count}/{MAX_PHOTOS} отримано ✓")

# ── Also accept documents (PDF/HEIC) ─────────────────────────

@router.message(RegistrationState.collecting_photos, F.document)
async def on_document_received(message: types.Message, state: FSMContext):
    """Collect documents (HEIC, PDF) during registration flow."""
    data = await state.get_data()
    photos = data.get("photos", [])

    if len(photos) >= MAX_PHOTOS:
        await message.reply(f"⚠️ Максимум {MAX_PHOTOS} фото. Натисніть ✅ Готово.")
        return

    doc = message.document
    file = await message.bot.get_file(doc.file_id)
    doc_bytes = await message.bot.download_file(file.file_path)
    content = doc_bytes.read()

    photos.append(content)
    await state.update_data(photos=photos)

    count = len(photos)
    await message.reply(f"📄 Документ {count}/{MAX_PHOTOS} отримано ✓")

# ── Callback: Done — send to PMS ─────────────────────────────

@router.callback_query(F.data == "reg_done")
async def on_registration_done(callback: types.CallbackQuery, state: FSMContext):
    """User pressed Done — send all photos to PMS for OCR + registration."""
    data = await state.get_data()
    photos = data.get("photos", [])
    reservation_id = data.get("reservation_id", "")

    if not photos:
        await callback.answer("⚠️ Жодного фото не надіслано!", show_alert=True)
        return

    await callback.answer("⏳ Обробляю фото...")
    status_msg = await callback.message.edit_text(
        f"⏳ <b>Обробка {len(photos)} фото...</b>\n"
        f"Це може зайняти до 2 хвилин (OCR + розпізнавання).",
        parse_mode="HTML",
    )

    try:
        result = await _register_photos(
            reservation_id,
            photos,
            chat_id=callback.message.chat.id,
            message_id=callback.message.message_id,
        )

        if result.get("success"):
            guests = result.get("guests", [])
            guest_lines = "\n".join(
                f"  {i+1}. {g['firstName']} {g['lastName']}"
                f"{' (' + g['nationality'] + ')' if g.get('nationality') else ''}"
                f"{' · ' + g['documentNumber'] if g.get('documentNumber') else ''}"
                for i, g in enumerate(guests)
            )
            errors = result.get("errors", [])
            error_lines = ""
            if errors:
                error_lines = "\n\n⚠️ Проблеми:\n" + "\n".join(f"  · {e}" for e in errors[:5])

            await status_msg.edit_text(
                f"✅ <b>Зареєстровано {result['guests_registered']}/{len(photos)} гостей</b>\n\n"
                f"{guest_lines}{error_lines}",
                parse_mode="HTML",
            )
        else:
            error_msg = result.get("error", "Unknown error")
            details = result.get("details", [])
            detail_text = "\n".join(f"  · {d}" for d in details[:5]) if details else ""
            await status_msg.edit_text(
                f"❌ <b>Помилка реєстрації</b>\n\n{error_msg}\n{detail_text}",
                parse_mode="HTML",
            )
    except Exception as e:
        await status_msg.edit_text(
            f"❌ <b>Помилка зв'язку з PMS</b>\n\n{str(e)}",
            parse_mode="HTML",
        )

    await state.clear()

# ── Callback: Cancel ──────────────────────────────────────────

@router.callback_query(F.data == "reg_cancel")
async def on_registration_cancel(callback: types.CallbackQuery, state: FSMContext):
    """Cancel registration flow."""
    await state.clear()
    await callback.message.edit_text("❌ Реєстрацію скасовано.")
    await callback.answer()
