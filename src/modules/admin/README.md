# Admin Module

> Адміністративні утиліти — очистка дублікатів iCal-бронювань та масовий переклад контенту.

## Публічне API

Всі публічні функції та типи знаходяться в `api/index.ts`. Імпортуй тільки звідти:

```ts
import { previewIcalCleanup, deleteIcalCleanup, translateAll } from '@admin'
```

| Функція / Тип | Опис |
|---|---|
| `previewIcalCleanup()` | Попередній перегляд iCal-бронювань для видалення (GET) |
| `deleteIcalCleanup(request)` | Видалення дублікатів iCal-бронювань, платежів та гостей (DELETE, потребує `?confirm=yes`) |
| `translateAll(request)` | Масовий переклад усього контенту (POST, опціонально `{ force: true }`) |

## Залежності

**Модулі** (через публічний API):
- `@core/db` — підключення до БД (`getDb`)

**Legacy** (потребують міграції):
- `@/lib/translate` — `retranslateAll` (TODO: перенести в `@core/translate`)

> [!NOTE]
> Модуль не залежить від жодного іншого бізнес-модуля — працює напряму з БД.

## Події

**Емітить** (`events/published.ts`):
| Подія | Payload | Коли |
|---|---|---|
| `IcalCleanupExecutedEvent` | `{ deletedReservations: number; deletedGuests: number }` | Після видалення iCal-дублікатів (визначено, ще не підключено) |

**Слухає:**
Не слухає подій інших модулів.

> [!WARNING]
> Подія `IcalCleanupExecutedEvent` визначена в типах, але ніде не емітиться — потрібно підключити до `event-bus` у хендлері `deleteIcalCleanup`.

## Схема даних

Модуль не має власних таблиць. Працює напряму з таблицями інших модулів:

- `reservations` — пошук та видалення iCal-бронювань (`r_ical_%`, `ical_%`)
- `guests` — видалення гостей, пов'язаних виключно з iCal-бронюваннями (`g_ical_%`)
- `fin_operations` — видалення платежів за iCal-бронюваннями
- `bank_transactions` — очищення зв'язків з фінансовими операціями

## Структура файлів

```
admin/
  api/
    index.ts                    ← єдина точка експорту
    cleanup-ical.handlers.ts    ← preview + delete iCal-дублікатів
    translate-all.handlers.ts   ← масовий переклад контенту
  events/
    published.ts                ← IcalCleanupExecutedEvent (визначено, не підключено)
  README.md                     ← цей файл
```

> [!NOTE]
> Мінімальний модуль — тільки `api/` та `events/`. Відсутність `domain/`, `data/`, `ui/` — свідомий вибір: це утиліти адміністратора, а не бізнес-домен.

## Точки розширення

- Підключити емісію `IcalCleanupExecutedEvent` → додати `emit()` у `cleanup-ical.handlers.ts` після транзакції
- Додати нову адмін-утиліту → створити `api/[name].handlers.ts` + реекспортувати через `api/index.ts`
- Перенести `@/lib/translate` → створити `@core/translate` та оновити імпорт

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
