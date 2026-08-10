# Reports Module

> Звіти: загальний звіт по бронюванням, глемпінг-звіт по окремих юнітах, міський податок (city tax) — read-only агрегації. Плюс публікація партнерських звітів: готовий HTML лежить у таблиці й віддається за токеном без сесії.

## Публічне API

Всі публічні функції знаходяться в `api/index.ts`. Імпортуй тільки звідти:

```ts
import { getReport, getGlampingReport, getCityTaxReport } from '@reports'
```

| Функція / Тип | Опис |
|---|---|
| `getReport(request)` | Загальний звіт за період: бронювання, дохід, завантаженість, комісії, оплати по методах |
| `getGlampingReport(request)` | Глемпінг-звіт: зайнятість та дохід по 6 глемпінг-юнітах (Mr1, Mr2, St1–St4) |
| `getCityTaxReport(request)` | Звіт міського податку за місяць: суми, оплачено/очікується, розбивка по джерелах |
| `getPublicPartnerReport(request, ctx)` | `GET /report/[token]` — віддає HTML партнерського звіту. **Без сесії**, лише за токеном; лічить перегляди |
| `listPartnerReports(request)` | `GET /api/reports/partner` — список опублікованих звітів (сесія) |
| `createPartnerReport(request)` | `POST /api/reports/partner` — публікує HTML, повертає токен і посилання (сесія) |
| `updatePartnerReport(request, ctx)` | `PUT /api/reports/partner/[id]` — замінити вміст, зняти з публікації (`is_published`), перевидати токен (`rotate_token`) |
| `deletePartnerReport(request, ctx)` | `DELETE /api/reports/partner/[id]` |

## Залежності

**Модулі** (через публічний API):
- `@core/db` — підключення до БД (getDb)

**Shared**:
- `next/server` — NextRequest, NextResponse для HTTP-обгорток

> `/report/` внесений у `PUBLIC_PREFIXES` у `src/proxy.ts` — інакше гейт сесій не пустив би партнера до звіту.

> Модуль **не залежить від інших бізнес-модулів** — читає безпосередньо з таблиць `reservations`, `units`, `categories`, `guests`, `fin_operations`.

## Події

**Емітить** (`events/published.ts`):

Явно порожній тип — модуль read-only, подій не генерує:
```ts
export type ReportEvents = Record<string, never>;
```

**Слухає:**

Не слухає подій інших модулів. Каталог `events/subscribed.ts` відсутній.

## Схема даних

**Таблиці (читає, не змінює):** `reservations`, `units`, `categories`, `guests`, `fin_operations`

**Таблиця (читає і змінює):** `partner_reports` — `token` (64 hex), `title`, `period`, `html`, `is_published`, `view_count`, `last_viewed_at`. HTML лежить у рядку, а не файлом: переживає деплой і не потребує каталогу завантажень.

Основні запити:
- `getReport` — агрегація бронювань за період + оплати з `fin_operations` + розрахунок завантаженості (unit-days)
- `getGlampingReport` — по-юнітно: зайнятість (день за днем), кількість бронювань, дохід
- `getCityTaxReport` — бронювання за місяць з полями `city_tax_amount`, `city_tax_paid`, `city_tax_included`

## Структура файлів

```
reports/
  api/
    index.ts              ← єдина точка експорту
    reports.handlers.ts   ← getReport, getGlampingReport — загальний та глемпінг-звіти
    city-tax.handlers.ts  ← getCityTaxReport — звіт міського податку
    partner-reports.handlers.ts ← публікація партнерських звітів за токеном
  events/
    published.ts          ← ReportEvents = Record<string, never> (явно порожній)
  README.md               ← цей файл
```

> **Відсутні каталоги** (свідомо — read-only модуль):
> - `domain/` — немає власних бізнес-типів (використовуються raw SQL-результати)
> - `data/` — SQL-запити живуть безпосередньо в handlers (допустимо для read-only)
> - `ui/` — UI реалізовано на стороні фронтенду через HTTP API
> - `events/subscribed.ts` — не слухає подій
> - `__tests__/` — TODO: додати тести

## Точки розширення

- Новий звіт → `api/[report].handlers.ts` + додати експорт в `api/index.ts`
- Типізувати відповіді → створити `domain/types.ts` з інтерфейсами `ReportSummary`, `GlampingReport`, `CityTaxReport`
- Винести SQL → `data/reports.repo.ts` для кращого розділення відповідальності
- Кешування звітів → додати in-memory cache з TTL для важких запитів завантаженості
- Партнерський звіт із даними з ПМС → генерувати HTML із шаблону, підставляючи цифри з `getPnl2` / `getPnlMatrix`, замість завантаження готового файлу

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
