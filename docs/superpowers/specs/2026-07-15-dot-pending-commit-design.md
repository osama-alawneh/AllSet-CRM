# Dot Pending-Commit + Popup Width Fixes — Design Spec

**Date:** 2026-07-15
**Status:** Owner-approved (walkthrough feedback round on feat/dotpopover-redesign; three decisions locked via Q&A).
**Trigger:** Owner walkthrough of the DotPopover redesign found: (1) map click creates a dot in the DB immediately — misclicks and click-to-dismiss both pollute the map; (2) job/lead form content cramped at 260px with the scrollbar overlaying inputs; (3) selects not full width.

## Owner decisions (locked)

1. **Deferred dot creation ("on first action"):** map click opens the popup with a *pending* dot — marker/popup local only, nothing in the DB. The dot is created only when the user takes a committing action (status chip, Save, Save Lead, Save Job). Close/Esc/✕/click-away discards.
2. **Click-away = just close:** a map click while any dot popup is open (pending or saved) only closes it. It never creates a dot and never opens a new popup. The next click starts a new pending dot.
3. **Card width 300px** (from 260), all popup views; edge-clamp updated to match.

## Constraints

- **No DB changes.** Existing RPCs suffice: `create_dot(p_lat,p_lng) → id`, `update_dot(id,label,notes,status)`, `convert_dot_to_lead/job(p_dot_id,…)`. pgTAP untouched.
- Branch: continue on `feat/dotpopover-redesign` on top of the redesign commits. Do NOT merge — owner walkthrough decides.
- Cleaner flow unchanged (`canCreate=false` — cleaners can never hold a pending dot; read-only view untouched).
- The 5fa824c fresh-dot coords regression observable stays: the popup's `data-lat`/`data-lng` must carry the real clicked coords (now on the *pending* placeholder).
- The final-review Important fix (createDot failure never silent) keeps an observable: creation failure now surfaces in the popup's `form-err role="alert"` slot instead of the map toolbar.

## Behavior design

### MapView (`components/map/MapView.tsx`)

- `OpenDot` gains `id: number | null` (null = pending, not in DB) and `seq: number` (stable popup identity — see Remount hazard).
- `onMapClick`: no longer async, no server call:
  - popup open (any kind) → `setOpenDot(null)` and stop. (Click-away rule.)
  - popup closed → open pending: `{ id: null, lat, lng, xPct, yPct, fresh: true, seq: prev.seq+1-style }`.
- `onPinClick` on a dot pin: unchanged semantics (opens/replaces popup with the saved dot), but also bumps `seq`. Clicking a *pin* while a popup is open still replaces the popup (click-away applies to empty-map clicks only).
- Absence-close rule: skipped entirely while `openDot.id === null` (a pending dot is never in props). After creation the existing `fresh` handshake applies unchanged.
- `createError` state + toolbar alert: **removed** (dead — creation failures now surface inside the popup).
- `openDotData` placeholder for pending: `{ id: null, lat, lng, label: '', notes: '', status: 'unmarked' }`.
- New `onCreated={id => setOpenDot(prev => prev ? { ...prev, id, fresh: true } : prev)}` handed to DotPopover; `router.refresh()` after adoption stays (moved into that callback).

### Remount hazard (why `seq`)

The popup is currently keyed `key={openDot.id}`. If the key changed when the pending id fills in (null → real id), React would remount DotPopover and wipe the user's typed label/notes mid-save. The key becomes `key={openDot.seq}`: stable across the pending→created transition, new for each newly opened popup (state resets when switching dots, as today).

### DotPopover (`components/map/DotPopover.tsx`)

- Prop `dot` widens to `Omit<Dot,'id'> & { id: number | null }`; new optional prop `onCreated?: (id: number) => void`.
- New helper inside the component:
  ```ts
  const ensureId = async (): Promise<{ id?: number; error?: string }> => {
    if (dot.id != null) return { id: dot.id };
    const res = await createDot(dot.lat, dot.lng);
    if (res.id != null) onCreated?.(res.id);
    return res;
  };
  ```
- `save(st)`: inside the existing transition, `ensureId()` first; on failure set its error (fallback text `Could not create dot`) and bail; on success `updateDot(madeId, label.trim(), notes.trim(), st)` as today. Chip `pick()` unchanged (delegates to save).
- `convert(fn)`: inside the transition, `ensureId()` first (same failure handling), then `fd.set('dot_id', String(madeId))` and call the existing convert action. Convert failure after creation leaves a plain visible dot — user retries; acceptable, no ghosts.
- `remove()`: pending (`dot.id == null`) → `onClose()` only, **no server call** (nothing to delete). Saved → unchanged `deleteDot` path.
- Everything else (state, views, markup, read-only branch, Escape, aria) unchanged.
- Non-atomicity accepted: chip/Save = two RPCs (`create_dot` then `update_dot`); worst case a dot exists as `unmarked` if the second call fails, and the error shows. A combined RPC was rejected — migration + pgTAP cost for no user-visible gain.

## Visual fixes (`app/globals.css` + one line in DotPopover)

- `.pop.pop-dot` width `260px` → `300px`.
- DotPopover `pos` clamp `130px` → `150px` (both sides; half of 300).
- `.dp-body` gains `scrollbar-width: thin; scrollbar-gutter: stable;` — the scroll rail stops overlaying inputs.
- New rule `.pop select { width: 100%; margin-bottom: 8px; }` — Window Cleaning / status selects reach the card edge in both forms (`.pop` is DotPopover-only; drawers unaffected).
- No other CSS changes; every existing `color-mix()` untouched.

## Tests (Vitest, jsdom)

`tests/unit/MapView.dots.test.tsx`:
- "clicking empty map calls createDot…" → becomes "opens a pending popup without creating a dot": `createDot` NOT called; `.pop-dot` present with `data-lat` `'41.6730'` / `data-lng` `'-91.5480'` (regression observable preserved on the pending placeholder).
- "surfaces a createDot failure…" (toolbar alert) → replaced by "map click while a popup is open closes it and creates nothing": open pending → second map click → popup gone, `createDot` never called → third click reopens.
- New: "status chip on a pending dot creates then updates and adopts the id" — click map, click Yes chip → `createDot(41.673, -91.548)`, `updateDot(99, '', '', 'yes')`; popup survives (id adopted, no remount wipe).
- Dot-pin click / absence-close / drawer-close / cleaner tests unchanged.

`tests/unit/DotPopover.render.test.tsx` (action mock gains `createDot`):
- New describe "DotPopover pending dot": (a) chip click → `createDot(42.3, -83.0)` + `onCreated(99)` + `updateDot(99, '', '', 'yes')`; (b) `createDot` failure → `form-err role="alert"` shows error, `updateDot` NOT called, `onCreated` NOT called; (c) Delete Dot on pending → `onClose` called, `deleteDot` NOT called.
- Existing tests unchanged (saved-dot flows identical; `onCreated` optional).

Battery: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. No pgTAP (no DB changes).

Manual (owner walkthrough): misclick → close → map clean; click-away closes only; chip/Save/Lead/Job on a fresh click all persist correctly; forms at 300px with visible thin scrollbar beside (not over) inputs; selects full width.

## Out of scope

Cleaner read-only view, DotCounts, MiniMap, drawers, `create_dot` RPC signature, the two carried final-review minors (✕ hit-area on mouse, focus-ring clip) — separate owner calls.
