# Calendar View on Leads and Jobs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone `/calendar` page with a third view mode — `Board | List | Calendar` — on both `/leads` (leads by created date) and `/jobs` (jobs by scheduled date).

**Architecture:** `ViewToggle` gains a `calendar` value driving `?view=calendar&m=YYYY-MM`. `CalendarGrid` swaps its `showLeads` boolean for a `kind: 'lead' | 'job'` prop that derives base path, glyph, and hint. Two new client sections (`LeadsCalendarSection`, `JobsCalendarSection`) own the `scrhead` and render the grid. Both host pages already fetch their full non-deleted record set, so the calendar buckets that data with `bucketByDay` — **no new queries**. The old page, its nav item, and the now-unused `monthWindow()` are deleted.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Supabase JS, Vitest + jsdom + react-dom/client (no Testing Library in this repo — tests render with `createRoot` + `act`).

**Spec:** `docs/superpowers/specs/2026-08-10-leads-jobs-calendar-view-design.md`

## Global Constraints

- Branch: `feat/small-changes` (unmerged). Do NOT merge or open a PR.
- No DB changes. No migration. pgTAP untouched.
- Read `node_modules/next/dist/docs/` before any Next-API-shaped change — this Next version differs from training data (repo rule, `AGENTS.md`).
- Day bucketing uses the app-wide `slice(0, 10)` UTC-ISO string convention. No `Date`-local parsing anywhere.
- Client components need `'use client'` as line 1. Server pages pass plain objects only — a `Map` does not cross the RSC boundary (`Object.fromEntries`).
- Existing test style: `// @vitest-environment jsdom` first line for render tests, `vi.mock('next/link', ...)`, `createRoot` + `act`, no Testing Library.
- Frontend rule (memory: `frontend-design-rules`): consistency is rule #1 — the three views must render the same `scrhead` action set.
- Run commands from repo root `D:\Development\ClearViewCRM` (PowerShell).
- Every task ends with a commit. Conventional Commits, body only when the "why" is non-obvious.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `components/ui/ViewToggle.tsx` | 3-state view switch (modify) | 1 |
| `tests/unit/ViewToggle.render.test.tsx` | toggle contract (create) | 1 |
| `components/calendar/CalendarGrid.tsx` | month grid, host-parameterized by `kind` (modify) | 2 |
| `tests/unit/CalendarGrid.render.test.tsx` | grid contract (modify) | 2 |
| `components/leads/LeadsCalendarSection.tsx` | leads calendar screen + header (create) | 3 |
| `app/(app)/leads/page.tsx` | `?view=calendar` branch + bucketing (modify) | 3 |
| `tests/unit/LeadsCalendarSection.render.test.tsx` | header contract (create) | 3 |
| `components/jobs/JobsCalendarSection.tsx` | jobs calendar screen + header (create) | 4 |
| `app/(app)/jobs/page.tsx` | `?view=calendar` branch + bucketing (modify) | 4 |
| `tests/unit/JobsCalendarSection.render.test.tsx` | header contract (create) | 4 |
| `app/(app)/calendar/page.tsx` | DELETED | 5 |
| `lib/nav.ts` | drop `/calendar` item + title, renumber (modify) | 5 |
| `lib/calendar.ts` | drop unused `monthWindow` (modify) | 5 |
| `tests/unit/nav.test.ts`, `tests/unit/calendar.test.ts` | follow the removals (modify) | 5 |

---

### Task 1: ViewToggle becomes three-state

**Files:**
- Modify: `components/ui/ViewToggle.tsx` (whole file, 14 lines)
- Test: `tests/unit/ViewToggle.render.test.tsx` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ViewToggle({ view, base })` where `view: 'board' | 'list' | 'calendar'` and `base: '/leads' | '/jobs'`. Calendar click pushes `` `${base}?view=calendar` ``. Tasks 3 and 4 render it with `view="calendar"`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ViewToggle.render.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
import { ViewToggle } from '@/components/ui/ViewToggle';

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const buttons = () => [...container.querySelectorAll('button')];
const byText = (t: string) => buttons().find(b => b.textContent?.includes(t))!;

describe('ViewToggle', () => {
  it('renders Board, List and Calendar', () => {
    act(() => root.render(<ViewToggle view="board" base="/leads" />));
    expect(buttons()).toHaveLength(3);
    expect(container.textContent).toContain('Calendar');
  });

  it('marks exactly the active view as pressed', () => {
    act(() => root.render(<ViewToggle view="calendar" base="/leads" />));
    const pressed = buttons().filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain('Calendar');
    expect(pressed[0].className).toContain('on');
  });

  it('pushes the right URL per view on /leads', () => {
    act(() => root.render(<ViewToggle view="board" base="/leads" />));
    act(() => { byText('Calendar').click(); });
    expect(push).toHaveBeenCalledWith('/leads?view=calendar', { scroll: false });
    act(() => { byText('List').click(); });
    expect(push).toHaveBeenCalledWith('/leads?view=list', { scroll: false });
    act(() => { byText('Board').click(); });
    expect(push).toHaveBeenCalledWith('/leads', { scroll: false });
  });

  it('pushes the right URL per view on /jobs', () => {
    act(() => root.render(<ViewToggle view="list" base="/jobs" />));
    act(() => { byText('Calendar').click(); });
    expect(push).toHaveBeenCalledWith('/jobs?view=calendar', { scroll: false });
    act(() => { byText('Board').click(); });
    expect(push).toHaveBeenCalledWith('/jobs', { scroll: false });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/ViewToggle.render.test.tsx`
Expected: FAIL — the component renders 2 buttons, no "Calendar"; the TypeScript `view="calendar"` prop is not assignable.

- [ ] **Step 3: Implement**

Replace the whole body of `components/ui/ViewToggle.tsx`:

```tsx
'use client';
import { useRouter } from 'next/navigation';

export type ViewMode = 'board' | 'list' | 'calendar';

// Board is the bare base path (no ?view=); list/calendar carry ?view=. Calendar deliberately
// omits ?m= so the button always lands on the current month — CalendarGrid's own nav owns ?m=.
export function ViewToggle({ view, base }: { view: ViewMode; base: '/leads' | '/jobs' }) {
  const router = useRouter();
  const go = (v: ViewMode) =>
    router.push(v === 'board' ? base : `${base}?view=${v}`, { scroll: false });
  const cls = (v: ViewMode) => (view === v ? 'on' : '');
  return (
    <div className="viewtoggle" role="group" aria-label="View mode">
      <button type="button" className={cls('board')} aria-pressed={view === 'board'} onClick={() => go('board')}>⌗ Board</button>
      <button type="button" className={cls('list')} aria-pressed={view === 'list'} onClick={() => go('list')}>☰ List</button>
      <button type="button" className={cls('calendar')} aria-pressed={view === 'calendar'} onClick={() => go('calendar')}>▦ Calendar</button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/ViewToggle.render.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify no existing caller broke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green. `LeadsListSection`, `KanbanBoard`, `JobsListSection`, `JobsBoard` pass `view="board"`/`view="list"`, which stay valid `ViewMode` values.

- [ ] **Step 6: Commit**

```bash
git add components/ui/ViewToggle.tsx tests/unit/ViewToggle.render.test.tsx
git commit -m "feat(ui): ViewToggle gains a Calendar view mode"
```

---

### Task 2: CalendarGrid parameterized by record kind

**Files:**
- Modify: `components/calendar/CalendarGrid.tsx:13-35` (props + hrefs + hint)
- Test: `tests/unit/CalendarGrid.render.test.tsx` (rewrite — the old file targets `/calendar` hrefs)

**Interfaces:**
- Consumes: `CalEntry` from `lib/calendar.ts` (unchanged: `{ kind: 'job' | 'lead'; id: number; label: string; color: string }`).
- Produces: `CalendarGrid({ month, entries, kind })` with `kind: 'lead' | 'job'`. `showLeads` no longer exists. Tasks 3 and 4 render it as `<CalendarGrid key={month} month={month} entries={entries} kind="lead" />` / `kind="job"`.

- [ ] **Step 1: Write the failing test**

Replace the whole of `tests/unit/CalendarGrid.render.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import type { CalEntry } from '@/lib/calendar';

const jobEntries: Record<string, CalEntry[]> = {
  '2026-07-14': [
    { kind: 'job', id: 5, label: 'Cust 5', color: 'var(--sched)' },
    { kind: 'job', id: 6, label: 'Cust 6', color: 'var(--prog)' },
    { kind: 'job', id: 7, label: 'Cust 7', color: 'var(--prog)' },
    { kind: 'job', id: 8, label: 'Cust 8', color: 'var(--prog)' },
    { kind: 'job', id: 9, label: 'Cust 9', color: 'var(--prog)' },
  ],
};
const leadEntries: Record<string, CalEntry[]> = {
  '2026-07-14': [{ kind: 'lead', id: 9, label: 'Lead 9', color: 'var(--new)' }],
};

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const renderJobs = () => act(() => root.render(<CalendarGrid month="2026-07" entries={jobEntries} kind="job" />));
const renderLeads = () => act(() => root.render(<CalendarGrid month="2026-07" entries={leadEntries} kind="lead" />));
const hrefs = () => [...container.querySelectorAll('a')].map(a => a.getAttribute('href'));

describe('CalendarGrid', () => {
  it('renders the month header with prev/today/next links on the jobs host', () => {
    renderJobs();
    expect(container.textContent).toContain('July 2026');
    expect(hrefs()).toContain('/jobs?view=calendar&m=2026-06');
    expect(hrefs()).toContain('/jobs?view=calendar&m=2026-08');
    expect(hrefs()).toContain('/jobs?view=calendar'); // Today
  });

  it('renders month nav on the leads host', () => {
    renderLeads();
    expect(hrefs()).toContain('/leads?view=calendar&m=2026-06');
    expect(hrefs()).toContain('/leads?view=calendar');
  });

  it('renders 31 day cells for July plus leading blanks', () => {
    renderJobs();
    expect(container.querySelectorAll('.calday')).toHaveLength(31);
    expect(container.querySelectorAll('.calblank')).toHaveLength(3); // 2026-07-01 is a Wednesday
  });

  it('shows up to 3 chips per day plus a +n more overflow', () => {
    renderJobs();
    const day = [...container.querySelectorAll('.calday')].find(d => d.textContent?.includes('14'))!;
    expect(day.querySelectorAll('.calchip')).toHaveLength(3);
    expect(day.textContent).toContain('+2 more');
  });

  it('job chips deep-link with ?j= and keep view+month', () => {
    renderJobs();
    expect(hrefs()).toContain('/jobs?view=calendar&m=2026-07&j=5');
  });

  it('lead chips deep-link with ?l= and keep view+month', () => {
    renderLeads();
    expect(hrefs()).toContain('/leads?view=calendar&m=2026-07&l=9');
  });

  it('hints at the date basis per host', () => {
    renderJobs();
    expect(container.querySelector('.hint')!.textContent).toContain('jobs by schedule');
    act(() => root.unmount());
    root = createRoot(container);
    renderLeads();
    expect(container.querySelector('.hint')!.textContent).toContain('leads by created');
  });

  it('day click opens the day panel listing ALL entries', () => {
    renderJobs();
    const day = [...container.querySelectorAll('.calday')].find(d => d.textContent?.includes('14'))!;
    act(() => { (day as HTMLElement).click(); });
    const panel = container.querySelector('.caldaypanel')!;
    expect(panel.querySelectorAll('a')).toHaveLength(5);
    expect(panel.textContent).toContain('Cust 9');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/CalendarGrid.render.test.tsx`
Expected: FAIL — hrefs are still `/calendar?m=…`; `kind` is not a prop (and `showLeads` is required).

- [ ] **Step 3: Implement**

In `components/calendar/CalendarGrid.tsx`, change the props block and the three href/hint sites. Replace lines 8-34 (the doc comment through the `.hint` span) with:

```tsx
// Month grid. Entries arrive pre-bucketed and pre-colored (the host page did the role
// filtering — cleaners never receive lead entries). `kind` says which host is rendering:
// it picks the base path, so every link stays inside that host's calendar view. Chip click
// deep-links the drawer; view+month ride along so Back/close keeps the grid. Tapping a day
// opens a panel listing everything (the phones-first path — cells collapse to count dots
// below the CSS breakpoint).
export function CalendarGrid({
  month, entries, kind,
}: {
  month: string;
  entries: Record<string, CalEntry[]>;
  kind: 'lead' | 'job';
}) {
  const { days, leadingBlanks } = monthGrid(month);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const base = kind === 'lead' ? '/leads' : '/jobs';
  const monthHref = (m: string | null) => (m ? `${base}?view=calendar&m=${m}` : `${base}?view=calendar`);
  const chipHref = (e: CalEntry) => `${base}?view=calendar&m=${month}&${e.kind === 'job' ? 'j' : 'l'}=${e.id}`;
  const hint = kind === 'lead' ? '◆ leads by created' : '● jobs by schedule';

  return (
    <section className="panel box">
      <div className="calhead">
        <h3>{monthLabel(month)}</h3>
        <div className="calnav">
          <Link className="chip" href={monthHref(addMonths(month, -1))}>‹ Prev</Link>
          <Link className="chip" href={monthHref(null)}>Today</Link>
          <Link className="chip" href={monthHref(addMonths(month, 1))}>Next ›</Link>
        </div>
        <span className="hint">{hint}</span>
      </div>
```

Leave everything from `<div className="calgrid">` down untouched.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/CalendarGrid.render.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Confirm the old page is the only broken caller**

Run: `npx tsc --noEmit`
Expected: exactly one error — `app/(app)/calendar/page.tsx` still passes `showLeads`. That file is deleted in Task 5; leave it failing for now and do NOT patch it.

- [ ] **Step 6: Commit**

```bash
git add components/calendar/CalendarGrid.tsx tests/unit/CalendarGrid.render.test.tsx
git commit -m "feat(calendar): grid links route to its host view

kind='lead'|'job' replaces showLeads: one prop drives base path, chip
param, and hint, so the grid works under /leads and /jobs alike."
```

---

### Task 3: Leads calendar view

**Files:**
- Create: `components/leads/LeadsCalendarSection.tsx`
- Modify: `app/(app)/leads/page.tsx` (imports, searchParams, `cal`/`month`/`backTo`, render branch)
- Test: `tests/unit/LeadsCalendarSection.render.test.tsx` (create)

**Interfaces:**
- Consumes: `ViewToggle` (Task 1) with `view="calendar" base="/leads"`; `CalendarGrid` (Task 2) with `kind="lead"`.
- Produces: `LeadsCalendarSection({ leads, month, entries, admin, money, canEdit })` — `leads: Lead[]`, `month: string`, `entries: Record<string, CalEntry[]>`, three booleans.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/LeadsCalendarSection.render.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
import { LeadsCalendarSection } from '@/components/leads/LeadsCalendarSection';
import type { CalEntry } from '@/lib/calendar';

const entries: Record<string, CalEntry[]> = {
  '2026-07-14': [{ kind: 'lead', id: 9, label: 'Lead 9', color: 'var(--new)' }],
};

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const render = (admin: boolean, canEdit = true) => act(() => root.render(
  <LeadsCalendarSection leads={[]} month="2026-07" entries={entries} admin={admin} money={true} canEdit={canEdit} />
));
const byText = (t: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(t));

describe('LeadsCalendarSection', () => {
  it('renders the grid with the shared header actions', () => {
    render(true);
    expect(container.querySelector('.viewtoggle')).toBeTruthy();
    expect(byText('Calendar')!.getAttribute('aria-pressed')).toBe('true');
    expect(byText('Export CSV')).toBeTruthy();
    expect(byText('New lead')).toBeTruthy();
    expect(container.querySelector('.calgrid')).toBeTruthy();
    expect(container.textContent).toContain('July 2026');
  });

  it('shows History to admins only', () => {
    render(true);
    expect(byText('History')).toBeTruthy();
    act(() => root.unmount());
    root = createRoot(container);
    render(false);
    expect(byText('History')).toBeUndefined();
  });

  it('New lead keeps the calendar view and month', () => {
    render(true);
    act(() => { byText('New lead')!.click(); });
    expect(push).toHaveBeenCalledWith('/leads?view=calendar&m=2026-07&new=1', { scroll: false });
  });

  it('hides New lead when canEdit is false', () => {
    render(true, false);
    expect(byText('New lead')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/LeadsCalendarSection.render.test.tsx`
Expected: FAIL — cannot resolve `@/components/leads/LeadsCalendarSection`.

- [ ] **Step 3: Create the component**

Create `components/leads/LeadsCalendarSection.tsx`:

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { type Lead } from '@/lib/leads';
import { toCSV, downloadCSV, leadsCsvTable } from '@/lib/csv';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import type { CalEntry } from '@/lib/calendar';

// Third leads view: same scrhead action set as board/list (consistency rule) over a month
// grid of leads bucketed by created date. Export stays whole-set, not month-scoped — the
// button means the same thing in every view.
export function LeadsCalendarSection({
  leads, month, entries, admin, money, canEdit,
}: {
  leads: Lead[];
  month: string;
  entries: Record<string, CalEntry[]>;
  admin: boolean;
  money: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();

  return (
    <section className="screen">
      <div className="scrhead">
        <ViewToggle view="calendar" base="/leads" />
        <div style={{ display: 'flex', gap: 8 }}>
          {admin && <HistoryToggle base="/leads" active={false} />}
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = leadsCsvTable(leads, money);
              downloadCSV('clearview-leads.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          {canEdit && (
            <button
              className="btn"
              type="button"
              onClick={() => router.push(`/leads?view=calendar&m=${month}&new=1`, { scroll: false })}
            >
              + New lead
            </button>
          )}
        </div>
      </div>
      {/* key={month}: remount on month nav so the day panel doesn't survive into a month it
          doesn't belong to; drawer open/close keeps the same m, so it correctly persists there. */}
      <CalendarGrid key={month} month={month} entries={entries} kind="lead" />
    </section>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/LeadsCalendarSection.render.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the page**

In `app/(app)/leads/page.tsx` make exactly four edits.

(a) Add imports below the existing `buildLeads` import:

```ts
import { resolveMonth, bucketByDay, type CalEntry } from '@/lib/calendar';
import { LeadsCalendarSection } from '@/components/leads/LeadsCalendarSection';
```

(b) Widen `searchParams` (line ~15):

```ts
  searchParams: Promise<{ l?: string; new?: string; view?: string; deleted?: string; m?: string }>;
```

(c) Replace the destructure + `list`/`backTo` block (lines ~19-22) with:

```ts
  const { l: lParam, new: newParam, view, deleted, m: mParam } = await searchParams;
  const isNew = newParam === '1';
  const list = view === 'list';
  const cal = view === 'calendar';
  const month = resolveMonth(mParam, new Date());
  const backTo = cal ? `/leads?view=calendar&m=${month}` : list ? '/leads?view=list' : '/leads';
```

(d) Replace the list/board ternary in the return (lines ~91-95) with:

```tsx
      {cal ? (
        <LeadsCalendarSection
          leads={leads} month={month}
          // Maps don't cross the RSC boundary — serialize. Buckets cover every month in the
          // already-fetched set; the grid renders only the requested one. No extra query.
          entries={Object.fromEntries(bucketByDay([], leads)) as Record<string, CalEntry[]>}
          admin={admin} money={canReadMoney} canEdit={true}
        />
      ) : list ? (
        <LeadsListSection leads={leads} admin={admin} money={canReadMoney} canEdit={true} />
      ) : (
        <KanbanBoard leads={leads} admin={admin} money={canReadMoney} canEdit={true} />
      )}
```

- [ ] **Step 6: Verify the page compiles and the suite is green**

Run: `npx tsc --noEmit`
Expected: still exactly the one pre-existing error in `app/(app)/calendar/page.tsx` (Task 5 deletes it) — nothing new.

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add components/leads/LeadsCalendarSection.tsx tests/unit/LeadsCalendarSection.render.test.tsx "app/(app)/leads/page.tsx"
git commit -m "feat(leads): calendar view — leads by created date

Reuses the page's existing unbounded fetch: no month-scoped query, the
full set is bucketed and the grid renders the requested month."
```

---

### Task 4: Jobs calendar view

**Files:**
- Create: `components/jobs/JobsCalendarSection.tsx`
- Modify: `app/(app)/jobs/page.tsx` (imports, searchParams, `cal`/`month`, render branch, drawer `backTo`)
- Test: `tests/unit/JobsCalendarSection.render.test.tsx` (create)

**Interfaces:**
- Consumes: `ViewToggle` (Task 1) with `view="calendar" base="/jobs"`; `CalendarGrid` (Task 2) with `kind="job"`.
- Produces: `JobsCalendarSection({ jobs, month, entries, admin, money })` — `jobs: Job[]`, `month: string`, `entries: Record<string, CalEntry[]>`, two booleans. `money` doubles as the create gate (admin/rep), exactly as in `JobsListSection`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/JobsCalendarSection.render.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const realtime = vi.fn();
vi.mock('@/lib/hooks/useJobsRealtime', () => ({ useJobsRealtime: () => realtime() }));
import { JobsCalendarSection } from '@/components/jobs/JobsCalendarSection';
import type { CalEntry } from '@/lib/calendar';

const entries: Record<string, CalEntry[]> = {
  '2026-07-14': [{ kind: 'job', id: 5, label: 'Cust 5', color: 'var(--sched)' }],
};

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

const render = (admin: boolean, money: boolean) => act(() => root.render(
  <JobsCalendarSection jobs={[]} month="2026-07" entries={entries} admin={admin} money={money} />
));
const byText = (t: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.includes(t));

describe('JobsCalendarSection', () => {
  it('renders the grid with the shared header actions', () => {
    render(true, true);
    expect(byText('Calendar')!.getAttribute('aria-pressed')).toBe('true');
    expect(byText('Export CSV')).toBeTruthy();
    expect(byText('New job')).toBeTruthy();
    expect(container.querySelector('.calgrid')).toBeTruthy();
  });

  it('subscribes to the jobs realtime channel like the other job views', () => {
    render(true, true);
    expect(realtime).toHaveBeenCalled();
  });

  it('hides History and New job from cleaners', () => {
    render(false, false); // cleaner: not admin, no money
    expect(byText('History')).toBeUndefined();
    expect(byText('New job')).toBeUndefined();
    expect(container.querySelector('.calgrid')).toBeTruthy();
  });

  it('New job keeps the calendar view and month', () => {
    render(true, true);
    act(() => { byText('New job')!.click(); });
    expect(push).toHaveBeenCalledWith('/jobs?view=calendar&m=2026-07&new=1', { scroll: false });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/JobsCalendarSection.render.test.tsx`
Expected: FAIL — cannot resolve `@/components/jobs/JobsCalendarSection`.

- [ ] **Step 3: Create the component**

Create `components/jobs/JobsCalendarSection.tsx`:

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { type Job } from '@/lib/jobs';
import { toCSV, downloadCSV, jobsCsvTable } from '@/lib/csv';
import { useJobsRealtime } from '@/lib/hooks/useJobsRealtime';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import type { CalEntry } from '@/lib/calendar';

// Third jobs view: month grid of jobs bucketed by scheduled date (unscheduled live on the
// board only). Same scrhead action set as board/list — consistency rule.
export function JobsCalendarSection({
  jobs, month, entries, admin, money,
}: {
  jobs: Job[];
  month: string;
  entries: Record<string, CalEntry[]>;
  admin: boolean;
  money: boolean;
}) {
  const router = useRouter();
  // New-job affordance: admin + rep create jobs (spec: rep = admin on job money); money
  // already means admin-or-rep for job data, so it doubles as the create gate here.
  const canCreate = money;

  // Realtime: same private 'jobs' broadcast subscription as JobsBoard/JobsListSection, so a
  // claim in another window refreshes the grid too. Debounced (250ms) router.refresh().
  useJobsRealtime();

  return (
    <section className="screen">
      <div className="scrhead">
        <ViewToggle view="calendar" base="/jobs" />
        <div style={{ display: 'flex', gap: 8 }}>
          {admin && <HistoryToggle base="/jobs" active={false} />}
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = jobsCsvTable(jobs, money);
              downloadCSV('clearview-jobs.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          {canCreate && (
            <button
              className="btn"
              type="button"
              onClick={() => router.push(`/jobs?view=calendar&m=${month}&new=1`, { scroll: false })}
            >
              + New job
            </button>
          )}
        </div>
      </div>
      {/* key={month}: remount on month nav so the day panel doesn't survive into a month it
          doesn't belong to; drawer open/close keeps the same m, so it correctly persists there. */}
      <CalendarGrid key={month} month={month} entries={entries} kind="job" />
    </section>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/JobsCalendarSection.render.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the page**

In `app/(app)/jobs/page.tsx` make exactly five edits.

(a) Add imports below the existing `buildJobs` import:

```ts
import { resolveMonth, bucketByDay, type CalEntry } from '@/lib/calendar';
import { JobsCalendarSection } from '@/components/jobs/JobsCalendarSection';
```

(b) Widen `searchParams` (line ~15):

```ts
  searchParams: Promise<{ j?: string; new?: string; view?: string; deleted?: string; m?: string }>;
```

(c) Replace the destructure + `list` line (lines ~17-18) with:

```ts
  const { j: jParam, new: newParam, view, deleted, m: mParam } = await searchParams;
  const list = view === 'list';
  const cal = view === 'calendar';
  const month = resolveMonth(mParam, new Date());
```

(d) Replace the list/board ternary in the return (lines ~154-158) with:

```tsx
      {cal ? (
        <JobsCalendarSection
          jobs={visible} month={month}
          // Maps don't cross the RSC boundary — serialize. `visible` is already role-filtered
          // by visibleJobs, so cleaners bucket only their own jobs. No extra query.
          entries={Object.fromEntries(bucketByDay(visible, [])) as Record<string, CalEntry[]>}
          admin={admin} money={canReadMoney}
        />
      ) : list ? (
        <JobsListSection jobs={visible} admin={admin} money={canReadMoney} />
      ) : (
        <JobsBoard jobs={visible} role={role} uid={uid} meName={meName} admin={admin} money={canReadMoney} pendingByJob={pendingByJob} />
      )}
```

(e) Replace the drawer's inline `backTo` (line ~165) with a calendar-aware one:

```tsx
          backTo={cal ? `/jobs?view=calendar&m=${month}` : list ? '/jobs?view=list' : '/jobs'}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: still only the pre-existing `app/(app)/calendar/page.tsx` error.

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add components/jobs/JobsCalendarSection.tsx tests/unit/JobsCalendarSection.render.test.tsx "app/(app)/jobs/page.tsx"
git commit -m "feat(jobs): calendar view — jobs by scheduled date

Buckets the page's already-fetched visibleJobs set, so cleaners see only
their own jobs on the grid without a second role filter."
```

---

### Task 5: Retire the standalone calendar + closeout

**Files:**
- Delete: `app/(app)/calendar/page.tsx`
- Modify: `lib/nav.ts` (NAV_ITEMS, TITLES, renumber)
- Modify: `lib/calendar.ts` (drop `monthWindow`)
- Modify: `tests/unit/nav.test.ts`, `tests/unit/calendar.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4 — after this task no code references `/calendar` or `monthWindow`.
- Produces: nav of 9 items, numbered `01`-`09`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/nav.test.ts`, replace the `navForRole` and `titleFor` bodies with:

```ts
describe('navForRole', () => {
  it('admin sees all 9 items', () => {
    expect(navForRole('admin').map(i => i.href)).toEqual([
      '/dashboard', '/map', '/leads', '/jobs', '/invoices', '/customers', '/cleaners', '/expenses', '/settings',
    ]);
  });
  it('no role sees a standalone calendar — it lives inside /leads and /jobs', () => {
    for (const role of ['admin', 'rep', 'cleaner'] as const) {
      expect(navForRole(role).map(i => i.href)).not.toContain('/calendar');
    }
  });
  it('rep sees expenses but no invoices/settings', () => {
    const hrefs = navForRole('rep').map(i => i.href);
    expect(hrefs).toContain('/leads');
    expect(hrefs).toContain('/expenses');
    expect(hrefs).toContain('/cleaners');
    expect(hrefs).not.toContain('/invoices');
    expect(hrefs).not.toContain('/settings');
  });
  it('cleaner sees no leads/invoices/settings', () => {
    const hrefs = navForRole('cleaner').map(i => i.href);
    expect(hrefs).toEqual(['/dashboard', '/map', '/jobs', '/customers', '/cleaners']);
  });
  it('numbers run 01..09 with no gaps', () => {
    expect(NAV_ITEMS.map(i => i.num)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09']);
  });
});

describe('titleFor', () => {
  it('maps known routes', () => {
    expect(titleFor('/customers')[0]).toBe('Customers / Accounts');
    expect(titleFor('/dashboard')[0]).toBe('Dashboard / Daily Ops');
    expect(titleFor('/cleaners')[0]).toBe('Cleaners / Leaderboard');
  });
  it('falls back to dashboard for the retired calendar route', () => {
    expect(titleFor('/calendar')[0]).toBe('Dashboard / Daily Ops');
  });
  it('matches sub-paths and falls back to dashboard', () => {
    expect(titleFor('/customers?c=3'.split('?')[0])[0]).toBe('Customers / Accounts');
    expect(titleFor('/unknown')[0]).toBe('Dashboard / Daily Ops');
  });
});
```

In `tests/unit/calendar.test.ts`, delete the whole `describe('monthWindow', …)` block (lines 28-33) and drop `monthWindow` from the import list on line 3. Then append these single-kind cases inside the existing `describe('bucketByDay', …)` block — the hosts now always call it with one side empty:

```ts
  it('buckets leads only when the jobs side is empty', () => {
    const map = bucketByDay([], [lead(9, '2026-07-14T20:00:00Z')]);
    expect(map.get('2026-07-14')).toEqual([
      { kind: 'lead', id: 9, label: 'Lead 9', color: 'var(--new)' },
    ]);
  });
  it('buckets jobs only when the leads side is empty', () => {
    const map = bucketByDay([job(1, '2026-07-14T09:00:00Z')], []);
    expect(map.get('2026-07-14')!.every(e => e.kind === 'job')).toBe(true);
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/unit/nav.test.ts`
Expected: FAIL — `/calendar` is still in NAV_ITEMS and TITLES.

- [ ] **Step 3: Implement the removals**

In `lib/nav.ts`: delete the `/calendar` line from `NAV_ITEMS`, renumber the items below it, and delete the `/calendar` TITLES line. The array becomes:

```ts
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', num: '01', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/map',       label: 'Map',       num: '02', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/leads',     label: 'Leads',     num: '03', roles: ['admin', 'rep'] },
  { href: '/jobs',      label: 'Jobs',      num: '04', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/invoices',  label: 'Invoices',  num: '05', roles: ['admin'] },
  { href: '/customers', label: 'Customers', num: '06', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/cleaners',  label: 'Cleaners',  num: '07', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/expenses',  label: 'Expenses',  num: '08', roles: ['admin', 'rep'] },
  { href: '/settings',  label: 'Settings',  num: '09', roles: ['admin'] },
];
```

Update the two view titles to mention the new mode (the subtitle is the page hint):

```ts
  '/leads':     ['Leads / Pipeline', 'drag to change status · board · list · calendar'],
  '/jobs':      ['Jobs / Board', 'claim to lock · drag status · board · list · calendar'],
```

In `lib/calendar.ts`: delete the `monthWindow` function (lines 35-37). Leave `resolveMonth`, `addMonths`, `monthLabel`, `monthGrid`, `bucketByDay`.

Delete the page:

```bash
git rm "app/(app)/calendar/page.tsx"
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run tests/unit/nav.test.ts tests/unit/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove nothing references the retired route or function**

Run: `git grep -n "monthWindow\|'/calendar'\|\"/calendar\"\|href=\"/calendar" -- . ":(exclude)docs"`
Expected: zero hits. Any hit is a miss — fix it before continuing.

- [ ] **Step 6: Full battery**

Run each, all must be clean:

```bash
npm run lint
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: lint 0 errors; tsc clean (the `app/(app)/calendar/page.tsx` error is gone with the file); full unit suite green; build succeeds and the route list has NO `/calendar` while `/leads` and `/jobs` are present.

No DB files changed in this plan, so pgTAP is not re-run.

- [ ] **Step 7: Commit**

```bash
git add lib/nav.ts lib/calendar.ts tests/unit/nav.test.ts tests/unit/calendar.test.ts
git commit -m "refactor(calendar): retire the standalone /calendar page

Calendar now lives as a view mode on /leads and /jobs, so the nav item,
the page, and monthWindow() (its only caller was the page's month-scoped
fetch) all go. Nav renumbered 01-09."
```

- [ ] **Step 8: Update the ledger**

Append a dated entry to `.superpowers/sdd/progress.md` recording: tasks completed, commits, battery results, and the walkthrough checklist below. Commit as `docs(ledger): calendar-as-view wave closeout`.

---

## Owner Walkthrough Checklist

Run on the local stack (`npx supabase start`, `npm run dev`), all three seeded roles:

- [ ] Nav has no Calendar item for admin, rep, or cleaner; numbering reads 01-09 with no gap
- [ ] `/leads`: toggle shows Board · List · Calendar; Calendar highlights when active
- [ ] Leads calendar: leads sit on the day they were created, colored by status
- [ ] Prev / Today / Next move months and stay inside `/leads?view=calendar`
- [ ] Lead chip opens the LeadDrawer; closing it returns to the same month, still in Calendar
- [ ] `+ New lead` from calendar opens the drawer; closing returns to the calendar month
- [ ] Export CSV and History (admin) behave the same as in List view
- [ ] `/jobs`: same toggle; jobs sit on their scheduled date; done jobs visible; unscheduled absent
- [ ] Job chip opens the JobDrawer; close returns to the same month in Calendar
- [ ] Cleaner on `/jobs?view=calendar`: sees only their own jobs, no History, no + New job
- [ ] Phone width: cells collapse to count dots; tapping a day opens the day panel
- [ ] Claim a job in a second window — the calendar refreshes on its own (realtime)

## Notes for the reviewer

- Day-panel heading still shows the raw ISO date (`2026-07-14`). Pre-existing, owner-flagged as
  cosmetic on the small-changes walkthrough; unchanged here.
- Export CSV is deliberately whole-set, not month-scoped (spec decision).
- `?deleted=1` (History) still wins over `?view=calendar` on both hosts — existing precedence,
  untouched.
