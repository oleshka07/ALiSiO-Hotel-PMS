# 📋 Roadmap: Виправлення аналітики сайтів

> **Джерело:** Аудит `docs/SITE_ANALYTICS_AUDIT.md`  
> **Пріоритет виконання:** Phase 1 → 2 → 3 → 4  
> Всі зміни стосуються одного файлу бекенду: `src/modules/bookings/api/site-analytics.handlers.ts`  
> та двох файлів фронтенду: `src/app/(dashboard)/sites/[siteId]/_components/AnalyticsTab.tsx` та `public/widget/embed.v2.js`

---

## Phase 1 — 🔴 Критичні баги бекенду (виконати першим)

### ✅ Task 1.1 — Виправити `getSessionsCount()` (BUG-01)

**Файл:** `src/modules/bookings/api/site-analytics.handlers.ts`, рядки 58–67

**Проблема:** Параметри `from` та `to` ігноруються, підставляються статичні рядки `T00:00:00Z`.

**Що змінити:**

```typescript
// ❌ БУЛО:
function getSessionsCount(db: any, siteId: string, from: string, to: string) {
  if (siteId === 'all') {
    const sql = `SELECT COUNT(DISTINCT session_id) as count FROM widget_events WHERE created_at >= ? AND created_at <= ?`;
    const row = db.prepare(sql).get(`T00:00:00Z`, `T23:59:59Z`) as { count: number };
    return row ? row.count : 0;
  }
  const sql = `SELECT COUNT(DISTINCT session_id) as count FROM widget_events WHERE site_id = ? AND created_at >= ? AND created_at <= ?`;
  const row = db.prepare(sql).get(siteId, `T00:00:00Z`, `T23:59:59Z`) as { count: number };
  return row ? row.count : 0;
}

// ✅ СТАЛО:
function getSessionsCount(db: any, siteId: string, from: string, to: string) {
  const fromTime = `${from}T00:00:00Z`;
  const toTime = `${to}T23:59:59Z`;
  if (siteId === 'all') {
    const sql = `SELECT COUNT(DISTINCT session_id) as count FROM widget_events WHERE created_at >= ? AND created_at <= ?`;
    const row = db.prepare(sql).get(fromTime, toTime) as { count: number };
    return row ? row.count : 0;
  }
  const sql = `SELECT COUNT(DISTINCT session_id) as count FROM widget_events WHERE site_id = ? AND created_at >= ? AND created_at <= ?`;
  const row = db.prepare(sql).get(siteId, fromTime, toTime) as { count: number };
  return row ? row.count : 0;
}
```

**Перевірка:** Після зміни у вкладці «Загальний огляд» показники «Відвідуваність (Сесії)» та «Конверсія %» мають відображати ненульові значення.

---

### ✅ Task 1.2 — Виправити параметри в `getAnalyticsGeo()` для мов (BUG-02)

**Файл:** `src/modules/bookings/api/site-analytics.handlers.ts`, рядки 291–302

**Проблема:** При `siteId === 'all'` `getSourceFilter` повертає `'1=1'` без `?`, але `langParams = [source, 'widget']` передає 2 зайвих параметри → помилка SQLite.

**Що змінити (замінити рядки 292–302):**

```typescript
// ❌ БУЛО:
const langParams = [source, 'widget'];
if (dateType === 'check_in') {
  langBookingsSql += ' AND check_in >= ? AND check_in <= ?';
  langParams.push(dateFrom, dateTo);
} else {
  langBookingsSql += ' AND created_at >= ? AND created_at <= ?';
  langParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
}

// ✅ СТАЛО:
const langParams: any[] = getSourceParams(siteId, propertyId); // <- використати уніфіковану функцію
if (dateType === 'check_in') {
  langBookingsSql += ' AND check_in >= ? AND check_in <= ?';
  langParams.push(dateFrom, dateTo);
} else {
  langBookingsSql += ' AND created_at >= ? AND created_at <= ?';
  langParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
}
```

---

### ✅ Task 1.3 — Виправити параметри в `getAnalyticsGeo()` для країн (BUG-02, другий випадок)

**Файл:** `src/modules/bookings/api/site-analytics.handlers.ts`, рядки 349–360

**Та ж сама проблема** для `countryParams`. Замінити аналогічно:

```typescript
// ❌ БУЛО:
const countryParams = [source, 'widget'];

// ✅ СТАЛО:
const countryParams: any[] = getSourceParams(siteId, propertyId);
```

> Обидва виправлення (1.2 та 1.3) — мінімальні, точкові. `getSourceParams` вже реалізована у файлі на рядку 31. Вона повертає `[]` при `siteId === 'all'` — саме те, що потрібно.

---

### ✅ Task 1.4 — Виправити воронку лідів при `siteId = 'all'` (BUG-03)

**Файл:** `src/modules/bookings/api/site-analytics.handlers.ts`, рядки 700–705

**Проблема:** Запит `WHERE site_id = ?` із значенням `'all'` не знаходить жодного запису.

**Що змінити:**

```typescript
// ❌ БУЛО:
const leadsSql = `
  SELECT id, email, phone, status 
  FROM site_incoming_leads 
  WHERE site_id = ? AND created_at >= ? AND created_at <= ?
`;
const submittedLeads = db.prepare(leadsSql).all(siteId, `${dateFrom} 00:00:00`, `${dateTo} 23:59:59`) as any[];

// ✅ СТАЛО:
let leadsSql: string;
let leadsParams: any[];
if (siteId === 'all') {
  leadsSql = `
    SELECT id, email, phone, status 
    FROM site_incoming_leads 
    WHERE created_at >= ? AND created_at <= ?
  `;
  leadsParams = [`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`];
} else {
  leadsSql = `
    SELECT id, email, phone, status 
    FROM site_incoming_leads 
    WHERE site_id = ? AND created_at >= ? AND created_at <= ?
  `;
  leadsParams = [siteId, `${dateFrom} 00:00:00`, `${dateTo} 23:59:59`];
}
const submittedLeads = db.prepare(leadsSql).all(...leadsParams) as any[];
```

**Примітка:** Воронка контактних форм у функції `getAnalyticsFunnel` доступна лише коли `siteId !== 'all'` (вона не викликається з маршруту `all`). Але ця зміна підготовлює код до майбутньої підтримки агрегованого перегляду.

---

## Phase 2 — 🟠 Мультивалютна агрегація (BUG-04)

### ✅ Task 2.1 — Додати поле `currency` до SQL-агрегацій

**Файли:** `src/modules/bookings/api/site-analytics.handlers.ts` (всі функції: `getReservationsStats`, `getAnalyticsTraffic`, `getAnalyticsGeo`, `getAnalyticsListings`, `getAnalyticsCampaigns`)

**Стратегія (без міграції БД):** Зберігати суму в `reservations.currency`. У SQL-запитах додати поле `currency` до GROUP BY або SELECT, а на стороні Node.js нормалізувати до CZK перед відповіддю.

**Що зробити в `getReservationsStats()`:**

```typescript
// ✅ Додати до SQL SELECT суму і кількість per currency:
function getReservationsStats(db: any, siteId: string, propertyId: string | null, from: string, to: string, dateType: string) {
  // --- КРОК 1: Зібрати всі бронювання з валютами ---
  let sql = `
    SELECT 
      currency,
      COUNT(*) as count,
      COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END), 0) as revenue,
      COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN (total_price - COALESCE(commission_amount, 0)) ELSE 0 END), 0) as unpaid_revenue,
      COALESCE(AVG(CASE WHEN payment_status = 'paid' THEN total_price ELSE NULL END), 0) as avg_check
    FROM reservations
    WHERE ${getSourceFilter(siteId, propertyId)} AND status != 'cancelled'
  `;
  // ... додати фільтрацію дат ...
  sql += ' GROUP BY currency';

  const RATES: Record<string, number> = { CZK: 1, EUR: 25.0, USD: 23.0 }; // ← Замінити на актуальні або на env
  const rows = db.prepare(sql).all(...params) as any[];

  // --- КРОК 2: Нормалізувати всі суми до CZK ---
  let totalCount = 0, totalRevenue = 0, totalUnpaid = 0, totalAvgCheck = 0, avgCount = 0;
  for (const row of rows) {
    const rate = RATES[row.currency] ?? 1;
    totalCount += row.count;
    totalRevenue += row.revenue * rate;
    totalUnpaid += row.unpaid_revenue * rate;
    if (row.avg_check > 0) { totalAvgCheck += row.avg_check * rate; avgCount++; }
  }
  return {
    count: totalCount,
    revenue: totalRevenue,
    unpaid_revenue: totalUnpaid,
    avg_check: avgCount > 0 ? totalAvgCheck / avgCount : 0,
  };
}
```

**Курси валют:** Додати константу `EXCHANGE_RATES` у верхній частині файлу або читати з `process.env`. Для production — зберігати курс на момент бронювання в таблиці `reservations.exchange_rate_czk`.

---

### ✅ Task 2.2 — Оновити `exchangeRates` на фронтенді (тимчасово)

**Файл:** `src/app/(dashboard)/sites/[siteId]/_components/AnalyticsTab.tsx`, рядки 56–61

Поки бекенд не повертає нормалізовані суми в CZK, оновити курси до актуальних значень та додати коментар:

```typescript
// TODO: замінити на отримання курсів з API або видалити після нормалізації на бекенді (Task 2.1)
const exchangeRates = {
  CZK: 1,
  EUR: 25.0,   // CNB станом на серпень 2026
  USD: 23.0    // CNB станом на серпень 2026
};
```

---

## Phase 3 — 🟡 Трекінг та логіка конверсії (BUG-05, BUG-07)

### ✅ Task 3.1 — Додати `page_view` трекінг в `embed.v2.js` (BUG-07)

**Файл:** `public/widget/embed.v2.js`

**Проблема:** Скрипт лише вставляє iframe, але не надсилає подію `page_view` до `/api/widget/event`. Тому перший крок воронки («Відвідування сайту») завжди = 0.

**Що додати** (після рядка `console.log('ALiSiO Widget V3 Loaded...')`, тобто рядок 104):

```javascript
// Track page_view event when embed script loads
(function trackPageView() {
  var sessionKey = 'alisio_sid';
  var sessionId = sessionStorage.getItem(sessionKey);
  if (!sessionId) {
    sessionId = Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
    sessionStorage.setItem(sessionKey, sessionId);
  }

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var utmParams = {};
  var pageParams = new URLSearchParams(window.location.search);
  UTM_KEYS.forEach(function(key) {
    var val = pageParams.get(key);
    if (val) utmParams[key] = val;
  });

  var payload = {
    site_id: siteSlug,       // siteSlug доступний через замикання скрипту
    session_id: sessionId,
    event_type: 'page_view',
    page: window.location.pathname,
    lang: lang,              // lang доступний через замикання
    utm_source: utmParams.utm_source || null,
    utm_medium: utmParams.utm_medium || null,
    utm_campaign: utmParams.utm_campaign || null,
  };

  fetch(baseUrl + '/api/widget/event', {    // baseUrl доступний через замикання
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(function() {});
})();
```

> **Важливо:** У `widget-event.handlers.ts` тип `page_view` вже присутній в масиві `allowedTypes` (рядок 55). Жодних змін на бекенді не потрібно.

---

### ✅ Task 3.2 — Виправити логіку конверсії при `date_type = 'check_in'` (BUG-05)

**Файл:** `src/modules/bookings/api/site-analytics.handlers.ts`, функція `getAnalyticsOverview`

**Проблема:** При `date_type = 'check_in'` сесії фільтруються за `created_at`, а бронювання — за `check_in`. Ці діапазони не збігаються → конверсія >100% або 0.

**Рішення — завжди рахувати сесії за `created_at` і додати UI-попередження:**

```typescript
// В getAnalyticsOverview — сесії завжди за created_at:
const currentSessions = getSessionsCount(db, siteId, dateFrom, dateTo); // ← вже так
```

**На фронтенді** (`AnalyticsTab.tsx`) додати підказку при `dateType === 'check_in'`:

```tsx
{/* Попередження при режимі check_in */}
{dateType === 'check_in' && (
  <div style={{ 
    background: 'rgba(251, 191, 36, 0.1)', 
    border: '1px solid rgba(251, 191, 36, 0.3)',
    borderRadius: 8, 
    padding: '10px 14px', 
    fontSize: 12, 
    color: '#ca8a04' 
  }}>
    ⚠️ Режим «За датою заїзду»: відвідуваність сайту відображається за датою бронювання 
    (зазвичай на тижні раніше заїзду). Показник «Конверсія %» в цьому режимі є приблизним.
  </div>
)}
```

**Де додати:** у JSX між фільтром дат та KPI-картками (орієнтовно після `</div>` фільтрів, рядок ~297 в `AnalyticsTab.tsx`).

---

## Phase 4 — 🔵 Dashboard Unification (майбутній крок)

### ✅ Task 4.1 — Спланувати об'єднання аналітики Сайт + Соцмережі

**Файли:** `AnalyticsTab.tsx`, `Analytics.tsx` (smm-helper)

> Цей блок не потребує негайного виконання. Виконати після Phase 1–3.

**Підхід:**
1. Визначити спільний формат відповіді API для обох систем (SMM і сайт).
2. Вбудувати `AnalyticsTab` як вкладку в загальний дашборд аналітики.
3. Виокремити загальні компоненти (DonutChart, KPI-картки) у `src/components/analytics/`.

---

## 🧪 Порядок тестування після виправлень

| Крок | Дія | Очікуваний результат |
|---|---|---|
| 1 | Відкрити `/sites/all?tab=analytics` | Завантаження без помилок у консолі |
| 2 | Перейти у «Загальний огляд» | Сесії ≠ 0, конверсія відображається коректно |
| 3 | Перейти у «Географія» | Карта та таблиці заповнені даними, немає SQLite error |
| 4 | Перейти у конкретний сайт → Воронка | `page_view` присутній як перший рядок воронки |
| 5 | Переключити валюту EUR/USD | Суми конвертуються пропорційно від бази CZK |
| 6 | Переключити `date_type = check_in` | З'являється попередження у жовтому банері |

---

## 📂 Файли що підлягають змінам

| Файл | Tasks | Пріоритет |
|---|---|---|
| `src/modules/bookings/api/site-analytics.handlers.ts` | 1.1, 1.2, 1.3, 1.4, 2.1, 3.2 | 🔴 CRITICAL |
| `public/widget/embed.v2.js` | 3.1 | 🟠 HIGH |
| `src/app/(dashboard)/sites/[siteId]/_components/AnalyticsTab.tsx` | 2.2, 3.2 | 🟡 MEDIUM |

---

*Документ створено: 02 серпня 2026 р. на основі `docs/SITE_ANALYTICS_AUDIT.md`*
