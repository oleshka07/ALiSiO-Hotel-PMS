# Guests Module

Manages guest profiles, guest portal (token-based public page), registration, chat, feedback, service orders, and the guest registry (evidenční kniha + Ubyport reporting to the Czech foreign police).

## Public API

```ts
import {
  listGuests, createGuest,
  getGuest, updateGuest, deleteGuest,
  getGuestPortal,
  registerGuests,
  submitFeedback,
  orderServices,
  payForService,
  getChatMessages, sendChatMessage,
  translateTexts,
  getRegistry, updateRegistryEntry, bulkUpdateRegistry,
  exportRegistry, exportRegistryUnl,
  getUbyportSettings, saveUbyportSettings,
} from '@guests';
```

## Responsibilities

- **Guest CRM** — CRUD for guest profiles with stay history
- **Guest Portal** — token-based public page (pre-arrival, in-stay, post-checkout phases)
- **Registration** — multi-guest registration form with find-or-create guest linking
- **Chat** — real-time messaging between guest and staff
- **Feedback** — post-stay feedback saved as reservation activity
- **Services** — additional service ordering + Teya payment integration
- **Translations** — on-demand OpenAI translation of portal content
- **Guest registry** — evidenční a domovní kniha: fees, exemptions, CSV export
- **Ubyport** — `.unl` batch file for the foreign police (Příloha č. 3 Provozního řádu): CP1250, record A (property) + records U (guests), validated up front so a rejectable batch is never produced silently

### Ubyport notes

- `domain/ubyport.ts` owns the format: CP1250 encoding, the §2.4.1 character sets, `dd.mm.yyyy` dates, and free-text nationality → three-letter code (including oval plate codes like `D` → `DEU`, which the web service rejects as `E_NATI_INVALID`).
- The export **refuses** a batch containing records the police would reject, and lists them per guest and field. `skipInvalid=1` emits the valid rows only and reports how many were left out.
- Record A (IDUB, zkratka, address, účel pobytu) lives in `settings` under `ubyport_*`, edited at `/settings/ubyport`. `ucelPobytu` is never seeded — it comes from the police číselník.
- Both codebooks are read from the service itself (`DejMiCiselnik('X', 'Staty' | 'UcelyPobytu' | 'Chyby')`) and embedded, so no code is inferred. `UcelyPobytu` is not a decade scale — there is no 20, 30, 40, 50, 60, 70 or 80: turistika is 10, obchodní 01, podnikání-OSVČ 06, studium 11, zaměstnání 27, zdravotní 00, jiné 99.
- `Staty` Kod3 is ISO 3166-1 alpha-3 and gates every nationality; CZE is absent from it by design. Their Kod2 is **not** ISO alpha-2 (SK = Saint Kitts, SI = Solomon Islands, GE = Equatorial Guinea) and must never be used.
- `Bydliště` is built per §2.7 as `Ulice, Město, XXX-Název státu` with the Czech name from the codebook. When the state cannot be recognised in our free-text address the field goes out empty (§3.3 allows 0 characters) and the guest appears under warnings — a malformed address gets the whole record rejected.
- `includeReported=1` exports guests already flagged as reported — needed for the 26.07–05.09 window, where the flag was set by a `PseudoRazitko` that produced no batch.
- A guest is marked reported **only after the portal accepts the batch**, via `mark_police_bulk` with the receipt number. A web-service `PseudoRazitko` is not an acceptance.
- Verify the produced file with the police's `UbyData` application before uploading it to Ubyport.

## Data Layer

| File | Responsibility |
|------|---------------|
| `guests.repo.ts` | Guest CRUD with stay aggregates |
| `guest-portal.repo.ts` | Portal page data (large JOIN + config merge) |
| `registration.repo.ts` | Guest registration (find-or-create, transaction) |
| `chat.repo.ts` | Chat messages read/write |
| `guest-actions.repo.ts` | Feedback, service orders, Teya payment helpers |
| `registry.repo.ts` | Evidenční kniha queries, police flags, `ubyport_*` settings |

## Cross-Module Dependencies

| Dependency | Status | Future plan |
|-----------|--------|-------------|
| `@/lib/sync/guest-lead-sync` | direct import | emit `crm.guest_updated` event |
| `@/lib/channels/telegram-bot` | direct import | emit `channels.notify` event |
| `@/lib/rate-limit` | direct import | move to `@shared/rate-limit` |
| `@/lib/teya` | direct import | emit `finance.payment_initiated` event |
| `@/lib/translate` | direct import | move to `@shared/translate` |

## Routes

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/guests` | `listGuests` |
| POST | `/api/guests` | `createGuest` |
| GET | `/api/guests/[id]` | `getGuest` |
| PATCH | `/api/guests/[id]` | `updateGuest` |
| DELETE | `/api/guests/[id]` | `deleteGuest` |
| GET | `/api/guest/[token]` | `getGuestPortal` |
| POST | `/api/guest/[token]/register` | `registerGuests` |
| POST | `/api/guest/[token]/feedback` | `submitFeedback` |
| POST | `/api/guest/[token]/services` | `orderServices` |
| POST | `/api/guest/[token]/pay` | `payForService` |
| GET | `/api/guest/[token]/chat` | `getChatMessages` |
| POST | `/api/guest/[token]/chat` | `sendChatMessage` |
| POST | `/api/guest/translate` | `translateTexts` |
| GET | `/api/guest-registry` | `getRegistry` |
| GET | `/api/guest-registry?format=csv` | `exportRegistry` |
| GET | `/api/guest-registry?format=unl` | `exportRegistryUnl` (`dry=1`, `skipInvalid=1`) |
| PATCH | `/api/guest-registry` | `bulkUpdateRegistry` (`mark_police_bulk`) |
| PATCH | `/api/guest-registry/[id]` | `updateRegistryEntry` |
| GET | `/api/ubyport-settings` | `getUbyportSettings` |
| PUT | `/api/ubyport-settings` | `saveUbyportSettings` |
