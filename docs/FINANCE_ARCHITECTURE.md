# Фінансовий модуль ALiSiO PMS — повна архітектура

Дата: 2026-05-06 (після cleanup-марафону PR #1–#13).

> **Філософія:** «Finance shows facts only.»
> Тільки реальні гроші. Жодних «обіцянок», «сигналів», авто-створень з webhook'ів.

---

## 1. Big picture

```
                       ┌──────────────────────────────────┐
                       │          PMS (бронювання)         │
                       │                                  │
                       │  reservations.payment_status     │
                       │  service_orders.payment_status   │
                       │  booking_service_orders.*        │
                       └──────┬───────────────────────────┘
                              │
                              │ PMS читає / пише ТІЛЬКИ свої таблиці.
                              │ Finance НЕ записує сюди.
                              │
                              ▼
       ┌──────────────────────────────────────────────────┐
       │                                                  │
       │              FINANCE (fin_operations)            │
       │                                                  │
       │   Кожен рядок = реальна транзакція грошей.       │
       │   Заповнюється з 4 джерел:                       │
       │                                                  │
       │   1. Manual (касова форма)                       │
       │   2. Bank statement (KB IMAP / CSV)              │
       │   3. Recurring template tick                     │
       │   4. Manual orphan recovery (admin)              │
       │                                                  │
       └──────────────────────────────────────────────────┘
                              │
                              │ Звіти агрегують ТІЛЬКИ з ledger.
                              │ Жоден report не лазить в reservations.
                              ▼
       ┌──────────────────────────────────────────────────┐
       │  P&L · Cashflow · Balance Sheet · Account        │
       │  Statement · Plan-Fact · Project Profitability   │
       └──────────────────────────────────────────────────┘
```

---

## 2. Ключова таблиця — `fin_operations`

**Кожен рядок** = одна реальна грошова операція. Все що ти бачиш у звітах, балансах, P&L — походить звідси.

### Структура (ключові поля)

| Поле | Тип | Призначення |
|---|---|---|
| `id` | TEXT PK | `inc_*` / `exp_*` / `txfr_*` префікси |
| `op_type` | TEXT | `income` \| `expense` \| `transfer` |
| `account_from_id` | FK → finance_accounts | Звідки гроші вийшли (для expense + transfer) |
| `account_to_id` | FK → finance_accounts | Куди прийшли (для income + transfer) |
| `amount` | REAL | Сума в `currency` (оригінальна валюта) |
| `currency` | TEXT | EUR/CZK/USD etc |
| `amount_company` | REAL | Сума в CZK (компанійська валюта). Для звітів |
| `paid_at` | DATE | Коли реально рухнулись гроші |
| `accrued_at` | DATE | Коли «заробилось» / «зобов'язано» (для P&L по нарахуванню) |
| `category_id` | FK → expense_categories | Класифікація |
| `project_id` | FK → business_units | Юніт/проект (для investor reports) |
| `counterparty_id` | FK → finance_counterparties | Хто відправив/отримав |
| `reservation_id` | FK → reservations | Якщо платіж пов'язаний з бронюванням |
| `status` | TEXT | `completed` (фактично відбулось) \| `pending` (запланована майбутня) |
| `is_planned` | INT | 1 якщо це майбутній прогноз (recurring template) |
| `source` | TEXT | Де взялась — `manual` \| `manual_bank` \| `kb_inbox` \| `recurring` |
| `source_ref` | TEXT | Зовнішній ID для idempotency (наприклад bank_tx_id) |
| `payment_subtype` | TEXT | `full` \| `partial` \| `service` \| `refund` |
| `comment` | TEXT | Вільний текст |
| `needs_review` | INT | 1 = адмін має перевірити (фолбек resolver чи NULL account) |

### Як виглядає реальний рух грошей

**Готівка від гостя (1000 CZK):**
```
op_type = 'income'
account_to_id = «Антон Готівка»
amount = 1000, currency = CZK
amount_company = 1000
source = 'manual'
```

**Витрата за прибирання (3000 CZK):**
```
op_type = 'expense'
account_from_id = «KEMP Gold»
amount = 3000, currency = CZK
category_id = «Прибирання»
counterparty_id = «Прибиральниця Олена»
source = 'manual'
```

**Переказ між рахунками:**
```
op_type = 'transfer'
account_from_id = «Антон Готівка»
account_to_id = «KEMP Gold»
amount = 50000
source = 'manual'
```

---

## 3. Звідки беруться записи (4 джерела)

Це **єдині 4 шляхи** як рядок з'являється в `fin_operations`. Жодних webhook'ів. Жодних автоматичних створень при гостьовій активності.

### 3.1. Manual (вручну через UI)

**Куди клікаєш:** `/finance/operations` → `+ Дохід` / `+ Витрата` / `+ Переказ` → модальне вікно

**Що робить:** POST `/api/finance/operations` → `createOperationInTx` → INSERT

**Коли використовувати:**
- Готівковий дохід на стійці (гість заплатив 500 CZK за пізнє виселення готівкою)
- Готівкова витрата (купив дрова на 800 CZK)
- Переказ між рахунками

**source:** `manual`

### 3.2. Bank statement import

Два підшляхи:

#### 3.2.1. KB IMAP (автоматичний)

**Як працює:**
1. KB надсилає тобі ранкову виписку CAMT.053 на email
2. Кожні 15 хв (або при кожному API-запиті як fallback-cron) `runBankInboxTickIfDue()` пушить IMAP
3. Парсер виписки створює fin_operation на кожен рядок
4. Auto-rules engine пробує матчити counterparty / категорію через `fin_auto_rules`
5. Якщо знайдено pending fin_operation з тією ж сумою → лінкує (status='pending' → 'completed')

**source:** `kb_inbox`

#### 3.2.2. CSV upload (ручний)

**Куди клікаєш:** `/finance/bank` → Upload CSV

**source:** `manual_bank`

**Файли:** `src/modules/finance/data/bank-inbox-engine.ts` + `statement-parsers.ts`

### 3.3. Recurring template tick

**Як працює:**
- В `fin_recurring_templates` зберігаються шаблони регулярних операцій (оренда, абонементи)
- Поле `next_run_at` визначає коли «фічну» наступну
- При кожному API-запиті (`runRecurringTickIfDue` у getDb hook) перевіряється чи є due-шаблони
- Lookup window — 30 днів вперед, тому майбутні плани з'являються в календарі завчасно
- Створює fin_operation:
  - Якщо дата у майбутньому: `status='pending'`, `is_planned=1`
  - Якщо у минулому/сьогодні: `status='completed'`, `is_planned=0`

**source:** `recurring`

### 3.4. Manual orphan recovery (адмін-шлях)

**Куди клікаєш:** `/finance/payments/orphans` → «Відновити платіж» на конкретному рядку

**Коли використовувати:** якщо бачиш гостьову послугу зі статусом `payment_status='paid'` (PMS), але fin_operations відсутній. Це може статись якщо webhook упав або ти видалив fin_operation випадково — kнопка дозволяє ручно створити запис заднім числом.

**source:** `teia` (legacy label, але ставиться вручну адміном)

---

## 4. Що ВЖЕ НЕ створює fin_operation (і чому)

| Подія | Що раніше | Що зараз |
|---|---|---|
| **Hostex prepaid sync** (Booking/Airbnb забронював) | `createAutoPayment` робив фантомний рядок | **Нічого** — лише оновлює `reservation.is_prepaid=1`, `payment_status='paid'` |
| **Гість оплатив сауну/BBQ через Teya widget** | Webhook робив рядок на «Антон Готівка» | **Нічого** — лише `service_orders.payment_status='paid'` |
| **Гість оплатив повне бронювання через guest portal Teya** | widget-payment-return робив рядок | **Нічого** — лише `reservation.payment_status='paid'`, `status='confirmed'` |
| **CRM 30% депозит** | Webhook робив рядок | **Нічого** |

**Чому?** Бо у всіх цих випадках гроші ще НЕ на нашому рахунку. Вони на:
- Booking (тиждень до перерахунку)
- Airbnb (тиждень-два)
- Teya merchant account (тижневий sweep)

Реальні гроші з'являться, коли **банк** (KB) отримає переказ від платформи. Тоді він прийде у виписці і ми його зафіксуємо як **факт**.

---

## 5. Як PMS дізнається «оплачено»

PMS НЕ читає з finance. PMS має власні поля:

```
reservations:
  payment_status   = 'unpaid' | 'partial' | 'paid' | 'prepaid' | 'payment_requested'
  is_prepaid       = 1 (для Hostex prepaid каналів)
  status           = 'tentative' | 'confirmed' | 'checked_in' | 'checked_out'

service_orders:
  payment_status   = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'

booking_service_orders:
  payment_status   = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
```

Як ці поля встановлюються:

| Сценарій | Хто оновлює |
|---|---|
| Booking/Airbnb prepaid резерва прийшла з Hostex | `hostex-sync.ts` встановлює `is_prepaid=1`, `payment_status='paid'` |
| Гість натиснув «Оплатити» на guest portal через Teya, redirect повернувся | `widget-payment-return.handlers.ts` встановлює `payment_status='paid'` |
| Teya webhook прилетів про успішну оплату | `webhook-teya.handlers.ts` встановлює `*.payment_status='paid'` |
| Адмін у Booking modal клацає «Прийняв готівку» | `/api/bookings/[id]` PATCH встановлює `payment_status='paid'` |

**Check-in кнопка** активується коли `payment_status IN ('paid', 'prepaid')` AND `registration_status='registered'`. Це перевіряється в `reservation.handlers.ts`. **Finance тут не задіяний.**

---

## 6. Усі таблиці finance (з призначенням)

### Core ledger
| Таблиця | Що містить |
|---|---|
| **`fin_operations`** | Усі грошові операції (єдина точка істини) |
| **`fin_operation_tags`** | M:N зв'язок між операціями і тегами |

### Master data (довідники)
| Таблиця | Що |
|---|---|
| `finance_accounts` | Рахунки: cash / bank / card / clearing. Поле `initial_balance` + сума ops дає balance |
| `finance_categories` | Категорії з classifier (cogs/opex/capex/tax) для P&L |
| `finance_counterparties` | Контрагенти (постачальники, клієнти, платформи) з aliases для авто-матчингу |
| `business_units` | Проекти/юніти (для P&L per project + investor reports) |
| `finance_tags` | Гнучкі теги |
| `finance_exchange_rates` | Курси валют по даті (EUR→CZK тощо) |

### Banking (вхід реальних грошей)
| Таблиця | Що |
|---|---|
| `fin_bank_inboxes` | IMAP конфіги для KB (encrypted credentials) |
| `bank_statements` | Імпортовані виписки (header) |
| `bank_transactions` | Рядки виписки + `matched_operation_id` (FK → fin_operations) |

### Auto / Plan
| Таблиця | Що |
|---|---|
| `fin_auto_rules` | Правила «якщо counterparty='Yandex Taxi' → category='Travel'» |
| `fin_auto_rule_matches` | Лог застосувань правил |
| `fin_recurring_templates` | Регулярні шаблони (оренда щомісяця) |
| `fin_budgets` | Плани (для Plan-Fact звіту) |

### Statement reconciliation (платформи)
| Таблиця | Що |
|---|---|
| `fin_channel_receivables` | Очікувані переказі від Booking/Airbnb (буде reused в clean-7) |
| `fin_statement_uploads` | Журнал завантажень CSV (Booking/Airbnb/VRBO виписок) |

### Receipts / Attachments
| Таблиця | Що |
|---|---|
| `fin_operation_attachments` | Документи прикріплені до операцій |
| `fin_receipt_inboxes` | IMAP для пересилання чеків з email |
| `fin_pending_receipts` | Чеки які ще не приклеїли до операції |

### Investors
| Таблиця | Що |
|---|---|
| `investors`, `investor_investments`, `investor_monthly_metrics`, `investor_payouts`, `investor_properties`, `investor_monthly_reports` | Investor module — використовує `business_units.id` як проект-ключ |

### Audit
| Таблиця | Що |
|---|---|
| `payment_webhook_log` | Audit trail кожного Teya webhook'а (raw payload + outcome) |
| `booking_activity_log` | Action log на бронюваннях (включно зі змінами unit_id) |
| `fin_system_state` | Throttle-маркери для cron-tick'ів (`last_recurring_tick`, etc) |

---

## 7. Звіти — що звідки агрегує

### 7.1. P&L (`/finance/reports/pnl`)

```sql
SELECT category, op_type, month, SUM(amount_company)
FROM fin_operations
WHERE status='completed'
  AND op_type != 'transfer'
  AND strftime('%Y-%m', accrued_at OR paid_at) BETWEEN ? AND ?
GROUP BY category, op_type, month
```

- **Basis toggle:** `accrued_at` (нарахування — стандарт для P&L) або `paid_at` (по факту)
- Сумує в **CZK** (`amount_company`)
- 11 секцій: Revenue → COGS → Gross → Variable → Operational → EBITDA → Tax → CapEx → Financing → Net Profit
- Через category.classifier визначається у яку секцію падає

### 7.2. Cashflow (`/finance/reports/cashflow`)

```sql
SELECT category, month, SUM(amount_company)
FROM fin_operations
WHERE status='completed' AND op_type != 'transfer'
  AND strftime('%Y-%m', paid_at) BETWEEN ? AND ?
GROUP BY category, month
```

- **Завжди по `paid_at`** (cashflow по визначенню = реальний рух)
- Сумує в CZK
- Показує opening/closing balance per month

### 7.3. Balance Sheet (`/finance/reports/balance`)

```sql
SELECT account, type,
  initial_balance
  + SUM(amount WHERE account_to_id = account.id AND paid_at <= as_of)
  - SUM(amount WHERE account_from_id = account.id AND paid_at <= as_of)
FROM finance_accounts
```

- На певну дату
- Активи (cash + bank) vs Зобов'язання (card balances < 0)
- В **оригінальній валюті рахунку**

### 7.4. Account Statement (`/finance/reports/statement/[accountId]`)

Виписка по одному рахунку: opening balance → список операцій → running balance → closing.

### 7.5. Project Profitability (`/finance/reports/projects`)

P&L per `business_units.id` × місяць. Інвестори читають це для свого проекту.

### 7.6. Plan-Fact (`/finance/reports/plan-fact`)

- **Plan** = `fin_budgets` (заплановано на місяць)
- **Fact** = `SUM(fin_operations.amount) WHERE status='completed' AND month=?`
- Variance %

### 7.7. Reconcile Dashboard (`/finance/reconcile`)

Морнінг чеклист:
- Outstanding receivables по валютах
- Pending receipts (чеки без прив'язки)
- Recurring suggestions (банк-операція схожа на шаблон)
- Last sync timestamps

### 7.8. Calendar (`/finance/calendar`)

Місячна сітка з прогнозом залишку. Включає `is_planned=1` для running balance forecast (cash-gap warning).

---

## 8. Multi-currency

### Як зберігається

Кожна `fin_operation` має:
- `amount` + `currency` (оригінал, що бачить користувач)
- `amount_company` (CZK еквівалент по курсу на `paid_at`)

### Конвертація

Файл: `src/modules/finance/api/operations.handlers.ts:17-43` (`computeAmountCompany`)

1. Якщо currency = CZK → `amount_company = amount`
2. Шукає latest rate в `finance_exchange_rates` де `effective_from <= paid_at`
3. Fallback: latest rate будь-якого date (з warning у log)
4. **Якщо курсу не існує взагалі — кидає помилку** (PR #5 fix). Адмін має додати курс у `/finance/settings → Курси валют`.

### Звіти

- **P&L / Cashflow / Plan-Fact** — сумують `amount_company` (все у CZK)
- **Balance Sheet / Account Statement** — сумують `amount` (оригінальна валюта рахунку)
- **Reconcile Dashboard** — `amount_company` (KPI у CZK)

---

## 9. Auto-rules engine

Файл: `src/modules/finance/data/auto-rules-engine.ts`

### Як працюють правила

Правило в `fin_auto_rules`:
```
conditions: [
  { field: 'comment', op: 'contains', value: 'Yandex Taxi' }
]
actions: {
  set_category_id: 'cat_travel',
  set_counterparty_id: 'cp_yandex'
  add_tag_ids: ['tag_business_trip']
}
```

### Коли виконуються

Функція `applyRulesToOperation` викликається з:

| Місце | Коли |
|---|---|
| `bank-inbox-engine.ts` | На кожний імпортований bank row |
| `payment-bridge.ts` (ВИДАЛЕНО після clean-1/5) | Раніше — після Hostex auto-pay. Зараз — нема |
| Адмін UI кнопка «Apply rules to all» | Bulk re-apply |

**ВАЖЛИВО:** Manual create через UI **НЕ запускає** auto-rules — бо адмін уже свідомо обрав категорію. Тільки автоматичні шляхи (bank import) проходять через engine.

---

## 10. Ризик — multi-cabin Booking бронювання

**Tobias Mähler** забронював 4 будинки одним замовленням на €2115. В Hostex API це повертається як **один** `reservation` з повною сумою. Наша система зараз імпортує одну резерву з прив'язкою до Stealth 3.

**Видно через:**
- `is_multi_room=1` (додано в попередньому PR #G)
- `multi_room_marker='_3-'`
- Banner у BookingViewModal

**Як обходити:** ручний split — створити 3 додаткові резерви для інших будинків. Hostex API не дає sibling-reservations, тому повністю автоматизувати не можемо.

---

## 11. Clean-7 — statement-driven attribution

**Що це:** автоматичний розподіл бан-кстмт-операції на per-reservation рядки через CSV-виписку платформи.

### Проблема яку розв'язує

Зараз коли Booking перераховує тижневу суму на банк:
```
KB виписка: «BOOKING.COM B.V. NO.P9AWUIAH... 12 000 CZK ach deposit»
```
→ Створюється 1 fin_operation на 12k CZK без attribution. Не знаєш:
- хто з гостей у тих 12к
- скільки кому з проектів пішло (для investor metrics)

### Як буде працювати після clean-7

1. **Тиждень: банк-виписка прийшла** → 1 fin_operation на «KEMP Gold», 12 000 CZK, counterparty=Booking.com
2. **Завантажуєш Booking weekly CSV** на `/finance/clearing` → upload widget уже існує
3. **Парсер бачить breakdown:**
   - Tobias 8000
   - Pavel 3700
   - Anna 500
   - Commission -200
4. **Auto-match:** знаходить bank op на ту саму суму (12 000 = 8000+3700+500-200), у тому самому каналі
5. **Splittить:**
   - Original op marked `parent_op_id=NULL, is_split_anchor=1` (ховається зі звітів, лишається для аудиту)
   - 3 child ops з `parent_op_id=original.id`, кожен з `reservation_id`, `project_id` (через unit→project mapping)
   - 1 commission expense op («Booking commission», category=fees)
6. **Result:**
   - P&L per project — точна attribution
   - Investor reports — реальні цифри
   - Refunds виділяються окремими рядками

### Що потрібно для реалізації

| Зміна | Де |
|---|---|
| Schema: `parent_op_id` колонка на fin_operations + `is_split_anchor` | `db.ts` migration |
| Endpoint: «split bank op via statement» | новий handler у finance |
| UI: кнопка на bank op рядку «Розподілити через виписку платформи» | operations page |
| Reports: фільтрувати `WHERE is_split_anchor = 0` | всі query |
| Reverse: можливість «unsplit» (повернути original, видалити children) | для випадкових помилок |

### Чи варто робити

**Варто, якщо:**
- Активно ведеш investor metrics (в тебе investor module використовується)
- Часто маєш Booking/Airbnb виписки з рефандами що треба точно проатрибутити
- Хочеш бачити в Operations table per-reservation income автоматично

**НЕ обов'язково, якщо:**
- Готовий вручну прокидати reservation_id у 1-2 операції на тиждень
- Investor metrics беруться з `reservations.total_price` (auto-revenue engine, як зараз)

### Альтернатива (мінімальний шлях)

Лишити як є, **вручну** в Booking modal вибирати «прив'язати цей платіж до резерви X». Це менше LoC, але більше ручної роботи на тиждень.

---

## 12. Що змінилось за cleanup-марафон (PR #1–#13)

| PR | Що зробив |
|---|---|
| #1 | Чан промокод (data fix) |
| #2 | Signals filter в balance/calendar/dashboard |
| #3 | needs_review backfill для legacy NULL-account ops |
| #4 | Auto-rules в payment-bridge (потім видалено в #12) |
| #5 | FX silent fallback fix — кидає помилку замість rate=1 |
| #6 | Finmap-style inline edit на /finance/operations |
| #7 | clean-1: Hostex sync **перестав** створювати fin_operations |
| #8 | clean-2: recalc skip prepaid + DELETE 56 legacy signals |
| #10 | clean-3: DROP COLUMN is_pms_signal + 7 filter sites |
| #11 | clean-4: Reports → `amount_company` (currency safety) |
| #12 | clean-5: Teya webhook + widget-payment-return перестали створювати fin_operations |
| #13 | clean-6: DELETE усіх legacy auto-ops (~180 рядків) |

**Сумарний LoC:** −300 / +50 (чистий мінус).

---

## 13. Глосарій

| Термін | Визначення |
|---|---|
| **Fact** | Реальна транзакція грошей. Готівка в касі / на банку / переказ між нашими рахунками |
| **Receivable** | Те що нам винні (Booking ще не перерахував). НЕ зберігаємо як fin_operation — лише в `fin_channel_receivables` як subledger |
| **Settlement** | Момент коли money фактично надходить на банк (Booking weekly payout) |
| **Clearing account** | Віртуальний рахунок в `finance_accounts` для платформ. Поточно майже не використовується після clean-cleanup |
| **Recurring template** | Шаблон регулярної операції (оренда щомісяця) |
| **is_planned=1** | Майбутня прогнозована операція. status='pending'. Виключається з P&L/Cashflow (бо ті фільтрують status='completed') |
| **needs_review=1** | Адмін має перевірити (account resolver fallback або NULL accounts) |
| **Auto-rules** | Правила автоматичної категоризації при bank import |

---

## 14. Корисні файли (де що шукати)

| Що | Файл |
|---|---|
| Single point of payment creation | `src/modules/finance/api/payment-bridge.ts` |
| List/CRUD операцій | `src/modules/finance/api/operations.handlers.ts` |
| Звіти (всі) | `src/modules/finance/api/reports.handlers.ts` |
| Hostex sync (без fin_op creation) | `src/lib/hostex-sync.ts` |
| Teya webhook (без fin_op creation) | `src/modules/payments/api/webhook-teya.handlers.ts` |
| Bank import engine | `src/modules/finance/data/bank-inbox-engine.ts` |
| CSV statement parsers | `src/modules/finance/data/statement-parsers.ts` |
| Auto-rules engine | `src/modules/finance/data/auto-rules-engine.ts` |
| Recurring engine | `src/modules/finance/data/recurring-engine.ts` |
| Schema migrations | `src/lib/db.ts` (Cleanup #A через #G) |
| Operations UI | `src/app/(dashboard)/finance/operations/page.tsx` |
| Operation modal | `src/app/(dashboard)/finance/operations/_components/OperationModal.tsx` |
