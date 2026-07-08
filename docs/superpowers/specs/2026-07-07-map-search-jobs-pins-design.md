# Map: address search + lead/job pins — design

Date: 2026-07-07
Status: approved by user (conversation), pending spec-file review

## Goal

Extend the map page with:

1. An address search bar with autocomplete that flies the map to the selected address.
2. Pins for all current leads (every status except `lost`) and all current jobs (every status except `done`), visually distinct and both clickable to their drawers.

## Decisions (user-confirmed)

- Job pin click opens `JobDrawer` on the map page (`/map?j=<id>`), same pattern as lead pins with `/map?l=<id>`.
- Job pins use a distinct shape (diamond) colored by job status; lead pins keep the existing teardrop with lead status color.
- Search select = fly to result + temporary highlight marker. Marker clears on next search or any map click. No form prefill.
- Two toolbar layer toggles — Leads / Jobs — both on by default.
- Autocomplete built as a custom combobox against the Mapbox Geocoding v6 forward endpoint. No new dependencies.

## 1. Data (server — `app/(app)/map/page.tsx`)

- Keep the existing leads fetch (`leads_public` + `customers`, admin quote join).
- Add a jobs fetch mirroring the jobs page pattern: `jobs_public` rows (price not needed for pins, so no admin base-table join) built via `buildJobs` with the already-fetched customers projection extended to include `lat`/`lng`.
- Server-side filters: leads `status !== 'lost'`; jobs `status !== 'done'`.
- Role visibility: apply `visibleJobs(role, uid, jobs)` so cleaners see only claimable + own jobs — identical rules to the jobs board.
- Job coordinates come from the job's customer `lat`/`lng`. Jobs whose customer has no coords are skipped (same as leads today).
- `?j=<id>` search param selects a job for the drawer, coexisting with `?l=<id>` for leads. If both present, lead wins (arbitrary but explicit).

## 2. Pin model (`lib/mapPins.ts` — new module)

```ts
export type MapPin =
  | { kind: 'lead'; id: number; lat: number; lng: number; status: LeadStatus; label: string }
  | { kind: 'job';  id: number; lat: number; lng: number; status: JobStatus;  label: string };
```

- Pure builder `buildMapPins(leads: Lead[], jobs: Job[]): MapPin[]` — applies the lost/done exclusions and missing-coords skip, builds labels (`{customer} — {status label}` for leads, `{customer} — Job: {status label}` for jobs). Unit-testable with no DOM.
- The existing lead-only `Pin` type in `lib/leads.ts` stays untouched; dashboard `MiniMap` remains lead-only and is out of scope.

## 3. Markers, legend, drawers

- `MapboxMap` and `SchematicMap` accept `MapPin[]` and branch on `kind`:
  - `lead` → existing `.mpin` teardrop, `statusColor[status]`.
  - `job` → new `.mpin` variant rendering a diamond (CSS-rotated square), `jobStatusColor[status]`.
- Pin click callback carries the pin (or `kind` + `id`); `MapView` routes lead → `/map?l=<id>`, job → `/map?j=<id>` (soft navigation, `scroll: false`).
- Map page renders `JobDrawer` when `?j=` matches a visible job, with `backTo="/map"`.
- `Legend` gains a job-status row (unclaimed / claimed / in progress) and a shape key (teardrop = lead, diamond = job).

## 4. Search (`components/map/MapSearch.tsx` — new client component)

- Text input in the map toolbar (`.maptools`), rendered only when the Mapbox implementation is active (`pickMapImpl(token) === 'mapbox'`). Schematic mode: no search (geocoding needs the token anyway).
- Debounce 300 ms; query the Mapbox Geocoding v6 forward endpoint with `q`, `autocomplete=true`, `limit=5`, `proximity=<current map center>`, `access_token=<existing NEXT_PUBLIC_MAPBOX_TOKEN>`.
- Suggestion dropdown is an ARIA combobox/listbox: ArrowUp/ArrowDown to move, Enter to select, Escape to close, click/tap to select. Touch targets ≥ 44px per the wave-2 conventions.
- On select: `map.flyTo({ center, zoom: 16 })` and place a temporary accent-colored marker at the result. The temp marker is cleared on the next search selection or any map click.
- Wiring: `MapView` owns `searchTarget: { lng, lat, seq } | null` state; `MapboxMap` receives it as a prop and flies/places the temp marker in an effect (`seq` forces re-fly on repeat selection of the same place).
- Robustness: `AbortController` cancels stale in-flight requests; fetch failure or empty feature list renders a single "No results" row; clearing the input closes the dropdown and aborts.

## 5. Layer toggles

- Two toggle chips in the toolbar: **Leads** and **Jobs**, both on by default.
- Local `useState` in `MapView`; pins filtered client-side by `kind` before being passed to the map implementation. No persistence.

## 6. Error handling summary

- Geocoding fetch errors: swallowed into "No results" (no toast, no crash); logged to console for debugging.
- Jobs query errors: `logQueryError` like the existing leads queries; page renders with whatever data arrived.
- Missing customer coords: pin silently skipped (existing behavior for leads, extended to jobs).

## 7. Testing

Vitest unit tests (node environment, matching repo pattern):

- `buildMapPins`: lost leads excluded, done jobs excluded, null-coord entries skipped, labels and kinds correct.
- Geocode URL builder (pure helper): parameters, proximity formatting, encoding.
- Suggestion → fly-target mapping helper.

No E2E/map-render tests, consistent with current repo (no mapbox-gl in test env).

## Out of scope

- Dashboard MiniMap (stays lead-only).
- Reverse geocoding on pin-drop (existing create-lead flow unchanged).
- Search in schematic fallback mode.
- Persisting toggle state.
