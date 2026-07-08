# Map Search + Lead/Job Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an address-autocomplete search bar that flies the map to a picked address, and show non-lost leads plus non-done jobs as visually distinct, clickable pins with layer toggles.

**Architecture:** A new pure module `lib/mapPins.ts` builds a discriminated-union `MapPin[]` (leads + jobs) from server data; the two map implementations render pins by `kind` (lead = existing diamond, job = circle). A new pure module `lib/geocode.ts` builds/parses Mapbox Geocoding v6 requests; a custom combobox component `MapSearch` consumes it and `MapView` relays the picked coordinate to `MapboxMap` via a `flyTo` prop.

**Tech Stack:** Next.js (App Router, server pages + client components), mapbox-gl (already installed), Supabase (`jobs_public` view), Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-07-07-map-search-jobs-pins-design.md`

## Global Constraints

- No new npm dependencies.
- Money never reaches non-admin clients: jobs are fetched from `jobs_public` only (price is not needed for pins).
- Cleaner visibility must go through `visibleJobs(role, uid, jobs)` — identical to the jobs board rules.
- `mapbox-gl` and its CSS may only be imported inside `components/map/MapboxMap.tsx` (never in a server file); dynamic import with `ssr: false` stays as-is.
- Search UI renders only when `pickMapImpl(token) === 'mapbox'` (schematic mode has no geocoding).
- Touch targets ≥ 44px (wave-2 convention); suggestion rows must meet this.
- This repo's Next.js has breaking changes vs. training data — if any Next.js API question arises, check `node_modules/next/dist/docs/` first. (This plan only uses patterns already present in the repo: async `searchParams`, `next/dynamic`, `useRouter` from `next/navigation`.)
- Test command: `npm test` (vitest run). Lint: `npm run lint`. Build check: `npm run build`.
- Commit after every task. Do NOT commit unrelated files already modified in the working tree (`app/globals.css` has pre-existing modifications — stage it with `git add app/globals.css` only if your task changed it, and mention pre-existing hunks are acceptable to include; if the tree looks dirty beyond your task, stage only the files your task touched).

---

### Task 1: `lib/mapPins.ts` — MapPin union + builder + color helper

**Files:**
- Create: `lib/mapPins.ts`
- Test: `tests/unit/mapPins.test.ts`

**Interfaces:**
- Consumes: `Lead`, `LeadStatus`, `statusLabel`, `statusColor` from `@/lib/leads`; `Job`, `JobStatus`, `jobStatusLabel`, `jobStatusColor` from `@/lib/jobs`.
- Produces (later tasks rely on these exact names):
  - `type MapPin = { kind: 'lead'; id: number; lat: number; lng: number; status: LeadStatus; label: string } | { kind: 'job'; id: number; lat: number; lng: number; status: JobStatus; label: string }`
  - `buildMapPins(leads: Lead[], jobs: Job[], geoByCustomer: Map<number, { lat: number | null; lng: number | null }>): MapPin[]`
  - `pinColor(pin: MapPin): string`
  - `pinKey(pin: MapPin): string` — `'lead-3'` / `'job-3'` (lead and job ids can collide; React keys and DOM lookups need uniqueness)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/mapPins.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMapPins, pinColor, pinKey, type MapPin } from '@/lib/mapPins';
import type { Lead } from '@/lib/leads';
import type { Job } from '@/lib/jobs';

const lead = (over: Partial<Lead>): Lead => ({
  id: 1, customer_id: 10, status: 'new', service: null, description: null,
  stories: null, panes: null, note: null, quote_value: null,
  created_at: '2026-01-01', updated_at: '2026-01-01',
  customer_name: 'Ann', address: null, phone: null, email: null,
  lat: 41.66, lng: -91.53, ...over,
});

const job = (over: Partial<Job>): Job => ({
  id: 1, customer_id: 10, lead_id: null, status: 'unclaimed',
  claimed_by: null, claimed_by_name: null, scheduled_date: null,
  service: null, description: null, price: null,
  created_at: '2026-01-01', updated_at: '2026-01-01',
  customer_name: 'Ann', address: null, phone: null, email: null, ...over,
});

const geo = new Map([[10, { lat: 41.66, lng: -91.53 }], [11, { lat: null, lng: null }]]);

describe('buildMapPins', () => {
  it('excludes lost leads and done jobs', () => {
    const pins = buildMapPins(
      [lead({ id: 1 }), lead({ id: 2, status: 'lost' })],
      [job({ id: 1 }), job({ id: 2, status: 'done' })],
      geo,
    );
    expect(pins).toHaveLength(2);
    expect(pins.find(p => p.kind === 'lead')?.id).toBe(1);
    expect(pins.find(p => p.kind === 'job')?.id).toBe(1);
  });

  it('skips leads without coords and jobs whose customer has no coords', () => {
    const pins = buildMapPins(
      [lead({ id: 1, lat: null, lng: null })],
      [job({ id: 1, customer_id: 11 }), job({ id: 2, customer_id: 99 })],
      geo,
    );
    expect(pins).toHaveLength(0);
  });

  it('builds labels: lead "name — Status", job "name — Job: Status"', () => {
    const pins = buildMapPins([lead({ status: 'follow' })], [job({ status: 'in_progress' })], geo);
    expect(pins[0].label).toBe('Ann — Follow-up');
    expect(pins[1].label).toBe('Ann — Job: In progress');
  });

  it('takes job coords from the customer geo map', () => {
    const pins = buildMapPins([], [job({})], geo);
    expect(pins[0].lat).toBe(41.66);
    expect(pins[0].lng).toBe(-91.53);
  });
});

describe('pinColor / pinKey', () => {
  const lp: MapPin = { kind: 'lead', id: 3, lat: 0, lng: 0, status: 'won', label: '' };
  const jp: MapPin = { kind: 'job', id: 3, lat: 0, lng: 0, status: 'claimed', label: '' };
  it('maps lead pins to lead status colors and job pins to job status colors', () => {
    expect(pinColor(lp)).toBe('var(--won)');
    expect(pinColor(jp)).toBe('var(--sched)');
  });
  it('produces distinct keys for same-id lead and job', () => {
    expect(pinKey(lp)).toBe('lead-3');
    expect(pinKey(jp)).toBe('job-3');
    expect(pinKey(lp)).not.toBe(pinKey(jp));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/mapPins.test.ts`
Expected: FAIL — cannot resolve `@/lib/mapPins`.

- [ ] **Step 3: Write the implementation**

Create `lib/mapPins.ts`:

```ts
import { statusLabel, statusColor, type Lead, type LeadStatus } from '@/lib/leads';
import { jobStatusLabel, jobStatusColor, type Job, type JobStatus } from '@/lib/jobs';

// One pin type for the map page: leads and jobs share the surface but keep their
// own status vocabularies. `kind` discriminates rendering (shape + color) and routing.
export type MapPin =
  | { kind: 'lead'; id: number; lat: number; lng: number; status: LeadStatus; label: string }
  | { kind: 'job'; id: number; lat: number; lng: number; status: JobStatus; label: string };

// Lead and job ids come from different sequences and can collide — key on kind too.
export const pinKey = (p: MapPin): string => `${p.kind}-${p.id}`;

export const pinColor = (p: MapPin): string =>
  p.kind === 'lead' ? statusColor[p.status] : jobStatusColor[p.status];

// Jobs carry no coordinates of their own; they inherit the customer's.
export function buildMapPins(
  leads: Lead[],
  jobs: Job[],
  geoByCustomer: Map<number, { lat: number | null; lng: number | null }>
): MapPin[] {
  const pins: MapPin[] = [];
  for (const l of leads) {
    if (l.status === 'lost') continue;
    if (l.lat == null || l.lng == null) continue;
    pins.push({
      kind: 'lead', id: l.id, lat: l.lat, lng: l.lng, status: l.status,
      label: `${l.customer_name} — ${statusLabel[l.status]}`,
    });
  }
  for (const j of jobs) {
    if (j.status === 'done') continue;
    const g = geoByCustomer.get(j.customer_id);
    if (g?.lat == null || g?.lng == null) continue;
    pins.push({
      kind: 'job', id: j.id, lat: g.lat, lng: g.lng, status: j.status,
      label: `${j.customer_name} — Job: ${jobStatusLabel[j.status]}`,
    });
  }
  return pins;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/mapPins.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/mapPins.ts tests/unit/mapPins.test.ts
git commit -m "feat(map): MapPin union + buildMapPins (non-lost leads, non-done jobs)"
```

---

### Task 2: `lib/geocode.ts` — Mapbox Geocoding v6 URL builder + response parser

**Files:**
- Create: `lib/geocode.ts`
- Test: `tests/unit/geocode.test.ts`

**Interfaces:**
- Consumes: `MAP_BOUNDS` from `@/lib/geo` (proximity bias = bounds center; the service area is one town, so bounds center ≈ map center without any ref plumbing).
- Produces (Task 5 relies on these exact names):
  - `type GeocodeSuggestion = { id: string; name: string; lat: number; lng: number }`
  - `geocodeUrl(q: string, token: string): string`
  - `parseGeocodeResponse(json: unknown): GeocodeSuggestion[]` — returns `[]` on any malformed input, never throws.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/geocode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { geocodeUrl, parseGeocodeResponse } from '@/lib/geocode';
import { MAP_BOUNDS } from '@/lib/geo';

describe('geocodeUrl', () => {
  it('targets the v6 forward endpoint with autocomplete, limit and token', () => {
    const u = new URL(geocodeUrl('123 Main St', 'pk.test'));
    expect(u.origin + u.pathname).toBe('https://api.mapbox.com/search/geocode/v6/forward');
    expect(u.searchParams.get('q')).toBe('123 Main St');
    expect(u.searchParams.get('autocomplete')).toBe('true');
    expect(u.searchParams.get('limit')).toBe('5');
    expect(u.searchParams.get('access_token')).toBe('pk.test');
  });
  it('biases proximity to the MAP_BOUNDS center as "lng,lat"', () => {
    const u = new URL(geocodeUrl('x', 't'));
    const [lng, lat] = u.searchParams.get('proximity')!.split(',').map(Number);
    expect(lng).toBeCloseTo((MAP_BOUNDS.minLng + MAP_BOUNDS.maxLng) / 2, 6);
    expect(lat).toBeCloseTo((MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2, 6);
  });
  it('URL-encodes the query', () => {
    expect(geocodeUrl('a&b c', 't')).toContain('q=a%26b+c'); // URLSearchParams encoding
  });
});

describe('parseGeocodeResponse', () => {
  const feature = (name: string, lng: number, lat: number, id = 'f1') => ({
    id,
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { full_address: name },
  });

  it('maps features to suggestions using geometry coordinates [lng, lat]', () => {
    const out = parseGeocodeResponse({ features: [feature('123 Main St, Iowa City', -91.53, 41.66)] });
    expect(out).toEqual([{ id: 'f1', name: '123 Main St, Iowa City', lat: 41.66, lng: -91.53 }]);
  });
  it('falls back to properties.name when full_address is missing', () => {
    const f = feature('', -91.5, 41.6);
    f.properties = { name: 'Iowa City' } as never;
    expect(parseGeocodeResponse({ features: [f] })[0].name).toBe('Iowa City');
  });
  it('returns [] for malformed payloads without throwing', () => {
    expect(parseGeocodeResponse(null)).toEqual([]);
    expect(parseGeocodeResponse({})).toEqual([]);
    expect(parseGeocodeResponse({ features: [{}] })).toEqual([]);
    expect(parseGeocodeResponse({ features: [{ geometry: { coordinates: ['x', 'y'] }, properties: {} }] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/geocode.test.ts`
Expected: FAIL — cannot resolve `@/lib/geocode`.

- [ ] **Step 3: Write the implementation**

Create `lib/geocode.ts`:

```ts
import { MAP_BOUNDS } from '@/lib/geo';

export type GeocodeSuggestion = { id: string; name: string; lat: number; lng: number };

// Proximity bias: center of the fixed service-area bounds. Good enough for a
// one-town CRM and avoids plumbing live map center through refs.
const PROXIMITY = `${(MAP_BOUNDS.minLng + MAP_BOUNDS.maxLng) / 2},${(MAP_BOUNDS.minLat + MAP_BOUNDS.maxLat) / 2}`;

export function geocodeUrl(q: string, token: string): string {
  const p = new URLSearchParams({
    q,
    autocomplete: 'true',
    limit: '5',
    proximity: PROXIMITY,
    access_token: token,
  });
  return `https://api.mapbox.com/search/geocode/v6/forward?${p}`;
}

// Defensive parse of the v6 GeoJSON response: any shape surprise yields [] (the
// search UI shows "No results"), never a crash in the client.
export function parseGeocodeResponse(json: unknown): GeocodeSuggestion[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: GeocodeSuggestion[] = [];
  for (const f of features) {
    const ft = f as {
      id?: unknown;
      geometry?: { coordinates?: unknown[] };
      properties?: { full_address?: unknown; name?: unknown };
    };
    const coords = ft?.geometry?.coordinates;
    const lng = Number(coords?.[0]);
    const lat = Number(coords?.[1]);
    const name = String(ft?.properties?.full_address ?? ft?.properties?.name ?? '');
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !name) continue;
    out.push({ id: String(ft?.id ?? `${lng},${lat}`), name, lat, lng });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/geocode.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/geocode.ts tests/unit/geocode.test.ts
git commit -m "feat(map): geocoding v6 URL builder + defensive response parser"
```

---

### Task 3: Map implementations render `MapPin[]` (shape by kind); Legend + CSS

**Files:**
- Modify: `components/map/SchematicMap.tsx` (whole file below)
- Modify: `components/map/MapboxMap.tsx` (marker loop + prop type)
- Modify: `components/map/Legend.tsx` (whole file below)
- Modify: `components/dashboard/MiniMap.tsx` (adapt lead `Pin[]` → `MapPin[]`)
- Modify: `app/globals.css` (add `.mpin-job`, `.lg-round` after line 141 `.mpin.drop` rule)

**Interfaces:**
- Consumes: `MapPin`, `pinColor`, `pinKey` from `@/lib/mapPins` (Task 1).
- Produces: `MapImplProps` changes to `{ pins: MapPin[]; ...; onPinClick: (pin: MapPin) => void }` — Task 4 and Task 5 pass these. `MapboxMap` gains optional `flyTo?: { lat: number; lng: number; seq: number } | null` **in Task 5**, not here.

No new unit test (DOM components; repo has no component tests). The gate is: existing tests pass, lint passes, `npm run build` compiles the changed prop types end-to-end.

- [ ] **Step 1: Replace `components/map/SchematicMap.tsx`**

```tsx
'use client';
import type React from 'react';
import { project, unproject } from '@/lib/geo';
import { pinColor, pinKey, type MapPin } from '@/lib/mapPins';

export type MapImplProps = {
  pins: MapPin[];
  canCreate: boolean;
  overlay: React.ReactNode;
  onMapClick: (lat: number, lng: number, xPct: number, yPct: number) => void;
  onPinClick: (pin: MapPin) => void;
  height?: number | string;
};

export function SchematicMap({ pins, canCreate, overlay, onMapClick, onPinClick, height }: MapImplProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canCreate) return;
    const target = e.target as HTMLElement;
    if (target.closest('.mpin') || target.closest('.pop')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - r.left) / r.width) * 100;
    const yPct = ((e.clientY - r.top) / r.height) * 100;
    const { lat, lng } = unproject(xPct, yPct);
    onMapClick(lat, lng, xPct, yPct);
  };

  return (
    <div
      className="map"
      onClick={handleClick}
      style={{ cursor: canCreate ? 'crosshair' : 'default', ...(height != null ? { height } : {}) }}
    >
      {/* prototype street/block chrome (clearview-proto.html mapChrome) */}
      <div className="street" style={{ left: 0, top: '38%', width: '100%', height: 6 }} />
      <div className="street" style={{ left: 0, top: '72%', width: '100%', height: 6 }} />
      <div className="street" style={{ left: '28%', top: 0, width: 6, height: '100%' }} />
      <div className="street" style={{ left: '66%', top: 0, width: 6, height: '100%' }} />
      <div className="block" style={{ left: '6%', top: '8%', width: '18%', height: '24%' }} />
      <div className="block" style={{ left: '34%', top: '8%', width: '28%', height: '24%' }} />
      <div className="block" style={{ left: '72%', top: '44%', width: '20%', height: '22%' }} />

      {pins.map(pin => {
        const { xPct, yPct } = project(pin.lat, pin.lng);
        return (
          <div
            key={pinKey(pin)}
            className={pin.kind === 'job' ? 'mpin mpin-job' : 'mpin'}
            title={pin.label}
            style={{ left: `${xPct}%`, top: `${yPct}%`, '--pc': pinColor(pin) } as React.CSSProperties}
            onClick={e => { e.stopPropagation(); onPinClick(pin); }}
          >
            <i />
          </div>
        );
      })}

      {overlay}
    </div>
  );
}
```

- [ ] **Step 2: Update the marker loop in `components/map/MapboxMap.tsx`**

Change the imports (drop `statusColor`, add mapPins helpers):

```tsx
import { MAP_BOUNDS } from '@/lib/geo';
import { pinColor, type MapPin } from '@/lib/mapPins';
import type { MapImplProps } from './SchematicMap';
```

In the marker-sync effect, replace the loop body so the inner element gets the job class and the click handler passes the pin:

```tsx
  // Sync markers whenever pins change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    for (const pin of pins) {
      // Mapbox owns the OUTER marker element's transform, so put .mpin styling on an
      // INNER child (its own rotate/translate does not fight Mapbox's positioning).
      const el = document.createElement('div');
      const inner = document.createElement('div');
      inner.className = pin.kind === 'job' ? 'mpin mpin-job' : 'mpin';
      inner.title = pin.label;
      inner.style.setProperty('--pc', pinColor(pin));
      inner.innerHTML = '<i></i>';
      inner.addEventListener('click', ev => {
        ev.stopPropagation();
        onPinClick(pin);
      });
      el.appendChild(inner);
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(map);
      markersRef.current.push(marker);
    }
  }, [pins, onPinClick]);
```

(The rest of the file — map init, click handler, refs — is untouched in this task.)

- [ ] **Step 3: Replace `components/map/Legend.tsx`**

Lost pins are gone from the map, so LOST leaves the legend; job statuses join with round swatches. `unclaimed` shares `var(--new)` with lead-`new` deliberately — shape (diamond vs circle) is the type discriminator, per the approved design.

```tsx
export function Legend() {
  return (
    <div className="legend">
      <span className="lg-head">Leads ◆</span>
      <span><i className="lg" style={{ background: 'var(--new)' }} /> NEW</span>
      <span><i className="lg" style={{ background: 'var(--follow)' }} /> FOLLOW-UP</span>
      <span><i className="lg" style={{ background: 'var(--won)' }} /> WON</span>
      <span className="lg-head">Jobs ●</span>
      <span><i className="lg lg-round" style={{ background: 'var(--new)' }} /> UNCLAIMED</span>
      <span><i className="lg lg-round" style={{ background: 'var(--sched)' }} /> CLAIMED</span>
      <span><i className="lg lg-round" style={{ background: 'var(--prog)' }} /> IN PROGRESS</span>
    </div>
  );
}
```

- [ ] **Step 4: Adapt `components/dashboard/MiniMap.tsx`**

MiniMap stays lead-only; it adapts its `Pin[]` to `MapPin[]` at the boundary:

```tsx
'use client';
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pickMapImpl } from '@/lib/geo';
import { SchematicMap } from '@/components/map/SchematicMap';
import type { MapPin } from '@/lib/mapPins';
import type { Pin } from '@/lib/leads';

// Same rule as MapView: mapbox-gl only loads when a token exists, never on the server.
const MapboxMap = dynamic(() => import('@/components/map/MapboxMap').then(m => m.MapboxMap), { ssr: false });

export function MiniMap({ pins, token }: { pins: Pin[]; token: string | null }) {
  const router = useRouter();
  const impl = pickMapImpl(token);
  const mapPins = useMemo<MapPin[]>(() => pins.map(p => ({ kind: 'lead', ...p })), [pins]);
  const onPinClick = (pin: MapPin) => router.push(`/map?l=${pin.id}`);
  return (
    <div style={{ cursor: 'pointer' }} onClick={() => router.push('/map')}>
      {impl === 'mapbox' ? (
        <MapboxMap
          pins={mapPins}
          canCreate={false}
          overlay={null}
          height={190}
          interactive={false}
          onMapClick={() => {}}
          onPinClick={onPinClick}
          token={token!}
        />
      ) : (
        <SchematicMap
          pins={mapPins}
          canCreate={false}
          overlay={null}
          height={190}
          onMapClick={() => {}}
          onPinClick={onPinClick}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add CSS to `app/globals.css`**

Insert directly after the `.mpin.drop { animation: ... }` line (~line 141):

```css
/* Job pins: same footprint as .mpin but round — shape is the lead/job discriminator.
   The base .mpin rotate(45deg) is harmless on a circle, so hover/positioning rules
   are inherited unchanged. */
.mpin.mpin-job, .mpin.mpin-job i { border-radius: 50%; }
.lg-round { border-radius: 50%; transform: none; }
.lg-head { color: var(--ink); font-weight: 600; }
[data-theme="dark"] .lg-head { color: var(--text, #e6e6e6); }
```

Note: if `var(--text)` does not exist in this stylesheet, check the `:root`/`[data-theme="dark"]` variable block at the top of `globals.css` and use whatever the dark-theme body text variable is (fallback shown keeps it safe either way).

- [ ] **Step 6: Fix the two remaining `onPinClick` call sites so the build compiles**

`components/map/MapView.tsx` still passes `Pin[]` and `onPinClick(id)`. Task 4 rewrites it fully; to keep THIS task green, apply the minimal bridge now (Task 4 replaces it):

In `components/map/MapView.tsx`:
- change `import type { Pin } from '@/lib/leads';` → `import type { MapPin } from '@/lib/mapPins';`
- change prop `pins: Pin[];` → `pins: MapPin[];`
- change `const onPinClick = (id: number) => router.push(`/map?l=${id}`, { scroll: false });` →

```tsx
  const onPinClick = (pin: MapPin) =>
    router.push(pin.kind === 'job' ? `/map?j=${pin.id}` : `/map?l=${pin.id}`, { scroll: false });
```

In `app/(app)/map/page.tsx`, replace the `pins` construction (the `const pins: Pin[] = leads.filter(...).map(...)` block) with:

```tsx
  const pins = buildMapPins(leads, [], new Map());
```

and change the leads import line to drop `Pin`:

```tsx
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { buildMapPins } from '@/lib/mapPins';
```

(`statusLabel` moves out of the page — `buildMapPins` owns labels now. Jobs arrive in Task 4.)

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: all suites PASS (including Task 1–2 tests).

Run: `npm run lint`
Expected: no new errors (pre-existing warnings acceptable if already in `lint-output.txt`).

Run: `npm run build`
Expected: compiles. This is the type-level proof that every `pins`/`onPinClick` consumer was updated.

- [ ] **Step 8: Commit**

```bash
git add components/map/SchematicMap.tsx components/map/MapboxMap.tsx components/map/Legend.tsx components/dashboard/MiniMap.tsx components/map/MapView.tsx "app/(app)/map/page.tsx" app/globals.css
git commit -m "feat(map): render MapPin union — job pins as circles, legend + minimap adapt"
```

---

### Task 4: Map page fetches jobs; `?j=` opens JobDrawer

**Files:**
- Modify: `app/(app)/map/page.tsx` (whole file below)

**Interfaces:**
- Consumes: `buildMapPins` (Task 1); `buildJobs`, `visibleJobs`, `JobRow`, `JobCustomer` from `@/lib/jobs`; `JobDrawer` from `@/components/jobs/JobDrawer` (props: `job, role, uid, admin, customers?, leadDetail?, backTo?` — see `app/(app)/jobs/page.tsx` for the reference call site); `getSession` from `@/lib/auth`.
- Produces: `/map?j=<id>` renders the job drawer; `MapView` receives combined `MapPin[]`.

Key rules carried over from the jobs page:
- Role-split jobs fetch exactly like the jobs page: admins read base `jobs` (JobDrawer shows price to admins), everyone else reads `jobs_public` (price structurally absent).
- Drawer selection resolves THROUGH `visibleJobs` — a cleaner deep-linking `?j=` to a foreign job renders no drawer.
- `?l=` wins over `?j=` if both are present (explicit, arbitrary).

- [ ] **Step 1: Replace `app/(app)/map/page.tsx`**

```tsx
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { buildJobs, visibleJobs, type JobRow, type JobCustomer } from '@/lib/jobs';
import { buildMapPins } from '@/lib/mapPins';
import { MapView } from '@/components/map/MapView';
import { LeadDrawer } from '@/components/leads/LeadDrawer';
import { JobDrawer, type LeadDetail } from '@/components/jobs/JobDrawer';

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; j?: string }>;
}) {
  const { l: lParam, j: jParam } = await searchParams;
  const user = await getSession();
  const uid = user?.id ?? '';
  const role = await getRole();
  const admin = role === 'admin';
  const canCreate = role === 'admin' || role === 'rep';
  const sb = await supabaseServer();

  // Role-split jobs fetch, same shape as app/(app)/jobs/page.tsx: admins read base
  // jobs (incl. price for the drawer); everyone else reads jobs_public (no price).
  const jobsQuery = admin
    ? sb
        .from('jobs')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,price')
        .order('id')
    : sb
        .from('jobs_public')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at')
        .order('id');

  const [lpRes, csRes, baseRes, jobsRes, psRes] = await Promise.all([
    sb
      .from('leads_public')
      .select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at')
      .order('id'),
    sb.from('customers').select('id,name,address,phone,email,lat,lng'),
    admin ? sb.from('leads').select('id,quote_value') : Promise.resolve({ data: null, error: null }),
    jobsQuery,
    sb.from('profiles').select('id,full_name'),
  ]);
  logQueryError('map.page.leads_public', lpRes.error);
  logQueryError('map.page.customers', csRes.error);
  logQueryError('map.page.leads', baseRes.error);
  logQueryError('map.page.jobs', jobsRes.error);
  logQueryError('map.page.profiles', psRes.error);

  const lp = lpRes.data;
  const cs = csRes.data;

  let quoteById: Map<number, number> | null = null;
  if (admin) {
    quoteById = new Map((baseRes.data ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (admin) {
    const rows = (jobsRes.data ?? []) as Array<JobRow & { price: number | null }>;
    jobRows = rows.map(r => ({
      id: r.id,
      customer_id: r.customer_id,
      lead_id: r.lead_id,
      status: r.status,
      claimed_by: r.claimed_by,
      scheduled_date: r.scheduled_date,
      service: r.service,
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    jobRows = (jobsRes.data ?? []) as JobRow[];
  }

  const names = new Map((psRes.data ?? []).map(p => [p.id as string, p.full_name as string]));
  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById);
  const allJobs = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const jobs = visibleJobs(role, uid, allJobs);

  const geoByCustomer = new Map(
    ((cs ?? []) as CustomerGeo[]).map(c => [c.id, { lat: c.lat, lng: c.lng }])
  );
  const pins = buildMapPins(leads, jobs, geoByCustomer);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null; // empty string → null

  // ?l= wins over ?j= if both are present. Job resolution goes THROUGH visibleJobs:
  // a cleaner deep-linking to a foreign job gets no drawer.
  const selectedLead = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;
  const selectedJob =
    !selectedLead && jParam ? jobs.find(j => j.id === Number(jParam)) ?? null : null;

  // Origin-lead quick view for the open job — mirrors app/(app)/jobs/page.tsx.
  let leadDetail: LeadDetail | null = null;
  if (selectedJob?.lead_id != null) {
    if (admin) {
      const { data: ld, error } = await sb
        .from('leads')
        .select('stories,panes,note,description,quote_value')
        .eq('id', selectedJob.lead_id)
        .single();
      logQueryError('map.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: Number(ld.quote_value ?? 0) } : null;
    } else {
      const { data: ld, error } = await sb
        .from('leads_public')
        .select('stories,panes,note,description')
        .eq('id', selectedJob.lead_id)
        .single();
      logQueryError('map.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: null } : null; // money structurally absent for non-admins
    }
  }
  const customerOptions = ((cs ?? []) as CustomerGeo[]).map(c => ({ id: c.id, name: c.name }));

  return (
    <section className="screen screen-fill">
      <MapView pins={pins} token={token} canCreate={canCreate} openLeadId={lParam ?? null} />
      {selectedLead && (
        <LeadDrawer key={selectedLead.id} lead={selectedLead} admin={admin} canEdit={canCreate} backTo="/map" />
      )}
      {selectedJob && role && (
        <JobDrawer
          key={selectedJob.id}
          job={selectedJob} role={role} uid={uid} admin={admin}
          customers={customerOptions} leadDetail={leadDetail}
          backTo="/map"
        />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm test` — PASS.
Run: `npm run build` — compiles.

Manual smoke (dev server likely already running; else `npm run dev`):
- `/map` shows lead pins (diamond) AND job pins (circle); no lost-lead pins, no done-job pins.
- Click a job circle → URL becomes `/map?j=<id>`, JobDrawer opens, back button returns to `/map`.
- Click a lead diamond → `/map?l=<id>`, LeadDrawer opens (unchanged behavior).
- Log in as (or simulate) cleaner: only unclaimed + own jobs appear as circles.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/map/page.tsx"
git commit -m "feat(map): job pins on map page, ?j= opens JobDrawer with jobs-page parity"
```

---

### Task 5: MapSearch combobox + flyTo/temp marker + layer toggles

**Files:**
- Create: `components/map/MapSearch.tsx`
- Modify: `components/map/MapView.tsx` (whole file below)
- Modify: `components/map/MapboxMap.tsx` (add `flyTo` prop + effect + temp-marker clearing)
- Modify: `app/globals.css` (searchbox + toggle chip styles, after the `.legend` rules ~line 144)

**Interfaces:**
- Consumes: `geocodeUrl`, `parseGeocodeResponse`, `GeocodeSuggestion` (Task 2); `MapPin` (Task 1); `MapImplProps` (Task 3).
- Produces:
  - `MapSearch` props: `{ token: string; onSelect: (s: GeocodeSuggestion) => void }`
  - `MapboxMap` gains `flyTo?: { lat: number; lng: number; seq: number } | null` (default `null`). `seq` increments per selection so re-picking the same address re-flies.

- [ ] **Step 1: Create `components/map/MapSearch.tsx`**

```tsx
'use client';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { geocodeUrl, parseGeocodeResponse, type GeocodeSuggestion } from '@/lib/geocode';

// Custom combobox over Mapbox Geocoding v6 — no dependency, app-themed, keyboardable.
export function MapSearch({ token, onSelect }: { token: string; onSelect: (s: GeocodeSuggestion) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      abortRef.current?.abort();
      setItems([]); setOpen(false); setFailed(false); setActive(-1);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch(geocodeUrl(query, token), { signal: ctl.signal });
        const parsed = parseGeocodeResponse(await res.json());
        setItems(parsed); setFailed(false); setActive(-1); setOpen(true);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('geocode failed', err);
        setItems([]); setFailed(true); setActive(-1); setOpen(true);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, token]);

  // Close when focus/click leaves the combobox.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const pick = (s: GeocodeSuggestion) => {
    abortRef.current?.abort();
    setQ(s.name);
    setOpen(false);
    setActive(-1);
    onSelect(s);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="map-search-listbox"
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `map-search-opt-${active}` : undefined}
        placeholder="Search address…"
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (items.length > 0 || failed) setOpen(true); }}
      />
      {open && (
        <ul className="searchbox-list" id="map-search-listbox" role="listbox">
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`map-search-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              // pointerdown, not click: fires before the input's blur/outside-close
              onPointerDown={e => { e.preventDefault(); pick(s); }}
            >
              {s.name}
            </li>
          ))}
          {items.length === 0 && <li className="empty" aria-disabled="true">No results</li>}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `components/map/MapView.tsx`**

```tsx
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pickMapImpl } from '@/lib/geo';
import type { MapPin } from '@/lib/mapPins';
import type { GeocodeSuggestion } from '@/lib/geocode';
import { SchematicMap } from './SchematicMap';
import { MapSearch } from './MapSearch';
import { PinPopover } from './PinPopover';
import { Legend } from './Legend';

// ssr:false requires a Client Component parent (this file). The schematic map never
// loads mapbox-gl; MapboxMap is only imported when a token exists (Task 6).
const MapboxMap = dynamic(() => import('./MapboxMap').then(m => m.MapboxMap), { ssr: false });

type Pending = { lat: number; lng: number; xPct: number; yPct: number };
type FlyTarget = { lat: number; lng: number; seq: number };

export function MapView({
  pins, token, canCreate, openLeadId,
}: {
  pins: MapPin[];
  token: string | null;
  canCreate: boolean;
  openLeadId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [showLeads, setShowLeads] = useState(true);
  const [showJobs, setShowJobs] = useState(true);
  const impl = pickMapImpl(token);

  // A successful createLeadFromPin soft-navigates to /map?l=<newId>, so this instance
  // persists and the popover would otherwise stay open (re-enabled Create button →
  // duplicate customer+lead on a second click). Render-phase state adjustment
  // (React-documented "adjust state when props change" pattern; a useEffect here
  // would trip react-hooks/set-state-in-effect): when the open-drawer lead changes,
  // dismiss the popover.
  const [seenLeadId, setSeenLeadId] = useState<string | null>(openLeadId);
  if (openLeadId !== seenLeadId) {
    setSeenLeadId(openLeadId);
    setPending(null); // creation succeeded (or a pin drawer opened) → close popover
  }

  const onMapClick = (lat: number, lng: number, xPct: number, yPct: number) => {
    if (canCreate) setPending({ lat, lng, xPct, yPct });
  };
  const onPinClick = (pin: MapPin) =>
    router.push(pin.kind === 'job' ? `/map?j=${pin.id}` : `/map?l=${pin.id}`, { scroll: false });
  const onSearchSelect = (s: GeocodeSuggestion) =>
    setFlyTo(prev => ({ lat: s.lat, lng: s.lng, seq: (prev?.seq ?? 0) + 1 }));

  const visible = pins.filter(p => (p.kind === 'lead' ? showLeads : showJobs));

  const overlay = pending ? (
    <PinPopover {...pending} onCancel={() => setPending(null)} />
  ) : null;

  return (
    <div className="panel box map-panel">
      <div className="maptools">
        <h3>Pin map / neighborhood</h3>
        {impl === 'mapbox' && <MapSearch token={token!} onSelect={onSearchSelect} />}
        <div className="layer-toggles" style={{ marginLeft: 'auto' }}>
          <button
            type="button" className="chip" aria-pressed={showLeads}
            onClick={() => setShowLeads(v => !v)}
          >
            ◆ Leads
          </button>
          <button
            type="button" className="chip" aria-pressed={showJobs}
            onClick={() => setShowJobs(v => !v)}
          >
            ● Jobs
          </button>
        </div>
        {canCreate && <span className="hint">✚ click empty space to drop a pin &amp; create a lead</span>}
      </div>
      {impl === 'mapbox' ? (
        <MapboxMap
          pins={visible} canCreate={canCreate} overlay={overlay} flyTo={flyTo}
          onMapClick={onMapClick} onPinClick={onPinClick} token={token!}
        />
      ) : (
        <SchematicMap pins={visible} canCreate={canCreate} overlay={overlay} onMapClick={onMapClick} onPinClick={onPinClick} />
      )}
      <Legend />
    </div>
  );
}
```

(Note: the `<h3>` loses `style={{ marginRight: 'auto' }}` — the spacer moves to `.layer-toggles`.)

- [ ] **Step 3: Add `flyTo` + temp marker to `components/map/MapboxMap.tsx`**

Extend the props signature:

```tsx
export function MapboxMap({
  pins, canCreate, overlay, onMapClick, onPinClick, token, height, interactive = true, flyTo = null,
}: MapImplProps & {
  token: string;
  interactive?: boolean;
  flyTo?: { lat: number; lng: number; seq: number } | null;
}) {
```

Add a ref next to `markersRef`:

```tsx
  const searchMarkerRef = useRef<mapboxgl.Marker | null>(null);
```

In the map-init effect, clear the temp marker on any map click (insert as the FIRST lines of the existing `map.on('click', …)` handler, before the `canCreateRef` check):

```tsx
    map.on('click', e => {
      searchMarkerRef.current?.remove();
      searchMarkerRef.current = null;
      if (!canCreateRef.current) return;
      // ... existing body unchanged
    });
```

Add a new effect after the marker-sync effect:

```tsx
  // Fly to a searched address and drop a temporary highlight marker. `seq` changes
  // on every selection, so re-picking the same address still re-flies. The marker
  // clears on the next selection or any map click.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 16 });
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = new mapboxgl.Marker({ color: '#f5a623' })
      .setLngLat([flyTo.lng, flyTo.lat])
      .addTo(map);
  }, [flyTo]);
```

Also remove the temp marker in the existing init-effect cleanup (before `map.remove()`):

```tsx
    return () => {
      searchMarkerRef.current?.remove();
      searchMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
```

- [ ] **Step 4: Add CSS to `app/globals.css`**

Insert after the `.legend span … .lg { … }` line (~line 144):

```css
/* Map toolbar: address search combobox + layer toggle chips */
.searchbox { position: relative; flex: 1 1 220px; max-width: 340px; }
.searchbox input { width: 100%; min-height: 44px; font-size: 16px; padding: 8px 12px;
  border: 1.5px solid var(--line); border-radius: 4px; background: var(--card); color: inherit; }
.searchbox-list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 30;
  margin: 0; padding: 4px; list-style: none; background: var(--card);
  border: 1.5px solid var(--line); border-radius: 4px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
.searchbox-list li { padding: 12px; min-height: 44px; border-radius: 3px; cursor: pointer;
  font-size: 13px; display: flex; align-items: center; }
.searchbox-list li.active, .searchbox-list li:hover { background: var(--line); }
.searchbox-list li.empty { color: var(--muted); cursor: default; }
.searchbox-list li.empty:hover { background: transparent; }
.layer-toggles { display: flex; gap: 8px; }
.chip { min-height: 44px; padding: 6px 12px; font-size: 12px; border-radius: 999px;
  border: 1.5px solid var(--line); background: transparent; color: var(--muted); cursor: pointer; }
.chip[aria-pressed="true"] { color: var(--ink); border-color: var(--ink); }
[data-theme="dark"] .chip[aria-pressed="true"] { color: inherit; border-color: var(--muted); }
```

Note: this stylesheet already has established input/button conventions from wave 2 (16px font-size on touch inputs, 44px targets). If a `.chip` or similar class already exists, reuse/extend rather than duplicate — search `globals.css` for `chip` before pasting.

- [ ] **Step 5: Verify**

Run: `npm test` — PASS.
Run: `npm run lint` — no new errors.
Run: `npm run build` — compiles.

Manual smoke on `/map` (Mapbox mode):
- Type 3+ chars in search → dropdown appears within ~½s; arrow keys move highlight; Enter selects.
- Selecting flies the map (zoom 16) and drops an orange marker; clicking the map clears the marker.
- Selecting the SAME address again re-flies (seq bump).
- Toggle chips hide/show diamond and circle pins independently.
- With token removed from `.env.local` (schematic mode): no search box, toggles still work.

- [ ] **Step 6: Commit**

```bash
git add components/map/MapSearch.tsx components/map/MapView.tsx components/map/MapboxMap.tsx app/globals.css
git commit -m "feat(map): address autocomplete search with flyTo + temp marker, layer toggles"
```

---

### Task 6: Full verification pass

**Files:** none new.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 2: Lint + build**

Run: `npm run lint` then `npm run build`
Expected: no new lint errors; build compiles.

- [ ] **Step 3: Cross-role manual smoke**

- Admin: lead + job pins, both drawers open/close, price visible in JobDrawer.
- Rep: job pins visible (all), JobDrawer read-only (no claim/status controls beyond role rules), no price.
- Cleaner: only unclaimed + own job circles; deep-link `?j=` to foreign job → no drawer.
- Mobile viewport (devtools): search input ≥44px, suggestion rows tappable, chips tappable, cooperative gestures still work.

- [ ] **Step 4: Commit any straggler fixes**

```bash
git status
# stage only files this feature touched
git commit -m "fix(map): post-verification polish" # only if fixes were needed
```
