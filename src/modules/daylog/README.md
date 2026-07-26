# Module: daylog

## Призначення

Щоденний журнал адміністратора (Андрій) у закритому Telegram-чаті. Він пише
вільним текстом, наговорює голосом або кидає фото чеку — модуль розбирає це в
структуровані записи й підбиває підсумок дня.

**Ізольований add-on.** Пише ЛИШЕ в `daylog_entries`. Не створює фінансових
операцій, не чіпає CRM/бронювання. Звірка daylog → фінанси — окремий майбутній
крок (навмисно, щоб не дублювати гроші з банк-виписки).

## Публічний API (`@daylog`)

| Функція | Опис | Доступ |
|---|---|---|
| `ingestTelegram(req)` | Приймає одне Telegram-повідомлення від бота, парсить, зберігає, відповідає підтвердженням | Bearer `TELEGRAM_BRIDGE_TOKEN` |
| `daylogReport(req)` | Звіт за день (JSON + текст); `?post=1` — ще й постить у чат | Bearer `TELEGRAM_BRIDGE_TOKEN` |
| `summarizeDate(date)` | Агрегат за день (програмно) | — |
| `listByDate(date)` | Записи за день (програмно) | — |

HTTP: `POST /api/daylog/telegram`, `GET /api/daylog/report?date=YYYY-MM-DD`.

## Залежності

- `@core/db` — SQLite
- OpenAI (`OPENAI_API_KEY`, вже налаштований): `gpt-4o` (текст/vision), `whisper-1` (голос)
- Telegram Bot API (`TELEGRAM_BOT_TOKEN`) — лише `sendMessage` / `getFile`.
  **Ніколи не викликає `getUpdates`** — єдиний поллер це Python-бот `@kemptimebot`.

## Події

Не емітує і не слухає подій event-bus.

## Схема даних

`daylog_entries` — `entry_date`, `author`, `input_type` (text/voice/photo),
`raw_text` (текст або транскрипт), `media_path`, `direction` (income/expense),
`category`, `amount`, `currency` (CZK/EUR), `qty_guests`, `qty_nights`,
`payment_method` (cash/card), `counterparty`, `description`, `needs_review`,
`review_reason`, `confidence`, `parsed_json`.

Одне повідомлення може дати кілька записів. Якщо суму не названо або валюта
неясна — `needs_review = 1`, і бот перепитує в чаті.

## Автоматика

`runDaylogReportTickIfDue(db)` викликається з `getDb()` — раз на добу після
`DAYLOG_REPORT_HOUR` (22:00 Прага) постить підсумок у чат. Cron не потрібен.

## Конфігурація

| Змінна | Дефолт | Опис |
|---|---|---|
| `DAYLOG_CHAT_ID` | `-5407249737` | Чат журналу; обробляються лише повідомлення звідти |
| `DAYLOG_REPORT_HOUR` | `22` | Година авто-звіту (Europe/Prague) |
| `DAYLOG_BRIDGE_SECRET` | — | Опційна альтернатива Bearer-токену (`x-daylog-secret`) |

## Точки розширення

- **Звірка з фінансами** — зіставити записи з банк-випискою / операціями PMS.
- **Корекція записів** — поле `corrected` уже є в схемі під редагування з чату.
- **UI-сторінка** — `summarizeDate()` готовий до відображення в дашборді.

## Інтеграція з ботом

Хендлер бота: [`bot-specs/daylog.py`](../../../bot-specs/daylog.py) — форвардить
повідомлення чату в PMS. Сам нічого не парсить.
