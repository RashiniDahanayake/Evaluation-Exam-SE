# Add ticket filtering + SLA computation (backend)

> Backend slice of the root [`../PR.md`](../PR.md). Scope: the database /
> repository layer, the `GET /tickets` endpoint, the SLA computation, and the
> API tests. Frontend write-up: [`../web/PR.md`](../web/PR.md).

## What this does
- **Filtering** on `GET /tickets` by `status` and `assignee`, independently or combined. No filter = full list.
- **SLA status** — every ticket DTO now carries an `slaStatus` (`ok` / `at_risk` / `breached`) computed server-side.

## How it's wired
- **DB / repository** (`tickets.repository.ts`) — `listTickets` builds a parameterised `WHERE` clause from the supplied filters; the previous per-row N+1 was folded into a single join + comment-count subquery.
- **API** (`tickets.routes.ts`, `tickets.schema.ts`) — `GET /tickets` validates/coerces `?status=&assigneeId=` via zod at the boundary. New `GET /users` endpoint backs the assignee dropdown.
- **SLA logic** (`sla.ts`) — `computeSlaStatus` is a pure, `now`-injected function, called from `toTicketDto` so `slaStatus` is present on **every** ticket DTO (list, detail, create).

## How to review
Suggested reading order:
1. `src/sla.ts` — the SLA rule (breach = not resolved within `sla_hours`; `at_risk` at 75% elapsed). Start here.
2. `src/mappers.ts` — where `slaStatus` gets attached to the DTO (the integration point).
3. `src/tickets/tickets.repository.ts` + `tickets.schema.ts` — the filter query and its validation.

## Tests
- `test/sla.test.ts` — 8 unit tests over the SLA rule (unresolved/resolved, boundary at the deadline, at-risk threshold).
- `test/tickets.test.ts` — API-level coverage for filtering (status, assignee, combined, empty, invalid → 400), the SLA field on the response, and the `/users` endpoint.

Run: `cd api && npm test` (needs the compose Postgres up).

## Notes / follow-ups
- Fixed while in here: `updateStatus` didn't clear `resolved_at` when a ticket was reopened, which would have misled the SLA computation. Reopen now clears it, with a test covering the resolve→reopen round trip. See [`DECISIONS.md`](DECISIONS.md).
- Deliberately out of scope: pagination and DB indexes on the filter columns — noted for a follow-up.
