# ALiSiO PMS ↔ Telegram Bot Bridge

## Архітектура

ALiSiO PMS інтегрована з Telegram ботом `@kemptimebot` (Python/aiogram).  
Бот працює на тому ж VPS (`46.225.132.220`) як systemd сервіс `alisio-bot`.

### Як вони зв'язані

```
PMS (Next.js, port 3001)  ←→  kemptimebot (Python, polling)
         ↓                              ↓
    sendMessage API              getUpdates (єдиний!)
    editMessage API              forwards crm_* → PMS
```

- **PMS → Telegram**: Надсилає повідомлення через Bot API (`sendMessage`, `editMessage`)
- **Telegram → PMS**: Python бот ловить `crm_*` callbacks і POST на `http://localhost:3001/api/crm/channels/telegram/callback`

### Конфігурація

| Змінна | Значення | Де |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | kemptimebot token | PMS `.env.local` |
| `TELEGRAM_CHAT_ID` | `5417846338` (owner) | PMS `.env.local` |
| `BOT_TOKEN` | той самий token | Bot `.env` |
| `PMS_BRIDGE_URL` | `http://localhost:3001` | Bot `.env` |

### Ключові файли PMS

| Файл | Опис |
|---|---|
| `src/lib/channels/telegram-bot.ts` | Send/edit Telegram messages |
| `src/app/api/crm/channels/telegram/callback/route.ts` | Прийняття callbacks від бота |
| `src/lib/ai/auto-response.ts` | AI draft → Telegram approval |

### Ключові файли Bot (Python)

| Файл | Опис |
|---|---|
| `src/bot/handlers/crm_bridge.py` | Форвард crm_* callbacks → PMS |
| `src/bot/config.py` | Конфігурація бота |

### Потоки даних

1. **Email → AI Draft → Telegram Approval**  
   PMS отримує email → AI генерує відповідь → надсилає в Telegram з кнопками → бот форвардить callback → PMS відправляє email

2. **Сповіщення з PMS → Telegram**  
   Нове бронювання, check-in, проблеми → PMS sendMessage → Telegram

3. **Бот → PMS (планується)**  
   - Створення бронювань через бот → POST на PMS API
   - Задачі/ремонти → POST на PMS API
   - Реєстрація гостей → POST на PMS API

4. **Бот → PMS Finance (PR #17, активне)**
   - Сауна walk-in → `POST /api/finance/telegram-bridge/operation` (sauna_income)
   - Готівкова витрата → `POST /api/finance/telegram-bridge/operation` (cash_expense)
   - Auth: `Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>` (з PMS `.env.local`)
   - Idempotency: `chat_id + message_id` як dedup-ключ; повторний POST повертає існуючий operation_id

   **Body для бота:**
   ```json
   {
     "type": "sauna_income",
     "amount": 600,
     "currency": "CZK",
     "category_id": "<optional>",
     "project_id": "<optional>",
     "comment": "Сауна 60хв · 2 особи",
     "chat_id": 5417846338,
     "message_id": 12345,
     "recorded_by": "Olha"
   }
   ```

   **Допоміжні endpoint'и для бота:**
   - `GET /api/finance/telegram-bridge/categories?op_type=income|expense` — категорії + проєкти для inline-клавіатур
   - `GET /api/finance/telegram-bridge/operations?source=telegram_sauna&limit=20` — recent imports

5. **Бот → PMS Registration (группова реєстрація через фото)**
   - `GET /api/registration/telegram-bridge` — today's check-ins (для inline клавіатури бота)
   - `POST /api/registration/telegram-bridge` — upload passport photos → OCR → register guests
   - Auth: `Authorization: Bearer <TELEGRAM_BRIDGE_TOKEN>`
   - POST body: `multipart/form-data` з полями `reservation_id`, `photos_0..photos_N` (JPEG/PNG)
   - Response: `{ success: true, guests_registered: N, guests: [...] }`
   - Bot handler spec: `bot-specs/registration.py`

### Як додати нову інтеграцію

**PMS → Telegram**: Використовуй `sendTelegramMessage()` з `src/lib/channels/telegram-bot.ts`  
**Telegram → PMS**: Додай callback prefix в `crm_bridge.py` або створи новий endpoint в PMS

### VPS Paths

- PMS: `/root/projects/alisio-pms/` (systemd: `alisio-pms`)
- Bot: `/root/projects/alisio-bot/` (systemd: `alisio-bot`)
- Bot env: `/root/projects/alisio-bot/.env`
- PMS env: `/root/projects/alisio-pms/.env.local`
