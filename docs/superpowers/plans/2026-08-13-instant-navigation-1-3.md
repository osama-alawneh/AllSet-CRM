# Instant Navigation (backlog item 10, fixes 1-3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a navigation feel instant — the page chrome appears the moment a link is clicked, with shimmering placeholders where the data will land — without changing what any user is allowed to see.

**Architecture:** Three independent levers, none of which touch data access. (1) A `loading.tsx` per route rendering a skeleton shaped like that route's real screen, so Next has something to show the instant a link is clicked. (2) That loading boundary is also the precondition Next requires before it will prefetch a dynamic route, so hovering a nav link starts warming the page for free. (3) `experimental.staleTimes.dynamic` gives the client router cache a short TTL, so returning to a page just visited costs no server round trip at all.

**Tech Stack:** Next.js 16.2.10 (App Router), React 19.2, hand-written CSS in `app/globals.css` driven by theme tokens, Vitest 3 + Testing Library.

**Spec:** `docs/owner-requests-backlog.md` — item 10 ("Navigation feels slow — measured, with a ranked fix list"), fixes 1-3 only.

## Global Constraints

- **This is not the Next.js in your training data.** Read `node_modules/next/dist/docs/01-app/02-guides/prefetching.md` and `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md` before writing code. Per `AGENTS.md`, the bundled docs win over memory.
- **Do NOT enable `cacheComponents`.** That is backlog item 6 and carries an RLS cross-user cache-leak hazard. This plan adds no `use cache` anywhere.
- **Do NOT touch `lib/auth.ts`, `proxy.ts`, or any `getRole`/`getSession` call site.** Those are items 4-5 and are auth-path changes.
- **No new dependencies.** Skeletons are plain components plus CSS.
- **Styling follows the existing system**: hand-written rules in `app/globals.css` using theme tokens (`--surface-2`, `--chip`, `--line`, `--r-sm`). Do not introduce Tailwind utility soup for this; the app's own CSS is the pattern.
- **Reduced motion is already handled globally** at `app/globals.css:475` — `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }`. Do not add a second opt-out.
- **Consistency is rule #1** for this codebase's frontend. Every skeleton reuses the real screen's own class names (`.screen`, `.scrhead`, `.panel`, `.box`, `.tblwrap`, `.tbl`, `.kpis`, `.kpi`, `.kanban`, `.col`, `.grid2`, `.screen-fill`) so the placeholder occupies the same box as the thing it stands in for. A skeleton that does not match its page's proportions causes layout shift on swap and is a defect.
- **Tests** live in `tests/unit/<Name>.render.test.tsx`, Vitest + Testing Library, run with `npm test`. Full battery must stay green: 327 passing at branch point.
- **`vitest.config.ts` sets `environment: 'node'` globally.** Every test that renders JSX must open with the docblock `// @vitest-environment jsdom`, exactly as the existing render tests do. Omit it and the test dies on `document is not defined`.
- **`@testing-library/jest-dom` is NOT installed.** Matchers like `toHaveAttribute` and `toHaveClass` do not exist here. Assert with `getAttribute`, `classList.contains`, and `style.width` as the tests below do.
- **Accessibility:** each skeleton screen is a single `role="status"` region with `aria-busy="true"` and a meaningful `aria-label`. Individual shimmer bars are decorative and carry `aria-hidden="true"`. Never signal loading by animation alone.

---

## File Structure

**Create:**
- `components/skeleton/Skeleton.tsx` — every skeleton primitive. One file: they are tiny, always change together, and are meaningless apart.
- `app/(app)/dashboard/loading.tsx`, `app/(app)/customers/loading.tsx`, `app/(app)/jobs/loading.tsx`, `app/(app)/leads/loading.tsx`, `app/(app)/invoices/loading.tsx`, `app/(app)/expenses/loading.tsx`, `app/(app)/cleaners/loading.tsx`, `app/(app)/settings/loading.tsx`, `app/(app)/map/loading.tsx` — each composes primitives into that route's shape.
- `tests/unit/Skeleton.render.test.tsx`, `tests/unit/loading.render.test.tsx`, `tests/unit/next-config.test.ts`

**Modify:**
- `app/globals.css` — add the `.sk` shimmer rules at the end of the file.
- `next.config.ts` — add `experimental.staleTimes`.

**Do not modify:** any `page.tsx`, any component under `components/` other than the new folder, `lib/auth.ts`, `proxy.ts`, `vercel.json`.

---

### Task 1: Skeleton primitives and their shimmer

**Files:**
- Create: `components/skeleton/Skeleton.tsx`
- Modify: `app/globals.css` (append at end of file)
- Test: `tests/unit/Skeleton.render.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces, all named exports from `components/skeleton/Skeleton.tsx`:
  - `SkeletonScreen({ label, children }: { label: string; children: React.ReactNode })` — renders `<section className="screen" role="status" aria-busy="true" aria-label={"Loading " + label}>`
  - `SkeletonBar({ w, h }: { w?: string; h?: number })` — one shimmer bar; `w` defaults `'100%'`, `h` defaults `12`
  - `SkeletonHead({ actions }: { actions?: number })` — the `.scrhead` title-plus-buttons row; `actions` defaults `2`
  - `SkeletonTable({ cols, rows }: { cols: number; rows?: number })` — `.panel.box > .tblwrap > table.tbl`; `rows` defaults `6`
  - `SkeletonKpis({ count }: { count?: number })` — `.kpis` grid of `.kpi.box`; `count` defaults `4`
  - `SkeletonBoard({ cols, cards }: { cols?: number; cards?: number })` — `.kanban` of `.col.box`; defaults `4` and `3`
  - `SkeletonPanel({ lines }: { lines?: number })` — `.panel.box` with `lines` bars; `lines` defaults `4`
  - `SkeletonFill()` — one large `.box.sk-fill` for the map screen

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/unit/Skeleton.render.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  SkeletonScreen, SkeletonBar, SkeletonHead, SkeletonTable,
  SkeletonKpis, SkeletonBoard, SkeletonPanel, SkeletonFill,
} from '@/components/skeleton/Skeleton';

describe('Skeleton primitives', () => {
  it('announces the screen as busy, with a label naming what is loading', () => {
    render(<SkeletonScreen label="jobs"><SkeletonBar /></SkeletonScreen>);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.getAttribute('aria-label')).toBe('Loading jobs');
    expect(region.classList.contains('screen')).toBe(true);
  });

  it('hides decorative bars from assistive tech', () => {
    const { container } = render(<SkeletonBar w="40%" h={20} />);
    const bar = container.querySelector('.sk') as HTMLElement;
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(bar.style.width).toBe('40%');
    expect(bar.style.height).toBe('20px');
  });

  it('renders a table skeleton with the real table chrome and requested shape', () => {
    const { container } = render(<SkeletonTable cols={5} rows={3} />);
    expect(container.querySelector('.panel.box')).toBeTruthy();
    expect(container.querySelector('.tblwrap')).toBeTruthy();
    expect(container.querySelectorAll('table.tbl thead th')).toHaveLength(5);
    expect(container.querySelectorAll('table.tbl tbody tr')).toHaveLength(3);
    expect(container.querySelectorAll('table.tbl tbody td')).toHaveLength(15);
  });

  it('defaults the table to six rows', () => {
    const { container } = render(<SkeletonTable cols={2} />);
    expect(container.querySelectorAll('table.tbl tbody tr')).toHaveLength(6);
  });

  it('renders the head row with a title bar plus the requested action buttons', () => {
    const { container } = render(<SkeletonHead actions={3} />);
    expect(container.querySelector('.scrhead')).toBeTruthy();
    expect(container.querySelectorAll('.scrhead .sk')).toHaveLength(4);
  });

  it('renders KPI, board, panel and fill shapes with the real class names', () => {
    const kpis = render(<SkeletonKpis count={3} />).container;
    expect(kpis.querySelectorAll('.kpis .kpi.box')).toHaveLength(3);

    const board = render(<SkeletonBoard cols={2} cards={4} />).container;
    expect(board.querySelectorAll('.kanban .col.box')).toHaveLength(2);
    expect(board.querySelectorAll('.kanban .col.box .sk')).toHaveLength(10);

    const panel = render(<SkeletonPanel lines={2} />).container;
    expect(panel.querySelectorAll('.panel.box .sk')).toHaveLength(2);

    const fill = render(<SkeletonFill />).container;
    expect(fill.querySelector('.box.sk-fill')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/Skeleton.render.test.tsx`

Expected: FAIL with `Failed to resolve import "@/components/skeleton/Skeleton"`.

- [ ] **Step 3: Write the component file**

```tsx
// components/skeleton/Skeleton.tsx
// Route-level loading skeletons. Every piece reuses the class names of the screen it
// stands in for (.screen, .scrhead, .panel, .tbl, .kpis, .kanban), so the placeholder
// occupies the same box as the real content and the swap causes no layout shift.
//
// Server components by design: they render inside loading.tsx, which Next serves before
// any client JS for the route has run.

export function SkeletonBar({ w = '100%', h = 12 }: { w?: string; h?: number }) {
  return <span className="sk" style={{ width: w, height: h }} aria-hidden="true" />;
}

// One busy region per screen rather than one per bar: assistive tech should hear
// "loading jobs" once, not forty times.
export function SkeletonScreen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="screen" role="status" aria-busy="true" aria-label={`Loading ${label}`}>
      {children}
    </section>
  );
}

export function SkeletonHead({ actions = 2 }: { actions?: number }) {
  return (
    <div className="scrhead">
      <SkeletonBar w="180px" h={22} />
      <div className="sk-actions">
        {Array.from({ length: actions }, (_, i) => (
          <SkeletonBar key={i} w="92px" h={34} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <div className="panel box">
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              {Array.from({ length: cols }, (_, i) => (
                <th key={i}><SkeletonBar w="70%" h={9} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c}><SkeletonBar w={c === 0 ? '80%' : '55%'} h={11} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="kpis">
      {Array.from({ length: count }, (_, i) => (
        <div className="kpi box" key={i}>
          <SkeletonBar w="55%" h={10} />
          <div className="sk-gap" />
          <SkeletonBar w="40%" h={28} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBoard({ cols = 4, cards = 3 }: { cols?: number; cards?: number }) {
  return (
    <div className="kanban">
      {Array.from({ length: cols }, (_, i) => (
        <div className="col box" key={i}>
          <SkeletonBar w="45%" h={10} />
          {Array.from({ length: cards }, (_, c) => (
            <SkeletonBar key={c} w="100%" h={62} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonPanel({ lines = 4 }: { lines?: number }) {
  return (
    <div className="panel box">
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBar key={i} w={i === 0 ? '35%' : '100%'} h={i === 0 ? 14 : 11} />
      ))}
    </div>
  );
}

export function SkeletonFill() {
  return <div className="box sk-fill" aria-hidden="true" />;
}
```

- [ ] **Step 4: Add the shimmer CSS**

Append to the end of `app/globals.css`:

```css
/* ===== Route-level loading skeletons =====
   The shimmer rides the existing surface tokens so a pending screen keeps the skin.
   No reduced-motion opt-out here on purpose: the global rule above already kills every
   animation for users who ask for that, and a second one would only drift. */
.sk {
  display: block;
  border-radius: var(--r-sm);
  background: linear-gradient(90deg, var(--surface-2), var(--chip), var(--surface-2));
  background-size: 200% 100%;
  animation: skshimmer 1.3s ease-in-out infinite;
}
@keyframes skshimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.sk-actions { display: flex; gap: 8px; }
.sk-gap { height: 12px; }
.kpi.box .sk, .col.box .sk, .panel.box .sk { margin-bottom: 8px; }
.col.box .sk:last-child, .panel.box .sk:last-child { margin-bottom: 0; }
.sk-fill { flex: 1; min-height: 420px; }
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run tests/unit/Skeleton.render.test.tsx`

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add components/skeleton/Skeleton.tsx tests/unit/Skeleton.render.test.tsx app/globals.css
git commit -m "feat(ui): skeleton primitives for route-level loading states"
```

---

### Task 2: Client route cache TTL

**Files:**
- Modify: `next.config.ts`
- Test: `tests/unit/next-config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `next.config.ts` default export gains `experimental.staleTimes = { dynamic: 30, static: 180 }`.

Why these numbers: per `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md`, `dynamic` has defaulted to **0 seconds** since v15 — so today nothing is reused and every revisit is a fresh round trip. 30s is long enough that flipping between Jobs and Customers while working a call is instant, and short enough that a stale list cannot outlive that call. `static` keeps the same order of magnitude as Next's own 5-minute default, at 180s, for prefetched shells.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/next-config.test.ts
import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

describe('next config', () => {
  // Guards the client router cache: at the 0s default, revisiting a page always costs a
  // server round trip, which is half of what backlog item 10 measured.
  it('gives the client router cache a non-zero TTL for dynamic routes', () => {
    expect(nextConfig.experimental?.staleTimes?.dynamic).toBe(30);
    expect(nextConfig.experimental?.staleTimes?.static).toBe(180);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/next-config.test.ts`

Expected: FAIL — received `undefined`.

- [ ] **Step 3: Write the config**

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache. `dynamic` has defaulted to 0s since Next 15, so every revisit
    // to an already-seen page costs a fresh server round trip; 30s makes flipping between
    // screens instant without letting a list go meaningfully stale. `static` covers
    // prefetched loading shells. Backlog item 10, fix 3.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/next-config.test.ts`

Expected: PASS.

- [ ] **Step 5: Confirm the build accepts the config**

Run: `npm run build`

Expected: compiles, with no warning naming `staleTimes` as unrecognised. If Next reports the key as unknown, stop — do not invent a replacement key. Re-read the bundled `staleTimes.md` and follow what that version documents.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts tests/unit/next-config.test.ts
git commit -m "perf: give the client router cache a 30s TTL for dynamic routes"
```

---

### Task 3: Loading shells for the table-shaped routes

Covers `/customers`, `/invoices`, `/expenses`, `/settings` — all four render `.screen > .scrhead` followed by `.panel.box > .tblwrap > table.tbl`.

**Files:**
- Create: `app/(app)/customers/loading.tsx`, `app/(app)/invoices/loading.tsx`, `app/(app)/expenses/loading.tsx`, `app/(app)/settings/loading.tsx`
- Test: `tests/unit/loading.render.test.tsx`

**Interfaces:**
- Consumes: `SkeletonScreen`, `SkeletonHead`, `SkeletonTable` from Task 1.
- Produces: a default-exported component per route. Next requires the default export; it takes no props.

Column counts come from the real tables so the placeholder does not resize on swap. Counted from the source on 2026-08-13: `components/customers/CustomersTable.tsx` **5** (`Customer, Address, Type, Jobs`, plus an admin-only `Invoices` — the skeleton shows the admin width, since it cannot know the viewer's role), `components/invoices/InvoicesTable.tsx` **6**, `components/expenses/ExpensesSection.tsx` **6**, `components/settings/UsersPanel.tsx` **6**. If a table has changed since, trust the code and update both the `loading.tsx` and the test.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/unit/loading.render.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CustomersLoading from '@/app/(app)/customers/loading';
import InvoicesLoading from '@/app/(app)/invoices/loading';
import ExpensesLoading from '@/app/(app)/expenses/loading';
import SettingsLoading from '@/app/(app)/settings/loading';

describe('table-shaped loading shells', () => {
  it.each([
    ['customers', CustomersLoading, 5],
    ['invoices', InvoicesLoading, 6],
    ['expenses', ExpensesLoading, 6],
    ['settings', SettingsLoading, 6],
  ] as const)('%s renders a busy screen with a table skeleton', (label, Comp, cols) => {
    const { container, unmount } = render(<Comp />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.getAttribute('aria-label')).toBe(`Loading ${label}`);
    expect(container.querySelector('.scrhead')).toBeTruthy();
    expect(container.querySelectorAll('table.tbl thead th')).toHaveLength(cols);
    unmount();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/loading.render.test.tsx`

Expected: FAIL — cannot resolve `@/app/(app)/customers/loading`.

- [ ] **Step 3: Write the four files**

```tsx
// app/(app)/customers/loading.tsx
// Shown the instant a link to /customers is clicked, and — because a loading boundary
// exists at all — this is also what Next prefetches on hover. Mirrors CustomersTable.
import { SkeletonScreen, SkeletonHead, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function CustomersLoading() {
  return (
    <SkeletonScreen label="customers">
      <SkeletonHead />
      <SkeletonTable cols={5} rows={8} />
    </SkeletonScreen>
  );
}
```

```tsx
// app/(app)/invoices/loading.tsx
import { SkeletonScreen, SkeletonHead, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function InvoicesLoading() {
  return (
    <SkeletonScreen label="invoices">
      <SkeletonHead />
      <SkeletonTable cols={6} rows={7} />
    </SkeletonScreen>
  );
}
```

```tsx
// app/(app)/expenses/loading.tsx
import { SkeletonScreen, SkeletonHead, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function ExpensesLoading() {
  return (
    <SkeletonScreen label="expenses">
      <SkeletonHead />
      <SkeletonTable cols={6} rows={7} />
    </SkeletonScreen>
  );
}
```

```tsx
// app/(app)/settings/loading.tsx
import { SkeletonScreen, SkeletonHead, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function SettingsLoading() {
  return (
    <SkeletonScreen label="settings">
      <SkeletonHead actions={1} />
      <SkeletonTable cols={6} rows={5} />
    </SkeletonScreen>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/loading.render.test.tsx`

Expected: PASS, 4 cases.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/customers/loading.tsx" "app/(app)/invoices/loading.tsx" "app/(app)/expenses/loading.tsx" "app/(app)/settings/loading.tsx" tests/unit/loading.render.test.tsx
git commit -m "feat(ui): loading shells for the table-shaped screens"
```

---

### Task 4: Loading shells for the board, dashboard, cleaners and map routes

**Files:**
- Create: `app/(app)/jobs/loading.tsx`, `app/(app)/leads/loading.tsx`, `app/(app)/dashboard/loading.tsx`, `app/(app)/cleaners/loading.tsx`, `app/(app)/map/loading.tsx`
- Modify: `tests/unit/loading.render.test.tsx` (append a second `describe` block)

**Interfaces:**
- Consumes: `SkeletonScreen`, `SkeletonHead`, `SkeletonBoard`, `SkeletonKpis`, `SkeletonPanel`, `SkeletonTable`, `SkeletonFill` from Task 1.
- Produces: a default-exported component per route, no props.

`/jobs` and `/leads` default to their board view (`JobsBoard` and `KanbanBoard` both render `.kanban`), so the board skeleton is the right default even though both routes can also render list or calendar views via `?view=`. A loading shell cannot read search params — it renders before the page does — so it must match the *default* view, which is where most navigations land. `/map` uses `.screen.screen-fill`, so its skeleton has to fill too.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/loading.render.test.tsx` (the imports go with the existing ones at the top):

```tsx
import JobsLoading from '@/app/(app)/jobs/loading';
import LeadsLoading from '@/app/(app)/leads/loading';
import DashboardLoading from '@/app/(app)/dashboard/loading';
import CleanersLoading from '@/app/(app)/cleaners/loading';
import MapLoading from '@/app/(app)/map/loading';

describe('board, dashboard, cleaners and map loading shells', () => {
  it.each([
    ['jobs', JobsLoading],
    ['leads', LeadsLoading],
  ] as const)('%s shows a kanban-shaped skeleton', (label, Comp) => {
    const { container, unmount } = render(<Comp />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(`Loading ${label}`);
    expect(container.querySelectorAll('.kanban .col.box').length).toBeGreaterThanOrEqual(3);
    unmount();
  });

  it('dashboard shows KPI tiles above panels, with no head row', () => {
    const { container } = render(<DashboardLoading />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Loading dashboard');
    expect(container.querySelectorAll('.kpis .kpi.box')).toHaveLength(4);
    expect(container.querySelectorAll('.grid2 .panel.box')).toHaveLength(2);
    // The real dashboard opens straight onto .kpis — a title bar here would shift the layout.
    expect(container.querySelector('.scrhead')).toBeNull();
  });

  it('cleaners shows the leaderboard table, with no head row', () => {
    const { container } = render(<CleanersLoading />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Loading cleaners');
    expect(container.querySelectorAll('table.tbl thead th')).toHaveLength(4);
    // The real /cleaners screen is <section className="screen"><Leaderboard /></section> —
    // no .scrhead — so a title bar here would be a placeholder for nothing.
    expect(container.querySelector('.scrhead')).toBeNull();
  });

  it('map fills the screen so the layout does not jump when tiles arrive', () => {
    const { container } = render(<MapLoading />);
    const region = screen.getByRole('status');
    expect(region.classList.contains('screen-fill')).toBe(true);
    expect(container.querySelector('.sk-fill')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/loading.render.test.tsx`

Expected: FAIL — cannot resolve `@/app/(app)/jobs/loading`.

- [ ] **Step 3: Write the five files**

```tsx
// app/(app)/jobs/loading.tsx
// /jobs defaults to the board view (JobsBoard -> .kanban). A loading shell renders before
// the page does and so cannot read ?view=; matching the default is the best it can do.
import { SkeletonScreen, SkeletonHead, SkeletonBoard } from '@/components/skeleton/Skeleton';

export default function JobsLoading() {
  return (
    <SkeletonScreen label="jobs">
      <SkeletonHead actions={3} />
      <SkeletonBoard cols={4} cards={3} />
    </SkeletonScreen>
  );
}
```

```tsx
// app/(app)/leads/loading.tsx
import { SkeletonScreen, SkeletonHead, SkeletonBoard } from '@/components/skeleton/Skeleton';

export default function LeadsLoading() {
  return (
    <SkeletonScreen label="leads">
      <SkeletonHead actions={3} />
      <SkeletonBoard cols={4} cards={3} />
    </SkeletonScreen>
  );
}
```

```tsx
// app/(app)/dashboard/loading.tsx
// The real dashboard opens straight onto .kpis with no .scrhead, so there is no title bar
// to stand in for. It then lays panels out in .grid2.
import { SkeletonScreen, SkeletonKpis, SkeletonPanel } from '@/components/skeleton/Skeleton';

export default function DashboardLoading() {
  return (
    <SkeletonScreen label="dashboard">
      <SkeletonKpis count={4} />
      <div className="grid2">
        <SkeletonPanel lines={6} />
        <SkeletonPanel lines={4} />
      </div>
    </SkeletonScreen>
  );
}
```

```tsx
// app/(app)/cleaners/loading.tsx
// /cleaners is <section className="screen"><Leaderboard /></section> and nothing else, and
// Leaderboard is a .panel.box wrapping a 4-column .tbl. No .scrhead, so no head skeleton.
import { SkeletonScreen, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function CleanersLoading() {
  return (
    <SkeletonScreen label="cleaners">
      <SkeletonTable cols={4} rows={6} />
    </SkeletonScreen>
  );
}
```

```tsx
// app/(app)/map/loading.tsx
// The map screen is .screen.screen-fill, so its placeholder has to fill too — a short
// skeleton here would collapse the layout and then jump when tiles arrive.
import { SkeletonFill } from '@/components/skeleton/Skeleton';

export default function MapLoading() {
  return (
    <section className="screen screen-fill" role="status" aria-busy="true" aria-label="Loading map">
      <SkeletonFill />
    </section>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/loading.render.test.tsx`

Expected: PASS — 4 table cases plus 5 from this task.

- [ ] **Step 5: Run the whole battery**

Run: `npm test`

Expected: all previously passing tests still pass, plus the new ones. Nothing should regress: no existing file was modified except `app/globals.css` and `next.config.ts`.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/jobs/loading.tsx" "app/(app)/leads/loading.tsx" "app/(app)/dashboard/loading.tsx" "app/(app)/cleaners/loading.tsx" "app/(app)/map/loading.tsx" tests/unit/loading.render.test.tsx
git commit -m "feat(ui): loading shells for the board, dashboard, cleaners and map screens"
```

---

### Task 5: Prove it on the real deployment, then record the result

Unit tests prove the skeletons render. They cannot prove a navigation got faster. This task measures the deployed result, because the point of fixes 1-3 is a number and a feel, not a component.

**Files:**
- Modify: `docs/owner-requests-backlog.md` (mark item 10 fixes 1-3 done, with measured numbers)
- Modify: `.superpowers/sdd/progress.md` (status entry)

- [ ] **Step 1: Full local verification**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`

Expected: no type errors, no lint errors, full battery green, clean build. Do not proceed on a red result.

- [ ] **Step 2: Deploy a preview and capture the numbers**

```bash
npx vercel deploy --yes
```

Against the returned preview URL, with a session cookie (the probe script that mints one is on branch `perf/latency-probe`), measure both a prefetch and a navigation:

```bash
npx vercel curl "<preview-url>/jobs" -H "Cookie: $C" -H "RSC: 1" -H "Next-Router-Prefetch: 1" -s -o /dev/null -w "prefetch TTFB %{time_starttransfer}s size %{size_download}\n"
npx vercel curl "<preview-url>/jobs" -H "Cookie: $C" -H "RSC: 1" -s -o /dev/null -w "nav TTFB %{time_starttransfer}s size %{size_download}\n"
```

Baseline to beat, measured on production 2026-08-13 before this work: `/dashboard` RSC navigation 310-520ms, `/customers` 317-518ms, and **no prefetch at all** — dynamic routes were not prefetchable without a loading boundary.

Expected now: the prefetch request returns the loading shell quickly, and a click paints that shell immediately instead of leaving the old page on screen.

- [ ] **Step 3: Confirm the behaviour by eye, in a browser**

Load the preview and click between Dashboard, Jobs and Customers. What should happen: the screen changes **immediately** to a shimmering version of the destination, then fills with real rows. What must NOT happen: a blank page, a full-screen spinner, or the layout jumping when real data replaces the skeleton. A jump means a skeleton's shape is wrong — fix its row/column counts rather than accepting it.

- [ ] **Step 4: Record the outcome**

Update item 10 in `docs/owner-requests-backlog.md`: mark fixes 1-3 done with the commit range and the measured before/after, and leave 4-6 exactly as written. Add a status entry to `.superpowers/sdd/progress.md` naming what shipped and the numbers.

- [ ] **Step 5: Commit**

```bash
git add docs/owner-requests-backlog.md .superpowers/sdd/progress.md
git commit -m "docs: record the instant-navigation result for backlog item 10"
```

---

## Notes for whoever executes this

**What this plan deliberately does not do:** it does not restructure any `page.tsx` to stream its data behind in-page `<Suspense>` boundaries. That would let the *real* chrome paint while only the rows shimmer, which is better still — but it means moving every page's data fetching into child components, and it interacts directly with backlog item 6 (Cache Components). That is separate work with its own spec, and this plan's win does not depend on it.

**If a skeleton looks wrong in the browser,** the fix is its row/column counts in the `loading.tsx`, plus the matching assertion in `tests/unit/loading.render.test.tsx`. Do not paper over layout shift with CSS hacks in `.sk` — the shape is the contract.
