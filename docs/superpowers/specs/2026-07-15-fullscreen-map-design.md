# Fullscreen Map + Direct Gestures — Design Spec

**Date:** 2026-07-15
**Status:** Owner-approved (design presented and approved in-session; layout + legend placement locked via Q&A).
**Trigger:** Owner: map should be full screen, and zoom/pan should not require Ctrl (desktop) or two fingers (mobile).

## Owner decisions (locked)

1. **Edge-to-edge map:** the map fills everything below the top nav on /map — no panel box, no padding, no map border. Toolbar floats over the map's top edge.
2. **Legend floats bottom-left** as a small translucent card over the map.
3. **Direct gestures everywhere on /map:** scroll-wheel zooms, one finger pans on mobile — `cooperativeGestures` removed.

## Constraints

- Branch `feat/fullscreen-map` off `main`. Do NOT merge, NO PR — owner walkthrough decides.
- Zero behavior change: handlers, popup state machine, drawers, pins untouched. Layout + one mapbox init option only.
- MiniMap (dashboard) unaffected: it is `interactive={false}` (gestures moot) and does not render inside the new layout class.
- Every `color-mix()` pinned `in srgb` (project rule).
- Battery: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. No DB changes.

## Current state (what changes)

- `components/map/MapView.tsx` root: `<div className="panel box map-panel">` with `<h3>Pin map / neighborhood</h3>` in `.maptools`, map impl, `<Legend />`.
- `app/globals.css`: `.screen-fill .map-panel` + `.screen-fill .map-panel .map` rules (lines ~423-424) make the map stretch inside the panel; `.map` (~142) carries a 1.5px border, 4px radius, `min(56vh, 520px)` height cap; `.maptools` (~140) is a static flex row; `.legend` (~174) sits below the map with `margin-top: 12px`.
- `components/map/MapboxMap.tsx` init (~line 52): `cooperativeGestures: true`.
- Shell context: `.app` padding 20px / `.main` gap 18px (desktop), `.app` padding 12px at the `max-width: 860px` breakpoint (`.main` gap stays 18px). The /map page section is `.screen.screen-fill` (flex: 1).

## Design

### Layout (`.map-full`)

MapView's root becomes `<div className="map-full">` (drops `panel box map-panel`; the `<h3>` is removed — no panel to title). CSS:

- `.map-full { flex: 1; min-height: 320px; position: relative; margin: -18px -20px -20px; }` — bleeds the `.main` topbar gap (18px) and the `.app` shell padding (20px sides/bottom). At `max-width: 860px` the side/bottom margins become `-12px` (matching the mobile shell padding); top stays `-18px`.
- `.map-full .map { position: absolute; inset: 0; height: 100%; border: none; border-radius: 0; }` — edge-to-edge, replaces the old `.screen-fill .map-panel(.map)` stretching rules, which are deleted. The base `.map` rule (border/radius/height cap) stays for the dashboard MiniMap.
- Toolbar floats: `.map-full .maptools` becomes `position: absolute; top: 10px; left: 10px; right: 10px; z-index: 15; margin: 0; padding: 8px; border-radius: 6px; background: color-mix(in srgb, var(--card) 82%, transparent); backdrop-filter: blur(4px);`. Same children (search, DotCounts, layer chips, hint); the map-search dropdown is `.searchbox-list` (z-30 — `.sresults` z-60 is the topbar global search, not this one). Inside `.maptools`'s new z-15 stacking context (backdrop-filter creates one) the dropdown flattens to 15, so an open dot popup (z-20) near the top edge paints over an open dropdown — transient double-open case, accepted under the same ruling as popup-over-toolbar.
- Legend floats: `.map-full .legend { position: absolute; bottom: 10px; left: 10px; z-index: 15; margin: 0; padding: 8px 10px; border-radius: 6px; }` + same translucent backdrop. Content unchanged.
- Z-order: map content (pins z-2) < toolbar/legend (z-15) < popup (`.pop` z-20) < drawers. A popup may overlap the toolbar — transient, accepted.

### Gestures

`components/map/MapboxMap.tsx`: delete the `cooperativeGestures: true,` line from the Map constructor options (mapbox default is off → direct scroll zoom + one-finger pan). Safe: /map no longer scrolls as a page (the map IS the page), and the only other instance (MiniMap) is non-interactive.

### Fallback

SchematicMap (no-token mode) renders the same `.map` div inside `.map-full` — inherits the identical fill layout. No component change.

## Tests

- `tests/unit/MapView.dots.test.tsx` — new render test: root element class is exactly `map-full`; no `h3` rendered; `.maptools` and `.legend` still present (they float via CSS). All existing selectors (`.map`, `.mpin`, `.pop-dot`, `button.chip`, `.dotcounts`) unaffected.
- `tests/unit/MapboxMap.render.test.tsx` — FakeMap gains an `opts` capture in its constructor; new test asserts the constructed map's `opts.cooperativeGestures` is `undefined`.
- Battery: unit, lint, tsc, build. No DB — pgTAP untouched.
- Manual (owner walkthrough): /map edge-to-edge below topbar both themes; scroll-wheel zoom without Ctrl; one-finger pan on phone; toolbar readable over satellite imagery; legend bottom-left; popups/drawers/converts unchanged; dashboard MiniMap unchanged; ≤860px shell (hamburger nav) still clean.

## Out of scope

Browser Fullscreen API (⛶ — no iPhone Safari support), topbar/nav changes, MiniMap, SchematicMap internals, popup/drawer behavior, safe-area insets.
