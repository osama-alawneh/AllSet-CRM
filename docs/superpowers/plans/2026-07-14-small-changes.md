# Small Changes Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six owner changes: Cleaners Pay rename, streets map style + faster flyTo, live user location, a new /calendar page (jobs by schedule + leads by created), and win rate counting map No-dots.

**Architecture:** Four independent surface tweaks (Tasks 1–3, 6) around one new page (Tasks 4–5: pure month-bucketing lib + a server page reusing the /map drawer pattern + a client grid). Task 6 extends `winRate` with a dot count derived from the dashboard's existing dots fetch.

**Tech Stack:** Next.js (App Router), mapbox-gl (GeolocateControl), Vitest + jsdom. No DB changes in this plan.

**Spec:** `docs/superpowers/specs/2026-07-14-small-changes-batch-design.md` (owner-approved; fable-reviewed). Read it before starting any task.

## Global Constraints

- **Prerequisite:** the map-dots plan (`2026-07-14-map-dots.md`) must be implemented first — Task 6 needs the `dots` table + the dashboard dots fetch it adds, and Task 3 assumes the dots plan's `MapboxMap` mock changes (`getContainer`) are in. Branch `feat/small-changes`, based on wherever the dots work lives (`main` if merged, else stacked on `feat/map-dots`). Do NOT merge — owner decides after walkthrough.
- Label copy (exact): field label **"Cleaners Pay"**, edit label **"Cleaners Pay $"**, confirm text **"No cleaners pay set — no payout will be created. Continue?"**. DB column stays `cleaner_amount`; no migration anywhere in this plan.
- Map style: `mapbox://styles/mapbox/streets-v12` everywhere, no toggle. flyTo `speed: 2.4`.
- GeolocateControl only on the interactive map (`/map`); NOT MiniMap, NOT the schematic fallback. Follow-until-first-pan is an accepted deviation (spec item 4) — do not fight it with custom code.
- Calendar: nav item after Jobs, all three roles; jobs by `scheduled_date` (done INCLUDED, deleted excluded, unscheduled absent), leads by `created_at` (admin/rep only); month in `?m=YYYY-MM`; `?m=` must survive drawer open AND close; day bucketing via the app-wide `slice(0, 10)` string convention — no timezone machinery.
- Win rate: `won / (won + lost + noDots)`, 0 on zero denominator; `noDots` is a client-side filter of the dashboard's dots fetch, NOT a new query.
- TDD; commit per task. Batteries: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` (no `test:db` — no DB changes).

---

## File Structure

| File | Responsibility |
|---|---|
| `components/jobs/JobDrawer.tsx`, `components/jobs/JobsBoard.tsx`, `components/map/DotPopover.tsx`, `tests/unit/JobDrawer.render.test.tsx` (+ any test greps hit) | Cleaners Pay rename (Task 1) |
| `lib/geo.ts` | `MAP_STYLE`, `FLY_TO_OPTS` constants (Task 2) |
| `components/map/MapboxMap.tsx` | style const, flyTo speed (Task 2); GeolocateControl (Task 3) |
| `tests/unit/MapboxMap.render.test.tsx` | mock growth + assertions (Tasks 2–3) |
| `lib/calendar.ts` + `tests/unit/calendar.test.ts` | month math + bucketing, pure (Task 4) |
| `app/(app)/calendar/page.tsx`, `components/calendar/CalendarGrid.tsx`, `lib/nav.ts`, `app/globals.css`, `tests/unit/CalendarGrid.render.test.tsx`, `tests/unit/nav.test.ts` | calendar page (Task 5) |
| `lib/dashboard.ts`, `app/(app)/dashboard/page.tsx`, `tests/unit/dashboard.test.ts` | win rate + noDots (Task 6) |

---

### Task 1: Rename "Cleaner pot" → "Cleaners Pay"

**Files:**
- Modify: `components/jobs/JobDrawer.tsx` (~lines 78, 194, 359), `components/jobs/JobsBoard.tsx` (~line 75), `components/map/DotPopover.tsx` (verify — dots plan Task 6 already used "Cleaners Pay"; confirm, don't assume)
- Test: `tests/unit/JobDrawer.render.test.tsx` (~lines 185–272) + grep-driven others

**Interfaces:** none — label strings only. `cleaner_amount` names in code/DB untouched. The "your share" line untouched.

- [ ] **Step 1: Update the tests first (failing)**

In `tests/unit/JobDrawer.render.test.tsx`: replace every `'Cleaner pot'` assertion string with `'Cleaners Pay'` and both confirm-string assertions with `'No cleaners pay set — no payout will be created. Continue?'`. Then sweep for stragglers:

Run: `grep -rni "cleaner pot" tests/` — update every hit the same way.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/unit/JobDrawer.render.test.tsx`
Expected: FAIL — component still renders the old labels.

- [ ] **Step 3: Update the components**

- `components/jobs/JobDrawer.tsx` line ~194: `<span className="k">Cleaner pot</span>` → `<span className="k">Cleaners Pay</span>`
- line ~359: `<span className="k">Cleaner pot $</span>` → `<span className="k">Cleaners Pay $</span>`
- line ~78 and `components/jobs/JobsBoard.tsx` line ~75: confirm string → `'No cleaners pay set — no payout will be created. Continue?'` (both call sites must stay byte-identical to each other).
- Final sweep: `grep -rni "cleaner pot" components/ app/ lib/` — expected ZERO hits after the edits (comments included — update comment text too; historical docs/ and .superpowers/ are exempt, leave them).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(jobs): rename Cleaner pot label to Cleaners Pay (column unchanged)"
```

---

### Task 2: Streets map style + faster flyTo

**Files:**
- Modify: `lib/geo.ts`, `components/map/MapboxMap.tsx`
- Test: `tests/unit/MapboxMap.render.test.tsx`, `tests/unit/geo.test.ts`

**Interfaces:**
- Produces from `lib/geo.ts`:
  ```ts
  export const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';
  export const FLY_TO_OPTS = { speed: 2.4 } as const; // mapbox default 1.2 — ~half the flight time
  ```
  Consumed only by `MapboxMap` today; future flyTo callers spread `FLY_TO_OPTS`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/geo.test.ts` — append:

```ts
import { MAP_STYLE, FLY_TO_OPTS } from '@/lib/geo';

describe('map constants', () => {
  it('uses the simple streets style (owner: no satellite anywhere)', () => {
    expect(MAP_STYLE).toBe('mapbox://styles/mapbox/streets-v12');
  });
  it('doubles the default flyTo speed', () => {
    expect(FLY_TO_OPTS).toEqual({ speed: 2.4 });
  });
});
```

`tests/unit/MapboxMap.render.test.tsx` — extend the mock's `FakeMap` to record constructor options:

```ts
class FakeMap {
  options: Record<string, unknown>;
  remove = vi.fn();
  on = vi.fn();
  project = vi.fn(() => ({ x: 0, y: 0 }));
  getContainer = vi.fn(() => document.createElement('div'));
  flyTo = vi.fn();
  constructor(options: Record<string, unknown>) {
    this.options = options;
    mapInstances.push(this);
  }
}
```

(adjust the `mapInstances` array element type accordingly) and add two tests, following the file's existing render/flushFrames idiom:

```ts
it('constructs the map with the shared streets style', () => {
  // render with baseProps(), flushFrames(), then:
  expect(mapInstances[0].options.style).toBe('mapbox://styles/mapbox/streets-v12');
});
it('search flyTo uses the fast shared options', () => {
  // render with flyTo={{ lat: 42.3, lng: -83.0, seq: 1 }}, flushFrames(), then:
  expect(mapInstances[0].flyTo).toHaveBeenCalledWith(
    expect.objectContaining({ speed: 2.4, zoom: 16, center: [-83.0, 42.3] })
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/unit/geo.test.ts tests/unit/MapboxMap.render.test.tsx`
Expected: FAIL — constants don't exist; style is satellite.

- [ ] **Step 3: Implement**

`lib/geo.ts` — append:

```ts
// One style for every Mapbox surface (/map + dashboard MiniMap): the simple
// vector streets look (house numbers render natively at high zoom). Owner
// decision 2026-07-14: satellite is gone, no toggle.
export const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

// Camera animation options shared by every flyTo caller. mapbox default speed
// is 1.2; 2.4 ≈ halves the flight time (owner: "faster map animations").
export const FLY_TO_OPTS = { speed: 2.4 } as const;
```

`components/map/MapboxMap.tsx`:
- import: `import { MAP_BOUNDS, MAP_STYLE, FLY_TO_OPTS } from '@/lib/geo';`
- constructor: `style: MAP_STYLE,`
- flyTo effect: `map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 16, ...FLY_TO_OPTS });`

- [ ] **Step 4: Run tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. (MiniMap changes automatically — it renders the same `MapboxMap`.)

- [ ] **Step 5: Commit**

```bash
git add lib/geo.ts components/map/MapboxMap.tsx tests/unit/geo.test.ts tests/unit/MapboxMap.render.test.tsx
git commit -m "feat(map): streets-v12 style everywhere + 2x flyTo speed"
```

---

### Task 3: Live user location (GeolocateControl)

**Files:**
- Modify: `components/map/MapboxMap.tsx`
- Test: `tests/unit/MapboxMap.render.test.tsx`

**Interfaces:** none new — the control is internal to `MapboxMap`, gated on the existing `interactive` prop (`/map` passes default `true`; MiniMap passes `false`).

- [ ] **Step 1: Write the failing tests**

Extend the mapbox-gl mock: add to `FakeMap` — `addControl = vi.fn();` — and to the mock's returned default export a control class, exported for instance checks:

```ts
class FakeGeolocateControl {
  options: Record<string, unknown>;
  constructor(options: Record<string, unknown>) { this.options = options; }
}
// return { default: { Map: FakeMap, Marker: FakeMarker, GeolocateControl: FakeGeolocateControl, accessToken: '' } };
```

Tests:

```ts
it('adds a GeolocateControl on the interactive map', () => {
  // render baseProps() (interactive defaults true), flushFrames(), then:
  const m = mapInstances[0];
  expect(m.addControl).toHaveBeenCalledTimes(1);
  const ctl = m.addControl.mock.calls[0][0];
  expect(ctl.options).toEqual({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  });
});
it('adds NO GeolocateControl when interactive is false (MiniMap)', () => {
  // render with interactive={false}, flushFrames(), then:
  expect(mapInstances[0].addControl).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/unit/MapboxMap.render.test.tsx`
Expected: FAIL — `addControl` never called.

- [ ] **Step 3: Implement**

In `components/map/MapboxMap.tsx`, inside the `requestAnimationFrame` construction callback, after `created = m;` and before the click handler:

```ts
// Live user location (owner item 4): button on the map; the browser
// permission prompt fires on first click (control-native — no permission
// code of ours). trackUserLocation follows until the first manual pan
// (mapbox ACTIVE_LOCK -> BACKGROUND), then the blue dot keeps updating
// without moving the camera — accepted deviation, see spec item 4.
// Interactive surfaces only: MiniMap (interactive=false) gets no control.
if (interactive) {
  m.addControl(
    new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    }),
    'top-right'
  );
}
```

No cleanup code: `map.remove()` (existing cleanup) tears down attached controls — mapbox owns the lifecycle.

- [ ] **Step 4: Run tests**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

NOTE: the assertion `addControl.mock.calls[0][0]` receives the control instance and the test above ignores the position arg; if the test file's lint config complains about unused vars, destructure accordingly.

- [ ] **Step 5: Commit**

```bash
git add components/map/MapboxMap.tsx tests/unit/MapboxMap.render.test.tsx
git commit -m "feat(map): GeolocateControl — live location dot on the interactive map"
```

---

### Task 4: Calendar lib — month math + bucketing

**Files:**
- Create: `lib/calendar.ts`
- Test: `tests/unit/calendar.test.ts`

**Interfaces:**
- Consumes: `Job` from `@/lib/jobs`, `Lead` + `statusColor` from `@/lib/leads`, `jobStatusColor` from `@/lib/jobs`.
- Produces (Task 5 consumes all of these):
  ```ts
  export type CalEntry = { kind: 'job' | 'lead'; id: number; label: string; color: string };
  export function resolveMonth(m: string | undefined, now: Date | string): string; // 'YYYY-MM'; invalid/missing -> current month
  export function addMonths(month: string, delta: number): string;
  export function monthLabel(month: string): string;                // 'July 2026'
  export function monthWindow(month: string): { from: string; to: string }; // ['YYYY-MM-01', first day of next month) for .gte/.lt queries
  export function monthGrid(month: string): { days: string[]; leadingBlanks: number }; // days = every 'YYYY-MM-DD' of the month; blanks = weekday of the 1st (Sunday start)
  export function bucketByDay(jobs: Job[], leads: Lead[]): Map<string, CalEntry[]>;   // jobs by scheduled_date, leads by created_at, both slice(0,10); jobs with null scheduled_date skipped
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveMonth, addMonths, monthLabel, monthWindow, monthGrid, bucketByDay,
} from '@/lib/calendar';
import type { Job } from '@/lib/jobs';
import type { Lead } from '@/lib/leads';

describe('resolveMonth', () => {
  const now = '2026-07-14T12:00:00Z';
  it('passes a valid ?m= through', () => expect(resolveMonth('2026-03', now)).toBe('2026-03'));
  it.each([undefined, '', 'garbage', '2026-13', '2026-00', '26-01'])('falls back to the current month for %j', m => {
    expect(resolveMonth(m as string | undefined, now)).toBe('2026-07');
  });
});

describe('addMonths', () => {
  it('steps forward and back across year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-07', 0)).toBe('2026-07');
  });
});

describe('monthLabel', () => {
  it('renders a human month', () => expect(monthLabel('2026-07')).toBe('July 2026'));
});

describe('monthWindow', () => {
  it('gives a [from, to) day pair for range queries', () => {
    expect(monthWindow('2026-07')).toEqual({ from: '2026-07-01', to: '2026-08-01' });
    expect(monthWindow('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
});

describe('monthGrid', () => {
  it('lists every day and the leading weekday blanks (Sunday start)', () => {
    const g = monthGrid('2026-07'); // 2026-07-01 is a Wednesday
    expect(g.days).toHaveLength(31);
    expect(g.days[0]).toBe('2026-07-01');
    expect(g.days[30]).toBe('2026-07-31');
    expect(g.leadingBlanks).toBe(3);
  });
  it('handles leap February', () => {
    expect(monthGrid('2028-02').days).toHaveLength(29);
  });
});

describe('bucketByDay', () => {
  const job = (id: number, sched: string | null): Job => ({
    id, customer_id: 1, lead_id: null, status: 'unclaimed', claimed_by: null,
    scheduled_date: sched, service: 'Window Cleaning', description: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    customer_name: `Cust ${id}`, address: null, phone: null, email: null,
    price: null, claimed_by_name: null, cleaner_amount: null, done_at: null,
    recur_days: null, recur_parent_id: null,
  } as unknown as Job);
  const lead = (id: number, created: string): Lead => ({
    id, customer_id: 1, status: 'new', service: null, description: null,
    stories: null, panes: null, note: null, quote_value: null,
    created_at: created, updated_at: created, customer_name: `Lead ${id}`,
    address: null, phone: null, email: null, lat: null, lng: null,
    rep_id: null, rep_name: null,
  });
  it('buckets jobs by scheduled day and leads by created day, with colors', () => {
    const map = bucketByDay(
      [job(1, '2026-07-14T09:00:00Z'), job(2, null)],
      [lead(9, '2026-07-14T20:00:00Z'), lead(10, '2026-07-02T00:00:00Z')]
    );
    const d14 = map.get('2026-07-14')!;
    expect(d14).toHaveLength(2);
    expect(d14[0]).toMatchObject({ kind: 'job', id: 1, label: 'Cust 1' });
    expect(d14[0].color).toBe('var(--sched)'); // unclaimed job color token from jobStatusColor
    expect(d14[1]).toMatchObject({ kind: 'lead', id: 9, color: 'var(--new)' });
    expect(map.get('2026-07-02')![0].id).toBe(10);
    expect([...map.values()].flat().some(e => e.kind === 'job' && e.id === 2)).toBe(false); // unscheduled absent
  });
});
```

NOTE: before finalizing the `d14[0].color` assertion, read `jobStatusColor` in `lib/jobs.ts:10` and use the ACTUAL token for `unclaimed` (the test above assumes `var(--sched)`; if the real map says otherwise, assert the real value — the lib must pass through `jobStatusColor`, not invent tokens).

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/unit/calendar.test.ts`
Expected: FAIL — `@/lib/calendar` missing.

- [ ] **Step 3: Implement `lib/calendar.ts`**

```ts
import type { Job } from '@/lib/jobs';
import { jobStatusColor } from '@/lib/jobs';
import type { Lead } from '@/lib/leads';
import { statusColor } from '@/lib/leads';

// Month math on 'YYYY-MM' strings; day bucketing on the app-wide slice(0,10)
// string convention (lib/dashboard.ts) — timestamps are compared as UTC ISO
// strings end to end, no Date-local parsing anywhere.

export type CalEntry = { kind: 'job' | 'lead'; id: number; label: string; color: string };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function resolveMonth(m: string | undefined, now: Date | string): string {
  if (m && MONTH_RE.test(m)) return m;
  const iso = typeof now === 'string' ? now : now.toISOString();
  return iso.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, mo] = month.split('-').map(Number);
  const idx = y * 12 + (mo - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12 + 12) % 12 + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function monthLabel(month: string): string {
  const [y, mo] = month.split('-').map(Number);
  return `${MONTH_NAMES[mo - 1]} ${y}`;
}

export function monthWindow(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${addMonths(month, 1)}-01` };
}

export function monthGrid(month: string): { days: string[]; leadingBlanks: number } {
  const [y, mo] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // day 0 of next month = last day of this
  const days = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const leadingBlanks = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); // 0 = Sunday
  return { days, leadingBlanks };
}

export function bucketByDay(jobs: Job[], leads: Lead[]): Map<string, CalEntry[]> {
  const map = new Map<string, CalEntry[]>();
  const push = (day: string, e: CalEntry) => {
    const list = map.get(day);
    if (list) list.push(e); else map.set(day, [e]);
  };
  for (const j of jobs) {
    if (j.scheduled_date == null) continue; // board covers unscheduled
    push(j.scheduled_date.slice(0, 10), {
      kind: 'job', id: j.id, label: j.customer_name, color: jobStatusColor[j.status],
    });
  }
  for (const l of leads) {
    push(l.created_at.slice(0, 10), {
      kind: 'lead', id: l.id, label: l.customer_name, color: statusColor[l.status],
    });
  }
  return map;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/calendar.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar.ts tests/unit/calendar.test.ts
git commit -m "feat(calendar): month math + day bucketing lib"
```

---

### Task 5: Calendar page + grid + nav

**Files:**
- Create: `app/(app)/calendar/page.tsx`, `components/calendar/CalendarGrid.tsx`
- Modify: `lib/nav.ts`, `app/globals.css`, `tests/unit/nav.test.ts`
- Test: `tests/unit/CalendarGrid.render.test.tsx`

**Interfaces:**
- Consumes: everything from Task 4; `JobDrawer`/`LeadDrawer` + their support-fetch shapes lifted from `app/(app)/map/page.tsx:39-146`; `visibleJobs`/`buildJobs`/`buildMembers` from `lib/jobs`; `buildLeads` from `lib/leads`.
- Produces:
  ```ts
  export function CalendarGrid(props: {
    month: string;                     // 'YYYY-MM'
    entries: Record<string, CalEntry[]>; // serialized bucketByDay (Maps don't cross the RSC boundary)
    showLeads: boolean;                // admin/rep true; cleaner false — legend text only, data already filtered server-side
  }): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

`tests/unit/nav.test.ts` — update: admin list gains `'/calendar'` after `'/jobs'` (now 10 items), cleaner list becomes `['/dashboard', '/map', '/jobs', '/calendar', '/customers', '/cleaners']`, and add:

```ts
it('rep sees the calendar', () => {
  expect(navForRole('rep').map(i => i.href)).toContain('/calendar');
});
```

and in `titleFor`: `expect(titleFor('/calendar')[0]).toBe('Calendar / Schedule');`

Create `tests/unit/CalendarGrid.render.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import type { CalEntry } from '@/lib/calendar';

const entries: Record<string, CalEntry[]> = {
  '2026-07-14': [
    { kind: 'job', id: 5, label: 'Cust 5', color: 'var(--sched)' },
    { kind: 'lead', id: 9, label: 'Lead 9', color: 'var(--new)' },
    { kind: 'job', id: 6, label: 'Cust 6', color: 'var(--prog)' },
    { kind: 'job', id: 7, label: 'Cust 7', color: 'var(--prog)' },
    { kind: 'job', id: 8, label: 'Cust 8', color: 'var(--prog)' },
  ],
};

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });
const render = () => act(() => root.render(<CalendarGrid month="2026-07" entries={entries} showLeads />));

describe('CalendarGrid', () => {
  it('renders the month header with prev/today/next links carrying ?m=', () => {
    render();
    expect(container.textContent).toContain('July 2026');
    const hrefs = [...container.querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/calendar?m=2026-06');
    expect(hrefs).toContain('/calendar?m=2026-08');
    expect(hrefs.some(h => h === '/calendar')).toBe(true); // Today
  });
  it('renders 31 day cells for July plus leading blanks', () => {
    render();
    expect(container.querySelectorAll('.calday')).toHaveLength(31);
    expect(container.querySelectorAll('.calblank')).toHaveLength(3); // 2026-07-01 is a Wednesday
  });
  it('shows up to 3 chips per day plus a +n more overflow', () => {
    render();
    const day = [...container.querySelectorAll('.calday')].find(d => d.textContent?.includes('14'))!;
    expect(day.querySelectorAll('.calchip')).toHaveLength(3);
    expect(day.textContent).toContain('+2 more');
  });
  it('entry links open the drawer keeping the month param', () => {
    render();
    const hrefs = [...container.querySelectorAll('a.calchip')].map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/calendar?m=2026-07&j=5');
    expect(hrefs).toContain('/calendar?m=2026-07&l=9');
  });
  it('day click opens the day panel listing ALL entries', () => {
    render();
    const day = [...container.querySelectorAll('.calday')].find(d => d.textContent?.includes('14'))!;
    act(() => { (day as HTMLElement).click(); });
    const panel = container.querySelector('.caldaypanel')!;
    expect(panel.querySelectorAll('a')).toHaveLength(5);
    expect(panel.textContent).toContain('Cust 8');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/unit/nav.test.ts tests/unit/CalendarGrid.render.test.tsx`
Expected: both FAIL.

- [ ] **Step 3: Nav**

`lib/nav.ts` — insert after the `/jobs` line and renumber everything below:

```ts
  { href: '/calendar',  label: 'Calendar',  num: '05', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/invoices',  label: 'Invoices',  num: '06', roles: ['admin'] },
  { href: '/customers', label: 'Customers', num: '07', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/cleaners',  label: 'Cleaners',  num: '08', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/expenses',  label: 'Expenses',  num: '09', roles: ['admin', 'rep'] },
  { href: '/settings',  label: 'Settings',  num: '10', roles: ['admin'] },
```

TITLES: `'/calendar': ['Calendar / Schedule', 'jobs by schedule · leads by created'],`

- [ ] **Step 4: Implement `components/calendar/CalendarGrid.tsx`**

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { addMonths, monthGrid, monthLabel, type CalEntry } from '@/lib/calendar';

const CHIP_CAP = 3; // chips per cell before "+n more"

// Month grid. Entries arrive pre-bucketed and pre-colored (server did role
// filtering — cleaners never receive lead entries). Chip click deep-links the
// drawer; the month param rides along so Back/close keeps the view. Tapping a
// day opens a panel listing everything (the phones-first path — cells collapse
// to count dots below the CSS breakpoint).
export function CalendarGrid({
  month, entries, showLeads,
}: {
  month: string;
  entries: Record<string, CalEntry[]>;
  showLeads: boolean;
}) {
  const { days, leadingBlanks } = monthGrid(month);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const chipHref = (e: CalEntry) => `/calendar?m=${month}&${e.kind === 'job' ? 'j' : 'l'}=${e.id}`;

  return (
    <section className="panel box">
      <div className="calhead">
        <h3>{monthLabel(month)}</h3>
        <div className="calnav">
          <Link className="chip" href={`/calendar?m=${addMonths(month, -1)}`}>‹ Prev</Link>
          <Link className="chip" href="/calendar">Today</Link>
          <Link className="chip" href={`/calendar?m=${addMonths(month, 1)}`}>Next ›</Link>
        </div>
        <span className="hint">● jobs by schedule{showLeads ? ' · ◆ leads by created' : ''}</span>
      </div>
      <div className="calgrid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="caldow">{d}</div>)}
        {Array.from({ length: leadingBlanks }, (_, i) => <div key={`b${i}`} className="calblank" />)}
        {days.map(day => {
          const list = entries[day] ?? [];
          return (
            <div
              key={day} className="calday" role="button" tabIndex={0}
              onClick={() => setOpenDay(list.length ? day : null)}
              onKeyDown={e => { if (e.key === 'Enter' && list.length) setOpenDay(day); }}
            >
              <span className="caldnum">{Number(day.slice(8))}</span>
              {list.slice(0, CHIP_CAP).map(e => (
                <Link
                  key={`${e.kind}${e.id}`} className="calchip" href={chipHref(e)}
                  style={{ '--pc': e.color } as React.CSSProperties}
                  onClick={ev => ev.stopPropagation()}
                >
                  {e.kind === 'job' ? '●' : '◆'} {e.label}
                </Link>
              ))}
              {list.length > CHIP_CAP && <span className="calmore">+{list.length - CHIP_CAP} more</span>}
              {/* phones-first collapse target: count dots shown below the breakpoint */}
              {list.length > 0 && (
                <span className="caldots" aria-hidden>
                  {list.slice(0, 4).map((e, i) => <i key={i} style={{ background: e.color }} />)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {openDay && (
        <div className="caldaypanel box">
          <div className="calhead">
            <h4>{openDay}</h4>
            <button type="button" className="x" onClick={() => setOpenDay(null)}>✕</button>
          </div>
          {(entries[openDay] ?? []).map(e => (
            <Link key={`${e.kind}${e.id}`} className="calchip" href={chipHref(e)} style={{ '--pc': e.color } as React.CSSProperties}>
              {e.kind === 'job' ? '●' : '◆'} {e.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Implement `app/(app)/calendar/page.tsx`**

Lift the fetch/drawer scaffold from `app/(app)/map/page.tsx` — same role split, same drawer wiring, but month-scoped and no pins:

```tsx
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { buildJobs, visibleJobs, buildMembers, type JobRow, type JobCustomer, type JobMember } from '@/lib/jobs';
import { resolveMonth, monthWindow, bucketByDay, type CalEntry } from '@/lib/calendar';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { LeadDrawer } from '@/components/leads/LeadDrawer';
import { JobDrawer, type LeadDetail } from '@/components/jobs/JobDrawer';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; l?: string; j?: string }>;
}) {
  const { m: mParam, l: lParam, j: jParam } = await searchParams;
  const month = resolveMonth(mParam, new Date());
  const { from, to } = monthWindow(month);
  const user = await getSession();
  const uid = user?.id ?? '';
  const role = await getRole();
  const admin = role === 'admin';
  const canReadMoney = admin || role === 'rep';
  const showLeads = canReadMoney; // leads layer is admin/rep (matches /leads nav gating)
  const sb = await supabaseServer();

  // Month-scoped, role-split jobs (same shape as jobs/map pages; done INCLUDED
  // — the calendar doubles as history; deleted excluded; unscheduled absent by
  // the gte filter). timestamptz vs day-string comparison is safe: ISO strings.
  const jobsQuery = canReadMoney
    ? sb
        .from('jobs')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,price,cleaner_amount,done_at,recur_days,recur_parent_id')
        .is('deleted_at', null)
        .gte('scheduled_date', from).lt('scheduled_date', to)
        .order('scheduled_date')
    : sb
        .from('jobs_public')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,cleaner_amount')
        .gte('scheduled_date', from).lt('scheduled_date', to)
        .order('scheduled_date');

  const [jobsRes, lpRes, csRes, baseRes, psRes, jmRes] = await Promise.all([
    jobsQuery,
    showLeads
      ? sb
          .from('leads_public')
          .select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at,rep_id')
          .gte('created_at', from).lt('created_at', to)
          .order('created_at')
      : Promise.resolve({ data: null, error: null }),
    sb.from('customers').select('id,name,address,phone,email,lat,lng,active'),
    // Quote map for the LeadDrawer (post-0029: admin AND rep read base leads).
    canReadMoney ? sb.from('leads').select('id,quote_value').is('deleted_at', null) : Promise.resolve({ data: null, error: null }),
    sb.from('profiles').select('id,full_name,role'),
    sb.from('job_members').select('id,job_id,cleaner_id,status,is_owner'),
  ]);
  logQueryError('calendar.page.jobs', jobsRes.error);
  logQueryError('calendar.page.leads_public', 'error' in lpRes ? lpRes.error : null);
  logQueryError('calendar.page.customers', csRes.error);
  logQueryError('calendar.page.leads', 'error' in baseRes ? baseRes.error : null);
  logQueryError('calendar.page.profiles', psRes.error);
  logQueryError('calendar.page.job_members', jmRes.error);

  const cs = csRes.data;
  const profiles = (psRes.data ?? []) as Array<{ id: string; full_name: string; role: string }>;
  const names = new Map(profiles.map(p => [p.id, p.full_name]));
  const reps = profiles
    .filter(p => p.role === 'admin' || p.role === 'rep')
    .map(p => ({ id: p.id, full_name: p.full_name }));

  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (canReadMoney) {
    const rows = (jobsRes.data ?? []) as Array<JobRow & { price: number | null; cleaner_amount: number | null; done_at: string | null; recur_days: number | null; recur_parent_id: number | null }>;
    jobRows = rows.map(r => ({
      id: r.id, customer_id: r.customer_id, lead_id: r.lead_id, status: r.status,
      claimed_by: r.claimed_by, scheduled_date: r.scheduled_date, service: r.service,
      description: r.description, created_at: r.created_at, updated_at: r.updated_at,
      cleaner_amount: r.cleaner_amount, done_at: r.done_at,
      recur_days: r.recur_days, recur_parent_id: r.recur_parent_id,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    jobRows = (jobsRes.data ?? []) as JobRow[];
  }

  let quoteById: Map<number, number> | null = null;
  if (canReadMoney) {
    quoteById = new Map((baseRes.data ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  const allJobs = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const jobs = visibleJobs(role, uid, allJobs);
  const leads = buildLeads((lpRes.data ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById, names);
  const allMembers: JobMember[] = buildMembers(
    (jmRes.data ?? []) as Array<Omit<JobMember, 'cleaner_name'>>,
    names
  );

  // Maps don't cross the RSC boundary — serialize.
  const entries: Record<string, CalEntry[]> = Object.fromEntries(bucketByDay(jobs, leads));

  const backTo = `/calendar?m=${month}`;
  // ?l= wins over ?j= (map-page rule); cleaner deep links filter through visibleJobs.
  const selectedLead = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;
  const selectedJob = !selectedLead && jParam ? jobs.find(j => j.id === Number(jParam)) ?? null : null;

  let leadDetail: LeadDetail | null = null;
  if (selectedJob?.lead_id != null) {
    if (admin) {
      const { data: ld, error } = await sb
        .from('leads')
        .select('stories,panes,note,description,quote_value')
        .eq('id', selectedJob.lead_id)
        .single();
      logQueryError('calendar.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: Number(ld.quote_value ?? 0) } : null;
    } else {
      const { data: ld, error } = await sb
        .from('leads_public')
        .select('stories,panes,note,description')
        .eq('id', selectedJob.lead_id)
        .single();
      logQueryError('calendar.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: null } : null;
    }
  }
  const customerOptions = ((cs ?? []) as Array<CustomerGeo & { active: boolean }>)
    .filter(c => c.active)
    .map(c => ({ id: c.id, name: c.name, phone: c.phone, address: c.address }));

  return (
    <section className="screen">
      <CalendarGrid month={month} entries={entries} showLeads={showLeads} />
      {selectedLead && (
        <LeadDrawer key={selectedLead.id} lead={selectedLead} admin={admin} money={canReadMoney} canEdit={canReadMoney} backTo={backTo} reps={reps} uid={uid} />
      )}
      {selectedJob && role && (
        <JobDrawer
          key={selectedJob.id}
          job={selectedJob} role={role} uid={uid} admin={admin}
          customers={customerOptions} leadDetail={leadDetail}
          members={allMembers.filter(m => m.job_id === selectedJob.id)}
          backTo={backTo}
        />
      )}
    </section>
  );
}
```

NOTE: the `money={canReadMoney}` LeadDrawer prop comes from the dots plan Task 8. If drawer prop names drifted during dots implementation, match whatever `app/(app)/map/page.tsx` passes at that point — the map page is the canonical caller to copy. NOTE on the leadDetail admin split: post-0029 a rep COULD read base leads too; keep the admin/non-admin split as the map page has it at implementation time (consistency beats micro-optimizing this fetch; if the dots work already widened the map page's leadDetail branch, copy that).

- [ ] **Step 6: CSS — `app/globals.css`** (append near the map/pop styles):

```css
/* Calendar (phones-first: chips collapse to count dots under 720px) */
.calhead { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.calhead h3, .calhead h4 { margin: 0; }
.calnav { display: flex; gap: 6px; }
.calgrid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.caldow { font-size: 9px; text-transform: uppercase; color: var(--muted); text-align: center; padding: 4px 0; }
.calblank { min-height: 72px; }
.calday { min-height: 72px; border: 1.5px solid var(--line); border-radius: 6px; padding: 4px; display: flex; flex-direction: column; gap: 2px; cursor: pointer; overflow: hidden; }
.caldnum { font-size: 10px; font-weight: 700; color: var(--muted); }
.calchip { display: block; font-size: 10px; line-height: 1.5; padding: 1px 4px; border-radius: 4px; border-left: 3px solid var(--pc); background: var(--chip); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; color: inherit; }
.calmore { font-size: 9px; color: var(--muted); }
.caldots { display: none; gap: 3px; }
.caldots i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.caldaypanel { margin-top: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
@media (max-width: 720px) {
  .calday { min-height: 44px; }
  .calday .calchip, .calday .calmore { display: none; }
  .caldots { display: inline-flex; }
}
```

- [ ] **Step 7: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green — nav tests updated, CalendarGrid tests pass, `/calendar` route builds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(calendar): month calendar page — jobs by schedule, leads by created, drawer deep links"
```

---

### Task 6: Win rate counts map No-dots

**Files:**
- Modify: `lib/dashboard.ts`, `app/(app)/dashboard/page.tsx`
- Test: `tests/unit/dashboard.test.ts`

**Interfaces:**
- Consumes: the dashboard's dots fetch (added by the dots plan Task 9 — `dotRows: Dot[]` already on the page).
- Produces: `winRate(leads: WinLead[], noDots: number): number` — signature change; the dashboard page is the only product call site (`app/(app)/dashboard/page.tsx:86`-ish).

- [ ] **Step 1: Update the tests first (failing)**

In `tests/unit/dashboard.test.ts`, the `winRate` describe block becomes:

```ts
describe('winRate', () => {
  it('divides won by won+lost when there are no No-dots', () => {
    expect(winRate([{ status: 'won' }, { status: 'won' }, { status: 'lost' }, { status: 'follow' }], 0)).toBeCloseTo(2 / 3);
  });
  it('No-dots widen the denominator (doors that said no are losses)', () => {
    expect(winRate([{ status: 'won' }, { status: 'lost' }], 2)).toBeCloseTo(1 / 4);
  });
  it('No-dots alone still yield 0 (nothing won)', () => {
    expect(winRate([], 3)).toBe(0);
  });
  it('returns 0 with no decided leads and no dots', () => {
    expect(winRate([{ status: 'new' }, { status: 'follow' }], 0)).toBe(0);
    expect(winRate([], 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/unit/dashboard.test.ts`
Expected: FAIL — winRate takes one argument.

- [ ] **Step 3: Implement**

`lib/dashboard.ts`:

```ts
// won / (won + lost + noDots); 0 when the denominator is 0. noDots = dots
// currently marked 'no' (owner 2026-07-14: a door that said no is a loss;
// converted/deleted dots are hard-deleted so they drop out naturally).
export function winRate(leads: WinLead[], noDots: number): number {
  const won = leads.filter(l => l.status === 'won').length;
  const lost = leads.filter(l => l.status === 'lost').length;
  const denom = won + lost + noDots;
  return denom === 0 ? 0 : won / denom;
}
```

`app/(app)/dashboard/page.tsx` — next to the existing `wr` computation:

```ts
const noDots = dotRows.filter(d => d.status === 'no').length;
const wr = Math.round(winRate(leads as WinLead[], noDots) * 100);
```

(`dotRows` exists on this page from the dots plan's MiniMap work; if it's named differently there, use that name — do NOT add a second dots query.)

- [ ] **Step 4: Run tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard.ts "app/(app)/dashboard/page.tsx" tests/unit/dashboard.test.ts
git commit -m "feat(dashboard): win rate counts map No-dots in the denominator"
```

---

### Task 7: Whole-branch battery, review, ledger

- [ ] **Step 1: Full battery**

```
npm run lint          # expect 0 problems
npx tsc --noEmit      # expect clean
npm test              # expect all unit files green
npm run build         # expect all routes incl. /calendar compile
npx supabase db reset # expect all migrations + seed apply (unchanged by this plan; sanity only)
npm run test:db       # expect all pgTAP green (unchanged; sanity only)
```

- [ ] **Step 2: Request whole-branch code review**

Use superpowers:requesting-code-review — diff is the branch base..`feat/small-changes`. Reviewer focus: rename sweep completeness (zero "cleaner pot" in components/app/lib/tests), calendar month-window query correctness + `?m=` survival through drawers, GeolocateControl gating (absent on MiniMap), winRate call-site consistency, nav renumbering.

- [ ] **Step 3: Fix findings, re-run battery, append ledger**

Append a dated entry to `.superpowers/sdd/progress.md` in its existing style; note "AWAITING owner walkthrough — do NOT merge".

- [ ] **Step 4: Owner walkthrough checklist**

Cover at minimum: Cleaners Pay label in JobDrawer view/edit + both no-pay confirms; map is street style on /map AND dashboard; search fly is visibly faster; locate button asks permission then shows the blue dot (and recenters until you pan — expected); calendar nav item for all roles, month grid, prev/today/next, chips open the right drawer and Back returns to the same month, cleaner sees jobs only, phone view collapses to dots + day panel; win rate on dashboard drops when dots are marked No and recovers when those dots convert or delete.

---

## Self-Review Notes (already applied)

- Spec coverage: item 1 (Task 2 flyTo), item 2 (Tasks 4–5), item 3 (Task 1), item 4 (Task 3), item 5 (Task 2 style), item 6 (Task 6). Drawer-support fetches, `?m=` on links AND backTo, nav.test breakage, mock growth, accepted-deviation comment — all spec review-fixes are embodied in the tasks.
- Type consistency: `CalEntry` produced by Task 4 `bucketByDay`, consumed serialized (`Record<string, CalEntry[]>`) by Task 5 — the Map→Object serialization is explicit in the page. `winRate(leads, noDots)` arity matches Task 6's test and call site. `FLY_TO_OPTS`/`MAP_STYLE` names identical across Tasks 2's lib, component, and tests.
- Known judgment calls for the reviewer: chips cap at 3 per cell (`CHIP_CAP`); day-panel opens on cell click only when the day has entries; calendar leads fetch is skipped entirely for cleaners (not fetched-then-filtered).
