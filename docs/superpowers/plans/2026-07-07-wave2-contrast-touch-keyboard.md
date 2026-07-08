# Wave 2 — Contrast Tokens, Touch, Keyboard Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the unreadable dark-theme status buttons and light-theme AA failures at the token level, make kanban boards scrollable + draggable on touch and operable by keyboard, stop iOS input zoom, and fix mobile viewport units/safe-areas/tap-targets.

**Architecture:** Single file-territory wave — `app/globals.css` owns almost everything (tokens propagate), plus the two board components (sensors), two card components (keyboard open), three status-pick call sites (token swap), and `MapboxMap.tsx` (cooperativeGestures). Run this wave as ONE worker; the files overlap too much to parallelize.

**Tech Stack:** Tailwind 4 (`globals.css` is plain CSS with tokens), dnd-kit (`MouseSensor`/`TouchSensor`/`KeyboardSensor`), Mapbox GL JS v3.

## Global Constraints

- **Next.js 16 breaking changes** — verify any Next API against `node_modules/next/dist/docs/` (repo `AGENTS.md`).
- Depends on Wave 1 Task 3 having shipped `viewportFit: 'cover'` (safe-area env() vars are inert without it — still safe to land, but verify order).
- Every task ends green: `npm run lint && npx tsc --noEmit && npm test` (111 baseline). Wave ends with `npm run build` + the manual phone checklist at the bottom.
- Blueprint+ look must not drift: same hues, only darkened light-theme ramp for AA; monospace, borders, shadows untouched.
- Commit after every task. Findings context: `docs/superpowers/2026-07-07-multiagent-review-findings.md`.

---

### Task 1: Token-level contrast fixes (UI-1, UI-5, UI-16)

**Files:**
- Modify: `app/globals.css` (`:root` :5-13, `[data-theme="dark"]` :14-21, plus every hardcoded `#fff`/`#04101c` pair listed below)
- Modify: `components/leads/LeadDrawer.tsx:127`, `components/jobs/JobDrawer.tsx:171`, `components/map/PinPopover.tsx:53`

**Interfaces:**
- Produces: new token `--on-status` (text color readable on any status-color fill): light `#ffffff`, dark `#04101c`. Wave 3 error/polish work may reuse it.

- [ ] **Step 1: Darken the light-theme status ramp + add --on-status**

In `:root` (globals.css:9-11) change only these values (dark theme block untouched):

```css
  --won: #0b7a4d; --lost: #d64848; --follow: #8f5f0a; --new: #5f7188;
  --sched: #7a5af0; --prog: #2f6df6; --done: #0b7a4d; --chip: #eef3f9;
  --paid: #0b7a4d; --sent: #8f5f0a; --draft: #5f7188;
  --on-accent: #ffffff;
  --on-status: #ffffff;
```

In `[data-theme="dark"]` (after `--on-accent: #04101c;` line 20) add:

```css
  --on-status: #04101c;
```

Add `--color-on-status: var(--on-status);` to the `@theme inline` block (:23-32).

Rationale: light `--won #0f9e63` ≈2.9:1 and `--follow #c98a12` ≈2.5:1 on `--paper` fail AA for the 10-11px bold text using them (`LeadCard` money, kanban column headers, `.claim.locked`). `#0b7a4d` ≈4.6:1, `#8f5f0a` ≈4.9:1 pass. Dark-theme pastels already pass as text — the dark bug is #fff *on* them, fixed next.

- [ ] **Step 2: Swap hardcoded #fff on status fills → var(--on-status)**

Identical one-line change in all three components (this is the Critical dark-theme bug — #fff on `--follow: #ffcb5e` ≈1.5:1):

`components/map/PinPopover.tsx:53` (and the same expression at `LeadDrawer.tsx:127` with `statusColor`, `JobDrawer.tsx:171` with `jobStatusColor`):

```tsx
style={sel ? { background: statusColor[st], color: 'var(--on-status)', borderColor: 'transparent' } : undefined}
```

Also globals.css:146 `.statuspick button.sel { color: #fff; ... }` → `color: var(--on-status);`.

- [ ] **Step 3: Adopt --on-accent, delete duplicated dark overrides (UI-16)**

For each pair below in globals.css, set `color: var(--on-accent)` on the base rule and delete the `[data-theme="dark"]` color override (keep any non-color parts of the dark rule, e.g. border-color/box-shadow):

| Base rule | Dark override to slim |
|---|---|
| `.btn` :98 (`color:#fff`) | :99 (`color:#04101c` out; keep border-color) |
| `.claim` :122 | :123 |
| `.pop .go` :148 | :149 |
| `.btn-p` :209 | :209 second half |
| `.logo` :61 | :62 (keep border/shadow) |
| `.who .av` :73 | — (no dark pair; still swap to token) |
| `.skip-link` :47 | — |
| `.nav a.on` :68-70 | dark pair keeps `background: var(--accent)`, color → token |
| `.viewtoggle button.on` :178-179 | same treatment |
| `.btn-danger:hover` :249 (`color:#fff`) | `--lost` is mid/dark in both themes; keep `#fff` here — it passes on `#d64848` and `#ff6b7a` is borderline; use `var(--on-status)` for consistency |

- [ ] **Step 4: Visual verify both themes**

Run: `npm run dev` (background), open http://localhost:3000 logged in as seed admin.
Check in BOTH themes (toggle): lead drawer status buttons readable when selected; kanban column headers; card money values; `.claim.locked` chip; nav active item; view toggle. Take it from the review's worst case: dark theme, LeadDrawer, "Follow-up" selected — text must be dark-on-amber, not white-on-amber.

- [ ] **Step 5: Gate + commit**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, 111/111.

```bash
git add app/globals.css components/leads/LeadDrawer.tsx components/jobs/JobDrawer.tsx components/map/PinPopover.tsx
git commit -m "fix(a11y): AA contrast — --on-status token, darkened light status ramp, adopt --on-accent"
```

---

### Task 2: Mobile CSS — 16px inputs, dvh, safe-area, 44px tap targets, pin hit area (MOB-H3, M1-M4)

**Files:**
- Modify: `app/globals.css`
- Modify: `app/offline/page.tsx` (inline `100vh` → `100dvh` fallback pair)

**Interfaces:**
- Consumes: `viewportFit: 'cover'` from Wave 1 Task 3.
- Produces: nothing downstream.

- [ ] **Step 1: Append the mobile block to globals.css**

Add at the end of the file:

```css
/* Wave 2: phone-first fixes (review findings MOB-H3, M1-M4) */

/* iOS zooms any focused input under 16px — only on touch devices, desktop keeps 12px. */
@media (pointer: coarse) {
  input, select, textarea { font-size: 16px; }
  /* 44px minimum touch targets (Apple HIG) */
  .btn, .iconbtn, .claim, .drawer .close, .viewtoggle button, .acts button, .pop .go, .pop .x,
  .statuspick button { min-height: 44px; }
  .nav a { min-height: 44px; align-items: center; }
  /* Map pins stay 16px visually; expand the hit area invisibly. */
  .mpin::after { content: ""; position: absolute; inset: -14px; }
}

/* Notch / home-indicator safe areas (inert until viewport-fit=cover ships — Wave 1). */
@media (max-width: 860px) {
  .app {
    padding-left: calc(12px + env(safe-area-inset-left));
    padding-right: calc(12px + env(safe-area-inset-right));
    padding-top: calc(12px + env(safe-area-inset-top));
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }
}
.drawer { padding-top: calc(22px + env(safe-area-inset-top)); padding-bottom: calc(22px + env(safe-area-inset-bottom)); }
```

- [ ] **Step 2: dvh with vh fallback (MOB-M2)**

For each of these rules, keep the existing `100vh` line and add a `100dvh` override line directly after it (older-browser fallback ordering):

- `body` :36 → after `min-height: 100vh;` add `min-height: 100dvh;`
- `.app` :50 → same pair
- `.login` :240 → same pair

`app/offline/page.tsx:7` inline style: `minHeight: '100dvh'` (single value fine — the page is self-contained and modern-browser-only concerns apply less, but if the style object allows only one value, prefer dvh).

- [ ] **Step 3: Gate + commit**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean.

```bash
git add app/globals.css app/offline/page.tsx
git commit -m "fix(mobile): 16px touch inputs, dvh units, safe-area insets, 44px tap targets, pin hit area"
```

---

### Task 3: Touch + keyboard drag sensors, card keyboard-open, cooperativeGestures (MOB-H1, UI-2, MOB-M6)

**Files:**
- Modify: `components/leads/KanbanBoard.tsx` (:4-10 imports, :42 sensors)
- Modify: `components/jobs/JobsBoard.tsx` (:4-10 imports, :48 sensors)
- Modify: `components/leads/LeadCard.tsx`, `components/jobs/JobCard.tsx` (title → open button)
- Modify: `app/globals.css:237` (`touch-action`), plus a `.cardlink` rule
- Modify: `components/map/MapboxMap.tsx:28-36` (map options)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `.cardlink` CSS class (unstyled button that inherits card typography) — Wave 3 may reuse for row-nav elements.

- [ ] **Step 1: Replace PointerSensor with Mouse+Touch+Keyboard sensors (both boards)**

dnd-kit gotcha this fixes: `PointerSensor` + `touch-action:none` captures every touch as a drag, so single-column phone kanban can't scroll (MOB-H1); and with no `KeyboardSensor` cards can't be dragged by keyboard (UI-2). `MouseSensor`+`TouchSensor` split lets touch use long-press activation while mouse keeps the 5px distance. Same change in `KanbanBoard.tsx` and `JobsBoard.tsx`:

```ts
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
```

```ts
// Mouse: 5px so click still opens the drawer. Touch: long-press (200ms) so a normal
// swipe scrolls the column instead of dragging the card. Keyboard: Enter picks up,
// arrows move, Enter drops (dnd-kit default bindings).
const sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  useSensor(KeyboardSensor)
);
```

- [ ] **Step 2: Relax touch-action**

`app/globals.css:237`: `.kanban .card2 { touch-action: none; }` → `.kanban .card2 { touch-action: manipulation; }` (allows scroll pans; long-press activation still wins for drags — this is the dnd-kit-documented pairing for delayed TouchSensor). Update the stale comment above it.

- [ ] **Step 3: Keyboard-open on cards without fighting KeyboardSensor**

dnd-kit's `KeyboardSensor` binds Enter/Space on the draggable root to *pick up* — so do NOT add Enter-to-open on the card root (it would clash). Instead make the card title a real button. Read `LeadCard.tsx` (root div `onClick` around :30-38) and `JobCard.tsx` (:33-41) first, then in each:

- Keep root `onClick` (pointer tap-to-open) and drag wiring as-is.
- Change the title element (`.addr` span/b in LeadCard, equivalent in JobCard) to:

```tsx
<button
  type="button"
  className="cardlink addr"
  onClick={e => { e.stopPropagation(); onOpen(lead.id); }}
  onPointerDown={e => e.stopPropagation()} /* don't start a drag from the button */
>
  {/* existing title content unchanged */}
</button>
```

(`lead.id` → `job.id` in JobCard; match each file's existing prop names exactly.)

Add to globals.css near `.card2` rules:

```css
/* Card titles are real buttons so keyboard users can open the drawer; visually inherit. */
.cardlink { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
```

Tab order result: card root (Enter = pick up drag) → title button (Enter = open drawer). Verify dnd-kit still injects `tabIndex=0` on the root.

- [ ] **Step 4: Mapbox cooperativeGestures (decision 2026-07-07)**

In `components/map/MapboxMap.tsx` map construction (:28-36) add `cooperativeGestures: true`. Verify the option name exists in the installed mapbox-gl v3 (`node_modules/mapbox-gl/dist/mapbox-gl.d.ts` — grep `cooperativeGestures`). One finger scrolls the page, two fingers pan the map, and Mapbox shows its built-in hint overlay; desktop scroll-zoom now needs Ctrl — acceptable per decision.

- [ ] **Step 5: Behavior verify**

Run: `npm run lint && npx tsc --noEmit && npm test` — clean.
Run: `npm run dev`; in Chrome DevTools device emulation (iPhone-class, touch on):
1. Leads board single column: swipe scrolls the column (does NOT drag).
2. Long-press a card ~200ms then drag → card moves between columns, status persists.
3. Tap a card → drawer opens.
4. Keyboard only (device emulation off): Tab to a card, Enter picks it up, arrows move it, Enter drops → status changes. Tab to the title button, Enter → drawer opens.
5. Map page (with Mapbox token): one-finger swipe scrolls page + hint appears; two-finger pans.

- [ ] **Step 6: Commit**

```bash
git add components/leads/KanbanBoard.tsx components/jobs/JobsBoard.tsx components/leads/LeadCard.tsx components/jobs/JobCard.tsx components/map/MapboxMap.tsx app/globals.css
git commit -m "fix(input): touch scroll vs long-press drag, keyboard drag + card open, mapbox cooperative gestures"
```

---

## Wave 2 exit checklist

- [ ] `npm run lint && npx tsc --noEmit && npm test` — 111/111; `npm run build` clean
- [ ] Dark theme: selected Follow-up status button = dark text on amber (not white)
- [ ] Light theme: kanban headers + card money ≥ AA (spot-check with a contrast picker)
- [ ] Emulated phone: kanban scrolls with swipe, drags with long-press, inputs don't zoom (font ≥16px computed)
- [ ] Keyboard: full drag cycle + drawer open with no mouse
