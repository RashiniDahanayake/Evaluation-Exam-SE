# Add ticket filtering controls + SLA badge (frontend)

> Frontend slice of the root [`../PR.md`](../PR.md). Scope: the React ticket
> list — filter controls and the SLA badge. Backend write-up:
> [`../api/PR.md`](../api/PR.md).

## What this does
- **Filter controls** on the ticket list: status and assignee `<select>`s, usable independently or combined. No selection = full list.
- **SLA badge** — every ticket in the list shows an at-a-glance badge: `On track` / `At risk` / `Breached`.

## How it's wired
- **`TicketList.tsx`** — status + assignee controls that re-fetch `GET /tickets?...` on change, plus the SLA badge column. The assignee dropdown is populated from `GET /users`.
- **`types.ts`** — `SlaStatus` type and the shared `TICKET_STATUSES` list used by both the filter and the detail-page status control.
- **`styles.css`** — SLA badge styling, reusing the existing `badge` pattern.
- **`vite.config.ts`** — dev proxy extended so `/users` is forwarded to the API alongside `/tickets`.

## How to review
1. `src/TicketList.tsx` — filter controls + badge rendering (the meat of the change).
2. `src/types.ts` — the `SlaStatus` type and the DTO shape the UI consumes.
3. `src/styles.css` — the badge styles.

The SLA rule is computed server-side; the UI only maps `slaStatus` → label + colour. See [`../api/PR.md`](../api/PR.md) for that logic.

## Notes / follow-ups
- Deliberately out of scope: surfacing the SLA deadline/countdown in the detail view, and reflecting active filters in the URL for shareable/bookmarkable filtered views — noted for a follow-up.
