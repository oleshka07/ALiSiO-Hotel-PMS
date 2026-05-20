# 🏦 MetaPrompt: Фінансовий модуль ALiSiO PMS

> **Як використати:** Скопіюй весь цей файл і встав як перше повідомлення в новий чат Antigravity.

---

## Контекст

Ти працюєш з проєктом **ALiSiO PMS** — Property Management System для готельного комплексу ALiSiO (Чехія).

Зараз потрібно працювати з **Фінансовим модулем**. Перед тим як почати будь-які зміни — **обов'язково прочитай архітектурну документацію і ключові файли**, щоб мати повний контекст.

## Крок 1: Прочитай архітектуру

Прочитай ці файли **послідовно**:

1. **`docs/FINANCE_ARCHITECTURE.md`** — повна архітектура фінансового модуля (538 рядків). Містить:
   - Big picture (PMS ↔ Finance розділення)
   - Ключова таблиця `fin_operations` (усі поля)
   - 4 джерела записів (Manual, Bank, Recurring, Orphan recovery)
   - Чому Hostex/Teya НЕ створюють fin_operations
   - Як PMS дізнається «оплачено» (payment_status flow)
   - Усі таблиці finance (core + master data + banking + auto/plan + receipts + investors + audit)
   - 8 звітів (P&L, Cashflow, Balance Sheet, Account Statement, Project Profitability, Plan-Fact, Reconcile, Calendar)
   - Multi-currency (amount vs amount_company, конвертація)
   - Auto-rules engine
   - Clean-7 plan (statement-driven attribution)
   - Глосарій

2. **`src/modules/finance/README.md`** — публічне API модуля (список усіх handler функцій)

3. **Knowledge Base** — проєкт вже є в Knowledge Base під назвою `ALiSiO PMS — Full Project Architecture`. Перевір актуальність секції Finance.

## Крок 2: Вивчи файлову структуру

### Backend: `src/modules/finance/`

```
finance/
├── README.md                              ← Публічне API (список функцій)
├── api/                                   ← 45 handler файлів
│   ├── index.ts                           ← Єдина точка експорту (26KB, роутінг)
│   ├── _guard.ts                          ← Auth/permission guard
│   ├── operations.handlers.ts             ← CRUD fin_operations (26KB)
│   ├── reports.handlers.ts                ← ВСІ звіти: P&L, Cashflow, Balance, Statement, Projects, Plan-Fact (57KB)
│   ├── payment-bridge.ts                  ← Single point для створення fin_operations з webhook'ів (8.9KB)
│   ├── payment-recovery.handlers.ts       ← Orphan recovery UI (11KB)
│   ├── accounts.handlers.ts               ← Рахунки (bank/cash/card/clearing)
│   ├── categories.handlers.ts             ← Категорії з classifier (14KB)
│   ├── counterparties.handlers.ts         ← Контрагенти з aliases (17KB)
│   ├── bank.handlers.ts                   ← Bank statements CRUD
│   ├── bank-inbox.handlers.ts             ← KB IMAP inbox management
│   ├── cron-bank-inbox.handlers.ts        ← Bank inbox cron trigger
│   ├── recurring.handlers.ts              ← Recurring templates
│   ├── auto-rules.handlers.ts             ← Auto-categorization rules
│   ├── investors.handlers.ts              ← Investor module (42KB!)
│   ├── clearing.handlers.ts               ← Platform clearing (Booking/Airbnb CSV)
│   ├── reconcile-dashboard.handlers.ts    ← Morning reconcile checklist
│   ├── calendar.handlers.ts               ← Financial calendar
│   ├── budgets.handlers.ts                ← Plan budgets
│   ├── tags.handlers.ts                   ← Flexible tags
│   ├── exchange-rates.handlers.ts         ← Currency rates
│   ├── export.handlers.ts                 ← Excel/PDF export (19KB)
│   ├── telegram-bridge.handlers.ts        ← Telegram notifications
│   ├── teya-sync.handlers.ts              ← Teya reconciliation
│   ├── import-wizard.handlers.ts          ← Import wizard
│   ├── finmap-import.handlers.ts          ← FinMap import
│   ├── forecast-scenarios.handlers.ts     ← Forecast scenarios
│   ├── invoices.handlers.ts               ← Invoice generation
│   ├── attachments.handlers.ts            ← Receipt/doc attachments
│   ├── receipt-inbox.handlers.ts          ← Receipt email inbox
│   ├── audit.handlers.ts                  ← Audit trail
│   ├── investor-audit/documents/notes/portal ← Investor sub-modules
│   ├── log.handlers.ts                    ← Activity log
│   ├── statement-upload.handlers.ts       ← Platform CSV upload
│   ├── supabase-import.handlers.ts        ← Legacy import
│   ├── projects.handlers.ts               ← Projects (business_units)
│   ├── business-units.handlers.ts         ← Legacy BU list
│   ├── expense-categories.handlers.ts     ← Legacy categories
│   ├── accrual/accruals.handlers.ts       ← Legacy accruals
│   └── capex/capex-item.handlers.ts       ← Legacy CAPEX
│
├── data/                                  ← 22 engine файлів
│   ├── bank-inbox-engine.ts               ← KB IMAP + CAMT.053 parser (24KB)
│   ├── statement-parsers.ts               ← CSV parsers: KB, Booking, Airbnb, generic (27KB)
│   ├── auto-rules-engine.ts               ← Rule matching engine
│   ├── recurring-engine.ts                ← Recurring template scheduler (12KB)
│   ├── auto-revenue-engine.ts             ← Revenue attribution (11KB)
│   ├── clearing-engine.ts                 ← Platform clearing/split engine (12KB)
│   ├── entity-matcher.ts                  ← Fuzzy matching for bank rows
│   ├── investor-portal-engine.ts          ← Investor metrics computation (35KB)
│   ├── cashback-calculator.ts             ← Cashback/ROI calculations
│   ├── performance-score.ts               ← Performance scoring
│   ├── monthly-digest-engine.ts           ← Monthly financial digest
│   ├── teya-reconcile-engine.ts           ← Teya settlement reconciliation
│   ├── finmap-import-engine.ts            ← FinMap data import (14KB)
│   ├── import-wizard-engine.ts            ← Generic import wizard
│   ├── import-commit-engine.ts            ← Import transaction commit (17KB)
│   ├── supabase-import-engine.ts          ← Legacy Supabase import (19KB)
│   ├── llm-statement-extractor.ts         ← AI-based bank statement parsing
│   ├── kb-pdf-parser.ts                   ← KB PDF statement parser (14KB)
│   ├── receipt-inbox-engine.ts            ← Receipt IMAP processing
│   ├── export-utils.ts                    ← Excel/PDF generation utils
│   ├── telegram-bot.ts                    ← TG notification helpers
│   └── pdf-worker-init.ts                 ← PDF worker initialization
│
└── events/
    └── published.ts                       ← Event definitions
```

### Frontend (UI): `src/app/(dashboard)/finance/`

```
finance/
├── page.tsx                    ← Dashboard overview (16KB)
├── _components/                ← Shared finance components
├── operations/                 ← Головна таблиця операцій (Finmap-style)
│   ├── page.tsx
│   └── _components/
│       └── OperationModal.tsx  ← Модалка створення/редагування операції
├── reports/                    ← Звіти (P&L, Cashflow, Balance, Statement, Projects, Plan-Fact)
├── bank/                       ← Bank statements + IMAP inbox
├── calendar/                   ← Financial calendar
├── clearing/                   ← Platform clearing
├── reconcile/                  ← Morning reconcile dashboard
├── investors/                  ← Investor module
├── payments/                   ← Payment recovery (orphans)
├── receipts/                   ← Receipt inbox
├── settings/                   ← Finance settings (accounts, categories, counterparties, tags, exchange rates, auto-rules, bank inboxes, recurring, budgets)
├── import/                     ← Import wizard
├── audit/                      ← Audit trail
├── log/                        ← Activity log
├── expenses/                   ← Legacy expenses view
├── pnl/                        ← Legacy P&L (старий звіт, ще є)
├── cashflow/                   ← Legacy cashflow
├── capex/                      ← Legacy CAPEX
├── accruals/                   ← Legacy accruals
└── expected-payments/          ← Legacy expected payments
```

### Legacy API (ще працює, але поступово мігрується):

```
src/app/api/finance/
├── overview/route.ts           ← Dashboard KPIs
├── pnl/route.ts                ← P&L (старий, uses expenses + payments tables)
├── cashflow/route.ts           ← Cashflow (старий)
├── expected-payments/route.ts  ← Expected payments
├── expenses/                   ← Legacy expenses CRUD
├── expense-categories/         ← Legacy categories
├── business-units/             ← Legacy BU list
├── capex/                      ← Legacy CAPEX CRUD
├── accruals/                   ← Legacy accruals CRUD
├── bank/                       ← Legacy bank import
└── ...modular routes via modules/finance/api/index.ts
```

### Ключова БД: `src/lib/db.ts`

- **~2240 рядків** — єдиний файл зі ВСІМА таблицями та міграціями
- Фінансові таблиці: `fin_operations`, `finance_accounts`, `finance_categories`, `finance_counterparties`, `fin_auto_rules`, `fin_recurring_templates`, `fin_budgets`, `fin_bank_inboxes`, `bank_statements`, `bank_transactions`, `fin_channel_receivables`, `fin_statement_uploads`, `fin_operation_attachments`, `fin_receipt_inboxes`, `fin_pending_receipts`, `finance_exchange_rates`, `finance_tags`, `fin_operation_tags`, `fin_system_state`, `payment_webhook_log`
- Legacy фінансові таблиці (ще використовуються): `payments`, `expenses`, `expense_categories`, `business_units`, `cost_allocations`, `capex_items`, `accruals`, `receipts`
- Investor таблиці: `investors`, `investor_investments`, `investor_monthly_metrics`, `investor_payouts`, `investor_properties`, `investor_monthly_reports`

## Крок 3: Перевір та онови Knowledge Base

Після прочитання:
1. Перевір чи секція "Finance" в Knowledge Base актуальна
2. Якщо ні — онови її, включивши:
   - Нову модульну структуру (`src/modules/finance/`)
   - `fin_operations` як core таблицю
   - 4 джерела записів
   - Розділення PMS ↔ Finance
   - Список звітів
   - Investor module

## Ключові конвенції

### Архітектурні правила:
- **«Finance shows facts only»** — тільки реальні гроші. Жодних авто-створень з webhook'ів
- **PMS ↔ Finance ізольовані** — Finance НЕ пише в reservations/service_orders. PMS НЕ читає з fin_operations
- **4 джерела:** Manual, Bank IMAP, Recurring template, Manual orphan recovery
- **Звіти агрегують тільки з `fin_operations`** (де `status='completed'` і `op_type != 'transfer'`)
- **Multi-currency:** `amount` (оригінальна) + `amount_company` (CZK). Звіти в CZK

### Технічні:
- **DB:** SQLite (better-sqlite3), WAL mode, FK enabled
- **Framework:** Next.js 16.1.6 App Router
- **Модульна архітектура:** `src/modules/finance/api/index.ts` — єдиний роутер
- **Auth guard:** `_guard.ts` перевіряє `nav:finance` permission
- **Cron ticks:** В `getDb()` hook — `runRecurringTickIfDue` + `runBankInboxTickIfDue`
- **Валюта компанії:** CZK. Курси в `finance_exchange_rates`

### Деплой:
```bash
# Локально: build
npm run build

# На сервер: upload + build + restart
scp -r src root@46.225.132.220:/root/projects/alisio-pms/
ssh root@46.225.132.220 "cd /root/projects/alisio-pms && npm run build && systemctl restart alisio-pms"
```

## Готово?

Після вивчення — підтверди що зрозумів архітектуру і запитай що потрібно робити.
