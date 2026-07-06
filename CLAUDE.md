# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DeskLine is a small support-desk service. Customers raise **tickets** (status `open`/`in_progress`/`resolved`/`closed`, a priority, an optional assignee, and an `sla_hours` value); tickets are worked by **users** (agents); the conversation on a ticket is a list of **comments**. The repo is a two-package workspace: `api/` (Fastify + Postgres) and `web/` (React + Vite).

## Commands

Run these from the repo root — the root `package.json` delegates into the sub-packages:

- `npm run seed` — drop/recreate tables from `api/db/schema.sql` and load `api/db/seed.sql`. Re-run any time for a fresh dataset.
- `npm run dev:api` — API on http://localhost:3000
- `npm run dev:web` — web app on http://localhost:5173 (proxies `/tickets` and `/users` to the API)
- `npm test` — API test suite

Inside `api/` there are also `npm run typecheck` (`tsc --noEmit`) and, in `web/`, `npm run build` (typechecks then builds). `web/` has no test suite.

Running a single test uses vitest directly from `api/`:

```sh
cd api && npx vitest run test/tickets.test.ts -t "filters by status"
```

### Database is required for everything

Both `npm run seed` and `npm test` need Postgres running: `docker compose up -d` (Postgres 15 on `localhost:5432`, credentials `postgres`/`postgres`, Adminer on http://localhost:8081). There is no in-memory/mocked DB — repositories and tests hit a real Postgres.

Tests run against a **separate** `deskline_test` database (created automatically on first run by `test/helpers.ts`), so `npm test` never touches your dev data. `beforeEach` drops all tables, reloads `schema.sql`, and inserts a fixed fixture set (2 users, 3 tickets, 3 comments) — assertions in `tickets.test.ts` depend on those exact fixtures.

## Architecture

### API request flow (`api/src/`)

`server.ts` (`buildServer`) registers a central error handler and per-domain route modules. Tests import `buildServer` and use `app.inject(...)` rather than a live socket.

A request moves through three layers, and the conventions matter:

1. **Routes** (`*/tickets.routes.ts`, `*/users.routes.ts`) — thin handlers. They parse input with a zod schema, call the repository, and throw `AppError(statusCode, message)` for domain failures (e.g. 404 unknown ticket, 400 unknown author). No SQL here.
2. **Repositories** (`*/*.repository.ts`) — the *only* place SQL lives. Every value is passed as a bound `$n` parameter; nothing is string-interpolated into SQL. `listTickets` builds its `WHERE` clause dynamically from optional filters using this pattern.
3. **Mappers** (`mappers.ts`) — the DB↔API boundary. DB columns are `snake_case` (`assignee_id`, `resolved_at`); API responses are `camelCase` (`assigneeId`, `resolvedAt`). `toTicketDto` / `toCommentDto` do the conversion and are the single source of the response shape. Repositories return DTOs, not raw rows, so mapping happens once.

**Errors:** `errors.ts` renders `AppError` → `{ error: message }` at its status code, `ZodError` → 400 `{ error: 'Validation failed', details }`, everything else → 500. Throw `AppError` for expected failures; let unexpected ones bubble.

**Validation:** every request input has a zod schema in a `*.schema.ts` file. Query/param strings are coerced (`z.coerce.number()`), and creation schemas carry the business defaults (`priority` → `medium`, `slaHours` → `8`, `assigneeId` → `null`). Add/extend a schema when adding an endpoint.

### SLA computation (`api/src/sla.ts`)

`computeSlaStatus(input, now)` derives `ok` / `at_risk` / `breached` from `createdAt`, `slaHours`, and `resolvedAt`. It is **pure** and takes `now` as an explicit argument (never reads the clock itself) so it's deterministic and unit-testable — `toTicketDto` defaults `now` to `new Date()` for real requests but tests pin it. `slaStatus` is computed on read, not stored; there is no `slaStatus` column. Keep this function pure when changing SLA rules.

### Data model (`api/db/schema.sql`)

`users`, `tickets`, `comments`. `tickets.status` and `tickets.priority` have CHECK constraints that must stay in sync with the corresponding zod enums in `tickets.schema.ts`. `resolved_at` is managed by `updateStatus`: set on → `resolved`, cleared on reopen (`open`/`in_progress`), left untouched on `closed`.

### Web (`web/src/`)

A dependency-free React SPA (no router, no data library). `App.tsx` does hash-based routing: `#/tickets/:id` → `TicketDetail`, otherwise `TicketList`. Components `fetch` the proxied API directly. `types.ts` mirrors the API DTO shapes — keep it aligned with `mappers.ts` when response shapes change.

## Configuration

The API reads `DATABASE_URL` and `PORT` from the environment (or an `api/.env`); defaults match the compose setup (see `.env.example`). Tests read `DATABASE_URL_TEST` (falls back to the `deskline_test` DB); `api/vitest.config.ts` sets `fileParallelism: false` because all test files share one Postgres instance.
