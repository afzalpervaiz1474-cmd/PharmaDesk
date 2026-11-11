# Roadmap

Status legend: **Done** — built and verified by tests or by running it · **Partial** — some of it works, read
the note · **Planned** — not started. No dates are promised.

## Phase 0 — Foundation (v0.1.0, current)

| Item | Status | Note |
| --- | --- | --- |
| Repository structure, documentation, CI definition | Done | CI workflow has not executed yet |
| Domain rules: stock status, expiry, summary, money, validation | Done | Unit-tested |
| SQLite schema and migrations (medicines, batches, sync outbox) | Done | Tested on Node's SQLite with the real migration files |
| Desktop UI: shell, dashboard, medicine list, registration form, batches | Done | Smoke-tested in a simulated DOM; appearance not yet reviewed in a real webview |
| Tauri 2 shell | Partial | Written and statically checked; **never compiled or run** |
| NestJS backend: config, PostgreSQL, migrations, health | Done | Tests + smoke test on PostgreSQL 18 |
| Authentication: register, login, JWT guard | Partial | Works; no refresh, reset, rate limiting or roles |
| Sync: outbox, push, server-side last-write-wins, pull endpoint | Partial | Desktop does not apply pulled changes |
| Assistant: chat UI, history, data functions, data-lookup mode | Done | |
| Assistant: OmniRoute gateway integration | Partial | Tested against a stub, not a live gateway |
| Open-source licence | Planned | Maintainer decision pending |

## Phase 1 — A desktop app that is proven to run

Goal: someone can install PharmaDesk and manage inventory on a single offline computer.

- [ ] Compile and run the Tauri shell on Windows, Linux and macOS; fix whatever that reveals
- [ ] Run the inventory flows inside Tauri (SQLite through `tauri-plugin-sql`)
- [ ] Get the CI workflow green, including `cargo check`
- [ ] Edit a batch; stock adjustments with a reason (damage, count correction)
- [ ] Atomic multi-statement writes through a Rust command (medicine + opening batch in one transaction)
- [ ] Local backup and restore of the database file
- [ ] Barcode scanner input on the medicine list
- [ ] Real screenshots in the README; first packaged pre-release

## Phase 2 — Selling and buying

- [ ] Sales and billing: counter sale, earliest-expiry-first batch selection, printable invoice, returns
- [ ] Stock movements ledger (every change to a quantity is a recorded movement)
- [ ] Purchases and suppliers: purchase entry that creates batches, payables, purchase returns
- [ ] Tax and discount handling (rules to be defined per country)
- [ ] Local user accounts with a PIN for the counter

## Phase 3 — Money and reports

- [ ] Business expenses with categories
- [ ] Gross profit (sales minus cost of goods sold) and net profit (minus expenses)
- [ ] Daily, weekly and monthly reports; expiry-loss report
- [ ] CSV and PDF export
- [ ] Dashboard cards for sales and profit, shown only once real data exists

## Phase 4 — Reliable cloud

- [ ] Apply pulled changes on the desktop (two-way sync)
- [ ] Background sync with retry and an online/offline indicator
- [ ] Replace device-clock conflict resolution with server-assigned versions
- [ ] Sync stock as movements instead of absolute quantities
- [ ] Token refresh, password reset, login rate limiting, staff roles
- [ ] Access token stored in the OS keychain
- [ ] Deployment guide for the backend (container image, TLS, backups)

## Phase 5 — Assistant

- [ ] Verify against a live OmniRoute gateway and document supported models
- [ ] Data functions for sales, purchases, expenses and profit (after Phases 2–3)
- [ ] Streaming replies
- [ ] Per-store usage limits and an audit log of assistant queries
- [ ] Optional on-device answers for data that has not been synchronised

## Not planned

- Electronic prescriptions, insurance claims or patient medical records.
- Dosage or clinical advice from the assistant.
