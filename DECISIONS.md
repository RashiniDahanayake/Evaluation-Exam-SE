# Decision Log

This log records the reasoning behind the *ticket filtering + SLA indicator* change:
the assumptions I committed to, the design trade-offs I made, where I used AI (and
what I corrected), what I found in the existing code, and what I'd tackle next.
Per-package detail lives in [`api/DECISIONS.md`](api/DECISIONS.md) and
[`web/DECISIONS.md`](web/DECISIONS.md); this is the whole-stack view.

---

## Problem framing

The brief asks for two agent-facing features on the ticket list: **filtering**
(by status and assignee) and an **SLA breach indicator**. Both are read-path
features, so the guiding constraints were: keep the *shape of the response* the
single source of truth, keep the SLA rule *pure and testable*, and keep untrusted
input *out of the SQL*. Everything below follows from those three.

---

## Assumptions I made

- **SLA breach definition.** A ticket breaches if it is *not resolved within
  `sla_hours` of creation*. The deadline is `created_at + sla_hours`. Resolved
  after the deadline → `breached`; still unresolved and already past the deadline
  → `breached`. This is the one hard, business-visible signal.
- **Deadline boundary is inclusive of "on time".** Resolving (or being at) *exactly*
  the deadline counts as met, not breached — `computeSlaStatus` uses a strict `>`
  comparison. Reasonable people could pick `>=`; I made the boundary explicit and
  put it under test rather than leaving it to chance.
- **A third `at_risk` state.** The brief says "breached vs not", but a binary badge
  is only useful *after* it's too late. I added an intermediate `at_risk` once
  ≥75% of the SLA window has elapsed on an unresolved ticket. It's a leading
  indicator, not a contractual state — the hard signal is still `breached`. The
  75% lives in one named constant (`AT_RISK_THRESHOLD`) so it's trivial to tune or
  remove.
- **Resolved tickets are judged on resolution time, not "now".** A ticket resolved
  comfortably inside its window stays `ok` forever, even years later. Once resolved,
  only the create→resolve duration matters; wall-clock time stops being an input.
- **Reopening is an allowed transition.** `PATCH /tickets/:id/status` accepts any
  valid target status, so a `resolved`/`closed` ticket can move back to
  `open`/`in_progress`. I treat that as intended support-desk behaviour rather than
  enforcing a state machine — but I handle its SLA consequence explicitly (see the
  `resolved_at` decision below).
- **Filters are optional, combinable, and validated at the edge.** No filter = full
  list; `status` and `assignee` apply independently or together. Invalid values are
  rejected with `400` at the boundary rather than silently ignored, so a typo in a
  query string can't quietly return the wrong set.

---

## Design decisions

### SLA is computed server-side, in exactly one place
`computeSlaStatus` lives in [`api/src/sla.ts`](api/src/sla.ts) and is called only
from `toTicketDto` ([`api/src/mappers.ts`](api/src/mappers.ts)). Because the mapper
is the single DB→API boundary, **every** ticket DTO — list, detail, and the create
response — carries a consistent `slaStatus` for free. The web app renders that
field and does no date math of its own, so the list and the API cannot drift. If I
change the SLA rule, there is one function to change and one set of unit tests to
update.

### `now` is injected, never read ambiently
Both `computeSlaStatus` and `toTicketDto` take `now` as an explicit argument
(defaulting to `new Date()`). Request handlers get the convenient default; tests
pin `now` to a fixed instant and assert deterministic output. This is the design
choice that makes the SLA logic unit-testable *without* freezing the global clock or
introducing a clock-abstraction dependency — the classic "pass the value, don't read
the world" move. All time math is done on epoch milliseconds (`Date.getTime()`), so
it's timezone-agnostic: `created_at`/`resolved_at` come back from Postgres as
absolute instants and the comparison never touches a local offset.

### `resolved_at` is cleared on reopen (correctness invariant)
The SLA badge is only as honest as its inputs. Moving a ticket *to* `resolved`
stamps `resolved_at = now()`; moving it back to `open`/`in_progress` **clears** it;
`closed` leaves it untouched. Without the clear, a reopened ticket would keep its
old resolution timestamp and `computeSlaStatus` would forever report it as
"resolved on time" while it sat open past its deadline. The invariant I'm
maintaining: *`resolved_at` is non-null iff the ticket is currently in a resolved
state.* See [`api/src/tickets/tickets.repository.ts`](api/src/tickets/tickets.repository.ts).

### Filtering is built from bound parameters, not string interpolation
`listTickets` assembles its `WHERE` clause from whichever filters are present and
pushes each value as a `$n` bound parameter — nothing user-supplied is ever
concatenated into SQL, so the endpoint is injection-safe by construction, not by
escaping. Type coercion (query strings → typed values) happens in the zod schema at
the route boundary, matching the existing `createTicketSchema` convention. Validation
and parameterisation are layered: the schema guarantees *shape*, bound params
guarantee *safety*.

### One query, not N+1
The previous `listTickets` issued one query per row for the assignee name and
comment count. I folded it into a single `LEFT JOIN` for the assignee plus a scalar
subquery for the comment count, mirroring `getTicketById`. List latency is now one
round trip regardless of result size.

### A minimal `GET /users` endpoint
The assignee filter dropdown needs the real list of agents. Rather than hardcoding
agents in the front end (which would rot the moment the users table changes), I
added a small users route + repository mirroring the tickets structure. It reuses the
same layering, so there's nothing novel to review.

### Consistency over cleverness
Throughout, I matched the repo's existing conventions: route/repository/schema split,
zod at the boundary, `snake_case` rows → `camelCase` DTOs via `mappers.ts`, `AppError`
for expected failures (rendered by the central handler in
[`api/src/errors.ts`](api/src/errors.ts)), and badge styling reusing the existing
`status-*` pattern. A reviewer should be able to read the new code as "more of the
same", which is the point.

---

## Correctness & testing strategy

- **SLA rule — unit tested in isolation.** `sla.test.ts` covers the whole truth
  table: unresolved-ok, unresolved-at-risk, unresolved-breached, resolved-on-time,
  resolved-late, and the exact-deadline boundary. Because `now` is injected, these
  are fast, deterministic, and DB-free.
- **Filtering & response shape — tested at the API level.** `tickets.test.ts`
  exercises `GET /tickets` through `app.inject`: status filter, assignee filter,
  the two combined, the empty-result case, an invalid value → `400`, the presence of
  `slaStatus` on the response, and the reopen→`resolved_at`-cleared round trip.
- **Layered on purpose.** Pure logic is proven by unit tests; wiring and validation
  are proven by API tests against a real Postgres (`deskline_test`). That split keeps
  the fast tests fast and reserves the DB for what actually needs it.

---

## Security & robustness posture

- **No SQL injection surface** on the new endpoints — every value is a bound
  parameter; the dynamic part of the query is only column/operator text the server
  controls.
- **Input is validated before it reaches a repository** — zod enums reject unknown
  statuses, and `assigneeId` is coerced to a positive integer, so malformed queries
  fail fast at the edge with a structured `400`.
- **Errors are typed, not leaked** — expected failures throw `AppError(status, msg)`;
  unexpected ones bubble to the central handler and return a generic `500` while the
  real error is logged, so internals aren't exposed to clients.

---

## Where I used AI

- **Scaffolded the repetitive, low-risk pieces:** the filter `WHERE`-builder, the zod
  schema additions, the `/users` route, the SLA badge CSS, and the first draft of the
  SLA unit tests.
- **Corrected (the important one):** the initial pass wrote `computeSlaStatus` and its
  unit tests but *never wired the result into the API response* — `toTicketDto` still
  didn't emit `slaStatus`. The unit tests were green, so the gap was invisible from
  the test summary, yet the badge would have rendered blank and two API tests asserted
  a field the endpoint never returned. I caught it by tracing the response path
  end-to-end (route → repository → mapper → DTO) and threaded the computation through
  the mapper. Lesson I'd generalise: green unit tests on a pure function say nothing
  about whether it's *reachable* from the request path.
- **Reviewed and kept:** the boundary-validation + bound-parameter approach for
  filters. It's the safe default and matched the repo's existing style, so I adopted
  it deliberately rather than by inertia.

---

## What I noticed in the existing code

- **`updateStatus` didn't clear `resolved_at` on reopen.** Detailed under "Design
  decisions" above — I fixed it because the SLA badge depends directly on that field
  being accurate, and added a test for the resolve→reopen round trip. The broader
  question of *which* transitions should be allowed is worth a team decision; the
  safe default (clear the stamp) is in place regardless.
- **The old `listTickets` was an N+1.** Folded into a single join + subquery while I
  was in there.

---

## What I'd do with more time

- **Persist the active filters in the URL hash** so a filtered view is shareable and
  survives a refresh (the web app already does hash routing).
- **Add an API-level test for `at_risk`** with a seed row, so the state is covered
  end-to-end and not only by unit tests.
- **Add DB indexes on `tickets.status` and `tickets.assignee_id`** to keep filtering
  fast as the table grows; both are exact-match predicates that benefit directly.
- **Paginate `GET /tickets`.** Fine at seed scale, but the list is unbounded today; I'd
  add keyset pagination on `created_at` to match the existing sort.
- **Surface the SLA deadline itself** (an absolute timestamp / countdown) in the ticket
  detail view, not just the coarse badge.
- **Define an explicit status-transition policy** if the team wants to disallow moves
  like `closed → open`; today any valid target status is accepted.
