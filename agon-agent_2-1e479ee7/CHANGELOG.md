# Changelog

All notable changes to PharmaDesk are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). While the version is below 1.0.0, anything may change.

## [0.1.0] - 2026-11-11

First version: the project foundation. No release artefacts were built.

### Added

**Desktop UI (React, TypeScript, Tailwind CSS)**

- Application shell with sidebar navigation and top bar.
- Dashboard with six overview cards, an expiry timeline chart, stock by dosage form, a reorder list and an expiry
  watch list, all calculated from inventory data.
- Medicine list with search, dosage-form filter, status filters and a detail panel.
- Medicine registration and edit form with validation, storage location and an optional opening batch.
- Batch management: add and remove batches per medicine.
- Assistant chat screen with conversation history.
- Sync & settings screen: display currency, backend address with connection test, sign in / create account,
  manual push of pending changes.
- Screens for planned modules (sales, purchases, expenses, reports), clearly marked as not implemented.

**Domain and data layer**

- Pure domain functions for stock status, expiry status, inventory summary, money parsing and form validation.
- `InventoryRepository` interface with SQLite and HTTP implementations.
- Sync outbox store and `SyncEngine` (push only).

**Tauri shell**

- Tauri 2 project with `tauri-plugin-sql` and application icons.
- SQLite migrations: `0001_create_inventory` (medicines, medicine_batches) and `0002_create_sync_outbox`
  (sync_outbox, sync_state and the triggers that fill the outbox).

**Backend (NestJS)**

- Environment validation that reports all configuration problems at start-up.
- PostgreSQL access layer and SQL migration runner (`npm run migrate`).
- Migrations: `0001_create_core` (pharmacies, users), `0002_create_inventory`, `0003_create_ai_conversations`.
- `GET /health`; `POST /auth/register`, `POST /auth/login`, `GET /auth/me` with scrypt password hashing and JWT.
- `GET /medicines`; `POST /sync/push` (last-write-wins, per-record results) and `GET /sync/pull` (cursor based).
- Assistant: read-only business data functions, OmniRoute client, function-calling loop with a round limit,
  data-lookup fallback, conversation storage, `/ai/*` endpoints.

**Project**

- 62 Vitest tests (8 of them UI smoke tests in a simulated DOM) and 68 Jest tests (27 of them end-to-end).
- `scripts/verify-tauri-config.mjs` for static checks of the Tauri setup.
- GitHub Actions workflow (not yet executed).
- README, ARCHITECTURE, ROADMAP, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, `.env.example` files.

### Known gaps in this version

- The Rust shell has not been compiled and the app has not been run inside Tauri.
- The OmniRoute integration has only been tested against a stub.
- Sync pulls are not applied on the desktop.
- No open-source licence has been selected.

See "Current development status" in the README for the full list.
