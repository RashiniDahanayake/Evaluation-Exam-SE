# Decision Log — Backend (API)

> Backend slice of the root [`../DECISIONS.md`](../DECISIONS.md). Covers the
> database query / repository layer, the `GET /tickets` endpoint, the SLA
> computation, and the API tests.

## Assumptions I made
- **SLA breach definition.** A ticket breaches if it is *not resolved within `sla_hours` of creation*. Concretely: resolved after the deadline → `breached`; still unresolved and already past the deadline → `breached`. The deadline is `created_at + sla_hours`.
- **A third `at_risk` state.** The brief only asks for "breached vs not", but a binary signal is easy to miss until it's too late. I added an intermediate `at_risk` state once ≥75% of the SLA window has elapsed on an unresolved ticket. It's a pure hint — the hard signal is still `breached`. The threshold is a single named constant so it's trivial to tune or remove.
- **Resolved tickets are judged on resolution time, not "now".** A ticket resolved comfortably inside its window stays `ok` forever, even years later. Only the create→resolve duration matters once resolved.
- **Filters are optional and combinable.** No filter = full list; `status` and `assignee` can be applied independently or together. Invalid filter values are rejected at the edge (400) rather than silently ignored.

## Design decisions
- **SLA is computed server-side, in one place.** `computeSlaStatus` lives in `api/src/sla.ts` and is called from `toTicketDto`, so *every* ticket DTO (list, detail, and create response) carries a consistent `slaStatus`. The web app just renders it — no duplicated date math on the client, no risk of the two drifting.
- **`now` is injected, not read ambiently.** Both `computeSlaStatus` and `toTicketDto` take `now` (defaulting to `new Date()`). Handlers get the convenient default; tests get determinism. This is what makes the SLA logic unit-testable without freezing the clock.
- **Filtering built as bound parameters.** The repository assembles the `WHERE` clause from whichever filters are present and pushes each value as a `$n` bound parameter — nothing is interpolated into SQL. Validation/coercion (query strings → typed values) happens in the zod schema at the route boundary, matching the existing `createTicketSchema` convention.
- **Added a `GET /users` endpoint.** The assignee filter dropdown needs the list of agents. I added a minimal users route/repository mirroring the existing tickets structure rather than hardcoding agents in the front end.
- **Matched existing conventions** throughout: repository/route/schema split, zod at the boundary, `snake_case` rows → `camelCase` DTOs via `mappers.ts`.

## Where I used AI
- Used AI to scaffold the repetitive, low-risk pieces: the filter `WHERE`-builder, the zod schema additions, the `/users` route, and the first draft of the SLA unit tests.
- **Corrected:** the initial pass wrote `computeSlaStatus` and the SLA unit tests but *never wired the result into the API response* — `toTicketDto` still didn't emit `slaStatus`, so the badge would have rendered blank and two API tests asserted a field the endpoint never returned. I caught this by tracing the response path end-to-end and threaded the computation through the mapper.
- **Reviewed, kept:** the boundary-validation and bound-parameter approach for filters — it's the safe default and matched the repo's existing style, so I kept it.

## Anything I noticed in the existing code
- **`updateStatus` never cleared `resolved_at` on reopen.** Moving a ticket *to* `resolved` stamps `resolved_at = now()`, but moving it *away* (e.g. back to `open`) left the old timestamp. A reopened ticket would then be judged by `computeSlaStatus` as "resolved on time" and show `ok` forever. Because the SLA badge depends directly on `resolved_at` being accurate, I fixed it: reopen now clears `resolved_at`, and there's a test covering the resolve→reopen round trip.
- **The old `listTickets` was an N+1** (one query per row for assignee/comment count). I folded it into a single join + subquery while I was in there, mirroring `getTicketById`.

## What I'd do with more time
- Add a seed row + an API test that exercises the `at_risk` state end-to-end (currently only covered by unit tests).
- Add DB indexes on `tickets.status` and `tickets.assignee_id` to keep filtering fast as the table grows.
- Consider pagination on `GET /tickets` — fine at seed scale, but the list is unbounded today.
