# ALiSiO PMS — Architecture

## Overview

ALiSiO PMS is a **modular monolith** built on Next.js 16 App Router + React 19 + TypeScript with SQLite (better-sqlite3).

Each business domain is a self-contained module in `src/modules/`. Modules communicate only through their public API (`api/index.ts`) or via the event bus (`src/core/event-bus/`).

---

## Module Map

```
src/
  modules/
    bookings/       — reservations, group bookings, availability, widget, analytics
    guests/         — guest profiles, portal (/guest/[token]), registration, feedback
    properties/     — properties, units, unit-types, buildings, categories
    pricing/        — rate plans, price calendar, promotions, restrictions
    finance/        — operations, P&L, cashflow, accounts, investors, import, Teya
    payments/       — Teya checkout sessions, webhooks, refunds
    crm/            — leads, conversations, inbox, pipeline, AI knowledge
    channels/       — Booking.com, Hostex, iCal integrations
    reports/        — city tax, glamping report, analytics
    tasks/          — internal task manager (projects, tags, priorities)
    auth/           — login/logout, user CRUD
    admin/          — iCal cleanup, bulk translation
    dashboard/      — main dashboard overview + alerts
    notifications/  — daily Telegram digest (⚠️ needs restructuring)

  core/
    db/             — SQLite connection (better-sqlite3), migrations
    auth/           — session management, RBAC (7 roles)
    event-bus/      — typed in-memory event emitter + event registry
    security/       — PII masking (maskLastName, maskEmail, etc.)

  shared/
    ui/             — layout components, design system (Header, Sidebar, mobile)
    utils/          — rate-limit, translate, useCurrentUser, useDevice
    types/          — shared base types (DateRange, Money, Pagination, etc.)
```

---

## Module Dependencies

```
bookings  ──depends on──► guests (via @guests)
bookings  ──depends on──► pricing (via @pricing)
bookings  ──depends on──► properties (via @properties)
bookings  ──depends on──► payments (via @payments)      ← subscribes to payment.completed
finance   ──depends on──► bookings (via @bookings)
finance   ──depends on──► payments (via @payments)      ← ⚠️ boundary violation: direct internal import
channels  ──depends on──► bookings (via @bookings)
channels  ──depends on──► properties (via @properties)
crm       ──depends on──► guests (via @guests)
crm       ──depends on──► bookings (via event bus)      ← subscribes to booking.created
crm       ──depends on──► payments (via event bus)      ← subscribes to payment.completed
reports   ──depends on──► bookings (via @bookings)
reports   ──depends on──► finance (via @finance)

all modules ──depend on──► @core/db, @core/auth, @core/event-bus
all modules ──depend on──► @shared/types, @shared/utils
```

---

## Events

Key events flowing through the system.

**Actively wired** (emit + subscribe connected):

| Event | Emitted by | Consumed by | What happens |
|---|---|---|---|
| `booking.created` | bookings | crm | Creates CRM lead + conversation |
| `payment.completed` | payments | bookings, crm | Sends confirmation email; updates CRM stage |

**Defined but not yet wired** (types exist in `events/published.ts`, no active emit/subscribe):

| Event | Defined by | Notes |
|---|---|---|
| `reservation.created/updated/deleted` | bookings | Will replace `booking.created` |
| `payment.session_created/failed/refunded` | payments | Types ready, not emitting yet |
| `finance.payment_created/deleted` | finance | Not connected to event bus |
| `finance.expense_created` | finance | Not connected to event bus |
| `guest.registered/updated/feedback` | guests | TODO: wire to CRM |
| `property/unit.created/changed` | properties | Not wired |
| `pricing.updated` | pricing | Not wired |
| `channel.reservation_synced/ari_synced` | channels | Not wired |
| `user.logged_in/created/deleted` | auth | Not wired |
| `lead.created/stage_changed/deleted` | crm | Not wired |
| `admin.ical_cleanup_executed` | admin | Not wired |

Full event type definitions: [`src/core/event-bus/registry.ts`](src/core/event-bus/registry.ts)

---

## Import Rules (enforced by ESLint + TypeScript)

```
✅ ALLOWED
  import { createBooking } from '@bookings'         // module public API
  import { getDb } from '@core/db'                  // core infrastructure
  import { DateRange } from '@shared/types'          // shared types
  import { eventBus } from '@core/event-bus'        // event bus

❌ FORBIDDEN
  import { BookingRepo } from '@/modules/bookings/data/booking.repo'  // internal
  import { Booking } from '@/modules/bookings/domain/booking'          // internal
  import anything from '@/modules/bookings/events/published'           // internal
```

ESLint rule: `no-restricted-imports` (currently `warn`, will become `error` after full migration)

TypeScript paths: all 14 modules are registered in `tsconfig.json` as `@<name>` → `src/modules/<name>/api`.

---

## Directory Structure Convention

Every module follows this structure:

```
modules/<name>/
  api/
    index.ts        ← ONLY public exports (functions + types)
    handlers.ts     ← Next.js route handler wrappers
  domain/
    types.ts        ← TypeScript interfaces & domain types
    [entity].ts     ← business logic, validations
  data/
    [entity].repo.ts ← SQL queries (synchronous better-sqlite3)
  events/
    published.ts    ← event types this module emits
    subscribed.ts   ← subscriptions to other modules' events
  ui/
    [Page].tsx      ← React components for this module
    [Form].tsx
  __tests__/
  README.md         ← module documentation (required)
```

---

## app/ Layer (Next.js routing)

`app/` contains only routing — no business logic:

```ts
// app/bookings/page.tsx — CORRECT
import { BookingsPage } from '@bookings'
export default BookingsPage

// app/api/bookings/route.ts — CORRECT  
import { bookingsHandlers } from '@bookings'
export const GET = bookingsHandlers.list
export const POST = bookingsHandlers.create
```

---

## Migration Status

> Last updated: 2026-06-30

### Core

| Module | Status | Notes |
|---|---|---|
| `core/db` | 🟡 Shim | Re-exports from `src/lib/db.ts` |
| `core/auth` | 🟡 Shim | Re-exports from `src/lib/auth.ts` + `src/lib/permissions.ts` |
| `core/event-bus` | ✅ Done | Original implementation (EventBus singleton + typed registry) |
| `core/security` | ✅ Done | PII masking utilities (new) |

### Modules

| Module | Status | api/ | domain/ | data/ | events/ | Legacy `@/lib` | Notes |
|---|---|---|---|---|---|---|---|
| `tasks` | ✅ Done | ✅ | ✅ | ✅ 3 repos | — | 1 | Cleanest module, zero boundary violations |
| `properties` | ✅ Done | ✅ | ✅ | ✅ 5 repos | ✅ defined | 2 | Clean structure |
| `payments` | 🟡 Partial | ✅ | ✅ | ✅ 1 repo | ✅ active | 3 | Events active (emit payment.*) |
| `bookings` | 🟡 Partial | ✅ | ✅ | ✅ 1 repo | ✅ active | ~14 | Events active (emit + subscribe), largest UI |
| `guests` | 🟡 Partial | ✅ | ✅ | ✅ 7 repos | ✅ defined | ~15 | Full structure, events not wired |
| `finance` | 🟡 Partial | ✅ (409 lines!) | — | ✅ 22 engines | ✅ defined | 8 | Largest module, 1 boundary violation |
| `pricing` | 🟡 Partial | ✅ | ✅ | ✅ 2 repos | ✅ defined | 3 | Events not wired |
| `channels` | 🟡 Partial | ✅ | ✅ | ✅ 2 repos | ✅ defined | 11 | Most legacy-coupled after CRM |
| `crm` | 🟡 Partial | ✅ | — | — | ✅ active | **26** | Highest legacy coupling, uses `components/` not `ui/` |
| `auth` | 🟡 Shell | ✅ | — | — | ✅ defined | 1 | api + events, events not wired |
| `admin` | ⬜ Shell | ✅ | — | — | ✅ defined | 1 | Minimal: 3 API functions |
| `dashboard` | ⬜ Shell | ✅ | — | — | ✅ empty | 0 | Read-only, cleanest deps |
| `reports` | ⬜ Shell | ✅ | — | — | ✅ empty | 0 | Read-only aggregation |
| `notifications` | ⚠️ Broken | ❌ | — | ✅ 1 file | ❌ | 0 | Only `data/daily-digest.ts`, no api/ |

Legend: ✅ Done · 🟡 Partial (has structure but legacy imports remain) · 🟡 Shell (api barrel exists, minimal structure) · ⬜ Shell (minimal) · ⚠️ Broken

### Migration Blockers

1. **`@/lib/channels/telegram-bot`** — imported by 6 modules (bookings, payments, pricing, finance, guests, crm). #1 candidate for `@core/notifications`.
2. **`@/lib/auth` + `@/lib/permissions`** — imported by 5 modules. `@core/auth` shim exists but not all modules use it.
3. **CRM legacy coupling** — 26 `@/lib/` imports across ai, channels, email, sync. Largest migration effort.
4. **Finance boundary violation** — `finance/data/teya-reconcile-engine.ts` imports from `@/modules/payments/domain/teya-client` instead of `@payments`.

---

## How to Add a New Module

1. Copy `docs/_templates/MODULE_README.md` → `src/modules/<name>/README.md`
2. Create directory structure: `api/`, `domain/`, `data/`, `events/`, `ui/`, `__tests__/`
3. Add TypeScript path in `tsconfig.json`: `"@name": ["./src/modules/name/api"]`
4. Add new events to `src/core/event-bus/registry.ts`
5. Export public API from `api/index.ts`
6. Fill in `README.md`
