# Add ticket filtering + SLA indicator

## What this does
Extends the main ticket list with two agent-requested features:

1. **Filtering** by `status` and `assignee`, independently or combined. No filter = full list.
2. **SLA indicator** — every ticket in the list now shows an at-a-glance SLA badge: `On track` / `At risk` / `Breached`.

## How it's wired through the stack
- **DB / repository** (`tickets.repository.ts`) — `listTickets` builds a parameterised `WHERE` clause from the supplied filters; the previous per-row N+1 was folded into a single join + comment-count subquery.
- **API** (`tickets.routes.ts`, `tickets.schema.ts`) — `GET /tickets` validates/coerces `?status=&assigneeId=` via zod at the boundary. New `GET /users` endpoint backs the assignee dropdown.
- **SLA logic** (`sla.ts`) — `computeSlaStatus` is a pure, `now`-injected function, called from `toTicketDto` so `slaStatus` is present on **every** ticket DTO (list, detail, create).
- **Web** (`TicketList.tsx`, `types.ts`, `styles.css`) — status + assignee `<select>` controls that re-fetch on change, plus the SLA badge column.

## How to review
Suggested reading order:
1. `api/src/sla.ts` — the SLA rule (breach = not resolved within `sla_hours`; `at_risk` at 75% elapsed). Start here.
2. `api/src/mappers.ts` — where `slaStatus` gets attached to the DTO (the integration point).
3. `api/src/tickets/tickets.repository.ts` + `tickets.schema.ts` — the filter query and its validation.
4. `web/src/TicketList.tsx` — filter controls + badge rendering.

## Tests
- `api/test/sla.test.ts` — 8 unit tests over the SLA rule (unresolved/resolved, boundary at the deadline, at-risk threshold).
- `api/test/tickets.test.ts` — API-level coverage for filtering (status, assignee, combined, empty, invalid → 400), the SLA field on the response, and the `/users` endpoint.

Run: `cd api && npm test` (needs the compose Postgres up). Full suite green: **22/22**.

## Notes / follow-ups
- Fixed while in here: `updateStatus` didn't clear `resolved_at` when a ticket was reopened, which would have misled the SLA badge (a reopened ticket would read as "resolved on time" forever). Reopen now clears it, with a test covering the resolve→reopen round trip. See `DECISIONS.md`.
- Deliberately out of scope: pagination and DB indexes on the filter columns — noted for a follow-up.
