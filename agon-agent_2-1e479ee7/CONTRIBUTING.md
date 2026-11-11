# Contributing to PharmaDesk

Thank you for considering a contribution. PharmaDesk is at an early stage, so careful, small changes help most.
By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

> **Licence notice.** No open-source licence has been selected yet (see [LICENSE](LICENSE)). Until one is,
> please discuss any non-trivial contribution in an issue first, because the terms your work would be published
> under are not settled.

## Ways to contribute

- **Build and run the desktop app** and report what happens. The Tauri shell has not been compiled yet, so a
  build log from Windows, macOS or Linux is the most useful contribution right now.
- Report bugs, with steps to reproduce, what you expected and what happened.
- Pick an unchecked item from [ROADMAP.md](ROADMAP.md) — open an issue to agree the approach before you start.
- Improve documentation, tests or accessibility.

Security problems must **not** be reported in public issues — see [SECURITY.md](SECURITY.md).

## Development workflow

1. Fork the repository and create a branch from `main`: `feat/short-description` or `fix/short-description`.
2. Set up the project as described in the [README](README.md#development-setup).
3. Make your change together with its tests.
4. Run the checks for the parts you touched:

   ```bash
   # Desktop UI and Tauri configuration (repository root)
   npm run lint && npm test && npm run build && npm run verify:tauri

   # Backend
   cd backend && npm test && npm run build

   # Rust shell (needs the Tauri prerequisites)
   cd src-tauri && cargo fmt --check && cargo check
   ```

5. Open a pull request against `main`.

## Code standards

### General

- TypeScript `strict` everywhere. No `any`; if a cast is unavoidable, keep it at a boundary and explain it.
- Small modules with one responsibility. Comments explain *why*, not *what*.
- Validate all input at the boundary: forms, API requests, sync payloads.
- Handle errors deliberately. Show users a message they can act on; never swallow an error silently.
- No secrets in code, tests, fixtures, logs or commit history. Never commit `.env` or database files.
- Do not present unfinished work as finished. If a feature is partial, say so in the UI and in the docs.
- Never display or generate business figures that are not read from recorded data.

### Desktop UI (`src/`)

- Layering: `features → data → domain`. `domain/` stays pure: no React, no I/O, no dates from the system clock
  (pass `today` in).
- Screens reach data only through `InventoryRepository` and the other interfaces, never through SQL or `fetch`
  directly.
- Money is integer minor units. Do not use floating point for amounts.
- Styling uses the semantic tokens in `src/index.css` (`bg-surface`, `text-muted`, …), not raw colours.
- Every interactive element is keyboard reachable and labelled; status is never conveyed by colour alone.

### Backend (`backend/`)

- Every request body and query is a DTO class with `class-validator` rules.
- SQL is always parameterised. Never build SQL from request values.
- Every query on business data filters by `pharmacy_id` from the authenticated user.
- New assistant data functions must be read-only, tenant-scoped and added to `BusinessDataService.tools`.

### Database migrations

- Schema changes go in a **new** numbered file: `src-tauri/migrations/NNNN_description.sql` (and register it in
  `src-tauri/src/lib.rs`) or `backend/migrations/NNNN_description.sql`.
- Never edit a migration that has been merged; users' databases have already applied it.
- Keep the SQLite and PostgreSQL schemas aligned for synchronised tables.

### Tests

- New rules in `domain/` need unit tests. New endpoints need an end-to-end test.
- A bug fix should come with a test that fails without the fix.
- Tests must not depend on the network, the current date or an installed database server.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`,
`refactor:`, `chore:`. Write the subject in the imperative mood: `fix: reject expired batches at sale time`.

## Pull request guidelines

- One logical change per pull request. Keep it small enough to review in one sitting.
- Describe **what** changed, **why**, and **how you tested it** — including what you could not test.
- Link the issue it resolves.
- Include a screenshot for visible UI changes.
- Update `CHANGELOG.md`, and `README.md` / `ROADMAP.md` / `ARCHITECTURE.md` when behaviour or status changes.
- All CI checks must pass. A maintainer review is required before merging.

## Reporting bugs

Please include: operating system and version, how you ran PharmaDesk (desktop build, `tauri dev`, browser
preview), the steps, the expected and actual result, and any error text. Remove store data and credentials from
logs and screenshots before posting.
