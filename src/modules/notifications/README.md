# Notifications Module

> ⚠️ **Структурно зламаний модуль** — потребує реструктуризації. Щоденний Telegram-дайджест: вечірнє зведення по CRM (нові повідомлення, без відповіді), Finance (доходи/витрати по методах оплати), Bookings (заїзди/виїзди, завантаженість), Tasks (прострочені, на сьогодні).

## Публічне API

> ⚠️ **`api/index.ts` відсутній** — модуль не має публічного API. Аліас `@notifications` в tsconfig вказує на неіснуючий `api/` каталог.

Наразі єдина точка входу — пряме використання функції з `data/daily-digest.ts`:

```ts
// ⚠️ Неправильний імпорт — порушення архітектури модулів
import { sendDailyOperationalDigest } from '@/modules/notifications/data/daily-digest'
```

### Експортовані функції (з `data/daily-digest.ts`)

| Функція | Опис |
|---|---|
| `sendDailyOperationalDigest()` | Головна точка входу — збирає дані з 4 джерел та надсилає 2 повідомлення в Telegram |

Внутрішні функції (не експортуються, але формують дайджест):

| Функція | Опис |
|---|---|
| `getCrmDigest()` | Зведення CRM: нові повідомлення, без відповіді (до 20), AI-чернетки |
| `getFinanceDigest()` | Фінанси: готівка/картка/банк/онлайн, витрати, порівняння з учора |
| `getBookingsDigest()` | Бронювання: заїзди/виїзди (з категоріями), завантаженість, джерела |
| `getTasksSummary()` | Задачі: прострочені, на сьогодні, в роботі, всього активних |
| `getDetailedBreakdown()` | Розбивка по бізнес-юнітах: заїзди, готівка/картка, витрати |

## Залежності

**Модулі** (через публічний API):
- `@core/db` — підключення до БД (getDb) ✅ правильний імпорт

**Зовнішні сервіси**:
- Telegram Bot API (`https://api.telegram.org/bot{TOKEN}/sendMessage`) — надсилання повідомлень

**Змінні оточення**:
- `TELEGRAM_BOT_TOKEN` — токен бота
- `TELEGRAM_CHAT_ID` — основний чат для дайджесту
- `TELEGRAM_ADMIN_CHAT_IDS` — додаткові чати адміністраторів (через кому)
- `NEXTAUTH_URL` — базовий URL для посилань у повідомленнях

> Модуль **читає напряму з таблиць інших модулів** (CRM, Finance, Bookings, Tasks) — порушення кордонів, але виправлення потребує створення публічних API-функцій агрегації в кожному модулі.

## Події

Модуль **не має каталогу `events/`** — не емітить і не слухає подій.

## Схема даних

**Таблиці (читає, не змінює):**

| Джерело | Таблиці |
|---|---|
| CRM | `crm_leads`, `crm_conversations`, `crm_messages`, `crm_auto_drafts` |
| Finance | `fin_operations` |
| Bookings | `reservations`, `units`, `categories`, `guests` |
| Tasks | `tasks`, `task_projects` |
| System | `business_units` |

## Структура файлів

```
notifications/
  data/
    daily-digest.ts       ← 754 рядки — весь модуль в одному файлі
                             CRM/Finance/Bookings/Tasks збір даних,
                             форматування HTML, відправка в Telegram
  README.md               ← цей файл
```

> ⚠️ **Відсутні каталоги (потрібно створити):**
> - `api/index.ts` — **критично** — потрібно створити з `sendDailyOperationalDigest` експортом, щоб аліас `@notifications` працював
> - `events/` — варто додати `published.ts` з подією `notification.digest_sent`
> - `domain/types.ts` — типи `CrmDigest`, `FinanceDigest`, `BookingsDigest`, `TasksSummary` вже визначені в файлі, треба винести
> - `__tests__/` — TODO: додати тести

## Точки розширення

- **🔴 Реструктуризація (пріоритет):**
  1. Створити `api/index.ts` з експортом `sendDailyOperationalDigest`
  2. Винести типи в `domain/types.ts`
  3. Розбити `daily-digest.ts` на окремі збирачі: `data/crm-digest.ts`, `data/finance-digest.ts`, `data/bookings-digest.ts`, `data/tasks-digest.ts`
  4. Замінити прямі SQL-запити до таблиць інших модулів на виклики їхніх публічних API
- Новий канал нотифікацій (email, push) → `data/[channel].ts` + стратегія в `domain/`
- Новий тип дайджесту (тижневий, по об'єкту) → `data/[type]-digest.ts`
- Підключити до шини подій → слухати `booking.checked_in`, `crm.message_received`, тощо

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
