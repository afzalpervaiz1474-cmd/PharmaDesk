# PharmaDesk

**Offline-first pharmacy management for independent medical stores.**

A desktop application that keeps working without internet — medicine inventory, batches and expiry tracking on the counter PC — with an optional cloud backend for backup, synchronisation and an AI business assistant.

> **Status: early foundation (v0.1.0).** Inventory management works. Sales, purchases, expenses and reports are **not built yet**. The desktop (Tauri) shell has **not been compiled or run yet** — see [Development status](#development-status) for exactly what is verified and what is not.

The application code lives in the [`agon-agent_2-1e479ee7/`](agon-agent_2-1e479ee7/) folder of this repository. Full documentation is there: [README](agon-agent_2-1e479ee7/README.md) · [Architecture](agon-agent_2-1e479ee7/ARCHITECTURE.md) · [Roadmap](agon-agent_2-1e479ee7/ROADMAP.md) · [Changelog](agon-agent_2-1e479ee7/CHANGELOG.md) · [Contributing](agon-agent_2-1e479ee7/CONTRIBUTING.md) · [Security](agon-agent_2-1e479ee7/SECURITY.md)

---

## Features

**Working today**

- **Medicine inventory** — register, edit, search, filter and delete medicines.
- **Batches & expiry** — multiple batches per medicine, each with batch number, expiry date, quantity, purchase price and selling price. Expired stock is never counted as sellable.
- **Stock locations** — rack, shelf and drawer recorded for every medicine.
- **Dashboard** — sellable units, stock value at cost and at selling price, reorder list, expiry watch, expiry timeline and stock by dosage form. Every figure is calculated from recorded data — nothing is invented.
- **Cloud backend** — NestJS REST API with PostgreSQL migrations, account registration and login (JWT), and a sync push/pull API with per-pharmacy tenant isolation.
- **AI assistant** — chat screen with conversation history. Answers come only from fixed, read-only data functions on the server. Without an AI gateway key it runs in a clearly labelled *data-lookup mode* (no language model).

**Partly built**

- Offline sync (push only — pull endpoint exists, applying pulled changes locally is not built yet)
- Desktop sign-in (works; no token refresh yet)
- OmniRoute AI gateway (implemented; tested against a stub only)

**Planned, not started**

- Sales & billing, purchases & suppliers, expenses, gross/net profit, daily / weekly / monthly reports. These appear in the app's sidebar marked **Planned** and show no data.

## Technology stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri 2 (Rust), `tauri-plugin-sql` |
| Desktop UI | React 19, TypeScript (strict), Tailwind CSS 4, Vite 7 |
| Local database | SQLite, versioned SQL migrations |
| Backend | Node.js, NestJS 11, REST, `class-validator` |
| Cloud database | PostgreSQL, versioned SQL migrations, `pg` driver (no ORM) |
| AI | OmniRoute gateway (OpenAI-compatible API), called from the backend only |
| Tests | Vitest (desktop UI logic), Jest + Supertest + PGlite (backend) |

## Quick start

There are **no installers or releases yet** — PharmaDesk runs from source.

### Prerequisites

| Needed for | Requirement |
| --- | --- |
| Everything | Node.js **22.13 or newer** and npm |
| Desktop app | Rust **1.77.2+** and the [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS |
| Backend | PostgreSQL 14 or newer |
| AI replies (optional) | A running OmniRoute gateway and an endpoint key |

### Run the checks (no Rust required)

```bash
cd agon-agent_2-1e479ee7
npm install
npm test              # domain logic, SQLite migrations + repositories, sync engine, UI smoke tests
npm run lint
npm run build         # type-check and production build of the UI
npm run verify:tauri  # static checks of the Tauri configuration (does not compile Rust)
```

### Run the desktop app

```bash
npm run tauri:dev     # compiles the Rust shell and opens the app window
npm run tauri:build   # builds an installer for the current platform
```

On first start the shell creates `pharmadesk.db` in the per-user application data directory and applies the migrations in `src-tauri/migrations/`. The app starts with an empty inventory.

> These two commands have **not** been run for this version. If the build fails, please open an issue with the compiler output.

### Run the backend (optional)

```bash
cd agon-agent_2-1e479ee7/backend
npm install
cp .env.example .env        # then edit: DATABASE_URL and JWT_SECRET are required
npm run migrate             # creates the PostgreSQL schema
npm run start:dev           # http://localhost:3000/api/v1
npm test                    # unit + end-to-end tests (needs no PostgreSQL server)
```

Create the database first, for example:

```sql
CREATE ROLE pharmadesk LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE pharmadesk OWNER pharmadesk;
```

Then in the app: **Sync & settings → Cloud backend** → enter `http://localhost:3000` → create an account → **Push pending changes**.

### Enable AI replies (optional)

Set these in `backend/.env` and restart the backend. Without them the assistant stays in data-lookup mode.

```bash
OMNIROUTE_BASE_URL=http://localhost:20128/v1
OMNIROUTE_API_KEY=            # your OmniRoute endpoint key — server side only
OMNIROUTE_MODEL=              # model or routing rule from your OmniRoute dashboard
```

### Browser preview

`npm run dev` serves the UI in a browser, where Tauri and SQLite do not exist. In that mode the UI talks to the small serverless functions in `api/`, which need a hosted Postgres (see the preview section of `.env.example`). **This adapter exists only for the hosted demo and is not part of the product architecture.** For real work, use the desktop app.

## Project structure

```text
.
├── README.md                     ← you are here (repository overview)
└── agon-agent_2-1e479ee7/        The PharmaDesk application
    ├── src/                      Desktop UI (React + TypeScript)
    │   ├── domain/               Pure business rules: stock, expiry, money, validation (+ tests)
    │   ├── data/                 InventoryRepository interface and its implementations
    │   │   └── sqlite/           SQLite repository + sync outbox store (+ tests on real migrations)
    │   ├── features/             dashboard, inventory, assistant, cloud, sync, settings, planned
    │   ├── components/           Reusable UI kit, layout, charts
    │   └── app/                  Runtime selection, navigation
    ├── src-tauri/                Tauri 2 shell (Rust)
    │   ├── migrations/           SQLite schema migrations
    │   ├── capabilities/         Window permissions
    │   └── src/                  lib.rs registers the SQL plugin and migrations
    ├── backend/                  NestJS REST API
    │   ├── migrations/           PostgreSQL schema migrations
    │   ├── src/                  config, database, auth, medicines, sync, ai, health
    │   └── test/                 End-to-end tests on in-memory PostgreSQL (PGlite)
    ├── api/                      Hosted browser-preview adapter only (not the backend)
    ├── scripts/                  verify-tauri-config.mjs
    └── *.md                      Full documentation (architecture, roadmap, changelog, …)
```

Design details are in [ARCHITECTURE.md](agon-agent_2-1e479ee7/ARCHITECTURE.md).

## Development status

Last verified: **2026-11-11**, on Linux with Node.js 24.

**Verified by running it**

| Area | What was run | Result |
| --- | --- | --- |
| Desktop UI logic | `npm test` — 62 Vitest tests | Pass |
| Desktop UI screens | Included above: 8 smoke tests render the whole app in jsdom with a fake API | Pass |
| SQLite schema & repositories | Real migration files loaded into Node's built-in SQLite; repositories run against them | Pass |
| Desktop UI build | `npm run lint`, `npm run build` | Pass |
| Tauri configuration | `npm run verify:tauri` (schema validation, icons, migration registration) | Pass |
| Backend | `npm test` — 68 Jest tests, incl. 27 end-to-end tests over HTTP with real migrations on PGlite | Pass |
| Backend build | `npm run build` | Pass |
| Backend on real PostgreSQL | Manual smoke test on PostgreSQL 18: migrate, health, register, login, sync push/pull, assistant | Pass |

**Written but not verified**

- **The Rust shell has never been compiled** (no `cargo check`, `tauri dev` or `tauri build`) — the build machine lacked the WebKitGTK libraries. The first `npm run tauri:dev` may reveal compile or configuration errors.
- **The app has never run inside Tauri** — the SQLite code is tested through Node's SQLite, not through `tauri-plugin-sql`.
- **OmniRoute has only been tested against a stub** of its OpenAI-compatible API, never a real gateway.
- **How the app looks** — verified by type-checking, linting, building and DOM-level tests, not by viewing it in a real browser or webview.
- The GitHub Actions workflow has never executed. Windows and macOS: nothing has been run on either.

**Known limitations**

- Sync is **push only**; changes from another device are not downloaded into the local database.
- Conflicts resolve by last-write-wins using device clocks — a wrong clock produces wrong winners.
- The desktop assistant only sees data that has been pushed to the backend.
- Batches cannot be edited, only removed and re-added. Stock is not reduced by sales (there are no sales yet).
- No login rate limiting, password reset, token refresh or staff roles.
- Amounts assume a two-decimal currency.

## Roadmap

See [ROADMAP.md](agon-agent_2-1e479ee7/ROADMAP.md). Next up: verify and fix the desktop build, finish two-way sync, then sales.

## Contributing

Contributions are welcome — especially a first verified desktop build on any OS. Read [CONTRIBUTING.md](agon-agent_2-1e479ee7/CONTRIBUTING.md) and the [Code of Conduct](agon-agent_2-1e479ee7/CODE_OF_CONDUCT.md) first.

## Security

Never commit `.env` files or database files. API keys belong on the backend only and are never shipped in the desktop app. To report a vulnerability, follow [SECURITY.md](agon-agent_2-1e479ee7/SECURITY.md) — please do not open a public issue.

## Licence

**No licence has been chosen yet.** Until the maintainer selects one, the code is published without a licence, which means nobody else has permission to use, copy, modify or distribute it. See [LICENSE](agon-agent_2-1e479ee7/LICENSE).
