# Decision Log — Frontend (Web)

> Frontend slice of the root [`../DECISIONS.md`](../DECISIONS.md). Covers the
> React ticket list: filter controls and the SLA badge. The SLA rule itself and
> the filter query are owned by the backend — see [`../api/DECISIONS.md`](../api/DECISIONS.md).

## Assumptions I made
- **Filters map directly to the URL / controls.** `status` and `assignee` are kept as strings in component state so they map 1:1 to the `<select>` values and the query string. Empty string means "no filter". No filter = full list; the two can be applied independently or together.
- **SLA is rendered, not computed.** The client trusts the `slaStatus` field on each ticket DTO and only maps it to a label + badge colour. All three states are surfaced: `ok` → "On track", `at_risk` → "At risk", `breached` → "Breached". Keeping the date math server-side means there's no risk of the list and API disagreeing.

## Design decisions
- **Badge styling consistent with the existing badges.** The SLA badge reuses the same `badge` styling pattern as the existing `status-*` badges rather than introducing a separate visual language.
- **Filters re-fetch from the server.** Changing the status or assignee control re-requests `GET /tickets?...` rather than filtering in-memory, so the list always reflects what the API considers a match (and stays correct if the dataset grows beyond what's loaded).
- **Single source of truth for statuses.** `TICKET_STATUSES` in `types.ts` is shared by the list filter and the detail-page status control so the two can't drift apart.

## Where I used AI
- Used AI to scaffold the SLA badge CSS and the filter-control markup, then reviewed it against the existing component conventions.

## Anything I noticed in the existing code
- Nothing blocking on the frontend; the existing list component was a clean starting point to extend with the filter controls and the SLA column.

## What I'd do with more time
- Surface the actual SLA deadline (a timestamp/countdown) in the ticket detail view, not just the list badge.
- Reflect the active filters in the URL hash so a filtered view is shareable/bookmarkable and survives a refresh.
