# Технічний аудит системи збору та відображення аналітики сайтів
**URL сторінки:** `/sites/all?tab=analytics`  
**Дата проведення:** 02 серпня 2026 р.  
**Статус:** Виявлено 2 критичні баги, 2 високого рівня та 3 середнього рівня.

---

## 📋 Короткий зміст (Executive Summary)

Проведено комплексний технічний аудит підсиленого модуля аналітики сайтів (`src/app/(dashboard)/sites/[siteId]/_components/AnalyticsTab.tsx` та `src/modules/bookings/api/site-analytics.handlers.ts`). 

У ході аналізу системи збору даних (`widget_events`, `reservations`, `site_incoming_leads`) та алгоритмів агрегації було виявлено серйозні технічні дефекти, які спричиняють **спотворення ключових бізнес-метричних показників (KPI)** (сесії, конверсія %, дохід, джерела трафіку, воронка конверсії), а в деяких випадках призводять до помилок SQL-запитів при перегляді загальної статистики (`siteId = 'all'`).

---

## 🚨 Критичні виявлені дефекти (Critical & High Severity)

### 1. 🔴 [CRITICAL] Помилка форматування дат в утиліті `getSessionsCount()`
- **Локація:** `src/modules/bookings/api/site-analytics.handlers.ts` (рядки 61 та 65)
- **Опис проблеми:**
  У функції `getSessionsCount(db, siteId, from, to)` значення аргументів `from` та `to` (наприклад, `'2026-08-01'`, `'2026-08-02'`) ігноруються, а в SQL-запит підставляються статичні рядкові константи `` `T00:00:00Z` `` та `` `T23:59:59Z` ``:
  ```typescript
  // НЕКОРЕКТНИЙ КОД:
  const sql = `SELECT COUNT(DISTINCT session_id) as count FROM widget_events WHERE site_id = ? AND created_at >= ? AND created_at <= ?`;
  const row = db.prepare(sql).get(siteId, `T00:00:00Z`, `T23:59:59Z`);
  ```
- **Вплив:** 
  Рядкове порівняння дати `created_at` (наприклад, `'2026-08-02T12:00:00Z'`) з константою `'T00:00:00Z'` повертає 0 або некоректну кількість сесій. Через це показник **Відвідуваність сайту (Сесії)** та **Конверсія %** на картках Загального огляду некоректні або дорівнюють нулю.
- **Необхідна виправка:**
  ```typescript
  const fromTime = `${from}T00:00:00Z`;
  const toTime = `${to}T23:59:59Z`;
  const row = db.prepare(sql).get(siteId, fromTime, toTime);
  ```

---

### 2. 🔴 [CRITICAL] Невідповідність параметрів у SQL-запитах Географії (`getAnalyticsGeo`)
- **Локація:** `src/modules/bookings/api/site-analytics.handlers.ts` (рядки 293 та 350)
- **Опис проблеми:**
  Для вибірки бронювань за мовами та країнами використовується функція `getSourceFilter(siteId, propertyId)`. Коли `siteId === 'all'`, дана функція повертає умова SQL `'1=1'` (без знаків `?`).
  Проте у функції `getAnalyticsGeo` масив параметрів захардкоджений як `[source, 'widget']`:
  ```typescript
  let langBookingsSql = `
    SELECT booking_lang as lang, ... FROM reservations
    WHERE ${getSourceFilter(siteId, propertyId)} AND status != 'cancelled' ...
  `;
  const langParams = [source, 'widget']; // <--- ПЕРЕДАЄТЬСЯ 2 ПАРАМЕТРИ
  const langBookings = db.prepare(langBookingsSql).all(...langParams);
  ```
- **Вплив:**
  При запиті `/api/booking-sites/all/analytics/geo` у SQL-запиті відсутні плейсхолдери `?`, але передаються 2 параметри. Це викликає помилку виконання SQLite або зсув аргументів при додаванні фільтрації за датами.
- **Необхідна виправка:**
  Використовувати уніфікований генератор параметрів `getSourceParams(siteId, propertyId)`.

---

### 3. 🟠 [HIGH] Поломка воронки лідів (`site_incoming_leads`) для `siteId = 'all'`
- **Локація:** `src/modules/bookings/api/site-analytics.handlers.ts` (рядок 703)
- **Опис проблеми:**
  Запит до таблиці захардкоджений на явне співпадіння `site_id = ?`:
  ```typescript
  const leadsSql = `
    SELECT id, email, phone, status 
    FROM site_incoming_leads 
    WHERE site_id = ? AND created_at >= ? AND created_at <= ?
  `;
  db.prepare(leadsSql).all(siteId, ...);
  ```
  Коли `siteId === 'all'`, виконання вибирає записи `WHERE site_id = 'all'`, які відсутні в БД.
- **Вплив:** 
  На загальній аналітиці всіх сайтів (`/sites/all?tab=analytics`) воронка "Форми зворотного зв'язку" завжди показує 0 заповнених форм та лідів.
- **Необхідна виправка:**
  Додати перевірку `siteId === 'all' ? '1=1' : 'site_id = ?'`.

---

### 4. 🟠 [HIGH] Некоректне сумування мультивалютних бронювань в SQL
- **Локація:** `src/modules/bookings/api/site-analytics.handlers.ts` (всі підсистеми: overview, traffic, geo, listings, campaigns)
- **Опис проблеми:**
  У SQL-запитах використовується сумування вихідних цін `SUM(total_price - commission_amount)`. Якщо в системі є бронювання, здійснені в EUR або USD, їх номінальне значення додається до суми в CZK без попередньої конверсії за курсом валюти на момент бронювання.
  Далі в компоненті `AnalyticsTab.tsx` отримане значення ділиться на фіксований курс `exchangeRates[currency]`.
- **Вплив:** 
  Якщо сайт має бронювання на €100 EUR, в БД зберігається 100. При виборі EUR в інтерфейсі фронтенд ділить 100 на 23.5, відображаючи €4.25 замість €100.

---

## 🟡 Середні дефекти та особливості обробки даних (Medium Severity)

### 5. 🟡 Логічний конфлікт при фільтрації за `date_type = 'check_in'`
- **Опис:** 
  При виборі режиму "За датою заїзду" (`check_in`) аналітика бронювань фільтрується за датами проживання гостей, а аналітика сесій `widget_events` — за датою створення запису `created_at`.
- **Вплив:**
  Оскільки відвідування сайту відбувається за тижні/місяці до дати заїзду, розрахунок `Конверсія % = (Бронювання / Сесії) * 100` у даному режимі дає математично викривлені результати (наприклад, >500% конверсії).

### 6. 🟡 Захардкоджені курси валют на фронтенді
- **Локація:** `src/app/(dashboard)/sites/[siteId]/_components/AnalyticsTab.tsx` (рядки 57-61)
- **Опис:** Курси `EUR: 23.5`, `USD: 22.0` зафіксовані в коді константами та не синхронізуються з валютним модулем PMS.

### 7. 🟡 Відсутність подій `page_view` від зовнішніх сайтів
- **Опис:** 
  У `useBookingWidget.ts` надсилаються лише події `widget_opened` та `widget_step_X`. Перший крок воронки ("Відвідування сайту") розраховується на основі `page_view`. Якщо на зовнішньому сайті готелю не встановлено `embed.v2.js` з авто-трекінгом перегляду сторінок, 1-й крок воронки показує 0.

---

## 🛠️ План рефакторингу та виправлення (Action Plan)

| Етап | Крок | Опис завдання | Файли |
|---|---|---|---|
| **Phase 1** | **Fix Critical Bugs** | 1. Виправити формування ISO-дат у `getSessionsCount`.<br>2. Перевести `getAnalyticsGeo` на `getSourceParams`.<br>3. Додати підтримку `siteId === 'all'` у запити `site_incoming_leads`. | `site-analytics.handlers.ts` |
| **Phase 2** | **Currency Normalization** | Зберігати або конвертувати `total_price` у базову валюту (CZK) під час збереження/вибірки бронювань або агрегувати з урахуванням `reservations.currency`. | `site-analytics.handlers.ts`<br>`AnalyticsTab.tsx` |
| **Phase 3** | **Funnel & Tracking Sync** | 1. Обробляти випадки `date_type === 'check_in'`, показуючи коректні підказки щодо сесій.<br>2. Переконатися, що віджет/embed скрипт коректно передає `page_view` при завантаженні сторінки готелю. | `useBookingWidget.ts`<br>`embed.v2.js` |
| **Phase 4** | **Dashboard Unification** | Об'єднати візуальні компоненти та структуру даних аналітики сайтів із загальною консоллю аналітики каналів (SMM / Telegram / Web). | `AnalyticsTab.tsx`<br>`Analytics.tsx` |

---
*Документ збережено у файлі: `docs/SITE_ANALYTICS_AUDIT.md`*
