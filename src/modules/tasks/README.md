# Tasks Module

> Внутрішній таск-менеджер для команди — задачі, проєкти, теги, пріоритети. Найчистіший модуль проєкту: правильна структура `api/data/domain`, нуль порушень кордонів модулів.

## Публічне API

Всі публічні функції та типи знаходяться в `api/index.ts`. Імпортуй тільки звідти:

```ts
import {
  listTasks, createTask, getTask, updateTask, deleteTask, reorderTasks,
  listProjects, createProject, getProject, updateProject, deleteProject,
  listTags, createTag, getTag, updateTag, deleteTag,
  type Task, type TaskProject, type TaskTag, type TaskStatus, type TaskPriority,
  TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG,
} from '@tasks'
```

### Задачі

| Функція / Тип | Опис |
|---|---|
| `listTasks(request)` | Список задач з фільтрами (проєкт, статус, виконавець, пріоритет, пошук, дедлайн) |
| `createTask(request)` | Створення задачі. Підтримує теги, Telegram-нотифікацію при призначенні |
| `getTask(request, { params })` | Отримання задачі за ID (з підзадачами та тегами) |
| `updateTask(request, { params })` | Оновлення полів задачі. Telegram-нотифікація при зміні статусу/виконавця |
| `deleteTask(request, { params })` | Видалення задачі (+ очищення вкладень з диску) |
| `reorderTasks(request)` | Масове оновлення `sort_order` для drag-and-drop |

### Проєкти

| Функція / Тип | Опис |
|---|---|
| `listProjects()` | Список проєктів (з кількістю задач) |
| `createProject(request)` | Створення проєкту (назва, колір, іконка, прив'язка до об'єкта) |
| `getProject(request, { params })` | Отримання проєкту за ID |
| `updateProject(request, { params })` | Оновлення проєкту |
| `deleteProject(request, { params })` | Видалення проєкту |

### Теги

| Функція / Тип | Опис |
|---|---|
| `listTags()` | Список тегів (сортування за назвою) |
| `createTag(request)` | Створення тегу (назва, колір) |
| `getTag(request, { params })` | Отримання тегу за ID |
| `updateTag(request, { params })` | Оновлення тегу |
| `deleteTag(request, { params })` | Видалення тегу (cascade видаляє зв'язки) |

### Типи та константи

| Функція / Тип | Опис |
|---|---|
| `type Task` | Задача: title, status, priority, assignee, project, due_date, tags, subtasks |
| `type TaskProject` | Проєкт: name, color, icon, property_id, task_count |
| `type TaskTag` | Тег: name, color |
| `type TaskStatus` | `'todo' \| 'in_progress' \| 'done' \| 'cancelled'` |
| `type TaskPriority` | `'low' \| 'normal' \| 'high' \| 'urgent'` |
| `TASK_STATUS_CONFIG` | Конфіг статусів: українські лейбли, іконки, кольори |
| `TASK_PRIORITY_CONFIG` | Конфіг пріоритетів: українські лейбли, іконки, кольори |

## Залежності

**Модулі** (через публічний API):
- `@core/db` — підключення до БД (getDb)
- `@/lib/auth` — авторизація (getSessionUser, getSessionIdFromCookies) — ⚠️ legacy-імпорт, має бути `@core/auth`

**Shared**:
- `next/server` — NextRequest, NextResponse для HTTP-обгорток
- `path`, `fs` — видалення файлів вкладень при видаленні задачі

## Події

Модуль **не має каталогу `events/`** — не емітить і не слухає подій шини.

> **Примітка:** Telegram-нотифікації (призначення задачі, зміна статусу, щоденний дайджест) реалізовані через прямі HTTP-виклики до Telegram Bot API в `data/task-notifications.ts`, минаючи шину подій.

## Схема даних

**Таблиці:** `tasks`, `task_projects`, `task_tags`, `task_tag_links`, `task_attachments`

Основні зв'язки:
- `tasks.project_id` → `task_projects.id`
- `tasks.parent_id` → `tasks.id` (підзадачі)
- `tasks.assignee_id` → `app_users.id`
- `task_tag_links` — зв'язок many-to-many між `tasks` та `task_tags`
- `task_attachments.task_id` → `tasks.id`

## Структура файлів

```
tasks/
  api/
    index.ts              ← єдина точка експорту (ТІЛЬКИ звідси імпортувати ззовні)
    tasks.handlers.ts     ← HTTP-обгортки: CRUD задач + reorder
    projects.handlers.ts  ← HTTP-обгортки: CRUD проєктів
    tags.handlers.ts      ← HTTP-обгортки: CRUD тегів
  data/
    tasks.repo.ts         ← SQL-запити для задач (list, get, create, update, delete, reorder, setTags)
    projects.repo.ts      ← SQL-запити для проєктів
    tags.repo.ts          ← SQL-запити для тегів
    task-notifications.ts ← Telegram-нотифікації (assign, status change, daily digest)
  domain/
    types.ts              ← TypeScript типи (Task, TaskProject, TaskTag, TaskStatus, TaskPriority)
                             та константи (TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG)
  README.md               ← цей файл
```

> **Відсутні каталоги** (не потрібні на даному етапі):
> - `events/` — модуль працює синхронно, Telegram-нотифікації реалізовані напряму
> - `ui/` — UI використовує API через HTTP-роути
> - `__tests__/` — TODO: додати тести

## Точки розширення

- Додати нову сутність (чеклісти, коментарі) → `data/[entity].repo.ts` + `api/[entity].handlers.ts` + оновити `api/index.ts`
- Новий статус або пріоритет → `domain/types.ts` (тип + конфіг)
- Підключити до шини подій → створити `events/published.ts` з подіями `task.created`, `task.status_changed`, `task.assigned`
- Замінити legacy-імпорт `@/lib/auth` → `@core/auth`

---

*Оновлюй цей файл при будь-якій значній зміні модуля.*
