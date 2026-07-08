# Wave 3 + Map Search/Job Pins — Combined Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **SUPERSEDES** `2026-07-07-wave3-mobilenav-a11y-polish.md` and `2026-07-07-map-search-jobs-pins.md`. Those two plans collide on `SchematicMap.tsx`, `MapboxMap.tsx`, `MiniMap.tsx`, and `globals.css`; this document merges them with the collisions resolved (Wave 3's pin-button a11y fix is baked into the map rewrite tasks instead of applied before/after them).

**Goal:** Hamburger mobile nav + dialog/tabs/combobox ARIA + route loading/error states + kanban drag handles (Wave 3), then job pins / address search / layer toggles on the map (map feature), then review-rider sweep, then CRM-owner quick wins and medium changes (Tiers 1–2 of the 2026-07-08 owner request list) — as one sequential wave.

**Architecture:** Phase A (Tasks 1–7) is Wave 3's shell/a11y work, none of which touches map files. Phase B (Tasks 8–12) is the map feature; its whole-file rewrites of `SchematicMap`/`MapView`/`Legend`/`MiniMap` now ship pins as real `<button>`s (Wave 3 finding UI-12) and the schematic street/block chrome (UI-9), so nothing is reverted. Phase C (Tasks 13–14) is the riders sweep and mid-wave verification. Phase D (Tasks 15–18) is the owner's Tier-1 quick wins (spinners, autofill, copy button, invoice statuses, service option set, job datetime). Phase E (Tasks 19–23) is Tier 2 (customer lookup combobox, customer deactivation, lead/job soft-delete history + restore, lead rep attribution, final verification). Task 1 must precede Task 2 (mobile nav reuses the upgraded Drawer); Task 19 reuses Task 12's `.searchbox` CSS. Tasks within a phase that both append to `globals.css` must run sequentially, not as parallel workers.

**Deferred (Tier 3, separate spec + brainstorm before planning):** job money split (`price` vs `cleaner_amount`), join requests + multi-owner jobs, expenses/true revenue, cleaner earnings board + leaderboard, recurring jobs, user-profile earnings totals. Owner decisions already locked 2026-07-08: waived/cancelled are two distinct invoice statuses; `cleaner_amount` typed manually per job; first claimer auto-approved as owner; co-owner cleaners may see the shared cleaner pool (but never `price`).

**Tech Stack:** Next.js 16.2.10 App Router (`loading.tsx`/`error.tsx` conventions — verify in `node_modules/next/dist/docs/`), React 19, mapbox-gl (already installed), Supabase (`jobs_public` view), Vitest (node env; jsdom added in Task 13), plain CSS tokens.

**Specs:** `docs/superpowers/specs/2026-07-07-map-search-jobs-pins-design.md` (map phase); Wave 3 scope from `docs/superpowers/2026-07-07-multiagent-review-findings.md`.

## Global Constraints

- **Next.js 16 breaking changes** — verify every Next convention used here against `node_modules/next/dist/docs/` before writing (repo `AGENTS.md`).
- No new npm dependencies, EXCEPT Task 13 Step 6's dev-deps (`@testing-library/react`, `jsdom`) which were user-approved in the Wave 3 amendment.
- Money never reaches non-admin clients: jobs are fetched from `jobs_public` only for non-admins (price is not needed for pins).
- Cleaner job visibility must go through `visibleJobs(role, uid, jobs)` — identical to the jobs board rules.
- `mapbox-gl` and its CSS may only be imported inside `components/map/MapboxMap.tsx` (never in a server file); dynamic import with `ssr: false` stays as-is.
- Search UI renders only when `pickMapImpl(token) === 'mapbox'` (schematic mode has no geocoding).
- Touch targets ≥ 44px (wave-2 convention); suggestion rows and toggle chips must meet this.
- Blueprint+ styling: all new UI (hamburger, skeletons, error card, search box, chips) uses existing tokens/classes (`.box`, `.lbl`, `.btn`, tokens) — no new colors except where a step names one.
- Every task ends green: `npm run lint && npx tsc --noEmit && npm test`; wave ends with `npm run build` + manual checklist.
- Commit after every task, staging only the files your task touched (the tree is clean at plan start).
- Findings log: `docs/superpowers/2026-07-07-multiagent-review-findings.md`.

---

## PHASE A — Wave 3 shell + a11y (no map files)

### Task 1: Drawer a11y upgrade — focus trap, restore, label, scroll lock (UI-3, UI-13)

**Files:**
- Modify: `components/ui/Drawer.tsx` (current file is 27 lines; full replacement below)
- Modify: every caller to pass `labelId` and put that id on its `<h2>`: grep `<Drawer` → `LeadDrawer.tsx`, `JobDrawer.tsx`, `CustomerDrawer.tsx`, `InvoiceDrawer.tsx` (confirm the list with the grep).

**Interfaces:**
- Produces: `Drawer({ onClose, labelId, children })` — `labelId?: string` new optional prop wired to `aria-labelledby`. Task 2 consumes this component for mobile nav.

- [ ] **Step 1: Replace Drawer.tsx**

```tsx
'use client';
import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({
  onClose, labelId, children,
}: {
  onClose: () => void;
  labelId?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  // Mount: remember the trigger, move focus in, lock body scroll. Unmount: undo both.
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      // Trap Tab inside the dialog (aria-modal promises this; the old version didn't deliver).
      const f = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (f.length === 0) { e.preventDefault(); ref.current.focus(); return; }
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement;
      if (!ref.current.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (active === first || active === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <aside ref={ref} tabIndex={-1} className="drawer box open" role="dialog" aria-modal="true" aria-labelledby={labelId}>
        {children}
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Wire labels in the four entity drawers**

In each caller (read each file first): the header `<h2>` gets a stable id and the `<Drawer>` gets `labelId`. Pattern (LeadDrawer shown; use `job-drawer-title`, `customer-drawer-title`, `invoice-drawer-title` in the others):

```tsx
<Drawer onClose={close} labelId="lead-drawer-title">
  ...
  <h2 id="lead-drawer-title">{...existing title expr...}</h2>
```

- [ ] **Step 3: Verify + commit**

Run: `npm run lint && npx tsc --noEmit && npm test` — clean.
Manual (`npm run dev`): open a lead drawer → Tab cycles inside only; Shift+Tab from first wraps to last; Escape closes and focus returns to the card/row that opened it; background doesn't scroll while open.

```bash
git add components/ui/Drawer.tsx components/leads/LeadDrawer.tsx components/jobs/JobDrawer.tsx components/customers/CustomerDrawer.tsx components/invoices/InvoiceDrawer.tsx
git commit -m "fix(a11y): drawer focus trap, focus restore, aria-labelledby, body scroll lock"
```

---

### Task 2: Hamburger mobile nav (MOB-H2, decision: Drawer-based)

**Files:**
- Create: `components/shell/MobileNav.tsx`
- Modify: `components/shell/Topbar.tsx` (add hamburger + nav slot)
- Modify: `app/(app)/layout.tsx` (pass sidebar node to Topbar — read it first for exact current props)
- Modify: `app/globals.css` (hide `.side` ≤860px, `.hamb` styles)

**Interfaces:**
- Consumes: `Drawer` from Task 1 (with `labelId`); `Sidebar({ role, name })` server component unchanged.
- Produces: `MobileNav({ children })` client component; `Topbar` gains optional `nav?: React.ReactNode` prop.

- [ ] **Step 1: MobileNav component**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';

export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Close on navigation — NavLinks inside are plain <Link>s.
  useEffect(() => { setOpen(false); }, [pathname]);
  return (
    <>
      <button type="button" className="iconbtn hamb" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
        ☰
      </button>
      {open && (
        <Drawer onClose={() => setOpen(false)} labelId="mobile-nav-title">
          <span id="mobile-nav-title" className="lbl">Navigation</span>
          {children}
        </Drawer>
      )}
    </>
  );
}
```

- [ ] **Step 2: Topbar slot + layout wiring**

`Topbar.tsx` — add `nav` prop, render `<MobileNav>{nav}</MobileNav>` as the FIRST element inside `.topbar` (left of the title):

```tsx
export function Topbar({ search, nav }: { search?: React.ReactNode; nav?: React.ReactNode }) {
  ...
  <div className="topbar">
    {nav && <MobileNav>{nav}</MobileNav>}
    <div> <h1>{title}</h1> ... </div>
    ...
```

`app/(app)/layout.tsx` — read the file; it renders `<Sidebar role={role} name={name} />` and `<Topbar search={...} />`. Change to pass a second Sidebar instance into the topbar (server node flows through the client boundary as children — valid RSC pattern):

```tsx
<Topbar search={...existing...} nav={<Sidebar role={role} name={name} />} />
```

The desktop `<Sidebar>` in the grid stays where it is.

- [ ] **Step 3: CSS — swap which nav is visible at 860px**

In `app/globals.css`: add `.hamb { display: none; }` near `.iconbtn` (:92). In the existing `@media (max-width: 860px)` block for `.app` (:51) add:

```css
.app > .side { display: none; }
.hamb { display: inline-flex; align-items: center; }
```

(The Drawer-hosted Sidebar keeps `.side .box` styling — it renders fine inside the drawer; verify no `position: sticky` artifact, `.drawer .side { position: static; border: 0; box-shadow: none; }` if needed.)

- [ ] **Step 4: Verify + commit**

Run: `npm run lint && npx tsc --noEmit && npm test` — clean.
Manual, device emulation ≤860px: sidebar block gone; ☰ appears in topbar; opens drawer with full nav + user card + sign-out; tapping a nav link navigates AND closes; Escape closes; desktop >860px unchanged.

```bash
git add components/shell/MobileNav.tsx components/shell/Topbar.tsx "app/(app)/layout.tsx" app/globals.css
git commit -m "feat(mobile): hamburger nav drawer at <=860px, desktop sidebar unchanged"
```

---

### Task 3: Tabs ARIA pattern (UI-8)

**Files:**
- Modify: `components/ui/Tabs.tsx` (23 lines; full replacement below)
- Modify: callers only if they must pass the new `label` prop — grep `<Tabs` (CustomerDrawer at minimum) and pass a short label like `"Customer records"`.

**Interfaces:**
- Produces: `Tabs({ tabs, label })` — `label: string` NEW REQUIRED prop (accessible name for the tablist).

- [ ] **Step 1: Replace Tabs.tsx**

```tsx
'use client';
import { useId, useState } from 'react';

export function Tabs({
  tabs, label,
}: {
  tabs: { key: string; label: string; content: React.ReactNode }[];
  label: string;
}) {
  const [on, setOn] = useState(tabs[0]?.key);
  const uid = useId();
  const idx = Math.max(0, tabs.findIndex(t => t.key === on));
  const tabId = (k: string) => `${uid}-tab-${k}`;
  const paneId = (k: string) => `${uid}-pane-${k}`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next =
      e.key === 'Home' ? tabs[0]
      : e.key === 'End' ? tabs[tabs.length - 1]
      : tabs[(idx + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setOn(next.key);
    document.getElementById(tabId(next.key))?.focus();
  };

  return (
    <>
      <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map(t => (
          <button
            key={t.key} type="button" id={tabId(t.key)} role="tab"
            aria-selected={t.key === on} aria-controls={paneId(t.key)}
            tabIndex={t.key === on ? 0 : -1}
            className={t.key === on ? 'on' : ''} onClick={() => setOn(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map(t => (
        <div
          key={t.key} id={paneId(t.key)} role="tabpanel" aria-labelledby={tabId(t.key)}
          hidden={t.key !== on} className="tabpane on"
        >
          {t.content}
        </div>
      ))}
    </>
  );
}
```

Note: panes switch to the native `hidden` attribute (always `className="tabpane on"`); the `.tabpane` display:none class dance (globals.css:200) becomes redundant for this component — leave the CSS (other markup may use it), just verify panes still show/hide.

- [ ] **Step 2: Update callers, verify, commit**

Grep `<Tabs`, add `label="..."` at each site. Run gates; manual: arrow keys move between tabs with focus, roving tabindex works (one Tab stop), panels announce.

```bash
git add components/ui/Tabs.tsx components/customers/CustomerDrawer.tsx
git commit -m "fix(a11y): ARIA tabs pattern with roving tabindex and arrow-key nav"
```

---

### Task 4: GlobalSearch combobox (UI-4)

**Files:**
- Modify: `components/search/GlobalSearch.tsx` (read whole file first; results render at :92-111)
- Modify: `app/globals.css` (`.scard.active` rule)

**Interfaces:**
- Consumes: existing search state/handlers in the file (debounced query, `results`, open flag, router push on pick — match actual names).
- Produces: nothing downstream. (Task 12's `MapSearch` is a separate, self-contained combobox for the map toolbar — same ARIA pattern, different component; no shared code expected.)

- [ ] **Step 1: Add combobox state + ARIA + keyboard nav**

Keep the existing fetch/debounce logic identical. Changes (adapt names to the file's actual state):

1. `const [active, setActive] = useState(-1);` reset to `-1` whenever results change.
2. Input gains: `role="combobox"`, `aria-expanded={show}`, `aria-controls={listId}`, `aria-activedescendant={active >= 0 ? optId(active) : undefined}`, `aria-autocomplete="list"`, and:

```tsx
onKeyDown={e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, -1)); }
  else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(results[active]); }
  else if (e.key === 'Escape') { close(); }
}}
```

**Behavior change (intended, from review):** bare Enter with no highlighted option no longer silently opens hit #1 — Enter only activates an arrow-highlighted option.

3. Results container: `role="listbox"` + `id={listId}` (from `useId()`). Each result card becomes:

```tsx
<div
  key={r.id} id={optId(i)} role="option" aria-selected={i === active}
  className={`scard${i === active ? ' active' : ''}`}
  onMouseEnter={() => setActive(i)}
  onMouseDown={e => e.preventDefault()} /* keep input focus */
  onClick={() => pick(r)}
>
```

4. globals.css near `.scard:hover` (:89): `.scard.active { background: var(--chip); }`

- [ ] **Step 2: Verify + commit**

Gates clean. Manual: type 2+ chars → ArrowDown highlights sequentially + `aria-activedescendant` updates (inspect); Enter opens highlighted customer; Escape closes; mouse hover + click still work.

```bash
git add components/search/GlobalSearch.tsx app/globals.css
git commit -m "fix(a11y): global search combobox — listbox roles, arrow-key nav, explicit Enter activation"
```

---

### Task 5: Route loading + error states (UI-6)

**Files:**
- Create: `app/(app)/loading.tsx`, `app/(app)/error.tsx`
- Reference FIRST: `node_modules/next/dist/docs/` pages for `loading` and `error` file conventions (Next 16 — confirm `error.tsx` prop shape).

- [ ] **Step 1: loading.tsx (Blueprint skeleton, tokens only)**

```tsx
export default function Loading() {
  return (
    <section className="screen" aria-busy="true" aria-label="Loading">
      <div className="kpis">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="kpi box" style={{ minHeight: 96, opacity: 0.55 }}>
            <span className="lbl">loading…</span>
          </div>
        ))}
      </div>
      <div className="panel box" style={{ minHeight: 260, opacity: 0.55 }}>
        <span className="lbl">fetching data…</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: error.tsx (client, retry via reset)**

```tsx
'use client';
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="screen">
      <div className="panel box" role="alert">
        <h3>Something went wrong</h3>
        <p className="cap">{error.digest ? `Ref ${error.digest}` : 'The last request failed.'}</p>
        <button type="button" className="btn" onClick={reset}>Retry</button>
      </div>
    </section>
  );
}
```

(Verify prop shape against the Next 16 docs before committing — Global Constraints.)

- [ ] **Step 3: Verify + commit**

Gates clean; `npm run dev` → throttle network (DevTools Slow 3G) → navigating shows the skeleton inside the shell (sidebar/topbar stay). Temporarily `throw new Error('boom')` in a page to see the error card + working Retry, then remove the throw.

```bash
git add "app/(app)/loading.tsx" "app/(app)/error.tsx"
git commit -m "feat(ux): route-level Blueprint skeleton and error boundary with retry"
```

---

### Task 6: Polish sweep (UI-7, 10, 11, 14, 15, 18, 20, 21; MOB-M5)

> Map-touching items from the original Wave 3 sweep moved out: pins-as-buttons (UI-12) and schematic chrome (UI-9) are baked into Task 10; the MiniMap "Open map" affordance is in Task 10 Step 5.

**Files:** listed per item; read each before editing.

- [ ] **Step 1: Shared rowNav + minirow keyboard (UI-7)** — `CustomerDrawer.tsx:47-57` already defines the correct helper. Extract it to `lib/rowNav.ts` exactly as-is (exported), import in `CustomerDrawer`, and apply to the `.minirow` divs in `LeadDrawer.tsx:88` and `JobDrawer.tsx:114,155` (spread the helper's props: `tabIndex={0} role="button"` + Enter/Space keydown, matching the helper's shape).

- [ ] **Step 2: role="alert" + .form-err (UI-11)** — add class `.form-err { color: var(--lost); font-size: 12px; }` to globals.css. Replace the copy-pasted `<p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>` with `<p className="form-err" role="alert">{error}</p>` in: `LeadDrawer.tsx:138`, `JobDrawer.tsx:181`, `KanbanBoard.tsx:88`, `JobsBoard.tsx:108`, `InvoiceDrawer.tsx:200`, `ClaimableJobs.tsx:32`, `PinPopover.tsx:61` (grep `var(--lost), fontSize: 12` to confirm the full list — line numbers may have drifted since the DndContext id fix).

- [ ] **Step 3: PinPopover Escape + edge clamp (UI-20, MOB-M5)** — in `PinPopover.tsx`: add Escape handling on the autoFocus input's `onKeyDown` (`if (e.key === 'Escape') onCancel();`) plus a container `onKeyDown` fallback; clamp position: `style={{ left: \`min(max(${xPct}%, 120px), calc(100% - 120px))\`, top: \`${yPct}%\` }}` (230px popover ⇒ 115px half-width + margin).

- [ ] **Step 4: ThemeToggle server prop (UI-10)** — layout already reads the theme cookie (`app/layout.tsx:12`). Thread `theme` down: `(app)/layout.tsx` reads the same cookie (or receives it), passes `<Topbar theme={theme} ...>` → `<ThemeToggle initial={theme} />`; `ThemeToggle` initializes `useState(initial === 'dark')` instead of sniffing `document`. Read `ThemeToggle.tsx` first and keep its cookie-write logic untouched.

- [ ] **Step 5: Small gates** —
  - `CustomersTable.tsx:32` (UI-14): the component needs a `canCreate: boolean` prop (wired from the page's role, same pattern as `KanbanBoard`'s `canEdit`); render the "+ New customer" button only when true. Update `customers/page.tsx` to pass it (`role !== 'cleaner'`).
  - `UsersPanel.tsx:39-44` (UI-15): add `aria-label="Full name" / "Email" / "Password" / "Role"` to the three inputs + role select in the create form (mirror the table's existing `aria-label` idiom at :66).
  - Dashboard KPI grid (UI-18): `globals.css:103` → `.kpis { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }` (keep the existing narrower breakpoints if they still make sense after auto-fit — likely deletable).
  - Offline page dark support (UI-21): in `app/offline/page.tsx`'s inline styles, add a `<style>{`@media (prefers-color-scheme: dark) { ... }`}</style>` block overriding the hardcoded light colors with the dark token literals (`#070d18` paper, `#dce6f5` ink) — keep everything inline/self-contained (no external CSS; the page must render offline).

- [ ] **Step 6: Verify + commit**

Gates clean (`npm run lint && npx tsc --noEmit && npm test`), `npm run build` clean.

```bash
git add -A
git commit -m "fix(polish): row keyboard nav, alert roles, popover clamp+escape, theme toggle SSR, role-gated buttons, labels, KPI auto-fit, offline dark"
```

---

### Task 7: Kanban drag-handle restructure (Wave 2 final-review adjudication, user-approved 2026-07-07)

**Files:**
- Modify: `components/leads/LeadCard.tsx`, `components/jobs/JobCard.tsx`
- Modify: `app/globals.css` (`.draghandle` rule)

**Interfaces:**
- Consumes: dnd-kit `useDraggable`'s `setActivatorNodeRef` (supported by installed version — verify in `node_modules/@dnd-kit/core`).
- Produces: `.draghandle` class; removes the nested-widget ARIA violation Wave 2 shipped (title `<button>` inside `role="button"` root). Task 13 Step 6's render smoke tests assert this exact structure.

Why: the Wave 2 card structure nests a real `<button>` inside a `role="button"` draggable root — ARIA children-presentational violation, inconsistent screen-reader behavior; the title button is also a mouse/touch drag dead zone. Target structure (per Wave 2 final review):

- [ ] **Step 1: Split activator from draggable node (both cards)** — Card root becomes a plain `<div ref={setNodeRef}>`: remove `{...attributes}` from it (no `role`, no `tabIndex`), KEEP the spread `{...listeners}`' mouse/touch drag surface behavior (root still receives `onMouseDown`/`onTouchStart`) and the `downPos` travel tracking + `onClick` open. Add a small drag-handle button as the card's first child: `<button type="button" className="draghandle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label="Move card">⠿</button>` (aria-label "Move job" in JobCard). Keyboard drag (Enter pick up / arrows / Enter drop) now lives ONLY on the handle; `aria-describedby` from `attributes` rides along.
- [ ] **Step 2: Simplify child-button suppression** — With no `onKeyDown` listener on the root, the title/Claim/locked buttons' `onKeyDown` stopPropagation becomes dead weight — remove it. Title button: before removing its `onMouseDown`/`onTouchStart` stops, note the root's drag listeners now cover the title area; a drag that starts and ends on the title must NOT fire `onOpen` — either give the title's `onClick` the same `downPos` travel check the root uses, or keep the title's mousedown/touchstart stops (title stays non-draggable). Pick whichever keeps behavior obviously correct; note the choice in the commit body. Claim/locked buttons keep their mousedown/touchstart stops.
- [ ] **Step 3: Style the handle** — globals.css, near `.card2` rules: `.draghandle { background: none; border: 0; padding: 2px 6px; color: var(--mut); cursor: grab; font-size: 12px; }` plus a `:focus-visible` outline consistent with existing focus styles. Blueprint+ tokens only, no new colors.
- [ ] **Step 4: Verify + commit** — Gates clean. Keyboard: Tab reaches handle, Enter picks up, arrows move, Enter drops; Tab reaches title, Enter opens drawer; card root no longer in tab order. Mouse/touch drag from card body still works.

```bash
git add components/leads/LeadCard.tsx components/jobs/JobCard.tsx app/globals.css
git commit -m "fix(a11y): drag-handle activator on kanban cards — no nested widget, keyboard drag on handle"
```

---

## PHASE B — Map: job pins, address search, layer toggles

### Task 8: `lib/mapPins.ts` — MapPin union + builder + color helper

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

### Task 9: `lib/geocode.ts` — Mapbox Geocoding v6 URL builder + response parser

**Files:**
- Create: `lib/geocode.ts`
- Test: `tests/unit/geocode.test.ts`

**Interfaces:**
- Consumes: `MAP_BOUNDS` from `@/lib/geo` (proximity bias = bounds center; the service area is one town, so bounds center ≈ map center without any ref plumbing).
- Produces (Task 12 relies on these exact names):
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

### Task 10: Map implementations render `MapPin[]` as BUTTON pins (merged UI-12 + UI-9); Legend + CSS + MiniMap

> This task merges the original map-plan Task 3 with Wave 3's UI-12 (pins must be `<button>`s with accessible names) and UI-9 (schematic street/block chrome). Pins render as real buttons in BOTH implementations from the start — nothing to retrofit later.

**Files:**
- Modify: `components/map/SchematicMap.tsx` (whole file below)
- Modify: `components/map/MapboxMap.tsx` (marker loop + prop type)
- Modify: `components/map/Legend.tsx` (whole file below)
- Modify: `components/dashboard/MiniMap.tsx` (adapt lead `Pin[]` → `MapPin[]`)
- Modify: `app/(app)/dashboard/page.tsx` (cap line becomes a real link — keyboard "Open map" affordance)
- Modify: `app/globals.css` (`.mpin` button reset, `.mpin-job`, `.lg-round`, `.street`/`.block` chrome — after line 141 `.mpin.drop` rule)

**Interfaces:**
- Consumes: `MapPin`, `pinColor`, `pinKey` from `@/lib/mapPins` (Task 8).
- Produces: `MapImplProps` changes to `{ pins: MapPin[]; ...; onPinClick: (pin: MapPin) => void }` — Tasks 11 and 12 pass these. `MapboxMap` gains optional `flyTo?: { lat: number; lng: number; seq: number } | null` **in Task 12**, not here.

No new unit test (DOM components; render-test infra arrives in Task 13). The gate is: existing tests pass, lint passes, `npm run build` compiles the changed prop types end-to-end.

- [ ] **Step 1: Replace `components/map/SchematicMap.tsx`**

Pins are `<button type="button">` — natively focusable and screen-reader named via `aria-label` (UI-12); the street/block chrome divs carry inline geometry (UI-9).

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
          <button
            key={pinKey(pin)}
            type="button"
            className={pin.kind === 'job' ? 'mpin mpin-job' : 'mpin'}
            aria-label={pin.label}
            title={pin.label}
            style={{ left: `${xPct}%`, top: `${yPct}%`, '--pc': pinColor(pin) } as React.CSSProperties}
            onClick={e => { e.stopPropagation(); onPinClick(pin); }}
          >
            <i />
          </button>
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

In the marker-sync effect, replace the loop body — the inner element is a real `<button>` (UI-12) with the job class, and the click handler passes the pin:

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
      // Real <button>: focusable + named for AT (Wave 3 UI-12).
      const el = document.createElement('div');
      const inner = document.createElement('button');
      inner.type = 'button';
      inner.className = pin.kind === 'job' ? 'mpin mpin-job' : 'mpin';
      inner.title = pin.label;
      inner.setAttribute('aria-label', pin.label);
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

MiniMap stays lead-only; it adapts its `Pin[]` to `MapPin[]` at the boundary. The wrapper stays a plain div (pointer convenience); keyboard users get the real link added in Step 5 — do NOT make the wrapper a button (pins inside are now buttons; nesting would recreate the widget-in-widget violation Task 7 just removed).

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

- [ ] **Step 5: Dashboard "Open map" keyboard affordance (replaces original Wave 3 MiniMap-wrapper item)**

In `app/(app)/dashboard/page.tsx`, the Neighborhood snapshot panel's cap line becomes a real link (import `Link` from `next/link` if not present):

```tsx
<p className="cap"><Link href="/map">tap to open full map →</Link></p>
```

Verify the link inherits `.cap` styling acceptably (add `style={{ color: 'inherit' }}` on the Link if the default anchor color clashes).

- [ ] **Step 6: Add CSS to `app/globals.css`**

Insert directly after the `.mpin.drop { animation: ... }` line (~line 141):

```css
/* Pins are real <button>s now (UI-12): reset UA button chrome; the existing .mpin
   rule already sets border/size/position, so only background/padding/font need zeroing. */
button.mpin { background: none; padding: 0; font: inherit; }
button.mpin:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Job pins: same footprint as .mpin but round — shape is the lead/job discriminator.
   The base .mpin rotate(45deg) is harmless on a circle, so hover/positioning rules
   are inherited unchanged. */
.mpin.mpin-job, .mpin.mpin-job i { border-radius: 50%; }
.lg-round { border-radius: 50%; transform: none; }
.lg-head { color: var(--ink); font-weight: 600; }
[data-theme="dark"] .lg-head { color: var(--text, #e6e6e6); }

/* Schematic map chrome (UI-9): streets/blocks were markup-only since the prototype port. */
.map .street { position: absolute; background: var(--line); opacity: .6; }
.map .block { position: absolute; background: var(--chip); border: 1px solid var(--line); border-radius: 2px; opacity: .5; }
```

Notes: if `var(--text)` does not exist in this stylesheet, check the `:root`/`[data-theme="dark"]` variable block at the top of `globals.css` and use whatever the dark-theme body text variable is (fallback shown keeps it safe either way). Same for `var(--accent)` in the focus ring — reuse whatever the existing `:focus-visible` rules use (grep `focus-visible` first). Verify visually that the button reset doesn't break the diamond (the `--pc` fill lives on the inner `<i>`; the dark-theme glow at globals.css:139 and the 44px mobile hit-area `::after` at :267 must still work).

- [ ] **Step 7: Fix the two remaining `onPinClick` call sites so the build compiles**

`components/map/MapView.tsx` still passes `Pin[]` and `onPinClick(id)`. Task 12 rewrites it fully; to keep THIS task green, apply the minimal bridge now (Task 12 replaces it):

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

(`statusLabel` moves out of the page — `buildMapPins` owns labels now. Jobs arrive in Task 11.)

- [ ] **Step 8: Verify**

Run: `npm test`
Expected: all suites PASS (including Task 8–9 tests).

Run: `npm run lint`
Expected: no new errors.

Run: `npm run build`
Expected: compiles. This is the type-level proof that every `pins`/`onPinClick` consumer was updated.

Manual: `/map` schematic + mapbox — Tab reaches each pin, Enter activates it (drawer opens); diamonds look unchanged; dashboard cap link navigates to `/map`.

- [ ] **Step 9: Commit**

```bash
git add components/map/SchematicMap.tsx components/map/MapboxMap.tsx components/map/Legend.tsx components/dashboard/MiniMap.tsx "app/(app)/dashboard/page.tsx" components/map/MapView.tsx "app/(app)/map/page.tsx" app/globals.css
git commit -m "feat(map): MapPin union rendered as button pins — job circles, legend, minimap, schematic chrome"
```

---

### Task 11: Map page fetches jobs; `?j=` opens JobDrawer

**Files:**
- Modify: `app/(app)/map/page.tsx` (whole file below)

**Interfaces:**
- Consumes: `buildMapPins` (Task 8); `buildJobs`, `visibleJobs`, `JobRow`, `JobCustomer` from `@/lib/jobs`; `JobDrawer` from `@/components/jobs/JobDrawer` (props: `job, role, uid, admin, customers?, leadDetail?, backTo?` — see `app/(app)/jobs/page.tsx` for the reference call site); `getSession` from `@/lib/auth`.
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

### Task 12: MapSearch combobox + flyTo/temp marker + layer toggles

**Files:**
- Create: `components/map/MapSearch.tsx`
- Modify: `components/map/MapView.tsx` (whole file below)
- Modify: `components/map/MapboxMap.tsx` (add `flyTo` prop + effect + temp-marker clearing)
- Modify: `app/globals.css` (searchbox + toggle chip styles, after the `.legend` rules ~line 144)

**Interfaces:**
- Consumes: `geocodeUrl`, `parseGeocodeResponse`, `GeocodeSuggestion` (Task 9); `MapPin` (Task 8); `MapImplProps` (Task 10).
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
// loads mapbox-gl; MapboxMap is only imported when a token exists.
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

Note: this stylesheet already has established input/button conventions from wave 2 (16px font-size on touch inputs, 44px targets). If a `.chip` or similar class already exists, reuse/extend rather than duplicate — search `globals.css` for `chip` before pasting (as of plan writing, `.chip` does not exist; `--chip` is a color token only).

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

## PHASE C — Riders + verification

### Task 13: Riders sweep — Wave 1/2 review leftovers (user-approved 2026-07-07)

**Files:** `supabase/tests/` (new pgTAP), `app/(app)/dashboard/page.tsx`, `app/(app)/settings/page.tsx`, `lib/auth.ts`, `app/layout.tsx` (themeColor), `public/` + icon script (maskable), `app/globals.css` (`--lost`), `package.json` + new test setup (render smoke)

**Interfaces:** render-test infra (vitest + @testing-library/react + jsdom) raises the vitest baseline — update the exit-checklist count. Smoke tests assert Task 7's card structure and Task 10's button pins.

- [ ] **Step 1: pgTAP rep-arm assertion** — jobs_public view predicate's only untested branch: as rep, select from `jobs_public` returns ALL jobs (not just unclaimed/own). Add to the existing view test file; run `npm run test:db` (needs local Supabase stack; ports note in `.superpowers/sdd/progress.md` — resolved 2026-07-07, stack on default 54xxx ports).
- [ ] **Step 2: logQueryError sweep** — dashboard + settings pages still discard query `error`s raw; route them through `logQueryError` (pattern from Wave 1 Task 2). In `lib/auth.ts`, fold `getRole`'s raw `console.error` into `logQueryError`.
- [ ] **Step 3: themeColor vs theme cookie** — manifest/metadata themeColor is unconditionally dark; make the layout emit it from the theme cookie (or a light/dark `theme_color` media pair) — verify the Next 16 metadata API shape in `node_modules/next/dist/docs/` first.
- [ ] **Step 4: Maskable icon clip check** — the maskable PNG's 80%-width square may clip in a circular mask; preview (DevTools Application → Manifest), regenerate from `public/icon.svg` with more padding via the existing sharp script if clipped.
- [ ] **Step 5: Light --lost AA** — `:root` `--lost: #d64848` → `#c93b3b` (white-on ≈5.0:1, as-text-on-paper ≈4.6:1 — recompute and note in commit). Dark theme untouched.
- [ ] **Step 6: Render-test smoke infra** — add dev-deps `@testing-library/react` + `jsdom`, vitest environment config for component tests. Smoke files:
  - LeadCard: root receives `onMouseDown`/`onTouchStart` drag listeners AND the `.draghandle` button receives keyboard activator attributes; title-button click calls `onOpen` (this is the exact bug class Wave 2's task-review Critical exposed — lint/tsc/unit-pure tests cannot see it).
  - SchematicMap: renders one `<button.mpin>` per pin with `aria-label` = pin label; job pins carry `.mpin-job`; clicking a pin calls `onPinClick` with the pin (guards Task 10's a11y contract).
- [ ] **Step 7: Gates + commit** — full battery incl. `npm run test:db` and build. Commit in two: `test(db): rep-arm jobs_public assertion` for Step 1; `fix(sweep): logQueryError coverage, themeColor cookie, maskable padding, --lost AA, render smoke tests` for the rest.

---

### Task 14: Full verification pass + exit checklist

**Files:** none new.

- [ ] **Step 1: Full battery**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build` — all clean.
Run: `npm run test:db` — pgTAP green (baseline 8 files/91 asserts + Task 13's rep-arm assertion).

- [ ] **Step 2: Cross-role manual smoke (map feature)**

- Admin: lead + job pins, both drawers open/close, price visible in JobDrawer.
- Rep: job pins visible (all), JobDrawer read-only (no claim/status controls beyond role rules), no price.
- Cleaner: only unclaimed + own job circles; deep-link `?j=` to foreign job → no drawer.
- Mobile viewport (devtools): search input ≥44px, suggestion rows tappable, chips tappable, cooperative gestures still work.

- [ ] **Step 3: Wave 3 exit checklist**

- Contrast picker: light-theme `--lost` selected/hover states ≥4.5:1.
- Keyboard: kanban drag cycle via handle button; card root NOT tabbable; title Enter opens drawer.
- Keyboard: Tab reaches map pins (both kinds), Enter opens the matching drawer.
- Phone emulation: hamburger flow end-to-end; no sidebar stack.
- Keyboard-only session: open/close every drawer (focus restored), switch tabs, search with arrows (global AND map search), open a map pin.
- Screen-reader spot check (Windows Narrator or axe DevTools): dialog named, tablist announced, both searches are comboboxes, errors announced, pins named.

- [ ] **Step 4: Commit any straggler fixes**

```bash
git status
# stage only files this wave touched
git commit -m "fix(wave): post-verification polish" # only if fixes were needed
```

- [ ] **Step 5: Out of scope (unchanged from Wave 3)** — SW skipWaiting/refresh prompt (MOB-L3), `supabase gen types`, DB tests for money-blank persistence.

---

## PHASE D — CRM-owner quick wins (Tier 1, requests of 2026-07-08)

### Task 15: Input quick wins — no spinners, zero defaults, autofill fix, copy-number button

**Files:**
- Modify: `app/globals.css` (number-input spinner removal, `.copybtn` if needed)
- Modify: `components/leads/LeadDrawer.tsx` (stories/panes defaults + CopyButton)
- Modify: `components/jobs/JobDrawer.tsx` (CopyButton)
- Modify: `components/customers/CustomerDrawer.tsx` (CopyButton)
- Modify: `components/settings/UsersPanel.tsx` (autofill suppression)
- Create: `components/ui/CopyButton.tsx`

**Interfaces:**
- Produces: `CopyButton({ value, label? })` client component — reusable anywhere a copy-to-clipboard affordance is needed.

- [ ] **Step 1: Kill number-input spinner arrows globally (owner request #1)**

Append to `app/globals.css`:

```css
/* No spinner arrows on number fields (owner request): values are typed; the
   1-step arrows are useless for stories/panes/money and misfire on touch. */
input[type='number'] { appearance: textfield; -moz-appearance: textfield; }
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
```

- [ ] **Step 2: Stories/panes default 0 (owner request: "default value (0) (unknown)")**

`LeadDrawer.tsx:182,184` — change `defaultValue={lead?.stories ?? ''}` → `defaultValue={lead?.stories ?? 0}` and `defaultValue={lead?.panes ?? ''}` → `defaultValue={lead?.panes ?? 0}`; delete the `placeholder="2"` / `placeholder="14"` attributes. Check `parseLeadForm` in `lib/leads.ts`: `0` must persist as `0` (not be coerced to null); if the parser nulls falsy values, fix it and extend `tests/unit/leads.test.ts` with a `stories: '0' → 0` assertion.

- [ ] **Step 3: Create-user autofill suppression (owner request #9 — the "Osama + dummy password" the owner saw is BROWSER CREDENTIAL AUTOFILL, not code placeholders; grep confirms no such strings exist)**

`UsersPanel.tsx:39-41` create form: add `autoComplete="off"` to the `<form>` element and the full_name + email inputs, and `autoComplete="new-password"` to the password input (the standards-blessed way to stop credential managers from injecting the admin's own saved login).

- [ ] **Step 4: CopyButton component + wire next to Call/Text/Email (owner request #8)**

`tel:` links already dial for real on phones — keep 📞 Call / 💬 Text / ✉ Email and ADD copy. Create `components/ui/CopyButton.tsx`:

```tsx
'use client';
import { useState } from 'react';

export function CopyButton({ value, label = 'Copy phone number' }: { value: string; label?: string }) {
  const [ok, setOk] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className="copybtn"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          // clipboard unavailable (insecure context / permission) — silent no-op beats a crash
        }
      }}
    >
      {ok ? '✓ Copied' : '⧉ Copy'}
    </button>
  );
}
```

Wire `<CopyButton value={lead.phone ?? ''} />` into the quick-action rows: `LeadDrawer.tsx:93-95`, `JobDrawer.tsx:119-121`, `CustomerDrawer.tsx:141-143` (after the Email anchor; read each row's container first and match the sibling anchors' styling — if the anchors carry a shared class, add CSS `.copybtn { /* same font-size/padding as those anchors, background: none, border: 0, cursor: pointer, color: var(--accent) or the anchors' color */ }` reusing whatever the row uses; 44px min tap height per wave-2 convention).

- [ ] **Step 5: Verify + commit**

Gates: `npm run lint && npx tsc --noEmit && npm test` — clean.
Manual: number inputs show no arrows (leads stories/panes, job price, invoice qty/unit_price); new-lead form shows 0/0; create-user form no longer pre-fills admin credentials (test in a browser that had them saved); Copy button copies the phone and flips to "✓ Copied".

```bash
git add app/globals.css components/ui/CopyButton.tsx components/leads/LeadDrawer.tsx components/jobs/JobDrawer.tsx components/customers/CustomerDrawer.tsx components/settings/UsersPanel.tsx lib/leads.ts tests/unit/leads.test.ts
git commit -m "fix(ux): remove number spinners, stories/panes default 0, user-form autofill guard, copy-phone button"
```

---

### Task 16: Invoice statuses `waived` + `cancelled` (two distinct statuses — owner decision 2026-07-08)

**Files:**
- Create: `supabase/migrations/0017_invoice_status_waived_cancelled.sql`
- Modify: `lib/invoices.ts` (status list/labels/colors — read first for exact export names)
- Modify: `tests/unit/invoices.test.ts` (status enumeration specs)
- Check: `components/invoices/InvoiceDrawer.tsx:188` (select — if it maps over the lib status array it updates for free), `components/invoices/InvoicesTable.tsx` (badge rendering), `supabase/tests/invoices_write.sql` (whether it enumerates statuses)

**Interfaces:**
- Produces: `invoice_status` enum gains `'waived' | 'cancelled'`; `InvoiceStatus` TS type widens to match. Tier-3 expenses/true-revenue logic will later treat these as non-revenue terminal states.

- [ ] **Step 1: Write the failing test**

In `tests/unit/invoices.test.ts`, extend the status specs (adapt to the file's actual export names — likely a `INVOICE_STATUSES` array and label/color maps):

```ts
it('includes waived and cancelled as distinct statuses', () => {
  expect(INVOICE_STATUSES).toContain('waived');
  expect(INVOICE_STATUSES).toContain('cancelled');
  expect(invoiceStatusLabel.waived).toBe('Waived');
  expect(invoiceStatusLabel.cancelled).toBe('Cancelled');
});
```

Run: `npm test -- tests/unit/invoices.test.ts` — FAIL.

- [ ] **Step 2: Migration**

Create `supabase/migrations/0017_invoice_status_waived_cancelled.sql`:

```sql
-- Owner request 2026-07-08: two DISTINCT terminal states (different logic later:
-- waived = forgiven debt, cancelled = void). ALTER TYPE ADD VALUE is fine inside
-- a migration as long as the new values aren't USED in this same migration.
alter type invoice_status add value if not exists 'waived';
alter type invoice_status add value if not exists 'cancelled';
```

Run: `npx supabase db reset` — applies clean.

- [ ] **Step 3: Widen the TS side**

In `lib/invoices.ts`: add `'waived' | 'cancelled'` to the `InvoiceStatus` type, append both to the status array, labels `Waived`/`Cancelled`, colors `waived: 'var(--follow)'` (amber — money intentionally forgone), `cancelled: 'var(--lost)'` (red — void). Reuse existing tokens only. If `InvoiceDrawer`/`InvoicesTable` hardcode status lists instead of importing the array, fix them to import it.

- [ ] **Step 4: Verify + commit**

Run: `npm test` — PASS (incl. new spec). `npm run test:db` — existing invoice pgTAP still green (update any assertion that enumerates the enum). Gates + build clean.
Manual: InvoiceDrawer status select shows all 5, saving `waived` persists and badge renders amber.

```bash
git add supabase/migrations/0017_invoice_status_waived_cancelled.sql lib/invoices.ts tests/unit/invoices.test.ts components/invoices/
git commit -m "feat(invoices): waived + cancelled statuses (distinct terminal states)"
```

---

### Task 17: Lead/job service type option set

**Files:**
- Modify: `lib/leads.ts` (add `SERVICE_TYPES` const)
- Modify: `components/leads/LeadDrawer.tsx` (service text input → select)
- Modify: `components/jobs/JobDrawer.tsx` (same, for consistency — jobs carry `service` too)
- Test: `tests/unit/leads.test.ts`

**Interfaces:**
- Produces: `SERVICE_TYPES = ['Window Cleaning', 'Car Detailing', 'Pressure Washing', 'Snow Plow'] as const` from `@/lib/leads`. DB column stays `text` (legacy seed values like "exterior windows" must keep displaying); a check constraint can come later once data is normalized.

- [ ] **Step 1: Add the constant + tiny spec**

`lib/leads.ts`:

```ts
// Owner-defined option set 2026-07-08. Column stays text: legacy rows keep their
// free-text value and render as an extra <option> until edited.
export const SERVICE_TYPES = ['Window Cleaning', 'Car Detailing', 'Pressure Washing', 'Snow Plow'] as const;
```

Spec in `tests/unit/leads.test.ts`: `expect(SERVICE_TYPES).toHaveLength(4)` + exact contents (guards accidental renames that would strand stored values).

- [ ] **Step 2: Swap the inputs**

In LeadDrawer's edit/create form, replace the service `<input>` with:

```tsx
<select name="service" defaultValue={lead?.service ?? ''}>
  <option value="">— select —</option>
  {lead?.service && !SERVICE_TYPES.includes(lead.service as never) && (
    <option value={lead.service}>{lead.service} (legacy)</option>
  )}
  {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
</select>
```

Same pattern in JobDrawer (`job?.service`). Read both files first for the exact current input markup/row structure.

- [ ] **Step 3: Verify + commit**

Gates clean. Manual: new lead offers the 4 options; a seed lead with legacy text shows it selected as "(legacy)".

```bash
git add lib/leads.ts tests/unit/leads.test.ts components/leads/LeadDrawer.tsx components/jobs/JobDrawer.tsx
git commit -m "feat(leads): service type option set (window/car/pressure/snow), legacy values preserved"
```

---

### Task 18: Job scheduled date → date + time

**Files:**
- Create: `supabase/migrations/0018_job_datetime.sql`
- Modify: `lib/jobs.ts` (`parseJobForm` date validation + display formatter — read first)
- Modify: `components/jobs/JobDrawer.tsx` (input type), `components/jobs/JobCard.tsx` + `components/jobs/JobsListTable.tsx` if they render the date (grep `scheduled_date`)
- Modify: `tests/unit/jobs.test.ts`
- Check: `supabase/tests/schema.sql` (may assert the column's type), CSV builders in `lib/csv.ts` (jobs export includes the date?)

**Interfaces:**
- Produces: `jobs.scheduled_date` becomes `timestamptz`; forms use `<input type="datetime-local">` (`YYYY-MM-DDTHH:MM` format). Tier-3 recurring jobs will build on this column.

- [ ] **Step 1: Migration — CAREFUL, `jobs_public` depends on the column**

Read `supabase/migrations/0016_security_hardening.sql` (and 0014) FIRST for the exact current `jobs_public` definition, its `security_invoker` option, and its grants — the recreate below must be a verbatim copy except the underlying type change. Create `supabase/migrations/0018_job_datetime.sql`:

```sql
-- Owner request 2026-07-08: jobs need a time, not just a day.
-- jobs_public selects scheduled_date, so it must be dropped and recreated
-- verbatim (copy the CURRENT definition from 0016 — do not improvise).
drop view if exists jobs_public;

alter table jobs
  alter column scheduled_date type timestamptz
  using scheduled_date::timestamptz;  -- existing dates become midnight local server time

-- >>> recreate jobs_public EXACTLY as 0016 defines it (same columns, same
-- security_invoker option) and re-issue its grants, e.g.:
-- create view jobs_public with (security_invoker = ...) as select ...;
-- grant select on jobs_public to authenticated;
```

Run: `npx supabase db reset` — applies clean. Run `npm run test:db` — if `schema.sql` pgTAP asserts `scheduled_date` is `date`, update the assertion to `timestamptz`.

- [ ] **Step 2: Form + parser**

JobDrawer: `<input name="scheduled_date" type="date" ...>` → `type="datetime-local"` with `defaultValue` sliced to `YYYY-MM-DDTHH:MM` (`job?.scheduled_date?.slice(0, 16) ?? ''`). In `lib/jobs.ts`, `parseJobForm`'s date validation currently accepts `YYYY-MM-DD` (format-only validation, per Plan 8 backlog note) — widen to accept `YYYY-MM-DDTHH:MM` (regex `/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/` — keep accepting bare dates so nothing existing breaks). Extend `tests/unit/jobs.test.ts`: datetime accepted, bare date still accepted, garbage rejected.

- [ ] **Step 3: Display**

Grep `scheduled_date` across `components/` + `lib/`: wherever it renders as a bare day, format date + time when a time is present (e.g. extend the existing `day()`/`fmt` helper in `lib/jobs.ts` with a `dayTime()` that appends `HH:MM` when the timestamp has one; midnight-exactly renders date-only so migrated rows don't all show "00:00"). Update its unit spec.

- [ ] **Step 4: Verify + commit**

Gates + `npm run test:db` + build clean. Manual: schedule a job for today 14:30, board card + drawer + list view show the time; a pre-existing seed job shows date only.

```bash
git add supabase/migrations/0018_job_datetime.sql lib/jobs.ts tests/unit/jobs.test.ts components/jobs/ supabase/tests/schema.sql
git commit -m "feat(jobs): scheduled_date carries time (timestamptz + datetime-local input)"
```

---

## PHASE E — CRM-owner medium changes (Tier 2)

### Task 19: CustomerLookup combobox replaces the raw customer `<select>` (lead/job/invoice forms)

**Files:**
- Create: `lib/customerLookup.ts` (pure filter), `components/customers/CustomerLookup.tsx`
- Modify: `components/leads/LeadDrawer.tsx:168-171`, `components/jobs/JobDrawer.tsx:210-213`, `components/invoices/InvoiceDrawer.tsx:135-136` (replace selects)
- Modify: the pages that feed `customers` props to those drawers (grep the drawers' call sites): the option arrays must widen from `{id, name}` to `{id, name, phone, address}` — every page already queries `customers` with those columns or can add them to the select list.
- Modify: `app/globals.css` (lookup row layout on top of Task 12's `.searchbox` styles)
- Test: `tests/unit/customerLookup.test.ts`

**Interfaces:**
- Consumes: Task 12's `.searchbox` / `.searchbox-list` CSS (already 44px rows, 16px input).
- Produces:
  - `type CustomerOption = { id: number; name: string; phone: string | null; address: string | null }`
  - `filterCustomers(q: string, customers: CustomerOption[]): CustomerOption[]` — case-insensitive substring match on name OR phone OR address, max 8 hits, `[]` for empty query.
  - `CustomerLookup({ customers, name, required?, initialId?, onPick? })` — emits the picked id through a hidden input named `name` (uncontrolled forms: LeadDrawer/JobDrawer) and/or the `onPick` callback (controlled: InvoiceDrawer).

- [ ] **Step 1: Write the failing filter test**

Create `tests/unit/customerLookup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterCustomers, type CustomerOption } from '@/lib/customerLookup';

const cs: CustomerOption[] = [
  { id: 1, name: 'Ahmad One', phone: '555-0101', address: '1 First St' },
  { id: 2, name: 'Ahmad Two', phone: '555-0202', address: '2 Second St' },
  { id: 3, name: 'Zoe', phone: null, address: null },
];

describe('filterCustomers', () => {
  it('matches name case-insensitively', () => {
    expect(filterCustomers('ahmad', cs)).toHaveLength(2);
  });
  it('disambiguates duplicate names by phone and address', () => {
    expect(filterCustomers('0202', cs).map(c => c.id)).toEqual([2]);
    expect(filterCustomers('first st', cs).map(c => c.id)).toEqual([1]);
  });
  it('handles null phone/address without throwing', () => {
    expect(filterCustomers('zoe', cs).map(c => c.id)).toEqual([3]);
  });
  it('returns [] for empty query and caps at 8 hits', () => {
    expect(filterCustomers('', cs)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Bob ${i}`, phone: null, address: null }));
    expect(filterCustomers('bob', many)).toHaveLength(8);
  });
});
```

Run: `npm test -- tests/unit/customerLookup.test.ts` — FAIL (module missing).

- [ ] **Step 2: Implement `lib/customerLookup.ts`**

```ts
export type CustomerOption = { id: number; name: string; phone: string | null; address: string | null };

// Owner request 2026-07-08: a dropdown dies at 1000 customers and can't tell
// 20 Ahmads apart — filter across name, phone AND address.
export function filterCustomers(q: string, customers: CustomerOption[]): CustomerOption[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return customers
    .filter(c =>
      c.name.toLowerCase().includes(s) ||
      (c.phone ?? '').toLowerCase().includes(s) ||
      (c.address ?? '').toLowerCase().includes(s))
    .slice(0, 8);
}
```

Run the test — PASS.

- [ ] **Step 3: Create `components/customers/CustomerLookup.tsx`**

```tsx
'use client';
import type React from 'react';
import { useId, useMemo, useState } from 'react';
import { filterCustomers, type CustomerOption } from '@/lib/customerLookup';

// Combobox over the page-provided customer list. Local filtering (no fetch):
// the pages already load all customers for the old <select>; same data, usable UI.
export function CustomerLookup({
  customers, name, required = false, initialId = null, onPick,
}: {
  customers: CustomerOption[];
  name: string;                       // hidden-input field name carrying the picked id
  required?: boolean;
  initialId?: number | null;
  onPick?: (c: CustomerOption) => void;
}) {
  const uid = useId();
  const initial = initialId != null ? customers.find(c => c.id === initialId) ?? null : null;
  const [q, setQ] = useState(initial?.name ?? '');
  const [picked, setPicked] = useState<CustomerOption | null>(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const hits = useMemo(() => filterCustomers(q, customers), [q, customers]);

  const pick = (c: CustomerOption) => {
    setPicked(c); setQ(c.name); setOpen(false); setActive(-1);
    onPick?.(c);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.preventDefault(); // never submit the form from the combobox
    if (!open || hits.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % hits.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? hits.length - 1 : a - 1)); }
    else if (e.key === 'Enter' && active >= 0) pick(hits[active]);
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="searchbox lookup">
      <input type="hidden" name={name} value={picked?.id ?? ''} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${uid}-opt-${active}` : undefined}
        placeholder="Search name, phone, address…"
        required={required && !picked}   /* browser blocks submit until something's typed; server re-validates the id */
        value={q}
        onChange={e => { setQ(e.target.value); setPicked(null); setOpen(true); setActive(-1); }}
        onFocus={() => { if (hits.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && hits.length > 0 && (
        <ul className="searchbox-list" id={`${uid}-list`} role="listbox">
          {hits.map((c, i) => (
            <li
              key={c.id}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onPointerDown={e => { e.preventDefault(); pick(c); }}
            >
              <span>{c.name}</span>
              <small>{[c.phone, c.address].filter(Boolean).join(' · ') || 'no phone / address'}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Lookup row CSS**

Append to `app/globals.css` (after Task 12's searchbox rules):

```css
/* CustomerLookup rows: two-line hits (name + phone·address) on the shared searchbox chrome */
.searchbox.lookup { max-width: none; }
.searchbox.lookup .searchbox-list li { flex-direction: column; align-items: flex-start; gap: 2px; }
.searchbox.lookup .searchbox-list li small { color: var(--muted); font-size: 11px; }
```

- [ ] **Step 5: Replace the three call sites**

- LeadDrawer create form (`select name="customer_id"`): `<CustomerLookup customers={customers} name="customer_id" required />`. The `customers` prop type widens to `CustomerOption[]` — update the prop type and the leads page's option-building query to select `id,name,phone,address`.
- JobDrawer create form: same swap; jobs page (and map page after Task 11 — it builds `customerOptions` too) widen to `id,name,phone,address`.
- InvoiceDrawer (`:135`, controlled state): `<CustomerLookup customers={customers} name="customer_lookup_display" initialId={customerId} onPick={c => setCustomerId(c.id)} />` — the drawer keeps its `customerId` state as the source of truth; the hidden input is inert here. Invoices page widens its customer query the same way.
- Verify server actions still receive `customer_id` (LeadDrawer/JobDrawer post the hidden input; grep `parseLeadForm`/`parseJobForm` expectations — the field name is unchanged).

- [ ] **Step 6: Verify + commit**

Gates + build clean. Manual: create-lead lookup finds by partial phone; two same-name customers distinguishable by the second line; Enter never submits the form early; InvoiceDrawer bill-to switches customers; empty lookup blocks submit on required forms.

```bash
git add lib/customerLookup.ts tests/unit/customerLookup.test.ts components/customers/CustomerLookup.tsx components/leads/LeadDrawer.tsx components/jobs/JobDrawer.tsx components/invoices/InvoiceDrawer.tsx app/globals.css
# plus the touched pages (leads/jobs/map/invoices) — stage what the grep found
git commit -m "feat(customers): typeahead lookup (name/phone/address) replaces customer dropdowns"
```

---

### Task 20: Customer deactivation (soft — no hard delete; invoices/jobs history must survive)

**Files:**
- Create: `supabase/migrations/0019_customer_active.sql`
- Modify: `components/customers/CustomerDrawer.tsx` (admin Deactivate/Reactivate button), `app/(app)/customers/page.tsx` (inactive filter + toggle), `app/(app)/customers/actions.ts` (or wherever saveCustomer lives — read it first)
- Check: every customer-feeding query from Task 19 (lookup lists must exclude inactive)
- Test: `supabase/tests/customers_write.sql` (extend)

**Interfaces:**
- Produces: `customers.active boolean not null default true`; `setCustomerActive(id, active)` server action (admin-only). Owner request #3 resolved as SOFT deactivation: customers FK-cascade to leads and restrict invoices — hard delete would orphan/destroy billing history. Hard delete stays available to admins via SQL only.

- [ ] **Step 1: Migration**

```sql
-- Owner request 2026-07-08 ("delete customers... or make their account inactive"):
-- soft flag. Hard delete would cascade leads/jobs and break invoice history.
alter table customers add column active boolean not null default true;
```

Read `0005_customer_writes.sql` + `0004_grants.sql` first: if customer UPDATE grants are column-scoped, extend them with `active`; if table-wide, nothing more needed. Existing RLS already restricts who may update customers — deactivation rides the same policy, BUT the UI only offers it to admins.

- [ ] **Step 2: pgTAP**

Extend `supabase/tests/customers_write.sql`: admin updates `active=false` → 1 row; cleaner attempt → 0 rows/denied (mirror the file's existing assertion style). Run `npm run test:db` — green.

- [ ] **Step 3: Server action + UI**

- Action (same file as the existing customer save action, same auth pattern): `setCustomerActive(id: number, active: boolean)` — require admin role (mirror how other admin-only actions check), update, `revalidatePath('/customers')`.
- CustomerDrawer (admin, edit mode): danger-zone row at the bottom — `active` customer shows `Deactivate customer` button (btn styling + `var(--lost)` text), inactive shows `Reactivate`. Inactive drawer header gets an `INACTIVE` chip (`.lbl` styling).
- Customers page: default query filters `eq('active', true)`; admin gets a `Show inactive` toggle (searchParam `?inactive=1`, same pattern as the existing `?view=` param) listing only inactive customers with the Reactivate path available.
- Task 19 lookup feeds + any create-form option queries: add `.eq('active', true)`.

- [ ] **Step 4: Verify + commit**

Gates + test:db + build. Manual: deactivate → customer leaves list + lookups; `?inactive=1` shows it; reactivate restores; existing invoices/jobs for the inactive customer still render fine.

```bash
git add supabase/migrations/0019_customer_active.sql supabase/tests/customers_write.sql components/customers/CustomerDrawer.tsx "app/(app)/customers/"
git commit -m "feat(customers): soft deactivation with admin toggle + inactive filter"
```

---

### Task 21: Lead/job soft-delete history + restore

**Files:**
- Create: `supabase/migrations/0020_soft_delete_history.sql`
- Modify: `app/(app)/leads/page.tsx`, `app/(app)/jobs/page.tsx` (+ their actions files), the leads/jobs list-view tables (add History toggle + Restore)
- Check/modify: EVERY RPC that targets leads/jobs by id — read `0003_claim_job.sql`, `0007_set_lead_status.sql`, `0009`, `0010_set_job_status.sql`, `0014_crud_columns_rpcs.sql` — each `where id = ...` gains `and deleted_at is null`
- Test: `supabase/tests/crud_rpcs.sql` (extend)

**Interfaces:**
- Produces: `leads.deleted_at` / `jobs.deleted_at timestamptz`; `delete_lead`/`delete_job` become soft (set `deleted_at`); new `restore_lead(p_id)` / `restore_job(p_id)` SECURITY DEFINER RPCs (admin-only, raise on 0 rows — copy the role-check + raise pattern from 0014's delete RPCs verbatim); `leads_public`/`jobs_public` exclude deleted rows. Owner request #10.

- [ ] **Step 1: Migration**

Create `supabase/migrations/0020_soft_delete_history.sql`. Read 0014 (delete RPC bodies + role checks), 0016 (current view definitions), and 0018 (this plan's jobs_public recreate) FIRST. Contents, in order:

```sql
alter table leads add column deleted_at timestamptz;
alter table jobs  add column deleted_at timestamptz;

-- 1) Views hide deleted rows: recreate leads_public + jobs_public with their
--    CURRENT definitions (0016 / this wave's 0018) + `where deleted_at is null`.
--    Verbatim copies otherwise — same columns, same security_invoker, re-grant select.

-- 2) delete_lead / delete_job: create or replace, same signatures + role checks
--    as 0014, body becomes:
--      update leads set deleted_at = now()
--        where id = p_id and deleted_at is null;
--      if not found then raise exception 'Lead % not found', p_id; end if;
--    (jobs likewise). Keep SECURITY DEFINER + the existing admin-only guard.

-- 3) restore_lead / restore_job: same skeleton, sets deleted_at = null
--      where id = p_id and deleted_at is not null.

-- 4) Sweep: claim_job (0003/0009), set_lead_status (0007), set_job_status (0010),
--    update_lead/update_job (0014) — every `where id =` on leads/jobs gains
--    `and deleted_at is null` so soft-deleted rows are dead to all mutations.
```

Write the actual SQL by copying each current RPC body and applying the described change — the comments above are the checklist, not the migration. Run `npx supabase db reset`.

- [ ] **Step 2: pgTAP**

Extend `supabase/tests/crud_rpcs.sql`: admin `delete_lead` → row still exists in base table with `deleted_at` set, absent from `leads_public`; `set_lead_status` on the deleted lead raises; `restore_lead` brings it back into the view; rep/cleaner `restore_lead` raises not-authorized; same trio for jobs + `claim_job` on a deleted job raises. Run `npm run test:db` — green.

- [ ] **Step 3: Admin queries exclude deleted**

Admin pages read base `leads`/`jobs` (for money) — grep those queries (leads page quote map, jobs page, dashboard, map page after Task 11) and add `.is('deleted_at', null)` — EXCEPT the history fetches below. Non-admin paths go through the views and are already filtered.

- [ ] **Step 4: History UI + restore actions**

- Server actions `restoreLead`/`restoreJob` wrapping the RPCs (same file/pattern as the existing delete actions from Plan 8 Task 4; revalidate the board + history paths).
- Leads + jobs pages: admin-only `🕘 History` toggle next to the existing board/list view toggle (searchParam `?deleted=1`, same URL-state pattern). When set: fetch `deleted_at is not null` rows (base table, admin) ordered by `deleted_at desc`, render the existing list-table component's markup with a `Deleted` column and a `Restore` button per row (form posting the restore action). Non-admins never see the toggle (and the RPC blocks them anyway).

- [ ] **Step 5: Verify + commit**

Gates + test:db + build. Manual: delete lead from drawer → gone from board; History shows it with timestamp; Restore → back on board with same status; deleted job can't be claimed (RPC raises); cleaner sees no History toggle.

```bash
git add supabase/migrations/0020_soft_delete_history.sql supabase/tests/crud_rpcs.sql "app/(app)/leads/" "app/(app)/jobs/" components/leads/ components/jobs/
git commit -m "feat(history): soft-delete leads/jobs with admin history view + restore"
```

---

### Task 22: Lead rep attribution (default: current user) — commission foundation

**Files:**
- Create: `supabase/migrations/0021_lead_rep.sql`
- Modify: `lib/leads.ts` (`Lead` type + `parseLeadForm` + builders), `components/leads/LeadDrawer.tsx` (rep select on create/edit + display row), `app/(app)/leads/page.tsx` (+ map page if it opens LeadDrawer with create/edit — read Task 11's version)
- Test: `tests/unit/leads.test.ts`, `supabase/tests/crud_rpcs.sql`

**Interfaces:**
- Produces: `leads.rep_id uuid references profiles(id)` exposed through `leads_public` (not money); `parseLeadForm` accepts optional `rep_id`; create/update RPCs carry `p_rep_id`. Tier-3 rep commissions will read this column. Owner request #17: "select rep user (can be admin), by default the current logged-in user".

- [ ] **Step 1: Migration**

Read 0014 (create_lead/update_lead signatures), 0015 (column-scoped lead grants), and 0020 (this wave's leads_public recreate) FIRST. Create `supabase/migrations/0021_lead_rep.sql`:

```sql
-- Commission attribution: which rep/admin brought the lead in.
alter table leads add column rep_id uuid references profiles(id);
update leads set rep_id = created_by where rep_id is null;  -- backfill: creator ≈ getter

-- leads_public: recreate CURRENT definition (0020's) + rep_id column (not money — safe for all roles).
-- create_lead / update_lead RPCs: create or replace with an added p_rep_id uuid
--   default null parameter; create_lead falls back to auth.uid() when null:
--   rep_id = coalesce(p_rep_id, auth.uid()). Keep every existing check verbatim.
-- 0015 column grants: add rep_id to the granted insert/update column lists for authenticated.
```

As in Task 21: the comments are the checklist; write real SQL by copying current definitions. `npx supabase db reset` clean.

- [ ] **Step 2: pgTAP + unit**

pgTAP: `create_lead` without `p_rep_id` sets `rep_id = auth.uid()`; with explicit `p_rep_id` persists it; rep can read `rep_id` via `leads_public`. Unit: `parseLeadForm` passes `rep_id` through when present, omits when blank (extend existing form-parse specs).

- [ ] **Step 3: UI**

- Leads page (and map page's LeadDrawer render path): fetch `profiles` where role in ('admin','rep') (`id, full_name` — profiles read-all policy from 0008 covers it) + the current uid; pass both to LeadDrawer.
- LeadDrawer create/edit form: `Rep` row — `<select name="rep_id" defaultValue={lead?.rep_id ?? uid}>` mapping the rep/admin profiles to options. Read view: `Rep` row showing the name (resolve id → full_name from the same list).
- Server actions: thread `rep_id` into the RPC call params (names must match Step 1's `p_rep_id`).

- [ ] **Step 4: Verify + commit**

Gates + test:db + build. Manual: new lead as rep defaults the select to self; admin can attribute a lead to any rep; drawer shows the rep name; kanban unaffected.

```bash
git add supabase/migrations/0021_lead_rep.sql lib/leads.ts tests/unit/leads.test.ts supabase/tests/crud_rpcs.sql components/leads/LeadDrawer.tsx "app/(app)/leads/" "app/(app)/map/"
git commit -m "feat(leads): rep attribution field, defaults to current user (commission foundation)"
```

---

### Task 23: Phase D/E verification pass

**Files:** none new.

- [ ] **Step 1: Full battery**

`npm run lint && npx tsc --noEmit && npm test && npm run build` clean; `npm run test:db` green (baseline + Task 13 rep-arm + Tasks 16/18/20/21/22 additions); `npx supabase db reset` applies 0001–0021 + seed clean.

- [ ] **Step 2: Owner-request acceptance walkthrough (dev server, all three roles)**

- No spinner arrows on any number field; stories/panes default 0.
- Create-user form: no autofilled credentials; creating a user still works end-to-end.
- Copy button on lead/job/customer quick actions; Call/Text/Email still live.
- Invoice: set waived → amber badge; cancelled → red; CSV export carries the status text.
- New lead: service select (4 options); legacy seed value still displays.
- Job scheduled 14:30 today: time visible on card, drawer, list.
- Customer lookup on lead/job/invoice create: find by phone fragment; duplicate names distinguishable.
- Deactivate customer → gone from lists/lookups; history intact; reactivate works.
- Delete lead + job → History toggle (admin only) → Restore → back on board; deleted job unclaimable.
- New lead as rep: rep defaults to self; admin can reassign.

- [ ] **Step 3: Commit stragglers**

```bash
git status
git commit -m "fix(wave): phase D/E post-verification polish" # only if fixes were needed
```
