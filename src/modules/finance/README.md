# Finance Module

Управляє фінансами: платежі до резервацій, витрати, CapEx, нарахування (accruals), банківські виписки, бізнес-одиниці. Надає P&L, cashflow та очікувані платежі.

## Публічне API

```ts
import { listPayments, createPayment, getFinanceOverview } from '@finance'
```

| Функція / Тип | Опис |
|---|---|
| `getFinanceOverview(req)` | Загальний огляд фінансів |
| `getPnl(req)` | P&L звіт |
| `getCashflow(req)` | Cashflow звіт |
| `getExpectedPayments(req)` | Очікувані надходження |
| `listPayments(req)` | Список платежів |
| `createPayment(req)` | Додати платіж до резервації |
| `deletePayment(req, ctx)` | Видалити платіж |
| `listExpenses()` | Список витрат |
| `createExpense(req)` | Додати витрату |
| `getExpense(req, ctx)` | Отримати витрату |
| `updateExpense(req, ctx)` | Оновити витрату |
| `deleteExpense(req, ctx)` | Видалити витрату |
| `listExpenseCategories()` | Категорії витрат (legacy — зберігається для сумісності) |
| `createExpenseCategory(req)` | Додати категорію (legacy) |
| `listCategories(req)` | Плоский список категорій (?op_type=, ?archived=1) |
| `getCategoryTree(req)` | Дерево категорій + `byOpType` групування |
| `createCategory(req)` | Нова категорія/підкатегорія — підкатегорія успадковує `op_type`/`classifier` |
| `updateCategory(req, ctx)` | Оновлення. `op_type`/`classifier` доступні лише для кореня |
| `archiveCategory(req, ctx)` | Архівація (каскадом на дітей) |
| `deleteCategory(req, ctx)` | Видалення (тільки якщо немає дітей і немає зв'язаних операцій) |
| `moveCategory(req, ctx)` | Зміна `parent_id`/`sort_order` (drag-and-drop) |
| `listBusinessUnits()` | Бізнес-одиниці (legacy — використовується старим UI) |
| `listProjects(req)` | Проєкти (нова Finmap-термінологія, читає ту саму `business_units`) |
| `getProjectTree(req)` | Дерево проєктів з `children` |
| `createProject(req)` | Новий проєкт / підпроєкт (успадковує `is_shared` від батька) |
| `updateProject(req, ctx)` | Оновлення. `is_shared` доступний тільки для кореня |
| `archiveProject(req, ctx)` | Архівація (каскадом на дітей) |
| `deleteProject(req, ctx)` | Видалення (тільки якщо немає дітей і немає зв'язків у 6 таблицях) |
| `moveProject(req, ctx)` | Зміна `parent_id`/`sort_order` (drag-and-drop) |
| `listCounterparties(req)` | Плоский список контрагентів (?kind=, ?archived=1, ?search=) |
| `getCounterpartyTree(req)` | Дерево контрагентів + `byKind` групування |
| `createCounterparty(req)` | Новий контрагент/підконтрагент (успадковує `kind`) |
| `updateCounterparty(req, ctx)` | Оновлення, `kind` тільки для кореня |
| `archiveCounterparty(req, ctx)` | Архівація (каскадом на дітей) |
| `deleteCounterparty(req, ctx)` | Видалення (тільки якщо немає дітей) |
| `moveCounterparty(req, ctx)` | Зміна `parent_id`/`sort_order` (drag-and-drop, match `kind`) |
| `matchCounterpartyByText(req)` | Пошук контрагента за підрядком коментаря через `aliases_json` (longest-match, case-insensitive) |
| `getAliasSuggestions(req)` | Топ-10 часто-вживаних рядків з existing counterparty полів (expenses/income/bank_transactions) |
| `listTags(req)` | Список тегів (?archived=1) |
| `createTag(req)` | Новий тег (UNIQUE case-insensitive на `name`) |
| `updateTag(req, ctx)` | Оновлення |
| `archiveTag(req, ctx)` | Архівація (is_active) |
| `deleteTag(req, ctx)` | Видалення (поки без FK-перевірок — буде у PR #6) |
| `listCapex()` | Список CapEx |
| `createCapex(req)` | Додати CapEx |
| `getCapexItem(req, ctx)` | Отримати CapEx-запис |
| `updateCapexItem(req, ctx)` | Оновити CapEx-запис |
| `deleteCapexItem(req, ctx)` | Видалити CapEx-запис |
| `listAccruals()` | Список нарахувань |
| `createAccrual(req)` | Додати нарахування |
| `getAccrual(req, ctx)` | Отримати нарахування |
| `updateAccrual(req, ctx)` | Оновити нарахування |
| `deleteAccrual(req, ctx)` | Видалити нарахування |
| `listBankStatements()` | Список банківських виписок |
| `listBankTransactions(req)` | Транзакції виписки |
| `updateBankTransaction(req, ctx)` | Оновити/зматчити транзакцію |
| `importBankStatement(req)` | Імпортувати XML виписку |
| `listAccounts(req)` | Список рахунків з обчисленим залишком (?archived=1 включно з архівними) |
| `createAccount(req)` | Додати рахунок |
| `updateAccount(req)` | Оновити рахунок |
| `archiveAccount(req)` | Архівувати/відновити рахунок (`is_active`) |
| `deleteAccount(req, ctx)` | Видалити рахунок (тільки якщо немає прив'язаних операцій) |
| `reconcileAccount(req, ctx)` | Звірка залишку — створює коригуючу операцію за дельтою |
| `listExchangeRates(req)` | Список курсів валют + поточні діючі |
| `upsertExchangeRate(req)` | Створити/оновити курс (UNIQUE на пару + дата) |
| `deleteExchangeRate(req, ctx)` | Видалити курс |

## Залежності

**Модулі** (через публічний API):
- `@core/db` — підключення до БД
- `@core/auth` — перевірка сесії

## Події

**Емітить** (`events/published.ts`):
| Подія | Payload | Коли |
|---|---|---|
| `finance.payment_created` | `{ paymentId, reservationId, amount }` | Новий платіж |
| `finance.payment_deleted` | `{ paymentId }` | Видалення платежу |
| `finance.expense_created` | `{ expenseId, amount, category }` | Нова витрата |

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
    index.ts                      ← єдина точка експорту
    reports.handlers.ts
    payments.handlers.ts
    expenses.handlers.ts
    expense.handlers.ts
    expense-categories.handlers.ts
    business-units.handlers.ts
    capex.handlers.ts
    capex-item.handlers.ts
    accruals.handlers.ts
    accrual.handlers.ts
    bank.handlers.ts
  events/
    published.ts
```

## Точки розширення

- Новий тип звіту → `reports.handlers.ts`
- Новий фінансовий документ → окремий `<name>.handlers.ts` + `index.ts`
- Нова подія → `events/published.ts` + `src/core/event-bus/registry.ts`

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
