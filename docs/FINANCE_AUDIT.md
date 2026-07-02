# Фінансова інфраструктура — аудит потоків даних і звітності

> Згенеровано в межах ревізії фінмодуля (2026-06). Це «карта місцевості» для
> реорганізації звітності. Файли/рядки актуальні на момент аудиту.

## 1. Граф потоків даних

```
ДЖЕРЕЛА ГРОШОВИХ ФАКТІВ                        ЄДИНИЙ LEDGER                 ЗВІТИ (cash)
────────────────────────                 ┌──────────────────────┐
UI (ручне створення) ────────────────┐   │                      │──► /finance (overview KPI)
Telegram-бот (сауна/готівка) ────────┤   │    fin_operations    │──► /finance/pnl (старий P&L + accruals)
Bank inbox (IMAP виписки KB) ────────┤   │  op_type: income/    │──► /finance/cashflow (легасі cashflow)
Ручний банк. імпорт (bank_tx) ───────┼──►│  expense/transfer    │──► /finance/reports/pnl (matrix, classifier)
Teya API sync (ручний) ──────────────┤   │  status, paid_at,    │──► /finance/reports/cashflow (matrix)
OTA CSV (Airbnb/Booking payout) ─────┤   │  accrued_at,         │──► indicators, balance, project-profit,
Import wizard (CSV/XLSX) ────────────┤   │  category_id,        │    plan-fact, statement, drill-down
Finmap import (історія) ─────────────┤   │  project_id, source, │──► експорти CSV
Recurring engine (шаблони) ──────────┤   │  source_ref (dedup)  │
Дивіденди інвесторам ────────────────┤   └──────────────────────┘
payment-bridge (cash при чек-іні, ───┘        ▲ createOperationInTx() — єдина воронка
  PIN-віджет, orphan-restore)                 │ (валідація, FX → amount_company, теги, аудит)

СВІДОМІ РОЗРИВИ (гроші є "у світі", але ще не на нашому рахунку):
  Teya webhook ──► reservations.payment_status='paid' (операції НЕМАЄ до банк. виписки)
  Hostex/OTA sync ──► fin_channel_receivables (дебіторка платформ, clearing-engine)
  Terminal у віджеті ──► маркер, без операції
  Компенсатори: bank-inbox cron + матчинг receivables; ручний Teya sync; orphan-restore

ПАРАЛЕЛЬНИЙ ВСЕСВІТ («звіти з календаря», reservations.total_price):
  /reports (дохід по check_in) · glamping report · CRM-профіль гостя ·
  investor auto-revenue (підказка) · інвестор-портал (прогноз частки) · AI schema-context
  → ці цифри НІКОЛИ не зійдуться з /finance (інший базис) — це аналітика продажів, не фінанси

РУЧНІ РЕЄСТРИ ПОЗА LEDGER:
  accruals (нарахування) ──► додаються ПОВЕРХ fin_operations у старому P&L (подвійний облік)
  capex_items ──► окремий реєстр; та сама покупка може бути і тут, і в операціях
  property_monthly_metrics (інвестори) ──► вводяться руками; портал бачить «треті» цифри
```

## 2. Довідники

- **Категорії:** одна таблиця `expense_categories`, але ДВІ семантичні осі:
  legacy (`std_group`/`pnl_line`/`alloc_method`) для старих звітів і нова
  (`parent_id`-дерево 2 рівні, `op_type`, `classifier`) для matrix-звітів.
  Синхронізація осей не форситься → одна операція класифікується по-різному
  в різних P&L. Legacy CRUD (`expense-categories.handlers.ts`) створює
  категорії без op_type/classifier.
- **Проєкти:** `business_units` (з parent_id). Алокація shared-витрат
  (cost_allocations) існує лише в старому getPnl.
- **Контрагенти:** `finance_counterparties` + aliases_json (авто-матчинг).
- **Теги:** повна інфраструктура (таблиці, CRUD, фільтр в операціях,
  auto-rules add_tag_ids), але у ЗВІТАХ не використовуються ніде.

## 3. Знайдені баги (технічно зламане)

| # | Що | Де |
|---|---|---|
| B1 | Підтвердження банк-транзакції з create_expense: обидва account_id завжди NULL → завжди 500 | `bank.handlers.ts:66-79` |
| B2 | deleteCategory рахує `FROM expenses` — таблиця DROPнута → «no such table» | `categories.handlers.ts:41-43` |
| B3 | Alias suggestions читає `FROM expenses`/`FROM income` (dropped) | `counterparties.handlers.ts:395-401` |
| B4 | /finance/log: форми POST-ять на неіснуючі роути /api/finance/income|expenses|transfers | `finance/log/page.tsx:97,198,289` |
| B5 | admin/fix-andrey-payments: сирий INSERT без accrued_at (NOT NULL) → впаде; повз воронку/аудит | `fix-andrey-payments/route.ts:106-129` |
| B6 | getCashflow: витрати БЕЗ status='completed' і JOIN (не LEFT) губить некатегоризовані | `reports.handlers.ts:395-431` |
| B7 | plan-fact: факти по дочірніх категоріях не згортаються на батьківські → факт занижений | `reports.handlers.ts:1002-1013` |
| B8 | Alloc-правила: `WHERE month=? OR month=(SELECT MAX…)` — недетермінований результат | `reports.handlers.ts:251-254` |
| B9 | Валютне змішування: операція в іншій валюті додає amount_company (CZK) до балансу не-CZK рахунку; amount_to у transfer ігнорується | `accounts.handlers.ts:20-27`, `reports.handlers.ts:806-812,922-953` |
| B10 | Teya задвоєння: teya_sync пише income по даті транзакції, банківська виписка (sweep) створить другий income; крос-джерельного dedup немає | `teya-reconcile-engine.ts:229-256` |
| B11 | Orphan-визначення застаріле (шукає лише source='teia') → усе виглядає orphan, restore створює дубль | `payment-recovery.handlers.ts:60-66` |
| B12 | TG-бот: fallback курс 24 захардкожено | `telegram-bridge.handlers.ts:164` |
| B13 | Зомбі is_pms_signal: читачі видалені, міграція+індекс+backfill живі | `db.ts:3467-3498` |
| B14 | Дубльовані блоки міграцій (payment_webhook_log, Cleanup #D двічі) | `db.ts:3628-3682 ≈ 3735-3789` |

## 4. Методологічні проблеми звітності

1. **Немає єдиного визначення «виручки місяця»** — 4 різні цифри:
   overview (income−refund, без фільтра категорій — financing потрапляє),
   indicators (income БЕЗ refund), pnl-matrix (по accrued_at + financing у
   виручці), /reports (total_price по check_in, включно з неоплаченими).
2. **Подвійний облік accruals:** старий P&L і overview додають accruals
   (pending, місцями і paid) поверх cash-операцій; `paid_expense_id`/
   `fin_operation_id` links існують, але ніде не використовуються для
   елімінації. Те саме — capex_items ↔ fin_operations.
3. **«Accrual» базис — фікція:** accrued_at дефолтиться в paid_at; deferred
   revenue (визнання доходу по ночах проживання) не існує. Передоплата за
   серпень = «дохід березня». Для сезонного глемпінгу — головне спотворення.
4. **Два cashflow дають різні числа** (легасі нетує refund, matrix — gross;
   легасі має баг статусів). У matrix opening/ending завжди по paid_at
   навіть при basis=accrued → «ending ≠ opening+net».
5. **OTA gross/net неконсистентно:** фінмодуль бачить net-надходження без
   визнання комісії витратою; /reports рахує gross−commission;
   expected-payments чекає gross (завищено на комісію), хоча існує
   fin_channel_receivables.expected_net.
6. **«Баланс» — не баланс:** без дебіторки OTA (receivables!), зобов'язань
   за передоплатами гостей, ОЗ (capex).
7. **pnl-matrix:** CapEx віднімається в «Чистий результат» (замість
   амортизації); Financing показано зі знаком, але не віднято.
8. **project-profitability:** без алокації shared, включає CAPEX/фінансові —
   не зіставно зі старим getPnl.
9. **Інвесторські метрики** вводяться руками — третя версія правди.

## 5. Мертве/застаріле (кандидати на видалення)

- Сторінка `/finance/log` (зламана, поза навігацією) — видалити.
- Легасі-сторінки `/finance/pnl`, `/finance/cashflow`, `/finance/expenses` —
  дублюють `/finance/reports` і `/finance/operations` (після вирівнювання
  цифр — прибрати або зробити редіректи).
- Згадки dropped-таблиць (B2, B3), зомбі-колонка (B13), дубль-міграції (B14).
- `finance/README.md` перелічує неіснуючі таблиці; `ai/schema-context.ts`
  вчить AI рахувати виручку з reservations.
- `/finance/payments/orphans`, `/finance/payments/services` — робочі, але
  поза навігацією; переосмислити після фіксу B11.

## 6. Цільова модель (рекомендація)

1. `fin_operations` (completed, без transfer) — єдине джерело всіх грошових
   звітів. Це вже майже так — доробити краї (B6, B10, B11).
2. Одна функція-визначення Revenue/Expenses (спільний SQL/хелпер), яку
   використовують overview, indicators, обидва P&L і cashflow.
3. Чесні назви: поки немає deferred revenue — «P&L (cash)»;
   /reports перейменувати на «Аналітика продажів».
4. Категорії: одна вісь (classifier + parent_id + op_type), legacy-вісь
   заморозити; заборонити створення категорій без op_type/classifier.
5. Accruals/capex: або лінк-та-елімінація через fin_operation_id, або
   виключити з P&L (залишити як操 операційні реєстри).
6. OTA: визнавати gross-дохід + комісію як витрату через receivables
   (expected_net вже є) — тоді P&L відповідає реальності продажів, а
   cashflow — банку.
7. Теги: підняти у звіти (фільтр у matrix + drill-down) або прибрати з UI.
