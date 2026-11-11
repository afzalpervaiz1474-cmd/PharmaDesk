# PharmaDesk architecture

This document describes the system as it is built in v0.1.0. Where something is designed but not implemented,
it is marked **(planned)**.

## 1. Overview

```text
 ┌────────────────────── Desktop (one per counter) ──────────────────────┐
 │  React UI ──► domain rules ──► InventoryRepository                  │
 │                                     │                               │
 │                         SqliteInventoryRepository                   │
 │                                     │  tauri-plugin-sql             │
 │   Tauri 2 shell (Rust) ── migrations ──► SQLite file (source of truth)│
 │                                     │  triggers                     │
 │                                 sync_outbox                         │
 └───────────────────────────────────────┬───────────────────────────────┘
                    HTTPS, JSON, bearer  │  only when online
 ┌───────────────────────────────────────▼───────────────────────────────┐
 │  NestJS backend:  auth │ sync │ medicines │ ai │ health             │
 │        │                               │                            │
 │   PostgreSQL (cloud copy, per pharmacy)   OmniRoute AI gateway        │
 └───────────────────────────────────────────────────────────────────────┘
```

Principles:

1. **Offline first.** The counter must keep working without internet. The local SQLite database is the source of
   truth for the store; the cloud is a copy.
2. **Thin shell.** The Rust side opens the window, owns the database file and runs migrations. Business rules live
   in TypeScript, where they are unit-tested.
3. **Secrets stay on the server.** The desktop app holds no API keys.
4. **No invented numbers.** Screens and the assistant show only what is recorded.

## 2. Desktop architecture

```text
src/
  domain/      pure functions and types – no React, no I/O
  data/        InventoryRepository (interface) and implementations
  features/    screens; each talks to data/ through React context
  components/  presentational UI kit
  app/         runtime selection, navigation
```

Dependencies point one way: `features → data → domain`. `domain` imports nothing from the other layers.

### Runtime selection

`src/data/runtime.ts` decides at start-up which data source to use:

| Runtime | Detected by | Inventory source | Sync outbox |
| --- | --- | --- | --- |
| Desktop | `__TAURI_INTERNALS__` on `window` | `SqliteInventoryRepository` | `SqliteOutboxStore` |
| Browser preview | otherwise | `HttpInventoryRepository` → `api/` | none |

The SQLite modules are loaded with a dynamic `import()`, so the browser bundle never loads the Tauri plugin.

### Tauri shell

- `src-tauri/src/lib.rs` registers `tauri-plugin-sql` with the migration list.
- `tauri.conf.json` preloads `sqlite:pharmadesk.db`, so migrations run at start-up.
- `capabilities/default.json` grants the main window `core:default`, `sql:default` and `sql:allow-execute`.
- The content-security policy allows scripts from the app only. `connect-src` currently allows any `https:` host
  because the backend address is user-configurable; tightening it is planned.

> Not yet verified: the shell has not been compiled. See the README.

### Hosted browser preview

`api/*.js` are serverless functions that give the browser preview something to talk to. They mirror the
repository contract over HTTP against a hosted Postgres and always answer the assistant in data-lookup mode.
They are a demo aid, not the backend, and the desktop app never calls them.

## 3. Database architecture

### Shared conventions

| Concern | Rule |
| --- | --- |
| Ids | UUIDs generated on the device, so records can be created offline |
| Money | Integer minor units (paise, cents). Never floating point. Two-decimal currencies only for now |
| Dates | Calendar dates as `YYYY-MM-DD`; timestamps as ISO 8601 UTC |
| Deletes | Soft delete (`deleted_at`) so deletions can be synchronised |
| Schema changes | Numbered SQL migrations. Released migrations are never edited |

### SQLite (desktop) — `src-tauri/migrations/`

| Table | Purpose |
| --- | --- |
| `medicines` | Product: name, generic name, manufacturer, dosage form, strength, unit, barcode, prescription flag, reorder level, rack / shelf / drawer, notes |
| `medicine_batches` | Stock: batch number, expiry date, quantity, purchase and selling price per unit |
| `sync_outbox` | Which records changed locally and still need to be pushed |
| `sync_state` | Key/value: device id, last push time |

Integrity is enforced in the database as well as in the forms: `CHECK` constraints on quantities, prices and
date format; a unique barcode among live medicines; a unique batch number per medicine among live batches.

### PostgreSQL (cloud) — `backend/migrations/`

| Table | Purpose |
| --- | --- |
| `pharmacies` | The tenant. Holds the store name and currency |
| `users` | Accounts, each belonging to one pharmacy. Password stored as an scrypt hash |
| `medicines`, `medicine_batches` | Same columns as SQLite plus `pharmacy_id` and `server_seq` |
| `ai_conversations`, `ai_messages` | Assistant history, including which data functions each answer used |
| `schema_migrations` | Applied migrations |

Every query that touches business data filters by `pharmacy_id`, taken from the verified access token.

The backend uses plain SQL through one small `Database` abstraction (`query`, `exec`, `transaction`). There is
no ORM. Production binds it to node-postgres; the end-to-end tests bind it to PGlite.

## 4. Backend architecture

```text
backend/src/
  config/     loadConfig(): validated, typed configuration from environment variables
  database/   Database abstraction, PgDatabase, migration runner + CLI
  common/     AllExceptionsFilter – one error shape, internals never leaked
  health/     GET /health
  auth/       register, login, me · scrypt · JWT guard
  medicines/  repository (tenant-scoped SQL) · GET /medicines
  sync/       POST /sync/push · GET /sync/pull
  ai/         assistant service, data functions, OmniRoute client, conversations
```

All routes are under `/api/v1`. A global `ValidationPipe` strips undeclared properties and rejects requests that
contain them. Errors use one shape: `{ statusCode, error, message, details? }`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Server, database and gateway-configuration status |
| POST | `/auth/register` | none | Create a pharmacy and its owner |
| POST | `/auth/login` | none | Exchange email + password for an access token |
| GET | `/auth/me` | bearer | Current profile |
| GET | `/medicines` | bearer | Cloud copy of the inventory (read-only) |
| POST | `/sync/push` | bearer | Upload changed records |
| GET | `/sync/pull` | bearer | Download changes after a cursor |
| GET | `/ai/status` | bearer | `ai` or `data_lookup` mode |
| POST | `/ai/chat` | bearer | Ask a question |
| GET | `/ai/conversations` | bearer | Conversation list |
| GET | `/ai/conversations/:id/messages` | bearer | Messages of one conversation |
| DELETE | `/ai/conversations/:id` | bearer | Delete a conversation |

### Authentication

Implemented: owner registration, login, HS256 JWT access tokens (12 hours by default), scrypt password hashing
with a per-password salt, identical errors and timing for unknown email and wrong password, a switch to close
registration.

**(planned)** refresh tokens, password reset, email verification, login rate limiting, staff accounts and
role-based permissions, storing the desktop token in the OS keychain instead of `localStorage`, offline unlock
(PIN) for the desktop app.

## 5. Offline synchronisation design

### Implemented

1. **Outbox by trigger.** SQLite triggers on `medicines` and `medicine_batches` insert a row into `sync_outbox`
   for every insert and update, inside the same statement. A write cannot be saved without being queued.
2. **Push.** `SyncEngine` reads the outbox (one entry per record, medicines before batches), sends each record's
   *current* state to `POST /sync/push`, and clears outbox rows only up to the id it read — edits made during a
   push stay queued.
3. **Server apply.** Records are applied one at a time. Each gets a result: `applied`, `stale` (the server
   already has a newer version) or `rejected` (with a reason). Pushing the same change twice is harmless.
4. **Conflict rule.** Last write wins on the record's `updatedAt`.
5. **Pull endpoint.** Every stored change gets a number from a database sequence (`server_seq`).
   `GET /sync/pull?cursor=N` returns later changes in order, including deletions.
6. **Tenant isolation.** A record id that exists under another pharmacy is rejected, never overwritten.

### Not implemented (planned)

- Applying pulled changes to SQLite. The triggers will need to skip remote changes so they are not queued again.
- Automatic background sync, retry with backoff, and an online/offline indicator.
- A screen for reviewing rejected records and conflicts.
- Sync for future tables (sales, purchases, expenses).

### Known weaknesses of the current design

- **Device clocks decide conflicts.** A device with a wrong clock can win or lose incorrectly, and a timestamp far
  in the future would keep winning. Server-assigned versions or hybrid logical clocks should replace this before
  multi-device use.
- **Row-level last-write-wins loses concurrent edits** to different fields of the same record.
- **Stock quantities must not sync as absolute numbers** once sales exist: two counters selling the same batch
  would overwrite each other. Sales will need to sync as stock *movements*.

## 6. AI gateway architecture

```text
Desktop UI ── POST /ai/chat (bearer) ──► AiService
                                            │ 1. system rules + recent history + function list
                                            ▼
                                     OmniRouteClient ── HTTPS, API key ──► OmniRoute ──► model
                                            │ 2. model asks for a function
                                            ▼
                                   BusinessDataService ── fixed SQL, pharmacy_id from token ──► PostgreSQL
                                            │ 3. result goes back to the model
                                            ▼
                                  4. answer stored and returned, with the functions it used
```

| Requirement | How it is met |
| --- | --- |
| Keys never in frontend code | `OMNIROUTE_API_KEY` is read from the backend environment only. No endpoint returns it; error messages and logs exclude it (tested). The desktop app talks only to the backend |
| Controlled database access | The model can only *name* one of five read-only functions in `business-data.service.ts` and pass small, clamped arguments. It cannot send SQL, table names or a pharmacy id |
| No invented business figures | Layered: (1) system rules forbid estimates; (2) low temperature; (3) data comes only from function results; (4) every answer is stored with the functions it used, and the UI flags AI answers that used none as "not verified"; (5) questions about sales or profit get a fixed "not recorded" reply in data-lookup mode |
| Environment configuration | `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`, `OMNIROUTE_MODEL`, `OMNIROUTE_TIMEOUT_MS`, validated at start-up |

**Honest limits.** Prompt rules reduce the chance of a model inventing a number; they cannot make it impossible.
Treat AI answers as assistance and confirm important figures on the inventory screens.

**Data-lookup mode.** With no key, or when the gateway fails, `data-lookup.ts` matches the question to one data
function by keyword and formats the result. No model is involved and the answer is labelled accordingly.

**Integration status.** OmniRoute is addressed through its OpenAI-compatible `/chat/completions` endpoint. The
client is tested against a local stub of that API; it has not yet been run against a real OmniRoute instance.

**Consequence of running server-side.** The assistant sees the cloud copy of the data, so on the desktop it only
knows about records that have been pushed.
