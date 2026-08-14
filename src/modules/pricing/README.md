# Pricing Module

Управління цінами: щоденний прайс-календар, bulk-оновлення, розрахунок вартості проживання.

Тут же живе **rate card** — правила, за якими віджет рахує ціну кемпінгу, глемпінгу
та будівель: сезони, свята, ставки за одиницю обладнання, курортний збір, депозит.

## Публічне API

```ts
import { getPricing, updatePricing, getBulkPricing, updateBulkPricing, getQuote } from '@pricing'
import { calcCampingPrice, calcGlampingPrice, calcBuildingPrice, CAMPING_ITEMS } from '@pricing'
import type { DayPrice, QuoteResult, PriceUpsertInput, PriceItem } from '@pricing'
```

| Функція | Опис |
|---|---|
| `getPricing(req)` | Місячний прайс-календар для unit type (GET /api/pricing) |
| `updatePricing(req)` | Upsert цін по конкретних датах (PUT /api/pricing) |
| `getBulkPricing(req)` | Ціни за діапазон дат для всіх unit types (GET /api/pricing/bulk) |
| `updateBulkPricing(req)` | Bulk-оновлення з фільтром weekdays/weekends (PUT /api/pricing/bulk) |
| `getQuote(req)` | Розрахунок вартості проживання з fees (POST /api/pricing/quote) |
| `calcCampingPrice(...)` | Ціна кемпінгу: обладнання + особи + електрика + тварини + збір |
| `calcGlampingPrice(...)` | Ціна glamping-одиниці (tiny / barn) |
| `calcBuildingPrice(...)` | Ціна будівлі (shared / non-shared / викуп) |
| `CAMPING_ITEMS` | Перелік одиниць кемпінгу (намет, авто, караван…) для чекбоксів |
| `getSeason`, `getNightDates`, `getRate`, `isHoliday` | Допоміжні функції rate card |

Функції rate card **чисті** — база не читається всередині. Прайс-лист передає
викликач: у браузері з `/api/widget/prices`, на сервері прямо з `widget_price_list`.

> Віджет (`src/app/book/lib/pricing.ts`) імпортує `domain/rate-card` напряму, а не
> через `@pricing`: барель тягне за собою route-handlers, а з ними better-sqlite3,
> якому в браузерному бандлі не місце.

## Залежності

- `@core/db` — SQLite
- `@/lib/channels/sync-queue` — тимчасовий прямий виклик ARI sync після оновлення цін (буде замінено на `eventBus.emit` після міграції channels)

## Події

**Може емітити** (не підключено):
- `pricing.updated` — після оновлення цін, channels підписується для ARI sync

## Схема даних

**Таблиці:** `price_calendar`, `fees_taxes`, `rate_plans`, `rate_plan_unit_types`, `occupancy_rules`, `child_pricing_rules`, `restrictions`, `promotions`

**Головна таблиця:** `price_calendar` — унікальний запис per `(unit_type_id, date)`.

## Структура файлів

```
pricing/
  api/
    index.ts              ← єдина точка імпорту (@pricing)
    pricing.handlers.ts   ← GET/PUT /api/pricing
    bulk.handlers.ts      ← GET/PUT /api/pricing/bulk
    quote.handlers.ts     ← POST /api/pricing/quote
  data/
    price-calendar.repo.ts ← SQL для price_calendar (read, upsert, bulk)
    quote.repo.ts          ← розрахунок quote + fees/taxes
  domain/
    types.ts              ← DayPrice, QuoteResult, PriceUpsertInput та re-exports
    rate-card.ts          ← сезони, свята, calcCamping/Glamping/BuildingPrice (чисті функції)
  events/
    published.ts          ← PricingUpdatedEvent type
  README.md
```

## Точки розширення

- Нова логіка ціноутворення → `data/price-calendar.repo.ts`
- Новий тип fees → `data/quote.repo.ts` (switch case)
- ARI sync → замінити `import('@/lib/channels/sync-queue')` на `eventBus.emit('pricing.updated')`
