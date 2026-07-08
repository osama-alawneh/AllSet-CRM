# Wave 3 — Mobile Nav, A11y Primitives, Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hamburger navigation on phones, correct dialog/tabs/combobox ARIA on the shared primitives, route-level loading/error states, and the remaining polish findings.

**Architecture:** Task 1 upgrades the shared `Drawer` (focus trap/restore/label/scroll-lock) because Task 2's mobile nav reuses it. Tasks 3-5 are independent primitives. Task 6 is a sweep of small, verified point fixes. Tasks 2-6 can run as separate workers AFTER Task 1 lands, except where noted (globals.css appends — rebase carefully or run sequentially).

**Tech Stack:** Next.js 16.2.10 App Router (`loading.tsx`/`error.tsx` conventions — verify in `node_modules/next/dist/docs/`), React 19, plain CSS tokens.

## Global Constraints

- **Next.js 16 breaking changes** — verify every Next convention used here (especially `error.tsx` props and `loading.tsx` streaming) against `node_modules/next/dist/docs/` before writing (repo `AGENTS.md`).
- Waves 1-2 are merged before this starts; baseline is their exit checklists.
- Every task ends green: `npm run lint && npx tsc --noEmit && npm test`; wave ends with `npm run build` + manual checklist.
- Blueprint+ styling: new UI (hamburger, skeletons, error card) uses existing tokens/classes (`.box`, `.lbl`, `.btn`, tokens) — no new colors.
- Commit after every task. Findings: `docs/superpowers/2026-07-07-multiagent-review-findings.md`.

---

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

**Interfaces:**
- Consumes: existing search state/handlers in the file (debounced query, `results`, open flag, router push on pick — match actual names).
- Produces: nothing downstream.

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

### Task 6: Polish sweep (UI-7, 9, 10, 11, 12, 14, 15, 18, 20, 21; MOB-M5)

**Files:** listed per item; read each before editing.

- [ ] **Step 1: Shared rowNav + minirow keyboard (UI-7)** — `CustomerDrawer.tsx:47-57` already defines the correct helper. Extract it to `lib/rowNav.ts` exactly as-is (exported), import in `CustomerDrawer`, and apply to the `.minirow` divs in `LeadDrawer.tsx:88` and `JobDrawer.tsx:114,155` (spread the helper's props: `tabIndex={0} role="button"` + Enter/Space keydown, matching the helper's shape).

- [ ] **Step 2: role="alert" + .form-err (UI-11)** — add class `.form-err { color: var(--lost); font-size: 12px; }` to globals.css. Replace the copy-pasted `<p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>` with `<p className="form-err" role="alert">{error}</p>` in: `LeadDrawer.tsx:138`, `JobDrawer.tsx:181`, `KanbanBoard.tsx:88`, `JobsBoard.tsx:108`, `InvoiceDrawer.tsx:200`, `ClaimableJobs.tsx:32`, `PinPopover.tsx:61` (grep `var(--lost), fontSize: 12` to confirm the full list).

- [ ] **Step 3: Pins as buttons (UI-12)** — `SchematicMap.tsx:45-53` and `MapboxMap.tsx:61-72`: render each pin as `<button type="button" className="mpin" aria-label={/* the existing title text */} ...>` keeping the existing style/position props; add `.mpin { background: none; border: 1.5px solid var(--card); }` adjustments so the button reset doesn't break the diamond (verify visually). `MiniMap.tsx:9`: wrap in a real link/button with `aria-label="Open map"`.

- [ ] **Step 4: PinPopover Escape + edge clamp (UI-20, MOB-M5)** — in `PinPopover.tsx`: add Escape handling on the autoFocus input's `onKeyDown` (`if (e.key === 'Escape') onCancel();`) plus a container `onKeyDown` fallback; clamp position: `style={{ left: \`min(max(${xPct}%, 120px), calc(100% - 120px))\`, top: \`${yPct}%\` }}` (230px popover ⇒ 115px half-width + margin).

- [ ] **Step 5: ThemeToggle server prop (UI-10)** — layout already reads the theme cookie (`app/layout.tsx:12`). Thread `theme` down: `(app)/layout.tsx` reads the same cookie (or receives it), passes `<Topbar theme={theme} ...>` → `<ThemeToggle initial={theme} />`; `ThemeToggle` initializes `useState(initial === 'dark')` instead of sniffing `document`. Read `ThemeToggle.tsx` first and keep its cookie-write logic untouched.

- [ ] **Step 6: Small gates** —
  - `CustomersTable.tsx:32` (UI-14): the component needs a `canCreate: boolean` prop (wired from the page's role, same pattern as `KanbanBoard`'s `canEdit`); render the "+ New customer" button only when true. Update `customers/page.tsx` to pass it (`role !== 'cleaner'`).
  - `UsersPanel.tsx:39-44` (UI-15): add `aria-label="Full name" / "Email" / "Password" / "Role"` to the three inputs + role select in the create form (mirror the table's existing `aria-label` idiom at :66).
  - Dashboard KPI grid (UI-18): `globals.css:103` → `.kpis { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }` (keep the existing narrower breakpoints if they still make sense after auto-fit — likely deletable).
  - Offline page dark support (UI-21): in `app/offline/page.tsx`'s inline styles, add a `<style>{`@media (prefers-color-scheme: dark) { ... }`}</style>` block overriding the hardcoded light colors with the dark token literals (`#070d18` paper, `#dce6f5` ink) — keep everything inline/self-contained (no external CSS; the page must render offline).

- [ ] **Step 7: SchematicMap prototype chrome (UI-9)** — `.street`/`.block` classes have no CSS anywhere. Check whether a prototype HTML (e.g. `clearview-proto.html`) exists in the repo for the original rules; if yes, port them; if no, add minimal Blueprint-consistent definitions to globals.css:

```css
/* Schematic map chrome (UI-9): streets/blocks were markup-only since the prototype port. */
.map .street { position: absolute; background: var(--line); opacity: .6; }
.map .block { position: absolute; background: var(--chip); border: 1px solid var(--line); border-radius: 2px; opacity: .5; }
```

Then check `SchematicMap.tsx:34-40` for the inline geometry (width/height/position styles) those divs carry; if they carry none, either add sensible inline percentages there or delete the dead markup — decide by what makes the schematic readable, and note the choice in the commit body.

- [ ] **Step 8: Verify + commit**

Gates clean (`npm run lint && npx tsc --noEmit && npm test`), `npm run build` clean.

```bash
git add -A
git commit -m "fix(polish): row keyboard nav, alert roles, button pins, popover clamp+escape, theme toggle SSR, role-gated buttons, labels, KPI auto-fit, offline dark, schematic chrome"
```

---

### Task 7: Kanban drag-handle restructure (Wave 2 final-review adjudication, user-approved 2026-07-07)

**Files:**
- Modify: `components/leads/LeadCard.tsx`, `components/jobs/JobCard.tsx`
- Modify: `app/globals.css` (`.draghandle` rule)

**Interfaces:**
- Consumes: dnd-kit `useDraggable`'s `setActivatorNodeRef` (supported by installed version — verify in `node_modules/@dnd-kit/core`).
- Produces: `.draghandle` class; removes the nested-widget ARIA violation Wave 2 shipped (title `<button>` inside `role="button"` root).

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

### Task 8: Riders sweep — Wave 1/2 review leftovers (user-approved 2026-07-07)

**Files:** `supabase/tests/` (new pgTAP), `app/(app)/dashboard/page.tsx`, `app/(app)/settings/page.tsx`, `lib/auth.ts`, `app/layout.tsx` (themeColor), `public/` + icon script (maskable), `app/globals.css` (`--lost`), `package.json` + new test setup (render smoke)

**Interfaces:** render-test infra (vitest + @testing-library/react + jsdom) raises the vitest baseline — update the exit-checklist count.

- [ ] **Step 1: pgTAP rep-arm assertion** — jobs_public view predicate's only untested branch: as rep, select from `jobs_public` returns ALL jobs (not just unclaimed/own). Add to the existing view test file; run `npm run test:db` (needs local Supabase stack; ports note in `.superpowers/sdd/progress.md`).
- [ ] **Step 2: logQueryError sweep** — dashboard + settings pages still discard query `error`s raw; route them through `logQueryError` (pattern from Wave 1 Task 2). In `lib/auth.ts`, fold `getRole`'s raw `console.error` into `logQueryError`.
- [ ] **Step 3: themeColor vs theme cookie** — manifest/metadata themeColor is unconditionally dark; make the layout emit it from the theme cookie (or a light/dark `theme_color` media pair) — verify the Next 16 metadata API shape in `node_modules/next/dist/docs/` first.
- [ ] **Step 4: Maskable icon clip check** — the maskable PNG's 80%-width square may clip in a circular mask; preview (DevTools Application → Manifest), regenerate from `public/icon.svg` with more padding via the existing sharp script if clipped.
- [ ] **Step 5: Light --lost AA** — `:root` `--lost: #d64848` → `#c93b3b` (white-on ≈5.0:1, as-text-on-paper ≈4.6:1 — recompute and note in commit). Dark theme untouched.
- [ ] **Step 6: Render-test smoke infra** — add dev-deps `@testing-library/react` + `jsdom`, vitest environment config for component tests. One smoke file: LeadCard root receives `onMouseDown`/`onTouchStart` drag listeners and handle receives keyboard activator, title-button click calls `onOpen` (this is the exact bug class Wave 2's task-review Critical exposed — lint/tsc/unit-pure tests cannot see it).
- [ ] **Step 7: Gates + commit** — full battery incl. `npm run test:db` and build. Commit in two: `test(db): rep-arm jobs_public assertion` for Step 1; `fix(sweep): logQueryError coverage, themeColor cookie, maskable padding, --lost AA, render smoke tests` for the rest.

---

## Wave 3 exit checklist

- [ ] All gates: lint, tsc, vitest 111+ (higher after Task 8 render smoke tests), pgTAP via test:db, build
- [ ] Contrast picker: light-theme `--lost` selected/hover states ≥4.5:1
- [ ] Keyboard: kanban drag cycle via handle button; card root NOT tabbable; title Enter opens drawer
- [ ] Phone emulation: hamburger flow end-to-end; no sidebar stack
- [ ] Keyboard-only session: open/close every drawer (focus restored), switch tabs, search with arrows, open a map pin
- [ ] Screen-reader spot check (Windows Narrator or axe DevTools): dialog named, tablist announced, search is a combobox, errors announced
- [ ] Optional follow-up NOT in this wave: SW skipWaiting/refresh prompt (MOB-L3), `supabase gen types`, DB tests for money-blank persistence
