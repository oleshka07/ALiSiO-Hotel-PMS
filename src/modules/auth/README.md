# Auth Module

> Автентифікація (login/logout/session) та CRUD для користувачів системи.

## Публічне API

Всі публічні функції та типи знаходяться в `api/index.ts`. Імпортуй тільки звідти:

```ts
import { login, logout, getMe, listUsers, createUser, getUser, updateUser, deleteUser } from '@auth'
```

| Функція / Тип | Опис |
|---|---|
| `login(request)` | Вхід за email + пароль, створення сесії, встановлення cookie (rate-limited: 5 спроб / 15 хв) |
| `logout()` | Видалення сесії та очищення cookie |
| `getMe()` | Отримання поточного авторизованого користувача за session cookie |
| `listUsers()` | Список всіх користувачів організації з permissions (потребує `manage_users`) |
| `createUser(request)` | Створення нового користувача з хешуванням пароля та permission overrides |
| `getUser(request, { params })` | Отримання одного користувача за ID з permission overrides |
| `updateUser(request, { params })` | Оновлення даних користувача (профіль, роль, пароль, permissions) |
| `deleteUser(request, { params })` | Видалення користувача, його сесій та permissions |

## Залежності

**Модулі** (через публічний API):
- `@core/db` — підключення до БД (`getDb`)
- `@core/auth` — `verifyPassword`, `hashPassword`, `createSession`, `deleteSession`, `getSessionUser`

**Legacy** (потребують міграції):
- `@/lib/permissions` — `getUserPermissions`, типи `Permission`, `PermissionOverride` (TODO: перенести в `@core/permissions` або `domain/`)

> [!NOTE]
> `@core/auth` — це shim-обгортка навколо legacy `@/lib/auth`. Потребує поступової міграції логіки в domain-шар модуля.

## Події

**Емітить** (`events/published.ts`):
| Подія | Payload | Коли |
|---|---|---|
| `UserLoggedInEvent` | `{ userId: string; email: string }` | Після успішного входу (визначено, ще не підключено) |
| `UserCreatedEvent` | `{ userId: string; role: string; organizationId: string }` | Після створення користувача (визначено, ще не підключено) |
| `UserDeletedEvent` | `{ userId: string }` | Після видалення користувача (визначено, ще не підключено) |

**Слухає:**
Не слухає подій інших модулів.

> [!WARNING]
> Усі три події визначені в типах, але жодна не емітиться — потрібно підключити до `event-bus` у відповідних хендлерах (`login`, `createUser`, `deleteUser`).

## Схема даних

**Таблиці:** `app_users`, `sessions`, `user_permissions`

```sql
-- Користувачі системи
-- app_users (id, organization_id, email, full_name, phone, telegram_chat_id,
--            role, password_hash, is_active, default_cash_account_id,
--            last_login, created_at, updated_at)

-- Сесії авторизації
-- sessions (user_id, ...)

-- Переозначення прав доступу
-- user_permissions (user_id, permission, granted)
```

## Структура файлів

```
auth/
  api/
    index.ts              ← єдина точка експорту
    login.handlers.ts     ← вхід + rate limiter (in-memory)
    logout.handlers.ts    ← вихід + очищення сесії
    me.handlers.ts        ← поточний користувач
    users.handlers.ts     ← список + створення користувачів
    user.handlers.ts      ← get/update/delete одного користувача
  events/
    published.ts          ← UserLoggedInEvent, UserCreatedEvent, UserDeletedEvent (визначено, не підключено)
  README.md               ← цей файл
```

> [!NOTE]
> Мінімальний модуль — тільки `api/` та `events/`. Відсутність `domain/`, `data/`, `ui/` — свідомий вибір на етапі міграції з monolith. Бізнес-логіка поки що вбудована в хендлери.

## Точки розширення

- Підключити емісію подій → додати `emit()` виклики в `login.handlers.ts`, `users.handlers.ts`, `user.handlers.ts`
- Виділити domain-шар → перенести SQL та валідацію з хендлерів у `domain/` та `data/`
- Перенести `@/lib/permissions` → створити `domain/permissions.ts` або `@core/permissions`
- Додати двофакторну автентифікацію → розширити `login.handlers.ts` + новий `domain/two-factor.ts`

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
