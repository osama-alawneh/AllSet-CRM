# DotPopover Redesign — Design Spec

**Date:** 2026-07-15
**Status:** Owner-approved design; fable-reviewed (APPROVE WITH CHANGES — all changes folded in below).
**Trigger:** Owner dislikes the shipped DotPopover look (carry from map-dots wave, ledger 2026-07-14). Owner supplied a screenshot of the old CRM's dot popup as the inspiration target.

## Goal

Restyle the map dot popup (`components/map/DotPopover.tsx`) to the screenshot's structure — 2-column grid of always-tinted status chip buttons with leading colored dot icons, big soft action buttons, full-width danger-tinted Delete, caret tail pointing at the dot — rendered entirely with the app's existing design tokens in both themes.

**Visual-only. Zero behavior change.** Same actions, same server calls, same state machine, same view transitions.

## Owner decisions (locked)

1. **Adapt, don't copy:** screenshot's STRUCTURE with app tokens (`var(--card)`, `var(--line)`, `var(--ink)`, status colors, `.box` chrome). NOT the literal always-dark navy card. Light theme = light card; dark theme = dark card.
2. **All 4 views** restyled: main, Lead form, Job form, cleaner read-only.
3. **Minimal card top (main view):** no "DOT" header, no coordinates line. Card starts at the Label input. Small ✕ floats top-right.
4. **Visual-only redesign.** Chip click still saves immediately; Save still saves label/notes; Lead/Job still switch views; Delete still deletes; ✕/Esc still close.
5. **Chip tints via `color-mix(in srgb, …)`** from existing status tokens. No new theme variables.

## Current state (what changes)

- `components/map/DotPopover.tsx` — markup + class changes only (see Component changes).
- `app/globals.css` lines ~201–215: `.pop` family. Some rules retire, some stay (see CSS plan). `.statuspick` / `.statuspick-wrap` rules **stay untouched** — `LeadDrawer.tsx` and `JobDrawer.tsx` still use `.statuspick`; only DotPopover stops using it.
- `tests/unit/DotPopover.render.test.tsx` — selector updates only.
- `tests/unit/MapView.dots.test.tsx:63-64` — coords-text assertion replaced (see Tests).

Status colors (spec-locked, `lib/dots.ts`, unchanged): yes `var(--won)`, no `var(--lost)`, not_home `var(--prog)`, callback `var(--sched)`, unmarked `var(--new)`.

## Visual design

### Card (`.pop.pop-dot`)

- Keeps `.pop` positioning (absolute, z-index 20, `translate(-50%, 12px)`, left-clamp `min(max(xPct%, 130px), calc(100% - 130px))`, top `yPct%`) — untouched.
- Keeps `.box` chrome: `var(--card)` bg, 1.5px border (`--ink` light / `--line` dark), theme shadows (hard offset light, soft dark).
- Width 260px (half-width 130px = the clamp; do not widen without updating the clamp), padding 14px.
- **Max-height + internal scroll:** `max-height: min(72vh, 440px); overflow-y: auto;` — the Job form at 44px touch targets otherwise clips inside `.map` (`overflow: hidden`) on small screens.
- **Caret tail:** `::after` rotated-square on the TOP edge pointing up at the dot (card renders 12px below the click point). ~12×12px, `top: -7px`, centered, `transform: rotate(45deg)`, `background: var(--card)`, border on the two exposed sides matching the card border color per theme. It visually covers the card's top border where it sits. No shadow (light theme's `4px 4px 0` offset casts down-right, away from a top caret). When the popup clamps at map edges the tail stays centered on the card, not on the dot — decorative, accepted.
- Card root carries `data-lat` / `data-lng` attributes (see Tests).

### Main view layout

```
╭──────────────────── ✕ ╮   ✕ = 24px glyph, top-right; 44px hit area via
│ [Label or address   ]  │       inset-extended pseudo-element (mpin::after
│ [Notes              ]  │       precedent), NOT a 44px visual box
│ ┌ ● Yes   ┐┌ ● No    ┐ │
│ ┌ ● Not H ┐┌ ● Call  ┐ │   2-col grid, 8px gaps
│ ┌ ● Unmk  ┐┌  SAVE   ┐ │   Save = accent primary, sits in grid
│ ┌  Lead   ┐┌  Job    ┐ │   Lead/Job = neutral
│ ┌───── Delete Dot ────┐ │   full width (grid-column: 1 / -1), danger tint
╰───────────▼────────────╯
            ●
```

- No h4, no coords `<p>`. Label input keeps `autoFocus`.
- Label input gets right-side clearance (`padding-right` or shortened first row) so the floating ✕ never overlaps its text/caret.
- Error `<p class="form-err" role="alert">` becomes a `grid-column: 1 / -1` grid item between the chip rows and Delete (kept `role="alert"`).

### Status chips (`.dp-chip`)

- Each chip carries **only** `style={{ '--dp-c': dotStatusColor[st] }}` — no other inline styles. (The current inline `background/color/borderColor` on the selected chip at DotPopover.tsx:74 is REMOVED; inline styles would override every class rule below.)
- All color derived in CSS from `var(--dp-c)`:
  - Unselected: `background: color-mix(in srgb, var(--dp-c) 12%, var(--card))`; `border: 1.5px solid color-mix(in srgb, var(--dp-c) 35%, var(--card))`; `color: var(--ink)`.
  - Selected (`aria-pressed="true"`, class `sel` kept): `background: color-mix(in srgb, var(--dp-c) 26%, var(--card))`; `border-color: var(--dp-c)`; `font-weight: 700`.
  - Leading dot icon `<i>`: 8px circle, `background: var(--dp-c)` — status is never conveyed by tint alone.
- Contrast verified (review): `var(--ink)` on all five 26% tints passes 4.5:1 in both themes. Dark-theme unmarked selected-vs-unselected tint delta is weak — the solid `--new` border is load-bearing; keep it ≥1.5px.
- Press feedback: `:active { transform: scale(.97); }` (transform-only; global reduced-motion rule at globals.css:320 kills transitions, instant scale is fine). Hover: border-color shift toward `var(--dp-c)`.
- Min-height 40px desktop; 44px under `pointer: coarse` (see Touch targets).
- Do not override the global `:focus-visible` outline (globals.css:50).
- Disabled (during `pending`): `opacity: .45; cursor: default;` — applies to all popup controls.

### Action buttons

- **Save** (`.dp-save`): accent primary — `background: var(--accent); color: var(--on-accent);` border per `.go` precedent (`--ink` light / `--accent` dark). Unmistakably a button, never chip-tinted (it sits beside the Unmarked chip; visual distinction is what keeps that row safe). Shows `Saving…` while pending (unchanged).
- **Lead / Job** (`.dp-btn`): neutral — `background: var(--chip); color: var(--ink); font-weight: 700;` 1.5px `var(--line)` border.
- **Delete Dot** (`.dp-danger`): full-width, danger tint — `background: color-mix(in srgb, var(--lost) 14%, var(--card)); border: 1.5px solid var(--lost);` text: light theme `color: color-mix(in srgb, var(--lost) 75%, var(--ink))` (plain `--lost` on the tint is ~4.3:1 — fails); dark theme `color: var(--lost)` (passes). Visually separated as the last row.
- All buttons: same radius/typography scale as the app (4px radius, 10px bold uppercase per `.btn` family).

### Lead / Job form views

- **Keep** their `<h4>` titles ("New lead" / "New job") — the two forms are near-identical; the title is the only discriminator. The "no header" decision applies to the main view only. Forms get no floating ✕; `Back` remains the exit (behavior unchanged).
- Inputs/selects/textarea unchanged in structure; restyled spacing via the new card (consistent 8px gaps).
- Submit: `Save Lead` / `Save Job` = accent primary, full-width.
- Below: `Back` (neutral `.dp-btn`) + `Delete Dot` (`.dp-danger`) in a 2-col row.
- `form-err` keeps `role="alert"`, full-width placement above submit.

### Cleaner read-only view

- Root gains `pop-dot` class (currently `pop box` only — tail/width/dp- styling would otherwise not apply).
- Content: static tinted status chip (same `.dp-chip` recipe, `disabled`/non-interactive), label text, notes text, floating ✕.
- No coords: fallback when label empty is the text `Unlabeled dot` (replaces the current lat/lng fallback).

## CSS plan (`app/globals.css`)

New `dp-` block: `.dp-grid` (2-col, 8px gap), `.dp-chip`, `.dp-chip i`, `.dp-save`, `.dp-btn`, `.dp-danger`, `.dp-x` (floating close + hit-area pseudo), `.dp-full` (grid-column 1 / -1), caret `::after` on `.pop-dot`.

Retire vs keep, rule by rule (grep for other consumers before deleting any):
- `.pop h4` (202): KEEP — Lead/Job form titles still use it. Main view simply no longer renders an h4.
- `.pop p` (202): KEEP — read-only view still renders label/notes as `<p>`. Main view no longer renders a coords `<p>`.
- `.pop .row` / `.pop .row + .row` (207/213): RETIRE from DotPopover markup (grid replaces rows). Delete the CSS rules only if grep shows no other consumer; otherwise leave the rules and just stop using the class here.
- `.pop .go` / `.pop .x` (208–210): DotPopover stops using them; CSS rules STAY (coarse-pointer block references them; grep for other consumers before any deletion).

Keep untouched: `.pop` positioning rule (201), `.pop input`/`.pop textarea` base sizing (203/212 — adjust margins to grid gaps as needed), `.statuspick`, `.statuspick-wrap` (drawers depend on them), `.dotcounts`, `.mpin-dot`.

**Touch targets:** add `.dp-chip, .dp-save, .dp-btn, .dp-danger, .dp-x` to the `pointer: coarse` 44px block (globals.css:345–353), or bake the `min-height` + coarse override into the `dp-` rules directly. Every interactive control in all 4 views must be covered. `.pop .go`/`.pop .x`/`.statuspick button` entries in that block stay (drawers/other consumers).

Pin `in srgb` for every `color-mix()` (oklab gives visibly different tints).

## Component changes (`components/map/DotPopover.tsx`)

Markup/class-only:
1. Chips: add `<i />` dot icon; replace inline selected-style with `style={{ '--dp-c': dotStatusColor[st] }}`; class `dp-chip` + keep `sel` + `aria-pressed`.
2. Save moves into the chip grid (row 3, beside Unmarked), class `dp-save`.
3. ✕ becomes floating `dp-x` top-right (main + read-only views).
4. Remove main-view `<h4>` and coords `<p>`; add `data-lat={dot.lat}` / `data-lng={dot.lng}` on the card root.
5. `btn-s`/`btn-danger`/`go`/`x`/`row` classes inside the popup replaced by `dp-` equivalents (global `.btn-danger` etc. untouched elsewhere).
6. Read-only view: add `pop-dot` class, `Unlabeled dot` fallback, static chip.
7. State logic, handlers, `useTransition`, error state: untouched.

## Tests

- `tests/unit/DotPopover.render.test.tsx`: selector updates (`.dp-chip` for the 5-chip `toHaveLength(5)` assertion; `sel` kept). All behavioral assertions unchanged.
- `tests/unit/MapView.dots.test.tsx:63-64`: currently asserts popup textContent contains real coords (`41.6730°, -91.5480°`, not `0.0000`) — the regression observable for the 5fa824c fresh-dot-coords fix. Coords leave the DOM text, so the assertion moves to the new attributes: `expect(el.getAttribute('data-lat')).toBe('41.673')`-style (exact literal per the test fixture), asserting NOT `0`. The regression coverage is preserved, not deleted.
- Battery: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. No DB changes — pgTAP untouched.
- Manual: both themes, `/map`, all 4 views, small viewport (job form scrolls inside card), touch emulation for 44px targets.

## Accessibility summary

- 4.5:1 text contrast on all tinted surfaces both themes (Delete light-theme text mix mandated above).
- Status = tint + dot icon + text label; selected = `aria-pressed` + solid border + weight (never color alone).
- 44px touch targets on coarse pointers, 8px gaps.
- `role="alert"` errors kept; global `:focus-visible` outline preserved; reduced-motion respected (transform-only feedback).

## Out of scope

Behavior, server actions, RPCs, `DotCounts`, map pins, MiniMap, drawers' `.statuspick`, other popups/forms, new theme variables.
