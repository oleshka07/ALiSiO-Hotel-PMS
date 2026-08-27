# ALiSiO PMS — Instructions for Claude

## Project Overview

Single-tenant PMS (Property Management System) for a glamping/resort. Next.js 16 App Router + React 19 + TypeScript + SQLite (better-sqlite3, synchronous). UI language: Ukrainian.

See [ARCHITECTURE.md](ARCHITECTURE.md) for full architecture documentation.

---

## Modular Architecture Rules

This project uses a **modular monolith** architecture. Follow these rules strictly:

### 1. Module boundaries

- Each module lives in `src/modules/<name>/`
- Modules communicate **ONLY** through `api/index.ts` — never import from `domain/`, `data/`, or `events/` of another module
- `src/core/` (db, auth, event-bus) can be imported by any module
- `src/shared/` (ui, utils, types) can be imported by any module
- `src/shared/` must NOT import from modules

### 2. Correct import patterns

```ts
// ✅ CORRECT — module public API
import { createBooking, type Booking } from '@bookings'
import { getDb } from '@core/db'
import { eventBus } from '@core/event-bus'
import { type DateRange } from '@shared/types'

// ❌ WRONG — internal module paths
import { BookingRepo } from '@/modules/bookings/data/booking.repo'
import { Booking } from '@/modules/bookings/domain/booking'
```

### 3. app/ layer must be thin

`app/` contains only Next.js routing — no business logic:

```ts
// app/bookings/page.tsx
import { BookingsPage } from '@bookings'
export default BookingsPage

// app/api/bookings/route.ts
import { bookingsHandlers } from '@bookings'
export const GET = bookingsHandlers.list
```

### 4. Event bus for cross-module side-effects

When module A needs to trigger behavior in module B without knowing about it:

```ts
import { eventBus } from '@core/event-bus'
await eventBus.emit('booking.created', { bookingId, guestId, unitId, total })
```

New event types must be added to `src/core/event-bus/registry.ts`.

### 5. README is required

**When you create or significantly change a module, update its `README.md`.**

Use the template: `docs/_templates/MODULE_README.md`

README must contain: purpose, public API list, dependencies, events (emits/listens), data schema, extension points.

### 6. New module checklist

When creating a new module:
- [ ] Create `src/modules/<name>/{api,domain,data,events,ui,__tests__}/`
- [ ] Add TypeScript path in `tsconfig.json`: `"@name": ["./src/modules/name/api"]`
- [ ] Add new events to `src/core/event-bus/registry.ts`
- [ ] Fill in `README.md` from template
- [ ] Update migration status in `ARCHITECTURE.md`

---

## Tech Stack Rules

- **Database:** SQLite via `better-sqlite3` — always synchronous, no `async/await` in repos
- **No ORM** — raw SQL only
- **Auth:** session cookies, RBAC via `@core/auth`
- **No new dependencies** unless absolutely necessary — minimal deps philosophy
- **TypeScript strict** — no `any` unless in existing legacy code

---

## Code Style

- Ukrainian UI labels
- No comments unless the WHY is non-obvious
- No docstrings
- Prefer editing existing files over creating new ones
- No backwards-compatibility hacks for removed code

---

## Deploy Safety

**This project auto-deploys `main` to production VPS.** A failing build can take the entire system down. Rules:

- NEVER `git push` directly to `main`. Use a feature branch + PR.
- Before pushing any branch, verify locally: `npx tsc --noEmit` (no TS1xxx errors) and `npm run build` (succeeds).
- The build runs on GitHub Actions, not the VPS. The server unpacks a ready release into `releases/<sha>/` and flips a `current` symlink; it never runs `npm` and never compiles. `data/` and `.env` are host state, shared by every release — a release must never carry either.
- If you see syntax errors after editing (mismatched quotes, broken JSX, missing brackets) — FIX before committing.
- Activate the pre-commit hook once per clone: `bash scripts/setup-hooks.sh` (or `scripts\setup-hooks.cmd` on Windows).
- See [docs/DEPLOY_SAFETY.md](docs/DEPLOY_SAFETY.md) for the full pipeline (CI, branch protection, deploy guards).
- Payments module: see [src/modules/payments/README.md](src/modules/payments/README.md) before touching any Teia logic.
