# Bookings Module

Управляє бронюваннями (резерваціями), гостьовими реєстраціями, груповими бронюваннями, джерелами бронювань, додатковими послугами та публічними ендпоінтами для віджету.

## Публічне API

```ts
import { listReservations, createReservation, type Reservation } from '@bookings'
```

| Функція / Тип | Опис |
|---|---|
| `listReservations()` | Список усіх бронювань |
| `createReservation(req)` | Створення нового бронювання |
| `getReservation(req, ctx)` | Отримання бронювання за ID |
| `updateReservation(req, ctx)` | Оновлення бронювання |
| `deleteReservation(req, ctx)` | Видалення бронювання |
| `listActivity(req, ctx)` | Активність/нотатки до бронювання |
| `createActivity(req, ctx)` | Додати нотатку |
| `listRegistrations(req, ctx)` | Список зареєстрованих гостей |
| `registerGuest(req, ctx)` | Реєстрація гостя |
| `removeRegistration(req, ctx)` | Видалення реєстрації |
| `listGroupBookings()` | Список групових бронювань |
| `createGroupBooking(req)` | Створення групового бронювання |
| `getGroupBooking(req, ctx)` | Отримання групового бронювання |
| `updateGroupBooking(req, ctx)` | Оновлення групового бронювання |
| `deleteGroupBooking(req, ctx)` | Видалення групового бронювання |
| `assignGuest(req, ctx)` | Призначення гостя до групи |
| `listBookingSources()` | Список джерел бронювань |
| `createBookingSource(req)` | Створення джерела |
| `updateBookingSource(req, ctx)` | Оновлення джерела |
| `deleteBookingSource(req, ctx)` | Видалення джерела |
| `listWidgetSiteSources()` | Активні `booking_sites` як pseudo-sources для CRM форми (code = `widget:<siteId>`) |
| `listAdditionalServices()` | Список додаткових послуг |
| `createAdditionalService(req)` | Створення послуги |
| `updateAdditionalService(req)` | Оновлення послуги |
| `deleteAdditionalService(req)` | Видалення послуги |
| `listAvailabilityBlocks()` | Список блокувань доступності |
| `deleteAvailabilityBlock(req)` | Видалення блокування |
| `listServiceOrders(req)` | Замовлення послуг (PMS + гостьова сторінка) |
| `updateServiceOrder(req)` | Зміна статусу замовлення (complete/cancel/reopen) |
| `getAvailability(req)` | Доступність для віджету; підтримує `siteId` або `siteSlug` для фільтрації за сайтом |
| `getAvailabilityOptions()` | CORS preflight |
| `validatePromo(req)` | Перевірка промокоду |
| `validatePromoOptions()` | CORS preflight |
| `getWidgetReservation(req)` | Отримання бронювання через віджет |
| `getWidgetReservationOptions()` | CORS preflight |
| `createWidgetReservation(req)` | Створення бронювання через віджет |
| `createWidgetReservationOptions()` | CORS preflight |
| `createWidgetCheckoutSession(req)` | Stripe Checkout для віджету |
| `createCheckoutSessionOptions()` | CORS preflight |
| `handlePaymentReturn(req)` | Обробка повернення після оплати |
| `getWidgetServices(req)` | Послуги для гостьової сторінки |
| `bookWidgetService(req)` | Замовлення послуги через віджет |
| `getWidgetServicesOptions()` | CORS preflight |
| `getWidgetCalendar(req)` | Календар доступності (публічний); підтримує `siteSlug`, `siteId`, `unitId`, `propertyId` |
| `getWidgetCalendarOptions()` | CORS preflight |
| `trackWidgetEvent(req)` | Збереження події трекінгу віджета/сайту |
| `trackWidgetEventOptions()` | CORS preflight |
| `getAnalyticsOverview(req, ctx)` | Аналітичний огляд (KPI + порівняння періодів) |
| `getAnalyticsTraffic(req, ctx)` | Аналітика джерел трафіку (UTM sources) |
| `getAnalyticsGeo(req, ctx)` | Географічна аналітика (мови та країни) |
| `getAnalyticsListings(req, ctx)` | Аналітика за типами розміщення та категоріями |
| `getAnalyticsCampaigns(req, ctx)` | Детальна аналітика UTM кампаній |
| `getAnalyticsFunnel(req, ctx)` | Воронка конверсій (відвідування -> оплата) |

## Залежності

**Модулі** (через публічний API):
- `@core/db` — підключення до БД
- `@core/auth` — перевірка сесії

**Зовнішні lib** (TODO: мігрувати):
- `@/lib/auth` — getSessionUser (через @core/auth)

## Події

**Емітить** (`events/published.ts`):
| Подія | Payload | Коли |
|---|---|---|
| `reservation.created` | `{ reservationId, guestId, unitId }` | Нове бронювання |
| `reservation.cancelled` | `{ reservationId }` | Скасування |
| `reservation.updated` | `{ reservationId }` | Оновлення даних |

## Схема даних

**Таблиці:** `reservations`, `reservation_activity`, `reservation_registrations`, `group_bookings`, `group_booking_guests`, `booking_sources`, `additional_services`, `availability_blocks`, `service_orders`, `booking_service_orders`, `booking_sites`, `site_listings`, `widget_events`

**Нові поля reservations:**
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` — UTM-параметри
- `booking_lang` — мова бронювання
- `country_code` — країна гостя (cf-ipcountry)
- `widget_session_id` — унікальний ID сесії віджета

**Таблиця widget_events:**
- `id` — первинний ключ
- `site_id` — ID партнерського сайту
- `session_id` — ID сесії відвідувача
- `event_type` — тип події (`page_view`, `widget_opened`, `widget_step_1..5`, `abandon`, `complete`)
- `page` — відносна адреса сторінки (наприклад, `/`, `/booking`)
- `utm_source`, `utm_medium`, `utm_campaign` — мітки
- `lang` — мова
- `created_at` — дата та час події

## Структура файлів

```
bookings/
  api/
    index.ts                          ← єдина точка експорту
    reservations.handlers.ts
    reservation.handlers.ts
    reservation-activity.handlers.ts
    reservation-registrations.handlers.ts
    group-bookings.handlers.ts
    group-booking.handlers.ts
    group-booking-assign.handlers.ts
    booking-sources.handlers.ts
    booking-source.handlers.ts
    booking-source-widgets.handlers.ts    ← GET /api/booking-sources/widget-sites
    additional-services.handlers.ts
    availability-blocks.handlers.ts
    service-orders.handlers.ts
    widget-availability.handlers.ts
    widget-promo.handlers.ts
    widget-reservation.handlers.ts
    widget-reserve.handlers.ts
    widget-checkout.handlers.ts
    widget-payment-return.handlers.ts
    widget-services.handlers.ts
    widget-calendar-public.handlers.ts
    widget-site.handlers.ts
    widget-event.handlers.ts             ← трекінг подій віджета
    site-analytics.handlers.ts           ← розрахунок аналітики
  ui/
    BookingV2.tsx                       ← embed iframe widget component
    booking-v2.css                      ← widget styles + themes
    translations.ts                     ← uk/en/cs/de i18n strings
  domain/
    types.ts
  events/
    published.ts
```

## Точки розширення

- Нова дія над бронюванням → новий handler у `api/`, додати до `index.ts`
- Новий тип послуги → розширити `additional_services` та `service-orders.handlers.ts`
- Нова подія → `events/published.ts` + `src/core/event-bus/registry.ts`

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
