# Finance Module

Управляє фінансами: операції (income/expense/transfer), P&L, cashflow, рахунки, бюджети, категорії, контрагенти, теги, CapEx, нарахування, банківські виписки, автоматичні правила, рекурентні шаблони, інвестори, Teya-синхронізація, універсальний імпорт (XLSX/CSV). Найбільший модуль у системі (~100+ публічних функцій).

## Публічне API

```ts
import { getFinanceOverview, listOperations, createOperation } from '@finance'
```

API згруповано за бізнес-доменами. Мутації загорнуті в `withPermission()` (RBAC).

### Звіти та матриці (read)

| Функція | Опис | Дозвіл |
|---|---|---|
| `getFinanceOverview(req)` | Загальний огляд фінансів | view_finance |
| `getPnl(req)` | P&L звіт | view_finance |
| `getCashflow(req)` | Cashflow звіт | view_finance |
| `getExpectedPayments(req)` | Очікувані надходження | view_finance |
| `getCashflowMatrix(req)` | Cashflow матриця по місяцях | view_finance |
| `getPnlMatrix(req)` | P&L матриця по місяцях | view_finance |
| `getFinancialIndicators(req)` | Фінансові індикатори | view_finance |
| `getOperationsForDrillDown(req)` | Операції для drill-down | view_finance |
| `getBalanceSheet(req)` | Баланс | view_finance |
| `getProjectProfitability(req)` | Рентабельність проєктів | view_finance |
| `getAccountStatement(req)` | Виписка по рахунку | view_finance |
| `getPlanFactReport(req)` | План-факт звіт | view_finance |

### Операції (CRUD)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listOperations(req)` | Список операцій | view_finance |
| `getOperation(req, ctx)` | Деталі операції | view_finance |
| `getOperationAudit(req, ctx)` | Аудит-лог операції | view_finance |
| `createOperation(req)` | Створити операцію | manage_payments |
| `updateOperation(req, ctx)` | Оновити операцію | manage_payments |
| `deleteOperation(req, ctx)` | Видалити операцію | manage_payments |
| `duplicateOperation(req, ctx)` | Дублювати операцію | manage_payments |
| `applyRecurringSuggestion(req, ctx)` | Застосувати рекурентну пропозицію | manage_payments |
| `getReservationPaymentTotals(req)` | Суми платежів по резервації | view_finance |
| `recalcReservationPaymentStatus(req)` | Перерахувати статус оплати | view_finance |

### Бюджети

| Функція | Опис | Дозвіл |
|---|---|---|
| `listBudgets(req)` | Список бюджетів | view_finance |
| `upsertBudget(req)` | Створити/оновити бюджет | manage_finance_settings |
| `deleteBudget(req)` | Видалити бюджет | manage_finance_settings |

### Категорії

| Функція | Опис | Дозвіл |
|---|---|---|
| `listCategories(req)` | Плоский список (?op_type=, ?archived=1) | view_finance |
| `getCategoryTree(req)` | Дерево категорій + `byOpType` групування | view_finance |
| `createCategory(req)` | Нова категорія/підкатегорія | manage_finance_settings |
| `updateCategory(req, ctx)` | Оновити (`op_type`/`classifier` — тільки корінь) | manage_finance_settings |
| `archiveCategory(req, ctx)` | Архівація (каскадом на дітей) | manage_finance_settings |
| `deleteCategory(req, ctx)` | Видалити (без дітей та зв'язаних операцій) | manage_finance_settings |
| `moveCategory(req, ctx)` | Drag-and-drop (`parent_id`/`sort_order`) | manage_finance_settings |
| `listExpenseCategories()` | Legacy категорії витрат | view_finance |
| `createExpenseCategory(req)` | Legacy створення категорії | manage_finance_settings |

### Проєкти (бізнес-одиниці)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listProjects(req)` | Список проєктів (Finmap-термінологія) | view_finance |
| `getProjectTree(req)` | Дерево з `children` | view_finance |
| `createProject(req)` | Новий проєкт/підпроєкт | manage_finance_settings |
| `updateProject(req, ctx)` | Оновити (`is_shared` тільки для кореня) | manage_finance_settings |
| `archiveProject(req, ctx)` | Архівація (каскадом) | manage_finance_settings |
| `deleteProject(req, ctx)` | Видалити (без дітей та зв'язків у 6 таблицях) | manage_finance_settings |
| `moveProject(req, ctx)` | Drag-and-drop | manage_finance_settings |
| `listBusinessUnits()` | Legacy (читає ту ж `business_units`) | view_finance |

### Контрагенти

| Функція | Опис | Дозвіл |
|---|---|---|
| `listCounterparties(req)` | Плоский список (?kind=, ?archived=1, ?search=) | view_finance |
| `getCounterpartyTree(req)` | Дерево + `byKind` групування | view_finance |
| `matchCounterpartyByText(req)` | Пошук за підрядком через `aliases_json` | view_finance |
| `getAliasSuggestions(req)` | Топ-10 часто-вживаних рядків для aliases | view_finance |
| `createCounterparty(req)` | Новий контрагент/підконтрагент | manage_finance_settings |
| `updateCounterparty(req, ctx)` | Оновити (`kind` тільки для кореня) | manage_finance_settings |
| `archiveCounterparty(req, ctx)` | Архівація (каскадом) | manage_finance_settings |
| `deleteCounterparty(req, ctx)` | Видалити (без дітей) | manage_finance_settings |
| `moveCounterparty(req, ctx)` | Drag-and-drop (match `kind`) | manage_finance_settings |

### Теги

| Функція | Опис | Дозвіл |
|---|---|---|
| `listTags(req)` | Список тегів (?archived=1) | view_finance |
| `createTag(req)` | Новий тег (UNIQUE case-insensitive) | manage_finance_settings |
| `updateTag(req, ctx)` | Оновити | manage_finance_settings |
| `archiveTag(req, ctx)` | Архівація | manage_finance_settings |
| `deleteTag(req, ctx)` | Видалити | manage_finance_settings |

### Рахунки

| Функція | Опис | Дозвіл |
|---|---|---|
| `listAccounts(req)` | Рахунки з обчисленим залишком | view_finance |
| `createAccount(req)` | Додати рахунок | manage_finance_settings |
| `updateAccount(req)` | Оновити | manage_finance_settings |
| `archiveAccount(req)` | Архівувати/відновити | manage_finance_settings |
| `deleteAccount(req, ctx)` | Видалити (без прив'язаних операцій) | manage_finance_settings |
| `reconcileAccount(req, ctx)` | Звірка — коригуюча операція за дельтою | manage_finance_settings |

### Курси валют

| Функція | Опис | Дозвіл |
|---|---|---|
| `listExchangeRates(req)` | Список курсів + поточні | view_finance |
| `getCurrentRate(req)` | Поточний курс для пари | view_finance |
| `upsertExchangeRate(req)` | Створити/оновити курс | manage_finance_settings |
| `deleteExchangeRate(req, ctx)` | Видалити | manage_finance_settings |

### CapEx

| Функція | Опис | Дозвіл |
|---|---|---|
| `listCapex()` | Список CapEx | view_finance |
| `getCapexItem(req, ctx)` | Отримати запис | view_finance |
| `createCapex(req)` | Додати | manage_finance_settings |
| `updateCapexItem(req, ctx)` | Оновити | manage_finance_settings |
| `deleteCapexItem(req, ctx)` | Видалити | manage_finance_settings |

### Нарахування (accruals)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listAccruals()` | Список нарахувань | view_finance |
| `getAccrual(req, ctx)` | Отримати | view_finance |
| `createAccrual(req)` | Додати | manage_finance_settings |
| `updateAccrual(req, ctx)` | Оновити | manage_finance_settings |
| `deleteAccrual(req, ctx)` | Видалити | manage_finance_settings |

### Банк (ручний імпорт)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listBankStatements()` | Список виписок | view_finance |
| `listBankTransactions(req)` | Транзакції виписки | view_finance |
| `updateBankTransaction(req, ctx)` | Оновити/зматчити | import_bank_data |
| `importBankStatement(req)` | Імпортувати XML виписку | import_bank_data |

### Bank inbox (автоматичний)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listBankInboxes()` | Список bank inboxes | view_finance |
| `createBankInbox(req)` | Створити | import_bank_data |
| `updateBankInbox(req)` | Оновити | import_bank_data |
| `deleteBankInbox(req)` | Видалити | import_bank_data |
| `toggleBankInbox(req)` | Вкл/вимк | import_bank_data |
| `testBankInbox(req)` | Тестове підключення | import_bank_data |
| `runBankInboxNow(req)` | Запустити зараз | import_bank_data |
| `runAllInboxes()` | Запустити всі | import_bank_data |
| `pollBankInboxesFromCron()` | Cron (X-Cron-Secret auth) | — (cron) |

### Автоматичні правила

| Функція | Опис | Дозвіл |
|---|---|---|
| `listAutoRules()` | Список правил | view_finance |
| `createAutoRule(req)` | Створити | manage_finance_settings |
| `updateAutoRule(req, ctx)` | Оновити | manage_finance_settings |
| `deleteAutoRule(req, ctx)` | Видалити | manage_finance_settings |
| `toggleAutoRule(req, ctx)` | Вкл/вимк | manage_finance_settings |
| `moveAutoRule(req, ctx)` | Змінити порядок | manage_finance_settings |
| `applyAutoRulesToOperations(req)` | Застосувати правила до операцій | manage_finance_settings |
| `autoMatchCounterpartiesAllOps(req)` | Авто-матч контрагентів | manage_finance_settings |

### Рекурентні шаблони + календар

| Функція | Опис | Дозвіл |
|---|---|---|
| `listRecurringTemplates()` | Список шаблонів | view_finance |
| `createRecurringTemplate(req)` | Створити | manage_finance_settings |
| `updateRecurringTemplate(req, ctx)` | Оновити | manage_finance_settings |
| `deleteRecurringTemplate(req, ctx)` | Видалити | manage_finance_settings |
| `toggleRecurringTemplate(req, ctx)` | Вкл/вимк | manage_finance_settings |
| `runRecurringNow(req, ctx)` | Запустити зараз | manage_finance_settings |
| `runAllDue()` | Запустити всі прострочені | manage_finance_settings |
| `getCalendarMonth(req)` | Фінансовий календар за місяць | view_finance |

### Рахунки-фактури (invoices)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listInvoices(req)` | Список інвойсів | view_finance |
| `getInvoiceHtml(req, ctx)` | HTML-рендер інвойсу | view_finance |
| `getInvoiceByReservation(req)` | Інвойс за резервацією | view_finance |
| `generateInvoiceForReservation(req)` | Генерація інвойсу | view_finance |
| `reissueInvoiceForReservation(req)` | Перевидача інвойсу | view_finance |
| `reissueInvoiceHandler(req, ctx)` | Перевидача (з RBAC) | manage_finance_settings |

### Звірка (reconciliation)

| Функція | Опис | Дозвіл |
|---|---|---|
| `reconciliationHandler(req)` | Журнал звірки інвойсів | view_finance |
| `getReconcileDashboard(req)` | Дашборд звірки | view_finance |

### Clearing (взаєморозрахунки)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listClearingAccounts(req)` | Клірингові рахунки | view_finance |
| `listReceivables(req)` | Дебіторська заборгованість | view_finance |
| `backfillReceivablesHandler(req)` | Бекфіл receivables | manage_finance_settings |

### Експорт

| Функція | Опис | Дозвіл |
|---|---|---|
| `exportOperations(req)` | Експорт операцій (CSV/Excel) | view_finance |
| `exportCashflow(req)` | Експорт cashflow | view_finance |
| `exportPnl(req)` | Експорт P&L | view_finance |
| `exportStatement(req)` | Експорт виписки | view_finance |

### Завантаження виписок (statement upload)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listStatementUploads()` | Список завантажень | view_finance |
| `uploadStatement(req)` | Завантажити виписку | import_bank_data |

### Telegram bridge

| Функція | Опис | Дозвіл |
|---|---|---|
| `recordTelegramOperation(req)` | Записати операцію з бота | — (bearer token) |
| `listTelegramOperations(req)` | Операції для бота | — (bearer token) |
| `listTelegramCategories(req)` | Категорії для бота | — (bearer token) |
| `listTelegramServices(req)` | Послуги для бота | — (bearer token) |
| `listTelegramReservations(req)` | Резервації для бота | — (bearer token) |
| `createTelegramServiceOrder(req)` | Замовлення послуги з бота | — (bearer token) |

### Вкладення (attachments)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listOperationAttachments(req)` | Вкладення операції | view_finance |
| `downloadAttachment(req, ctx)` | Завантажити файл | view_finance |
| `getAttachmentCounts(req)` | Кількість вкладень | view_finance |
| `uploadAttachment(req)` | Завантажити файл | manage_payments |
| `deleteAttachment(req, ctx)` | Видалити файл | manage_payments |

### Teya sync (термінальні платежі)

| Функція | Опис | Дозвіл |
|---|---|---|
| `getTeyaSyncStatus(req)` | Статус синхронізації | view_finance |
| `getTeyaCoverage(req)` | Покриття транзакцій | view_finance |
| `syncTeyaTransactions(req)` | Синхронізувати | import_bank_data |

### Імпорт-візард (generic)

| Функція | Опис | Дозвіл |
|---|---|---|
| `listImportFormats()` | Формати імпорту | view_finance |
| `listImportRuns()` | Історія імпортів | view_finance |
| `parseImportFile(req)` | Розпарсити файл | manage_finance_settings |
| `saveImportFormat(req)` | Зберегти формат | manage_finance_settings |
| `deleteImportFormat(req)` | Видалити формат | manage_finance_settings |
| `resolveEntities(req)` | Резолвити сутності | manage_finance_settings |
| `saveEntityResolutions(req)` | Зберегти резолюції | manage_finance_settings |
| `reviewRows(req)` | Ревізія рядків | manage_finance_settings |
| `commitImport(req)` | Підтвердити імпорт | manage_finance_settings |

### Інвестори

| Функція | Опис | Дозвіл |
|---|---|---|
| `listInvestors()` | Список інвесторів | view_finance |
| `createInvestor(req)` | Створити | manage_investors |
| `updateInvestor(req, ctx)` | Оновити | manage_investors |
| `deleteInvestor(req, ctx)` | Видалити | manage_investors |
| `listInvestments()` | Інвестиції | view_finance |
| `createInvestment(req)` | Створити | manage_investors |
| `updateInvestment(req, ctx)` | Оновити | manage_investors |
| `deleteInvestment(req, ctx)` | Видалити | manage_investors |
| `listMonthlyMetrics()` | Місячні метрики | view_finance |
| `upsertMonthlyMetric(req)` | Додати/оновити | manage_investors |
| `deleteMonthlyMetric(req, ctx)` | Видалити | manage_investors |
| `listPayouts()` | Виплати | view_finance |
| `createPayout(req)` | Створити виплату | manage_investors |
| `deletePayout(req, ctx)` | Видалити | manage_investors |
| `previewMonthlyPayout(req)` | Прев'ю місячної виплати | manage_investors |
| `bulkMonthlyPayout(req)` | Масова виплата | manage_investors |
| `listInvestorProperties()` | Об'єкти інвесторів | view_finance |
| `createInvestorProperty(req)` | Прив'язати об'єкт | manage_investors |
| `updateInvestorProperty(req, ctx)` | Оновити | manage_investors |
| `unlinkInvestorProperty(req, ctx)` | Відв'язати | manage_investors |
| `listInvestorProjects()` | Проєкти інвесторів | view_finance |
| `listMonthlyReports()` | Місячні звіти | view_finance |
| `upsertMonthlyReport(req)` | Створити/оновити звіт | manage_investors |
| `deleteMonthlyReport(req, ctx)` | Видалити | manage_investors |
| `getMonthlyDigest(req)` | Місячний дайджест | view_finance |
| `sendDigestTelegram(req)` | Надіслати дайджест в Telegram | manage_investors |
| `getTelegramStatus()` | Статус Telegram-бота | view_finance |
| `getAutoRevenueForMonth(req)` | Авто-дохід за місяць | view_finance |
| `listForecastScenarios()` | Сценарії прогнозу | view_finance |
| `upsertForecastScenario(req)` | Створити/оновити сценарій | manage_investors |
| `deleteForecastScenario(req, ctx)` | Видалити | manage_investors |
| `copyScenariosToAll(req)` | Копіювати сценарії на всіх | manage_investors |
| `listMonthlyNotes()` | Місячні нотатки | view_finance |
| `upsertMonthlyNote(req)` | Створити/оновити | manage_investors |
| `deleteMonthlyNote(req, ctx)` | Видалити | manage_investors |
| `listDocuments()` | Документи інвесторів | view_finance |
| `downloadDocument(req, ctx)` | Завантажити | view_finance |
| `uploadDocument(req)` | Завантажити файл | manage_investors |
| `deleteDocument(req, ctx)` | Видалити | manage_investors |
| `getInvestorAudit(req)` | Аудит-лог | view_finance |
| `previewCascadeDelete(req, ctx)` | Прев'ю каскадного видалення | view_finance |
| `relinkProjectToUnit(req, ctx)` | Перелінкувати проєкт | manage_investors |
| `executeCascadeDelete(req, ctx)` | Каскадне видалення | manage_investors |
| `getInvestorPortalData(req)` | Портал інвестора | — (portal_token) |
| `importFromSupabase(req)` | Імпорт з Supabase | manage_investors |

### Payment bridge (internal, no HTTP)

| Функція | Опис | Дозвіл |
|---|---|---|
| `createPaymentOperation(...)` | Створити операцію з платежу | internal |
| `hasPaymentOperation(...)` | Перевірити існування | internal |
| `deletePaymentOperationsForReservation(...)` | Видалити операції резервації | internal |

### Payment recovery + Paid services

| Функція | Опис | Дозвіл |
|---|---|---|
| `listOrphanPayments()` | Осиротілі платежі | view_finance |
| `listPaidServices()` | Оплачені послуги | view_finance |
| `restoreOrphanPayment(req)` | Відновити осиротілий платіж | manage_payments |

### Receipt inbox

| Функція | Опис | Дозвіл |
|---|---|---|
| `listReceiptInboxes()` | Список receipt inboxes | view_finance |
| `createReceiptInbox(req)` | Створити | import_bank_data |
| `updateReceiptInbox(req)` | Оновити | import_bank_data |
| `deleteReceiptInbox(req)` | Видалити | import_bank_data |
| `runReceiptInboxNow(req)` | Запустити зараз | import_bank_data |
| `listPendingReceipts()` | Необроблені чеки | view_finance |
| `downloadPendingReceipt(req, ctx)` | Завантажити чек | view_finance |
| `attachPendingReceipt(req)` | Прикріпити до операції | manage_payments |
| `archivePendingReceipt(req)` | Архівувати чек | manage_payments |

### Аудит

| Функція | Опис | Дозвіл |
|---|---|---|
| `getFinanceLog(req)` | Лог фінансових дій | view_finance |
| `getFinanceAudit(req)` | Перевірка цілісності (ledger inconsistencies) | view_finance |

## Залежності

**Модулі** (через публічний API):
- `@core/db` — підключення до БД
- `@core/auth` — перевірка сесії та RBAC

**Legacy** (TODO: мігрувати):
- `@/lib/auth` — getSessionUser
- `@/lib/permissions` — перевірка дозволів
- `@/lib/invoice-template` — генерація HTML інвойсів
- `@/lib/channels/telegram-bot` — Telegram-повідомлення

**⚠️ Порушення меж модулів:**
- `data/teya-reconcile-engine.ts` імпортує з `@/modules/payments/domain/teya-client` — має використовувати `@payments`

## Події

**Емітить** (`events/published.ts`):
| Подія | Payload | Коли |
|---|---|---|
| `finance.payment_created` | `{ paymentId, reservationId, amount, method }` | Нова операція-платіж |
| `finance.payment_deleted` | `{ paymentId, reservationId }` | Видалення платежу |
| `finance.expense_created` | `{ expenseId, categoryId, businessUnitId, amount, month }` | Нова витрата |

**Слухає**: Не слухає подій інших модулів.

## RBAC дозволи

| Дозвіл | Що покриває |
|---|---|
| `view_finance` | Всі read-ендпоінти (UI ховає навігацію) |
| `manage_payments` | CRUD операцій, вкладення, payment recovery |
| `manage_finance_settings` | Рахунки, категорії, проєкти, контрагенти, теги, курси, бюджети, авто-правила, рекурентні, CapEx, нарахування, імпорт-візард |
| `import_bank_data` | Банківські виписки, bank inbox, statement upload, receipt inbox, Teya sync |
| `manage_investors` | Інвестори, інвестиції, метрики, виплати, документи, сценарії, нотатки |

## Схема даних

**Головна таблиця:** `fin_operations` — єдиний реєстр фактичного руху коштів
(income / expense / transfer; всі джерела: ручні, банк-імпорт, Telegram,
Teya, OTA, recurring). Запис ТІЛЬКИ через `createOperationInTx()`.

**Довідники:** `expense_categories` (дерево, op_type + classifier),
`business_units` (проєкти), `finance_counterparties`, `finance_tags` +
`fin_operation_tags`, `finance_accounts`, `finance_exchange_rates`.

**Допоміжні:** `fin_budgets`, `fin_recurring_templates`, `bank_statements` +
`bank_transactions` (staging виписок), `fin_bank_inboxes`,
`fin_channel_receivables` (дебіторка OTA), `capex_items`, `accruals`,
`invoices`, `fin_operation_audit`.

> Legacy-таблиці `payments`, `expenses`, `income`, `transfers` ВИДАЛЕНІ
> (міграція PR #6 перелила їх у fin_operations). Не посилатися.

## Структура файлів

```
finance/
  api/
    index.ts                          ← єдина точка експорту (409 рядків, RBAC)
    _guard.ts                         ← withPermission() helper
    reports.handlers.ts               ← P&L, cashflow, overview, matrices
    operations.handlers.ts            ← CRUD операцій
    budgets.handlers.ts
    categories.handlers.ts            ← дерево категорій
    projects.handlers.ts              ← дерево проєктів (бізнес-одиниці)
    counterparties.handlers.ts        ← дерево контрагентів
    tags.handlers.ts
    accounts.handlers.ts              ← рахунки + reconcile
    exchange-rates.handlers.ts
    capex.handlers.ts / capex-item.handlers.ts
    accruals.handlers.ts / accrual.handlers.ts
    bank.handlers.ts                  ← ручний імпорт виписок
    bank-inbox.handlers.ts            ← автоматичний bank inbox
    cron-bank-inbox.handlers.ts       ← cron-тригер
    auto-rules.handlers.ts
    recurring.handlers.ts             ← рекурентні шаблони
    calendar.handlers.ts
    invoices.handlers.ts
    reconciliation.handlers.ts
    reconcile-dashboard.handlers.ts
    clearing.handlers.ts
    export.handlers.ts
    statement-upload.handlers.ts
    telegram-bridge.handlers.ts
    attachments.handlers.ts
    teya-sync.handlers.ts
    import-wizard.handlers.ts
    investors.handlers.ts
    investor-audit.handlers.ts
    investor-notes.handlers.ts
    investor-documents.handlers.ts
    investor-portal.handlers.ts
    forecast-scenarios.handlers.ts
    supabase-import.handlers.ts
    payment-bridge.ts                 ← internal (no HTTP)
    payment-recovery.handlers.ts
    receipt-inbox.handlers.ts
    log.handlers.ts
    audit.handlers.ts
  data/                               ← 22 engine-файли (НЕ *.repo.ts)
    auto-revenue-engine.ts
    auto-rules-engine.ts
    bank-inbox-engine.ts
    cashback-calculator.ts
    clearing-engine.ts
    entity-matcher.ts
    export-utils.ts
    import-commit-engine.ts
    import-wizard-engine.ts
    investor-portal-engine.ts
    kb-pdf-parser.ts
    llm-statement-extractor.ts
    monthly-digest-engine.ts
    pdf-worker-init.ts
    performance-score.ts
    receipt-inbox-engine.ts
    recurring-engine.ts
    statement-parsers.ts
    supabase-import-engine.ts
    telegram-bot.ts
    teya-reconcile-engine.ts
  events/
    published.ts
```

> ⚠️ **Відхилення від конвенції**: `data/` використовує `*-engine.ts` замість `*.repo.ts`. Це свідомий вибір — engines містять складну бізнес-логіку, а не чисті SQL-запити.

## Точки розширення

- Новий тип звіту → `api/reports.handlers.ts` + додати до `index.ts`
- Новий тип операції → `api/operations.handlers.ts`
- Новий bank parser → `data/statement-parsers.ts`
- Новий авто-правило → `data/auto-rules-engine.ts`
- Нова інвесторська сутність → `api/investors.handlers.ts` + `index.ts`
- Новий RBAC дозвіл → `api/_guard.ts` + `@/lib/permissions`
- Нова подія → `events/published.ts` + `src/core/event-bus/registry.ts`

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
