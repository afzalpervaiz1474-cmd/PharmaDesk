# PharmaDesk

Offline-first pharmacy management for independent medical stores: a desktop app that keeps working without
internet, with an optional cloud backend for backup, synchronisation and an AI business assistant.

> **Status: early foundation (v0.1.0).** Inventory management works. Sales, purchases, expenses and reports are
> **not built yet**. The desktop shell has **not been compiled or run** by the authors of this first version —
> see [Current development status](#current-development-status) for exactly what was and was not verified.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Current development status](#current-development-status)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [Licence](#licence)

## Features

**Working today**

- **Medicine inventory** — register, edit, search, filter and delete medicines.
- **Batches and expiry** — several batches per medicine, each with batch number, expiry date, quantity, purchase
  price and selling price. Expired stock is never counted as sellable.
- **Stock locations** — rack, shelf and drawer for every medicine.
- **Dashboard** — sellable units, stock value at cost and at selling price, reorder list, expiry watch, expiry
  timeline and stock by dosage form. Every figure is calculated from recorded data.
- **Cloud backend** — NestJS REST API with PostgreSQL migrations, account registration and login (JWT), a sync
  push/pull API with tenant isolation, and the assistant service.
- **Assistant** — chat screen with conversation history. Answers come from fixed, read-only data functions on the
  server. Without an AI gateway key it runs in a clearly labelled *data-lookup mode* (no language model).

**Partly built** — offline sync (push only), desktop sign-in (works, no token refresh), OmniRoute AI gateway
(implemented, tested against a stub only).

**Planned, not started** — sales and billing, purchases and suppliers, expenses, gross/net profit, daily /
weekly / monthly reports. They appear in the app's sidebar marked **Planned** and show no data.

## Technology stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri 2 (Rust), `tauri-plugin-sql` |
| Desktop UI | React 19, TypeScript (strict), Tailwind CSS 4, Vite 7 |
| Local database | SQLite, versioned SQL migrations |
| Backend | Node.js, NestJS 11, REST, `class-validator` |
| Cloud database | PostgreSQL, versioned SQL migrations, `pg` driver (no ORM) |
| AI | OmniRoute gateway through its OpenAI-compatible API, called from the backend only |
| Tests | Vitest (desktop UI logic), Jest + Supertest + PGlite (backend) |

## Screenshots

> **Placeholder — no screenshots have been captured yet.**
> Add images to `docs/screenshots/` and link them here once the desktop app has been built and run.
> Suggested shots: dashboard, medicine list, registration form, assistant.

## Installation

There are **no installers or releases yet**. To try PharmaDesk you run it from source (next section).

## Development setup

### Prerequisites

| Needed for | Requirement |
| --- | --- |
| Everything | Node.js **22.13 or newer** and npm |
| Desktop app | Rust **1.77.2+** and the [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS |
| Backend | PostgreSQL 14 or newer |
| AI replies (optional) | A running [OmniRoute](https://github.com/diegosouzapw/OmniRoute) gateway and an endpoint key |

### 1. Desktop UI checks (no Rust required)

```bash
npm install
npm test              # domain logic, SQLite migrations + repositories, sync engine, UI smoke tests
npm run lint
npm run build         # type-check and production build of the UI
npm run verify:tauri  # static checks of the Tauri configuration (does not compile Rust)
```

### 2. Run the desktop app

```bash
npm run tauri:dev     # compiles the Rust shell and opens the app window
npm run tauri:build   # builds an installer for the current platform
```

On first start the shell creates `pharmadesk.db` in the per-user application data directory and applies the
migrations in `src-tauri/migrations/`. The app starts with an empty inventory.

> These two commands have **not** been run for this version. If the build fails, please open an issue with the
> compiler output — see [Current development status](#current-development-status).

### 3. Run the backend (optional)

```bash
cd backend
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

Then, in the app: **Sync & settings → Cloud backend** → enter `http://localhost:3000` → create an account →
**Push pending changes**.

### 4. Enable AI replies (optional)

Set these in `backend/.env` and restart the backend. Without them the assistant stays in data-lookup mode.

```bash
OMNIROUTE_BASE_URL=http://localhost:20128/v1
OMNIROUTE_API_KEY=            # your OmniRoute endpoint key – server side only
OMNIROUTE_MODEL=              # model or routing rule from your OmniRoute dashboard
```

### Browser preview

`npm run dev` serves the UI in a browser, where Tauri and SQLite do not exist. In that mode the UI talks to the
small serverless functions in `api/`, which need a hosted Postgres (see the preview section of `.env.example`).
**This adapter exists only for the hosted demo and is not part of the product architecture.** For real work use
the desktop app.

## Project structure

```text
.
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
└── *.md                      Documentation
```

Design details are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Current development status

Last verified: 2026-11-11, on Linux with Node.js 24.

### Verified by running it

| Area | What was run | Result |
| --- | --- | --- |
| Desktop UI logic | `npm test` — 62 Vitest tests | Pass |
| Desktop UI screens | Part of the above: 8 smoke tests render the whole app in a simulated DOM (jsdom) with a fake API: dashboard figures, list filters, form validation, save, delete confirmation | Pass |
| SQLite schema and repositories | Part of the above: the real migration files are loaded into Node's built-in SQLite and the repositories run against them | Pass |
| Desktop UI build | `npm run lint`, `npm run build` | Pass |
| Tauri configuration | `npm run verify:tauri` (schema validation, icons, migration registration) | Pass |
| Rust dependencies | `cargo generate-lockfile`, `cargo fmt --check` | Pass |
| Backend | `npm test` — 68 Jest tests, including 27 end-to-end tests over HTTP with the real migrations on PGlite | Pass |
| Backend build | `npm run build` | Pass |
| Backend on real PostgreSQL | Manual smoke test on PostgreSQL 18: migrate, health, register, login, sync push/pull, assistant | Pass |
| Hosted browser preview API | The `api/` handlers called directly, and over HTTP on the deployed preview, against the demo database: inventory create / read / update / delete, validation and conflict errors, assistant lookups, conversation privacy | Pass |

### Written but **not** verified

| Area | Why it matters |
| --- | --- |
| **The Rust shell has never been compiled.** No `cargo check`, `tauri dev` or `tauri build` was run, because the build machine lacked the WebKitGTK libraries. | The first `npm run tauri:dev` may reveal compile or configuration errors. |
| **The app has never run inside Tauri.** The SQLite code is tested through Node's SQLite, not through `tauri-plugin-sql`. | Differences in the plugin (parameter binding, error text, permissions, CSP) would only show at runtime. |
| **OmniRoute has only been tested against a stub** that imitates the OpenAI-compatible API. | Behaviour with a real gateway and real models, including function calling, is unknown. |
| **How the app looks.** The UI was verified by type-checking, linting, building and DOM-level tests, not by a person or tool looking at it in a real browser or webview. | Layout or styling defects would not have been caught. |
| The GitHub Actions workflow has never executed. | It may need adjustments on its first run. |
| Windows and macOS. | Nothing has been run on either. |

### Known limitations

- Sync is **push only**. Changes made on another device are not downloaded into the local database.
- Conflicts are resolved by last-write-wins using device clocks. A wrong clock produces wrong winners.
- The assistant on the desktop only sees data that has been pushed to the backend.
- Registering a medicine with an opening batch is two writes, not one transaction.
- Batches cannot be edited, only removed and re-added. Stock is not reduced by sales (there are no sales).
- No login rate limiting, password reset, token refresh or staff roles.
- Amounts assume a two-decimal currency.

## Roadmap

See [ROADMAP.md](ROADMAP.md). Next up: verify and fix the desktop build, finish two-way sync, then sales.

## Contributing

Contributions are welcome — especially a first verified desktop build on any OS. Read
[CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Security

Never commit `.env` files or database files. API keys belong on the backend only and are never shipped in the
desktop app. To report a vulnerability, follow [SECURITY.md](SECURITY.md) — please do not open a public issue.

## Licence

**No licence has been chosen yet.** Until the maintainer selects one, the code is published without a licence,
which means nobody else has permission to use, copy, modify or distribute it. See [LICENSE](LICENSE).
