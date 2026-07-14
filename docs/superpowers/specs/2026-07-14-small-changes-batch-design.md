# Small Changes Batch — Design

**Date:** 2026-07-14
**Status:** Approved by owner (brainstorm session 2026-07-14)
**Scope:** Six owner-requested changes, designed together, sized small-to-medium. Item 6 depends on the map-dots feature (`2026-07-14-map-dots-design.md`) being implemented first.

## 1. Faster map animations

The only animated camera move today is `map.flyTo` on search-select (`components/map/MapboxMap.tsx:109`). Add `speed: 2.4` (mapbox default 1.2 — roughly halves flight time) via a shared exported options constant so future flyTo callers inherit it. GeolocateControl centering (item 4) keeps its own default. No other animations exist; `cooperativeGestures` untouched.

## 2. Calendar page (`/calendar`)

**Nav:** new item in `lib/nav.ts` after Jobs — `{ href: '/calendar', label: 'Calendar', roles: ['admin','rep','cleaner'] }`; subsequent `num` strings renumber. `TITLES` entry: `['Calendar / Schedule', 'jobs by schedule · leads by created']`.

**Page:** server component, month view with Prev / Today / Next controls (month in `?m=YYYY-MM` search param; missing/invalid → current month). Fetches scoped to the visible month:

- **Jobs** by `scheduled_date` within the month, deleted excluded, done INCLUDED (calendar doubles as history). Role-split identical to the jobs page: admin/rep read base `jobs`, cleaners read `jobs_public`, filtered through `visibleJobs`. Unscheduled jobs (null `scheduled_date`) do not appear — the board covers them.
- **Leads** by `created_at` within the month — **admin/rep only** (matches `/leads` nav gating; cleaners get a jobs-only calendar). Uses `leads_public` + the same build helpers as the leads/map pages.

**Day cell:** status-colored chips — ● for jobs (job-status colors), ◆ for leads (lead-status colors) — showing the customer name, with `+n more` overflow past the cell's capacity. Phones-first (house rule): below a width breakpoint cells collapse to colored count dots; tapping a day opens a day panel (list of that day's entries, same chip styling).

**Entry click:** navigates to `/calendar?j=<id>` or `/calendar?l=<id>`; the page renders `JobDrawer` / `LeadDrawer` with `backTo="/calendar"` — the exact `/map` page pattern (`app/(app)/map/page.tsx:151-162`), including the `?l=` wins-over-`?j=` rule and cleaner deep-link filtering through `visibleJobs`. `?m=` is preserved when opening/closing drawers.

**Timezone:** day bucketing uses the string-slice convention already used app-wide (`scheduled_date.slice(0,10)`, per `jobsThisWeek` in `lib/dashboard.ts`) — no new timezone machinery.

**Testing:** unit — month bucketing helper (jobs+leads → day map, month boundary, invalid `?m=`), render (chips per day, overflow, cleaner sees no leads, day panel), drawer param routing.

## 3. Rename "Cleaner pot" → "Cleaners Pay"

Label-only change; DB column stays `cleaner_amount`, no migration. Sites:

- `components/jobs/JobDrawer.tsx:194` (view label) and `:359` (edit label "Cleaners Pay $").
- Done-without-pot confirm dialogs — `components/jobs/JobsBoard.tsx:75` and `components/jobs/JobDrawer.tsx:78`: "No cleaners pay set — no payout will be created. Continue?".
- Map-dots spec's Job form field label (applies when that feature is built).
- Unit tests asserting the old label (`tests/unit/JobDrawer.render.test.tsx` and any board test) update with it.
- Historical spec/plan docs are NOT rewritten. Sweep `grep -ri "pot"` over `components/ app/ lib/ tests/` at implementation time to catch stragglers ("your share" line is untouched).

## 4. User location on map

Mapbox `GeolocateControl` added to the interactive `/map` map only (NOT MiniMap, NOT the schematic fallback — no geo frame there):

```ts
new mapboxgl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,   // live-updating blue dot + accuracy ring
  showUserHeading: true,
})
```

- Button renders on the map; the browser permission prompt fires on first click (control's native behavior — no permission code of ours).
- `trackUserLocation: true` centers on click and follows until the user pans; mapbox's built-in disengage-on-pan delivers the owner's "live dot, no auto-follow fight" intent. Dot keeps updating after follow disengages.
- Added in the map-construction effect, removed with the map (control lifecycle owned by mapbox).
- Testing: unit render test asserts the control is attached for the /map instance and absent for MiniMap (`interactive={false}` prop drives the gate — control added only when `interactive`).

## 5. Simple map style (no satellite)

`mapbox://styles/mapbox/satellite-streets-v12` → `mapbox://styles/mapbox/streets-v12`, everywhere, no toggle. Single exported constant `MAP_STYLE` in `lib/geo.ts`, consumed by `MapboxMap` — `/map` and dashboard MiniMap both change with it. Streets style renders house/address numbers natively at high zoom (owner's "no houses-style graphics, just house numbers"). Matches old-CRM look in owner screenshots.

## 6. Win rate counts map No's

**Depends on map-dots implementation (dots table must exist).**

- `lib/dashboard.ts` `winRate` signature: `winRate(leads: WinLead[], noDots: number)` → `won / (won + lost + noDots)`, still 0 on zero denominator.
- Dashboard page adds a head-count query: `dots` where `status = 'no'` (all roles can read dots per the dots spec; count query follows the unclaimed-badge head-count pattern from polish-wave Task 8, `logQueryError` → treat null as 0).
- Converted dots are deleted by the convert RPCs and deleted dots are gone (hard delete), so they naturally drop out of the count — the denominator reflects doors that CURRENTLY stand at "no".
- Unit tests: existing `winRate` cases extend with `noDots` (0 keeps old behavior; positive shifts rate; no-leads + no-dots → 0).

## Sequencing

Items 1, 3, 4, 5 are independent of everything. Item 2 is independent but largest. Item 6 requires the dots migration. Natural plan order: dots feature first (its own spec), then this batch in one wave (6 last).

## Out of scope

- Style toggle / satellite return.
- Calendar week/day views, drag-to-reschedule, unscheduled bucket.
- Follow-me navigation mode.
