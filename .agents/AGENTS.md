# ALiSiO PMS — Agent Rules

## Модульна архітектура

### Правило: Імпорти тільки через публічний API
Завжди імпортуй з `@modulename` (api/index.ts), ніколи з внутрішніх шляхів модуля.

```ts
// ✅ ПРАВИЛЬНО
import { createBooking } from '@bookings'
import { getDb } from '@core/db'

// ❌ ЗАБОРОНЕНО
import { BookingRepo } from '@/modules/bookings/data/booking.repo'
import { Booking } from '@/modules/bookings/domain/booking'
```

### Правило: README обов'язковий
При створенні нового модуля або значній зміні існуючого — оновлюй його `README.md`.
Шаблон: `docs/_templates/MODULE_README.md`. Мова: українська.

README повинен містити: призначення, публічне API (таблиця), залежності, події (emit/subscribe), схема даних, структура файлів, точки розширення.

### Правило: Уникай нових legacy imports
Не додавай нових імпортів з `@/lib/`. Використовуй:
- `@core/db` замість `@/lib/db`
- `@core/auth` замість `@/lib/auth`
- `@core/event-bus` для подій

Якщо legacy import неминучий — додай коментар:
```ts
import { something } from '@/lib/some-module' // TODO: migrate to @core/
```

## Безпека деплою

- НІКОЛИ не пушити напряму в `main` — auto-deploy на production VPS
- Перед пушем: `npx tsc --noEmit` + `npm run build`
- Виправляй синтаксичні помилки ДО коміту
