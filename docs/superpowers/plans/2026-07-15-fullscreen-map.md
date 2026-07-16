# Fullscreen Map + Direct Gestures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /map renders the map edge-to-edge below the top nav with a floating toolbar and legend, and zoom/pan works directly (no Ctrl on desktop, one finger on mobile).

**Architecture:** Pure layout: MapView's root swaps panel chrome for a `.map-full` container that bleeds the shell padding via negative margins; the map impl fills it absolutely; toolbar/legend float over it. One mapbox init option (`cooperativeGestures`) deleted. Zero behavior change.

**Tech Stack:** Next.js client components, plain CSS in `app/globals.css`, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-07-15-fullscreen-map-design.md` (owner-approved). Read it before starting any task.

## Global Constraints

- Branch `feat/fullscreen-map` (exists, spec committed f6f228f). Do NOT merge, NO PR — owner walkthrough decides.
- Zero behavior change: handlers, popup state machine, drawers, pins untouched.
- MiniMap (dashboard) unaffected: `interactive={false}`, never inside `.map-full`; the base `.map` rule (border/radius/height cap) must survive for it.
- Every `color-mix()` pinned `in srgb`.
- Shell values are fixed: `.app` padding 20px desktop / 12px at `max-width: 860px`; `.main` gap 18px at both.
- TDD: tests first (red), then implementation. Commit after each task.
- Battery: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. No DB changes.
- Windows/PowerShell environment; commands work in PowerShell and Git Bash.

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/unit/MapView.dots.test.tsx` | full-bleed layout render test (Task 1) |
| `tests/unit/MapboxMap.render.test.tsx` | FakeMap opts capture + no-cooperativeGestures test (Task 1) |
| `components/map/MapView.tsx` | root class swap + h3 removal (Task 2) |
| `components/map/MapboxMap.tsx` | delete `cooperativeGestures: true,` (Task 2) |
| `app/globals.css` | `.map-full` block replaces the `.screen-fill .map-panel` rules (Task 2) |

---

### Task 1: Layout + gesture contract tests (red)

**Files:**
- Modify: `tests/unit/MapView.dots.test.tsx`
- Modify: `tests/unit/MapboxMap.render.test.tsx`

**Interfaces:**
- Produces (Task 2 must satisfy): MapView root element className exactly `map-full`; no `h3` in MapView output; `.maptools` and `.legend` still rendered; mapbox Map constructed with `cooperativeGestures` ABSENT from its options.

- [ ] **Step 1: Add to `tests/unit/MapView.dots.test.tsx`**

At the end of the `describe('MapView dots', …)` block, add:

```ts
  it('renders the full-bleed layout — .map-full root, no panel chrome, no heading', () => {
    render(<MapView {...base} />);
    const rootEl = container.firstElementChild!;
    expect(rootEl.className).toBe('map-full');
    expect(container.querySelector('h3')).toBeNull();
    expect(container.querySelector('.maptools')).toBeTruthy(); // toolbar still present (floats via CSS)
    expect(container.querySelector('.legend')).toBeTruthy();   // legend still present (floats via CSS)
  });
```

- [ ] **Step 2: Update `tests/unit/MapboxMap.render.test.tsx`**

Change the FakeMap class (lines ~16-26) to capture constructor options — replace:

```ts
  class FakeMap {
    remove = vi.fn();
    on = vi.fn();
    project = vi.fn(() => ({ x: 0, y: 0 }));
    flyTo = vi.fn();
    getContainer = vi.fn(() => document.createElement('div'));
    getCanvasContainer = vi.fn(() => document.createElement('div'));
    constructor() {
      mapInstances.push(this);
    }
  }
```

with:

```ts
  class FakeMap {
    remove = vi.fn();
    on = vi.fn();
    project = vi.fn(() => ({ x: 0, y: 0 }));
    flyTo = vi.fn();
    getContainer = vi.fn(() => document.createElement('div'));
    getCanvasContainer = vi.fn(() => document.createElement('div'));
    opts?: Record<string, unknown>;
    constructor(opts?: Record<string, unknown>) {
      this.opts = opts;
      mapInstances.push(this);
    }
  }
```

and change the `mapInstances` declaration (line ~12) from:

```ts
const mapInstances: Array<{ remove: ReturnType<typeof vi.fn> }> = [];
```

to:

```ts
const mapInstances: Array<{ remove: ReturnType<typeof vi.fn>; opts?: Record<string, unknown> }> = [];
```

Then add at the end of the `describe('MapboxMap StrictMode lifecycle', …)` block:

```ts
  it('constructs the map with direct gestures (no cooperativeGestures)', () => {
    act(() => {
      root.render(
        <StrictMode>
          <MapboxMap {...baseProps()} />
        </StrictMode>,
      );
    });
    act(() => flushFrames());
    expect(mapInstances[0].opts?.cooperativeGestures).toBeUndefined();
  });
```

- [ ] **Step 3: Run to verify red**

Run: `npm test -- tests/unit/MapView.dots.test.tsx tests/unit/MapboxMap.render.test.tsx`
Expected failures (red): the MapView layout test (root className is currently `panel box map-panel`; an `h3` exists) and the gestures test (`opts.cooperativeGestures` is currently `true`). All pre-existing tests in both files stay green.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/MapView.dots.test.tsx tests/unit/MapboxMap.render.test.tsx
git commit -m "test(map): fullscreen layout + direct-gesture contract"
```

---

### Task 2: Layout + gesture implementation (green)

**Files:**
- Modify: `components/map/MapView.tsx` (two edits)
- Modify: `components/map/MapboxMap.tsx` (one deletion)
- Modify: `app/globals.css` (replace two rules, add one block)

**Interfaces:**
- Consumes: Task 1's contract.
- Produces: final layout. No other file changes.

- [ ] **Step 1: `components/map/MapView.tsx` — root class + heading**

In the returned JSX, change:

```tsx
    <div className="panel box map-panel">
      <div className="maptools">
        <h3>Pin map / neighborhood</h3>
```

to:

```tsx
    <div className="map-full">
      <div className="maptools">
```

Nothing else in the file changes.

- [ ] **Step 2: `components/map/MapboxMap.tsx` — delete the gesture gate**

In the Map constructor options, delete this single line (~line 52):

```ts
        cooperativeGestures: true,
```

Nothing else in the file changes.

- [ ] **Step 3: `app/globals.css` — swap the fill rules for the `.map-full` block**

Find the fullscreen-map block (~lines 420-424):

```css
/* Fullscreen map page: the screen stretches to fill .main, the map panel absorbs the
   free space, and the .map inside grows past its default min(56vh, 520px) cap. */
.screen-fill { flex: 1; min-height: 0; }
.screen-fill .map-panel { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.screen-fill .map-panel .map { flex: 1; height: auto; min-height: 320px; }
```

Replace it with:

```css
/* Fullscreen map page (spec 2026-07-15): the map bleeds the shell padding (20px
   desktop / 12px ≤860px) and the .main topbar gap (18px), edge-to-edge below the
   top nav; toolbar and legend float over it. Base .map keeps its border/radius/
   height cap for the dashboard MiniMap. */
.screen-fill { flex: 1; min-height: 0; }
.map-full { flex: 1; min-height: 320px; position: relative; margin: -18px -20px -20px; }
@media (max-width: 860px) { .map-full { margin: -18px -12px -12px; } }
.map-full .map { position: absolute; inset: 0; height: 100%; border: none; border-radius: 0; }
.map-full .maptools, .map-full .legend {
  position: absolute; left: 10px; z-index: 15; margin: 0; border-radius: 6px;
  background: color-mix(in srgb, var(--card) 82%, transparent);
  backdrop-filter: blur(4px);
}
.map-full .maptools { top: 10px; right: 10px; padding: 8px; }
.map-full .legend { bottom: 10px; padding: 8px 10px; }
```

No other CSS changes — the base `.map`, `.maptools`, and `.legend` rules stay untouched.

- [ ] **Step 4: Run the two test files**

Run: `npm test -- tests/unit/MapView.dots.test.tsx tests/unit/MapboxMap.render.test.tsx`
Expected: PASS (all).

- [ ] **Step 5: Full battery**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: 277 unit (275 + the 2 new tests), lint 0, tsc clean, build all routes.

- [ ] **Step 6: Commit**

```bash
git add components/map/MapView.tsx components/map/MapboxMap.tsx app/globals.css
git commit -m "feat(map): edge-to-edge /map with floating toolbar/legend, direct zoom/pan"
```

---

### Task 3: Closeout — battery, wave review, ledger, push

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append entry)

- [ ] **Step 1: Full battery at branch tip**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all green. Record counts.

- [ ] **Step 2: Wave review**

Dispatch a code reviewer over `main..HEAD` with the spec. Focus areas: (a) zero behavior change — MapView/MapboxMap diffs are class/markup/option-only; (b) MiniMap isolation — base `.map` rule intact, `.map-full` reaches nothing on the dashboard; (c) negative margins match the shell values exactly (20/12/18, breakpoint 860px); (d) color-mix `in srgb`; (e) old `.screen-fill .map-panel` rules fully gone with no remaining `map-panel`/`panel box` consumers in MapView; (f) z-order sanity (pins 2 < toolbar/legend 15 < .pop 20). Fix findings TDD-style, re-verify.

- [ ] **Step 3: Ledger entry**

Append to `.superpowers/sdd/progress.md`: wave commits, battery counts, review verdict, and this owner walkthrough checklist:

```
[ ] /map: map edge-to-edge below topbar, both themes; no panel border/padding remnants
[ ] Desktop: scroll-wheel zooms WITHOUT Ctrl; drag pans
[ ] Phone: one-finger pan works; pinch zoom works; ≤860px shell (hamburger) clean
[ ] Toolbar floats top: search, dot counts, layer chips, hint readable over satellite imagery
[ ] Legend floats bottom-left, translucent, readable both themes
[ ] Popups (dot/pending) and drawers unchanged; popup may overlap toolbar (accepted)
[ ] Dashboard MiniMap unchanged (border, size, non-interactive)
[ ] No-token schematic fallback still fills the screen
```

- [ ] **Step 4: Commit ledger + push**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(ledger): fullscreen-map closeout"
git push -u origin feat/fullscreen-map
```

Do NOT merge — owner walkthrough decides.

---

## Self-Review Notes (already applied)

- `.map-full` keeps `min-height: 320px` (carried from the deleted rule) so short viewports never collapse the map.
- Toolbar/legend share one backdrop rule; per-element position/padding split keeps it DRY without a new class.
- The MapView layout test pins `className` EXACTLY (`toBe('map-full')`) — catches accidental retention of `panel box`.
- The gestures test asserts absence (`toBeUndefined()`), not `false` — the line is deleted, not set.
- `.maptools` base rule keeps `margin-bottom: 12px`; the float override sets `margin: 0` so no phantom gap.
