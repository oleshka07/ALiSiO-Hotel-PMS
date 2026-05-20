# MetaPrompt: ALiSiO PMS — Guest Module Context Bootstrap

> **Як використовувати:** Скопіюй цей документ і дай в нову розмову Antigravity перед тим, як просити редагувати гостьову сторінку.
> Або скажи: "Прочитай файл `GUEST_MODULE_METAPROMPT.md` в робочому просторі та отримай контекст перед початком роботи."

---

## 🏗️ Проект

**ALiSiO PMS** — Property Management System для ALiSiO Resort & Glamping (Лугачовіце, Чехія).

| Параметр | Значення |
|---|---|
| **Repo** | `d:\Antigraviti\ALiSiO PMS` / GitHub: `oleshka07/ALiSiO-Hotel-PMS` |
| **Домен** | `alisio.swipescape.eu` |
| **VPS** | `46.225.132.220`, порт `3001`, systemd: `alisio-pms` |
| **Стек** | Next.js 16, React 19, TypeScript, SQLite (better-sqlite3, WAL), Vanilla CSS |
| **Deploy** | Push to `main` → GitHub Actions → SSH → build → restart |
| **БД** | `/root/projects/alisio-pms/data/alisio.db` |

---

## 📱 Гостьова сторінка — Загальна архітектура

Гостьова сторінка (`/guest/[token]`) — це **iOS-style мобільна веб-сторінка** (max-width: 430px), яку гості відкривають по персональному посиланню з токеном. Підтримує **7 мов** (EN, DE, CS, UK, PL, NL, FR).

### Lifecycle гостя (5 фаз)

```
far_before (>7 днів до заїзду) → before (1-7 днів) → checkin_day → during (перебування) → checkout
```

**Gate screens** (перехоплюють рендер до фази):
- **PaymentGateScreen** — якщо `!isPaid`, блокує всі фічі, показує кнопку оплати
- **PostStayPage** — якщо `data.expired`, показує подяку + знижку на ребукінг

### Файлова карта модуля

```
src/app/guest/[token]/              ← FRONTEND
├── page.tsx                        ← 1,780 рядків, монолітна сторінка (весь UI)
├── guest-page.css                  ← 44KB, iOS-native дизайн (--gp-tint: #2E6B4F)
├── translations.ts                 ← 50KB, 7 мов × ~80 ключів
├── content-translations.ts         ← Хелпер для динамічних перекладів
└── layout.tsx                      ← Viewport meta, no-index

src/app/api/guest/[token]/          ← API ROUTES
├── route.ts                        ← GET → getGuestPortal
├── register/route.ts               ← POST → registerGuests
├── pay/route.ts                    ← POST → payForService (single + cart)
├── pay-booking/route.ts            ← POST → payForBooking (оплата проживання)
├── services/route.ts               ← POST → orderServices (legacy, без Teya)
├── cart/route.ts                   ← POST → handleCartEvent (abandon tracking)
├── chat/route.ts                   ← GET/POST → guest chat (iMessage-style)
├── feedback/route.ts               ← POST → submitFeedback
└── ocr/route.ts                    ← POST → AI OCR (GPT-4o vision)

src/modules/guests/                 ← БІЗНЕС-ЛОГІКА
├── api/
│   ├── portal.handlers.ts          ← Збирає всі дані для гостя (JOIN 8 таблиць)
│   ├── pay.handlers.ts             ← 16KB! Оплата послуг (single + cart → Teya)
│   ├── pay-booking.handlers.ts     ← Оплата залишку за проживання
│   ├── register.handlers.ts        ← Реєстрація гостей (multi-guest)
│   ├── cart.handlers.ts            ← Cart events + abandon notifications (TG + email)
│   ├── chat.handlers.ts            ← Guest ↔ staff chat
│   ├── feedback.handlers.ts        ← Зворотній зв'язок
│   ├── services.handlers.ts        ← Legacy ordering (без оплати)
│   ├── translate.handlers.ts       ← Переклади через OpenAI
│   ├── guest.handlers.ts           ← GET guest by token
│   └── index.ts                    ← Barrel exports
├── data/
│   ├── guest-portal.repo.ts        ← Дані порталу (reservation JOIN, photos, config)
│   ├── guest-actions.repo.ts       ← createServiceOrder, logCartEvent, abandon
│   ├── registration.repo.ts        ← Зберігання реєстрацій гостей
│   ├── guests.repo.ts              ← CRUD гостей
│   ├── guest-dedup.repo.ts         ← Дедуплікація гостей
│   └── chat.repo.ts                ← Чат з гостем
├── domain/types.ts                 ← Типи: GuestWithStats, CreateGuestInput
├── events/published.ts             ← Events: GuestRegistered, Updated, FeedbackSubmitted
└── ui/
    ├── PaymentGateScreen.tsx        ← Gate screen для неоплачених
    └── FarBeforeScreen.tsx          ← >7 днів до заїзду

src/modules/bookings/api/           ← WIDGET SERVICES (Sauna/Tub/Breakfast)
├── widget-services.handlers.ts     ← book-slots, book-breakfast, book-toggle
├── widget-checkout.handlers.ts     ← Teya checkout для віджета
└── service-orders.handlers.ts      ← Dashboard: список замовлень (обидві таблиці)

src/modules/payments/api/
└── webhook-teya.handlers.ts        ← Вебхук Teya: підтвердження оплат, TG нотифікації

src/lib/ai/
└── ocr-document.ts                 ← GPT-4o Vision OCR для документів
```

---

## 🗃️ Ключові таблиці БД

### Замовлення послуг (ДВІ таблиці!)

> [!IMPORTANT]
> Є **дві таблиці** для замовлень послуг. Це legacy-рішення. Dashboard об'єднує обидві.

| Таблиця | Використання | Ключові поля |
|---|---|---|
| `service_orders` | Guest page single-pay, widget checkout | id, reservation_id, service_id, quantity, total_price, service_date, notes (JSON), status, payment_status |
| `booking_service_orders` | Widget services, guest cart | id, reservation_id, service_id, menu_item_id, quantity, service_date, time_slot_id, options_json, unit_price, total_price, status, payment_status, site_id |

### Типи послуг (`additional_services.service_type`)

| Тип | Послуги | Особливості |
|---|---|---|
| `simple` | BBQ Grill, Early Check-in | Просто кількість × ціна |
| `slot_booking` | **Sauna**, **Hot Tub** | Дата + час (startHour, hours) зберігається в `notes` JSON |
| `menu_selection` | **Breakfast** | Конкретна страва з `menu_items`, дата обирається |
| `toggle` | Late Checkout | Вкл/вимк для бронювання |

### notes JSON для slot_booking

```json
{
  "service_date": "2026-05-08",
  "startHour": 16,
  "hours": 2,
  "addons": [{"id": "addon_broom", "quantity": 1, "price": 100}],
  "unit_price": 500,
  "source": "guest_cart"
}
```

### Інші ключові таблиці

| Таблиця | Призначення |
|---|---|
| `reservations` | guest_page_token, check_in/out, payment_status, total_price |
| `guests` | Ім'я, контакти, документи |
| `reservation_guests` | Multi-guest registration data |
| `menu_items` | Breakfast позиції (name, price, category: 'food') |
| `service_time_slots` | Слоти для sauna/tub (capacity tracking) |
| `cart_events` | Abandon tracking |
| `guest_page_config` | Конфіг гостьової сторінки per unit_type |
| `property_guest_config` | Конфіг per property |

---

## 💳 Потоки оплати

### 1. Оплата проживання (pay-booking)
```
Guest → "Оплатити" → POST /api/guest/[token]/pay-booking
→ Рахує remaining = total_price - SUM(fin_operations)
→ createPaymentSession(Teya) → redirect
→ Webhook: updates reservation.payment_status = 'paid'
→ TG: sendBookingPaymentTG()
→ Auto-invoice
```

### 2. Оплата однієї послуги (pay)
```
Guest → "Order" → POST /api/guest/[token]/pay {serviceId, quantity, serviceDates}
→ createPendingServiceOrder() → createPaymentSession(Teya) → redirect
→ Webhook: updates service_orders.payment_status = 'paid'
→ TG: sendGuestOrderTG()
```

### 3. Оплата кошика (pay + items[])
```
Guest → Cart → "Pay All" → POST /api/guest/[token]/pay {items: [...]}
→ Resolves кожен item:
  - kind='simple' → service_orders
  - kind='slot' → service_orders + notes JSON (startHour, hours)
  - kind='breakfast' → booking_service_orders (per menu_item per date)
→ Single Teya session for total → redirect
→ Webhook: updates all linked orders → TG per order type
```

### 4. Widget checkout (sauna/tub через embed widget)
```
Widget → POST /api/booking/services {action:'book-slots'}
→ Creates service_time_slots + booking_service_orders
→ POST /api/booking/checkout-session → Teya
→ Webhook: same as above
```

---

## 🔔 Telegram нотифікації

Всі нотифікації йдуть через `sendTelegramMessage()` з `@/lib/channels/telegram-bot`.

| Подія | Функція | Чат |
|---|---|---|
| Оплата проживання | `sendBookingPaymentTG` | Admin chat |
| Замовлення послуги (guest page) | `sendGuestOrderTG` | Admin chat |
| Замовлення через віджет | `sendWidgetOrderTG` | Admin chat |
| Abandoned cart | В `cart.handlers.ts` | Admin chat |

### Формат TG для послуг

```
🛎 Нове замовлення послуги
👤 {guestName}
🏠 {unitName}
📅 {checkIn} — {checkOut}
📦 {serviceName} × {qty}
🕐 {startHour}:00–{endHour}:00     ← тільки для slot_booking!
🍽 {menuItemName} × {qty}           ← тільки для breakfast!
💰 {amount} CZK — ✅ Оплачено
```

---

## 📝 Реєстрація гостей

### 3 кроки:
1. **Контакти:** fullName*, email*, phone, dateOfBirth*
2. **Документ:** documentType*, documentNumber*, nationality*, address* + OCR scan
3. **Підтвердження:** таблиця введених даних → submit

### OCR Flow:
```
Camera → FileReader.readAsDataURL() → POST /api/guest/[token]/ocr
→ Full data URL → ocrDocument() → GPT-4o Vision
→ Returns: {fullName, firstName, lastName, dateOfBirth, documentNumber, documentType, nationality, address, confidence}
→ Auto-fills form fields
```

### Multi-guest:
Якщо `adults > 1`, форма повторюється для кожного гостя (`regCurrentGuest` 0-indexed).

---

## 🌐 Мови та автовизначення

| Мова | Код | Автодетект за телефоном |
|---|---|---|
| English | EN | Default / +44, +1 |
| Deutsch | DE | +49, +43 |
| Čeština | CS | +420, +421 |
| Українська | UK | +380 |
| Polski | PL | +48 |
| Nederlands | NL | +31 |
| Français | FR | +33, +32 |

---

## 🔧 Відомі паттерни та підводні камені

### 1. service_date ОБОВ'ЯЗКОВА
Всі INSERT-и повинні включати `service_date`. Fallback chain:
```
explicit_date || notes.service_date || reservation.check_in
```

### 2. Два типи time data
- `slot_booking` → час в `notes` JSON (`startHour`, `hours`)
- `menu_selection` → `menu_item_id` в `booking_service_orders`
- **Ніколи** не парси `notes` для breakfast — там може бути legacy сміття

### 3. service_type == 'slot_booking', НЕ 'slot'
В БД тип = `slot_booking`. Раніше був баг де перевіряли `=== 'slot'`.

### 4. Дві таблиці замовлень
Dashboard (`service-orders.handlers.ts`) UNION-ить обидві. Webhook оновлює обидві.

### 5. CSS ізольований
Всі стилі гостьової сторінки — в `guest-page.css` з префіксом `.gp-`. Не в `globals.css`.

### 6. Монолітна page.tsx
`page.tsx` = ~1780 рядків. Весь UI в одному файлі (поки що). Компоненти-виключення: `PaymentGateScreen.tsx`, `FarBeforeScreen.tsx`.

---

## 📋 Чеклист для змін

Перед тим як змінювати гостьовий модуль, перевір:

- [ ] Прочитай `page.tsx` — відповідну секцію (пошук за функцією/станом)
- [ ] Перевір `translations.ts` — чи є ключ перекладу для нового тексту
- [ ] Перевір `guest-page.css` — чи є стиль для нового елементу
- [ ] Якщо торкаєшся оплат — перевір `pay.handlers.ts` + `webhook-teya.handlers.ts`
- [ ] Якщо торкаєшся послуг — перевір ОБ'ДВІ таблиці (`service_orders` + `booking_service_orders`)
- [ ] Комміт на `main` → auto-deploy через GitHub Actions
- [ ] Логи: `ssh root@46.225.132.220 "journalctl -u alisio-pms --since '30 min ago' --no-pager"`

---

## 🔑 Швидкі команди

```bash
# Подивитися логи сервера
ssh root@46.225.132.220 "journalctl -u alisio-pms --since '1 hour ago' --no-pager | tail -50"

# Запустити діагностичний скрипт на сервері
scp tmp_query.js root@46.225.132.220:/tmp/q.js
ssh root@46.225.132.220 "cd /root/projects/alisio-pms && node /tmp/q.js"

# Перевірити статус деплою
gh run list --repo oleshka07/ALiSiO-Hotel-PMS -L 3 -w "Deploy ALiSiO PMS"

# SQL запит до БД
ssh root@46.225.132.220 "cd /root/projects/alisio-pms && sqlite3 data/alisio.db 'SELECT ...'"

# Push на main з авторизацією
$auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("oleshka07: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"))
git -c "http.extraHeader=Authorization: Basic $auth" push origin main
```
