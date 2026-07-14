# Small Changes Batch — Design

**Date:** 2026-07-14
**Status:** Approved by owner (brainstorm session 2026-07-14)
**Scope:** Six owner-requested changes, designed together, sized small-to-medium. Item 6 depends on the map-dots feature (`2026-07-14-map-dots-design.md`) being implemented first.

## 1. Faster map animations

The only animated camera move today is `map.flyTo` on search-select (`components/map/MapboxMap.tsx:109`). Add `speed: 2.4` (mapbox default 1.2 — roughly halves flight time) via a shared exported options constant in `lib/geo.ts` (beside `MAP_STYLE`, item 5) so future flyTo callers inherit it. GeolocateControl centering (item 4) keeps its own default. No other animations exist; `cooperativeGestures` untouched.

## 2. Calendar page (`/calendar`)

**Nav:** new item in `lib/nav.ts` after Jobs — `{ href: '/calendar', label: 'Calendar', num: '05', roles: ['admin','rep','cleaner'] }`; subsequent `num` strings renumber. `TITLES` entry: `['Calendar / Schedule', 'jobs by schedule · leads by created']`.

**Page:** server component, month view with Prev / Today / Next controls (month in `?m=YYYY-MM` search param; missing/invalid → current month). Fetches scoped to the visible month:

- **Jobs** by `scheduled_date` within the month, deleted excluded, done INCLUDED (calendar doubles as history). Role-split identical to the jobs page: admin/rep read base `jobs`, cleaners read `jobs_public`, filtered through `visibleJobs`. Unscheduled jobs (null `scheduled_date`) do not appear — the board covers them.
- **Leads** by `created_at` within the month — **admin/rep only** (matches `/leads` nav gating; cleaners get a jobs-only calendar). Uses `leads_public` + the same build helpers as the leads/map pages.

**Day cell:** status-colored chips — ● for jobs (job-status colors), ◆ for leads (lead-status colors) — showing the customer name, with `+n more` overflow past the cell's capacity. Phones-first (house rule): below a width breakpoint cells collapse to colored count dots; tapping a day opens a day panel (list of that day's entries, same chip styling).

**Entry click:** navigates to `/calendar?m=<m>&j=<id>` or `/calendar?m=<m>&l=<id>`; the page renders `JobDrawer` / `LeadDrawer` with `backTo={'/calendar?m=' + m}` — otherwise the exact `/map` page pattern (`app/(app)/map/page.tsx:151-162`), including the `?l=` wins-over-`?j=` rule and cleaner deep-link filtering through `visibleJobs`. The month param must ride along on BOTH open links and backTo (drawers close via `router.push(backTo)`, so a bare `/calendar` would lose the month).

**Drawer-support fetches:** rendering those drawers needs the map page's ancillary data, not just the month-scoped jobs/leads — `job_members` (JobDrawer members panel), `profiles` incl. `role` (names + LeadDrawer `reps`/`uid`), active-customer options, and the per-selection `leadDetail` query with its admin/non-admin split (`app/(app)/map/page.tsx:39-146`). Same code shapes, lifted as-is.

**Timezone:** day bucketing uses the string-slice convention already used app-wide (`scheduled_date.slice(0,10)`, per `jobsThisWeek` in `lib/dashboard.ts`) — no new timezone machinery.

**Testing:** unit — month bucketing helper (jobs+leads → day map, month boundary, invalid `?m=`), render (chips per day, overflow, cleaner sees no leads, day panel), drawer param routing incl. `?m=` survival. `tests/unit/nav.test.ts` updates with the new item (asserts exact item count + cleaner href list today).

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
- **Accepted deviation from "no auto-follow":** mapbox has no "live dot, never follow" mode — `trackUserLocation: true` follows the position from click until the first manual pan (ACTIVE_LOCK → BACKGROUND on drag), then the dot keeps updating without moving the camera. Owner-visible effect: after tapping the locate button the map recenters on each position fix until you pan once. Closest off-the-shelf match to intent; accepted in brainstorm.
- Added in the map-construction effect, removed with the map (control lifecycle owned by mapbox).
- Testing: unit render test asserts the control is attached for the /map instance and absent for MiniMap (`interactive={false}` prop drives the gate — control added only when `interactive`). The mapbox-gl test mock grows `addControl` on FakeMap + a `GeolocateControl` export (`tests/unit/MapboxMap.render.test.tsx` mock has neither today).

## 5. Simple map style (no satellite)

`mapbox://styles/mapbox/satellite-streets-v12` → `mapbox://styles/mapbox/streets-v12`, everywhere, no toggle. Single exported constant `MAP_STYLE` in `lib/geo.ts`, consumed by `MapboxMap` — `/map` and dashboard MiniMap both change with it. Streets style renders house/address numbers natively at high zoom (owner's "no houses-style graphics, just house numbers"). Matches old-CRM look in owner screenshots.

## 6. Win rate counts map No's

**Depends on map-dots implementation (dots table must exist).**

- `lib/dashboard.ts` `winRate` signature: `winRate(leads: WinLead[], noDots: number)` → `won / (won + lost + noDots)`, still 0 on zero denominator.
- No new query: the dashboard already fetches full dot rows for the MiniMap (dots spec, Dashboard MiniMap section) — `noDots` is a client-side `filter(d => d.status === 'no').length` over that data. One fetch, no drift between the MiniMap dots and the stat.
- Converted dots are deleted by the convert RPCs and deleted dots are gone (hard delete), so they naturally drop out of the count — the denominator reflects doors that CURRENTLY stand at "no".
- Unit tests: existing `winRate` cases extend with `noDots` (0 keeps old behavior; positive shifts rate; no-leads + no-dots → 0).

## Sequencing

Items 1, 3, 4, 5 are independent of everything. Item 2 is independent but largest. Item 6 requires the dots migration. Natural plan order: dots feature first (its own spec), then this batch in one wave (6 last).

## Out of scope

- Style toggle / satellite return.
- Calendar week/day views, drag-to-reschedule, unscheduled bucket.
- Follow-me navigation mode.
