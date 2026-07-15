# Dot Pending-Commit + Popup Width Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map click opens a local pending-dot popup (no DB write); the dot is created on the first committing action; click-away just closes; card widens to 300px with a non-overlaying scrollbar and full-width selects.

**Architecture:** `OpenDot.id` becomes `number | null` (null = pending) plus a `seq` used as the popup's React key so the pending id filling in never remounts the popup. DotPopover gains `ensureId()` — lazily `createDot(lat,lng)` before `updateDot`/convert, reporting the new id up via `onCreated`. All existing RPCs reused; **no DB changes**.

**Tech Stack:** Next.js (App Router) client components, plain CSS in `app/globals.css`, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-07-15-dot-pending-commit-design.md` (owner-approved). Read it before starting any task.

## Global Constraints

- Branch: continue on `feat/dotpopover-redesign` (exists, redesign commits 2d42810..a9864f1 + spec 38694ea already on it). Do NOT merge, NO PR — owner walkthrough decides.
- **No DB changes.** RPC signatures fixed: `create_dot(p_lat,p_lng) → bigint`, `update_dot(p_id,p_label,p_notes,p_status)`, converts take `p_dot_id`. pgTAP untouched.
- Cleaner flow unchanged: `canCreate=false` means cleaners never see a pending dot; read-only view untouched.
- 5fa824c regression observable stays: popup `data-lat`/`data-lng` carry real clicked coords ('41.6730'/'-91.5480' in the MapView test) — now on the pending placeholder.
- createDot failure must stay observable: surfaces in the popup's `form-err role="alert"` slot (toolbar `createError` is removed as dead).
- The dp- CSS block from the redesign stays untouched except the two rules named in Task 3. Every existing `color-mix()` stays byte-identical.
- TDD: tests first (red where applicable), then implementation. Commit after each task.
- Battery: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Windows/PowerShell environment; commands work in PowerShell and Git Bash.

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/unit/MapView.dots.test.tsx` | pending-open, click-away, chip-commit-adoption tests (Task 1) |
| `tests/unit/DotPopover.render.test.tsx` | pending-dot describe: create-then-update, failure alert, delete-discard (Task 1) |
| `components/map/DotPopover.tsx` | `PopDot` type, `onCreated` prop, `ensureId()`, pending-aware save/remove/convert, clamp 150 (Task 2) |
| `components/map/MapView.tsx` | pending OpenDot + seq key, click-away, absence-rule guard, createError removal (Task 2) |
| `app/globals.css` | width 300, dp-body scrollbar, `.pop select` (Task 3) |

---

### Task 1: Tests for the pending-commit contract (red)

**Files:**
- Modify: `tests/unit/MapView.dots.test.tsx`
- Modify: `tests/unit/DotPopover.render.test.tsx`

**Interfaces:**
- Produces (Task 2 must satisfy): map click never calls `createDot`; first map click opens `.pop-dot` with clicked-coords data attrs; map click with any popup open closes it (creating nothing) and the next click reopens; chip click on a pending dot calls `createDot` once then `updateDot(99, '', '', 'yes')`; DotPopover accepts `dot.id: null` + optional `onCreated(id)`; on pending: chip → `createDot(lat,lng)` + `onCreated(99)` + `updateDot(99,…)`, createDot failure → `role="alert"` with the error and NO `updateDot`/`onCreated`, Delete Dot → `onClose` only, NO `deleteDot`.

- [ ] **Step 1: Update `tests/unit/MapView.dots.test.tsx`**

Change the actions import (line 16) to also pull `updateDot`:

```ts
import { createDot, updateDot } from '@/app/(app)/map/actions';
```

Replace the entire test `'clicking empty map calls createDot and opens the popup on the new id'` (lines 54–66) with:

```ts
  it('clicking empty map opens a pending popup without creating a dot', async () => {
    render(<MapView {...base} />);
    await act(async () => {
      (container.querySelector('.map') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(createDot).not.toHaveBeenCalled();
    expect(container.querySelector('.pop-dot')).toBeTruthy();
    // Pending placeholder must carry the clicked coords (jsdom 0×0 rect →
    // unproject(0,0)) as data attrs, not 0.0000 — 5fa824c regression observable.
    const card = container.querySelector('.pop-dot')!;
    expect(card.getAttribute('data-lat')).toBe('41.6730');
    expect(card.getAttribute('data-lng')).toBe('-91.5480');
  });
```

Replace the entire test `'surfaces a createDot failure as an alert and opens no popup'` (lines 67–82) with these two tests:

```ts
  it('map click while a popup is open just closes it — no dot created', async () => {
    render(<MapView {...base} />);
    const mapClick = () => act(async () => {
      (container.querySelector('.map') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    await mapClick();
    expect(container.querySelector('.pop-dot')).toBeTruthy();
    await mapClick(); // click-away: closes, never creates
    expect(container.querySelector('.pop-dot')).toBeNull();
    expect(createDot).not.toHaveBeenCalled();
    await mapClick(); // next click starts a new pending dot
    expect(container.querySelector('.pop-dot')).toBeTruthy();
  });
  it('status chip on a pending dot creates the dot, adopts the id, keeps the popup', async () => {
    render(<MapView {...base} />);
    await act(async () => {
      (container.querySelector('.map') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    const yes = [...container.querySelectorAll('button.dp-chip')].find(b => b.textContent?.includes('Yes'))!;
    await act(async () => { (yes as HTMLButtonElement).click(); });
    expect(createDot).toHaveBeenCalledTimes(1);
    expect(updateDot).toHaveBeenCalledWith(99, '', '', 'yes'); // id 99 adopted from the createDot mock
    expect(container.querySelector('.pop-dot')).toBeTruthy(); // no remount wipe / no close
  });
```

All other tests in the file stay byte-identical.

- [ ] **Step 2: Update `tests/unit/DotPopover.render.test.tsx`**

Add `createDot` to the actions mock (line 7 block) as the FIRST entry:

```ts
vi.mock('@/app/(app)/map/actions', () => ({
  createDot: vi.fn(async () => ({ id: 99 })),
  updateDot: vi.fn(async () => ({})),
  deleteDot: vi.fn(async () => ({})),
  convertDotToLead: vi.fn(async () => ({})),
  convertDotToJob: vi.fn(async () => ({})),
}));
import { createDot, updateDot, deleteDot } from '@/app/(app)/map/actions';
```

(The import line replaces the existing `import { updateDot, deleteDot } …` at line 13.)

Add this describe after the `DotPopover main view` describe (after line 55):

```ts
describe('DotPopover pending dot (id null)', () => {
  const pending = { id: null, lat: 42.3, lng: -83.0, label: '', notes: '', status: 'unmarked' as const };
  it('chip click creates the dot, reports it up, then updates it', async () => {
    const onCreated = vi.fn();
    render(<DotPopover dot={pending} canEdit xPct={50} yPct={50} onClose={() => {}} onCreated={onCreated} />);
    await act(async () => { byText('Yes')!.click(); });
    expect(createDot).toHaveBeenCalledWith(42.3, -83.0);
    expect(onCreated).toHaveBeenCalledWith(99);
    expect(updateDot).toHaveBeenCalledWith(99, '', '', 'yes');
  });
  it('createDot failure surfaces in the popup alert; no update, no adoption', async () => {
    vi.mocked(createDot).mockResolvedValueOnce({ error: 'boom' });
    const onCreated = vi.fn();
    render(<DotPopover dot={pending} canEdit xPct={50} yPct={50} onClose={() => {}} onCreated={onCreated} />);
    await act(async () => { byText('Yes')!.click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('boom');
    expect(updateDot).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
  it('Delete Dot on a pending dot just closes — no server call', async () => {
    const onClose = vi.fn();
    render(<DotPopover dot={pending} canEdit xPct={50} yPct={50} onClose={onClose} />);
    await act(async () => { byText('Delete Dot')!.click(); });
    expect(onClose).toHaveBeenCalled();
    expect(deleteDot).not.toHaveBeenCalled();
  });
});
```

All other tests in the file stay byte-identical.

- [ ] **Step 3: Run to verify red**

Run: `npm test -- tests/unit/DotPopover.render.test.tsx tests/unit/MapView.dots.test.tsx`
Expected failures (red): MapView 'pending popup without creating a dot' (createDot IS called today); MapView 'click-away' (today the second click creates another dot and the popup stays); DotPopover all 3 pending tests (component calls `updateDot(null,…)` / `deleteDot(null)` and never `createDot`). Expected still-green: MapView 'status chip on a pending dot…' — today's create-on-click flow also ends in `updateDot(99,'','','yes')`; this test is the post-change remount/adoption guard, not a red driver. Everything else green.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/DotPopover.render.test.tsx tests/unit/MapView.dots.test.tsx
git commit -m "test(map): pending-commit contract — no create on click, click-away closes, lazy createDot"
```

---

### Task 2: DotPopover + MapView pending flow (green)

**Files:**
- Modify: `components/map/DotPopover.tsx` (full replacement below)
- Modify: `components/map/MapView.tsx` (full replacement below)

**Interfaces:**
- Consumes: Task 1's contract; existing actions unchanged (`createDot(lat,lng) → {id?,error?}`).
- Produces: `export type PopDot = Omit<Dot, 'id'> & { id: number | null }` (MapView imports it); DotPopover prop `onCreated?: (id: number) => void`.

- [ ] **Step 1: Replace `components/map/DotPopover.tsx` with:**

```tsx
'use client';
import { useState, useTransition, type CSSProperties } from 'react';
import { DOT_STATUSES, dotStatusColor, dotStatusLabel, type Dot, type DotStatus } from '@/lib/dots';
import { SERVICE_TYPES, LEAD_STATUSES, statusLabel } from '@/lib/leads';
import { createDot, updateDot, deleteDot, convertDotToLead, convertDotToJob } from '@/app/(app)/map/actions';

type View = 'main' | 'lead' | 'job';

// id null = pending: opened from a bare map click, not in the DB yet. The first
// committing action creates it (spec 2026-07-15 dot-pending-commit).
export type PopDot = Omit<Dot, 'id'> & { id: number | null };

// All chip color flows from --dp-c (globals.css color-mixes it into the card
// color). Never set background/color inline here — it would override the
// selected-state CSS entirely.
const chipStyle = (st: DotStatus) => ({ '--dp-c': dotStatusColor[st] }) as CSSProperties;

// Three-view dot popup (spec: main / Lead form / Job form). Positioned like
// the old create-lead popover: xPct/yPct clamped so it never hangs off the map edge.
export function DotPopover({
  dot, canEdit, xPct, yPct, onClose, onCreated,
}: {
  dot: PopDot; canEdit: boolean; xPct: number; yPct: number; onClose: () => void;
  onCreated?: (id: number) => void;
}) {
  const [view, setView] = useState<View>('main');
  const [label, setLabel] = useState(dot.label);
  const [notes, setNotes] = useState(dot.notes);
  const [status, setStatus] = useState<DotStatus>(dot.status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pos = { left: `min(max(${xPct}%, 150px), calc(100% - 150px))`, top: `${yPct}%` } as const;
  // Coords live as data attrs (MapView's fresh-dot regression test reads them);
  // they no longer render as text.
  const coords = { 'data-lat': dot.lat.toFixed(4), 'data-lng': dot.lng.toFixed(4) };

  // Pending dots are created lazily on the first committing action. onCreated
  // lets the parent adopt the real id without remounting the popup (the popup
  // is keyed on the parent's seq, not the id).
  const ensureId = async (): Promise<{ id?: number; error?: string }> => {
    if (dot.id != null) return { id: dot.id };
    const res = await createDot(dot.lat, dot.lng);
    if (res.id != null) onCreated?.(res.id);
    return res;
  };

  const save = (st: DotStatus = status) => {
    setError(null);
    startTransition(async () => {
      const made = await ensureId();
      if (made.id == null) { setError(made.error ?? 'Could not create dot'); return; }
      const res = await updateDot(made.id, label.trim(), notes.trim(), st);
      if (res.error) setError(res.error);
    });
  };
  const pick = (st: DotStatus) => { setStatus(st); save(st); }; // chip click saves immediately
  const remove = () => {
    if (dot.id == null) { onClose(); return; } // pending: nothing in the DB to delete
    const id = dot.id;
    setError(null);
    startTransition(async () => {
      const res = await deleteDot(id);
      if (res.error) setError(res.error); else onClose();
    });
  };
  const convert = (fn: typeof convertDotToLead) => (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const made = await ensureId();
      if (made.id == null) { setError(made.error ?? 'Could not create dot'); return; }
      fd.set('dot_id', String(made.id));
      const res = await fn(fd); // success redirects away
      if (res?.error) setError(res.error);
    });
  };

  if (!canEdit) {
    return (
      <div className="pop box pop-dot" style={pos} {...coords} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <button type="button" className="dp-x" aria-label="Close" onClick={onClose}>✕</button>
        <div className="dp-body">
          <span className="dp-chip" style={chipStyle(dot.status)}><i />{dotStatusLabel[dot.status]}</span>
          <p>{dot.label || 'Unlabeled dot'}</p>
          {dot.notes && <p>{dot.notes}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="pop box pop-dot" style={pos} {...coords} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      {view === 'main' && (
        <>
          <button type="button" className="dp-x" aria-label="Close" onClick={onClose}>✕</button>
          <div className="dp-body">
            <input name="label" placeholder="Label or address" value={label} onChange={e => setLabel(e.target.value)} autoFocus />
            <textarea name="notes" placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
            <div className="dp-grid">
              {DOT_STATUSES.map(st => {
                const sel = st === status;
                return (
                  <button
                    key={st} type="button" className={sel ? 'dp-chip sel' : 'dp-chip'}
                    aria-pressed={sel} disabled={pending} style={chipStyle(st)}
                    onClick={() => pick(st)}
                  >
                    <i />{dotStatusLabel[st]}
                  </button>
                );
              })}
              <button type="button" className="dp-save" disabled={pending} onClick={() => save()}>{pending ? 'Saving…' : 'Save'}</button>
              <button type="button" className="dp-btn" disabled={pending} onClick={() => setView('lead')}>Lead</button>
              <button type="button" className="dp-btn" disabled={pending} onClick={() => setView('job')}>Job</button>
              {error && <p className="form-err dp-full" role="alert">{error}</p>}
              <button type="button" className="dp-danger dp-full" disabled={pending} onClick={remove}>Delete Dot</button>
            </div>
          </div>
        </>
      )}

      {view === 'lead' && (
        <div className="dp-body">
          <form action={convert(convertDotToLead)}>
            <h4>New lead</h4>
            <input name="name" placeholder="Name" />
            <input name="phone" placeholder="Number" />
            <input name="address" placeholder="House number / address" defaultValue={label} />
            <input name="quote" type="number" min={0} step="0.01" placeholder="Quote" />
            <select name="service" defaultValue={SERVICE_TYPES[0]} required>
              {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select name="status" defaultValue="new">
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}
            </select>
            <textarea name="note" placeholder="Notes" defaultValue={notes} />
            {error && <p className="form-err" role="alert">{error}</p>}
            <button type="submit" className="dp-save dp-wide" disabled={pending}>{pending ? 'Saving…' : 'Save Lead'}</button>
            <div className="dp-grid">
              <button type="button" className="dp-btn" disabled={pending} onClick={() => { setError(null); setView('main'); }}>Back</button>
              <button type="button" className="dp-danger" disabled={pending} onClick={remove}>Delete Dot</button>
            </div>
          </form>
        </div>
      )}

      {view === 'job' && (
        <div className="dp-body">
          <form action={convert(convertDotToJob)}>
            <h4>New job</h4>
            <input name="name" placeholder="Name" />
            <input name="phone" placeholder="Number" />
            <input name="address" placeholder="House number / address" defaultValue={label} />
            <input name="price" type="number" min={0} step="0.01" placeholder="Price" />
            <label className="lbl">Cleaners Pay
              <input name="cleaner_amount" type="number" min={0} step="0.01" placeholder="0.00" />
            </label>
            <select name="service" defaultValue={SERVICE_TYPES[0]} required>
              {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input name="scheduled_date" type="datetime-local" />
            <textarea name="description" placeholder="Notes" defaultValue={notes} />
            {error && <p className="form-err" role="alert">{error}</p>}
            <button type="submit" className="dp-save dp-wide" disabled={pending}>{pending ? 'Saving…' : 'Save Job'}</button>
            <div className="dp-grid">
              <button type="button" className="dp-btn" disabled={pending} onClick={() => { setError(null); setView('main'); }}>Back</button>
              <button type="button" className="dp-danger" disabled={pending} onClick={remove}>Delete Dot</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
```

Deltas vs the redesign version, for the reviewer: `PopDot` type exported (id nullable) and used for the `dot` prop; new optional `onCreated` prop; `createDot` import added; `ensureId()` added; `save`/`convert` call `ensureId()` first and bail to `setError` on failure; `remove()` short-circuits pending to `onClose()`; clamp `130px` → `150px` in `pos`. ALL markup, views, chip rendering, Escape handling, aria attributes: byte-identical to the redesign version.

- [ ] **Step 2: Replace `components/map/MapView.tsx` with:**

```tsx
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pickMapImpl } from '@/lib/geo';
import { visibleMapPins, type MapPin } from '@/lib/mapPins';
import type { Dot } from '@/lib/dots';
import type { GeocodeSuggestion } from '@/lib/geocode';
import { SchematicMap } from './SchematicMap';
import { MapSearch } from './MapSearch';
import { DotPopover, type PopDot } from './DotPopover';
import { DotCounts } from './DotCounts';
import { Legend } from './Legend';

// ssr:false requires a Client Component parent (this file). The schematic map never
// loads mapbox-gl; MapboxMap is only imported when a token exists.
const MapboxMap = dynamic(() => import('./MapboxMap').then(m => m.MapboxMap), { ssr: false });

type FlyTarget = { lat: number; lng: number; seq: number };
// id null = pending: popup opened from a bare map click; the dot isn't in the DB
// until the first committing action inside the popup (spec dot-pending-commit).
// fresh: created this session and possibly not yet in `dots` (router.refresh in
// flight) — the absence-close rule below must not fire on it before first sight.
// lat/lng: real coords for the pending/fresh placeholder (props haven't caught up).
// seq: stable popup identity for the React key — the pending id filling in must
// NOT remount the popup (a remount would wipe typed label/notes mid-save).
type OpenDot = { id: number | null; lat: number; lng: number; xPct: number; yPct: number; fresh: boolean; seq: number };

export function MapView({
  pins, dots, token, canCreate, canEditDots, openLeadId, openJobId,
}: {
  pins: MapPin[];
  dots: Dot[];
  token: string | null;
  canCreate: boolean;      // admin/rep: map click drops a dot
  canEditDots: boolean;    // admin/rep: popup is editable; cleaner gets read-only
  openLeadId: string | null;
  openJobId: string | null;
}) {
  const router = useRouter();
  const [openDot, setOpenDot] = useState<OpenDot | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [showLeads, setShowLeads] = useState(true);
  const [showJobs, setShowJobs] = useState(true);
  const [showDots, setShowDots] = useState(true);
  const impl = pickMapImpl(token);

  // Render-phase state adjustments (React-documented "adjust state when props
  // change" pattern — an effect here trips react-hooks/set-state-in-effect):
  // 1) A drawer opened (?l= or ?j= changed) -> convert succeeded or a pin
  //    drawer took over; close the dot popup.
  const drawerKey = `${openLeadId ?? ''}|${openJobId ?? ''}`;
  const [seenDrawerKey, setSeenDrawerKey] = useState(drawerKey);
  if (drawerKey !== seenDrawerKey) {
    setSeenDrawerKey(drawerKey);
    setOpenDot(null);
  }
  // 2) The open dot vanished from props (teammate deleted/converted it, or our
  //    own delete landed). Pending dots (id null) are never in props — skip;
  //    `fresh` dots are exempt until first seen in props.
  if (openDot && openDot.id != null) {
    const present = dots.some(d => d.id === openDot.id);
    if (present && openDot.fresh) setOpenDot({ ...openDot, fresh: false });
    if (!present && !openDot.fresh) setOpenDot(null);
  }

  // Bare map click never writes: popup open -> just close it (click-away);
  // nothing open -> open a pending dot at the click point.
  const onMapClick = (lat: number, lng: number, xPct: number, yPct: number) => {
    if (!canCreate) return;
    setOpenDot(prev => prev ? null : { id: null, lat, lng, xPct, yPct, fresh: true, seq: (prev?.seq ?? 0) + 1 });
  };
  const onPinClick = (pin: MapPin, xPct: number, yPct: number) => {
    if (pin.kind === 'dot') {
      setOpenDot(prev => ({ id: pin.id, lat: pin.lat, lng: pin.lng, xPct, yPct, fresh: false, seq: (prev?.seq ?? 0) + 1 }));
      return;
    }
    setOpenDot(null);
    router.push(pin.kind === 'job' ? `/map?j=${pin.id}` : `/map?l=${pin.id}`, { scroll: false });
  };
  const onSearchSelect = (s: GeocodeSuggestion) =>
    setFlyTo(prev => ({ lat: s.lat, lng: s.lng, seq: (prev?.seq ?? 0) + 1 }));

  const visible = visibleMapPins(pins, { leads: showLeads, jobs: showJobs, dots: showDots });

  // Pending (id null) and fresh dots aren't in props — render on a local placeholder.
  const openDotData: PopDot | null = openDot
    ? dots.find(d => d.id === openDot.id)
      ?? (openDot.id == null || openDot.fresh
          ? { id: openDot.id, lat: openDot.lat, lng: openDot.lng, label: '', notes: '', status: 'unmarked' }
          : null)
    : null;
  const overlay = openDot && openDotData ? (
    <DotPopover
      key={openDot.seq}
      dot={openDotData} canEdit={canEditDots}
      xPct={openDot.xPct} yPct={openDot.yPct}
      onClose={() => setOpenDot(null)}
      onCreated={id => {
        setOpenDot(prev => (prev ? { ...prev, id, fresh: true } : prev));
        router.refresh();
      }}
    />
  ) : null;

  return (
    <div className="panel box map-panel">
      <div className="maptools">
        <h3>Pin map / neighborhood</h3>
        {impl === 'mapbox' && <MapSearch token={token!} onSelect={onSearchSelect} />}
        <DotCounts dots={showDots ? dots : []} />
        <div className="layer-toggles" style={{ marginLeft: 'auto' }}>
          <button type="button" className="chip" aria-pressed={showLeads} onClick={() => setShowLeads(v => !v)}>
            ◆ Leads
          </button>
          <button type="button" className="chip" aria-pressed={showJobs} onClick={() => setShowJobs(v => !v)}>
            ● Jobs
          </button>
          <button type="button" className="chip" aria-pressed={showDots} onClick={() => setShowDots(v => !v)}>
            ● Dots
          </button>
        </div>
        {canCreate && <span className="hint">✚ click empty space to drop a dot</span>}
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

Deltas vs current, for the reviewer: `createDot` import removed; `createError` state and its toolbar `<p role="alert">` removed (creation failures now surface inside the popup — Task 1's DotPopover failure test is the observable); `OpenDot` gains `id: number|null` + `seq`; absence-rule guarded on `id != null`; `onMapClick` is synchronous — close-if-open, else open pending; `onPinClick` uses functional set + seq bump (dot branch unchanged otherwise); `openDotData` typed `PopDot | null`, placeholder also serves pending; popup keyed on `seq` with new `onCreated` adoption callback (`fresh: true` + `router.refresh()`, exactly the handshake the old create-on-click path ran). Drawer-close rule, toggles, DotCounts, hint, map impl wiring: byte-identical.

- [ ] **Step 3: Run the two test files**

Run: `npm test -- tests/unit/DotPopover.render.test.tsx tests/unit/MapView.dots.test.tsx`
Expected: PASS (all, including the previously-green adoption guard).

- [ ] **Step 4: Full unit suite + typecheck**

Run: `npm test` then `npx tsc --noEmit`
Expected: 273 passing (269 + 4 new: MapView net +1 — two tests replaced by three — and 3 DotPopover), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add components/map/DotPopover.tsx components/map/MapView.tsx
git commit -m "feat(map): pending-commit dots — create on first action, click-away closes, seq-keyed popup"
```

---

### Task 3: CSS — width 300, scrollbar beside content, full-width selects

**Files:**
- Modify: `app/globals.css` (three one-line-ish edits; dp- block otherwise untouched)

**Interfaces:**
- Consumes: nothing new (Task 2's clamp 150 pairs with the 300px width here).
- Produces: final visual. No other file changes.

- [ ] **Step 1: Widen the card**

Change (currently at ~line 210):

```css
.pop.pop-dot { width: 260px; }
```

to:

```css
.pop.pop-dot { width: 300px; }
```

- [ ] **Step 2: Scrollbar stops overlaying inputs**

Change the `.dp-body` rule (in the dp- block, ~line 229):

```css
.dp-body { max-height: min(72vh, 440px); overflow-y: auto; }
```

to:

```css
.dp-body { max-height: min(72vh, 440px); overflow-y: auto; scrollbar-width: thin; scrollbar-gutter: stable; }
```

- [ ] **Step 3: Full-width selects**

Directly after the existing `.pop input { width: 100%; margin-bottom: 8px; }` rule (~line 203), add:

```css
.pop select { width: 100%; margin-bottom: 8px; }
```

(`.pop` is DotPopover-only — repo grep shows no other consumer; drawers don't use `.pop`.)

- [ ] **Step 4: Full battery**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: 273 unit, lint 0, tsc clean, build all routes.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(map): dot popup 300px, thin gutter scrollbar, full-width selects"
```

---

### Task 4: Closeout — battery, wave review, ledger, push

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append entry)

- [ ] **Step 1: Full battery at branch tip**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all green. Record counts.

- [ ] **Step 2: Wave review**

Dispatch a code reviewer over `a9864f1..HEAD` (this wave only; the redesign underneath was already whole-branch-reviewed) with the spec (`docs/superpowers/specs/2026-07-15-dot-pending-commit-design.md`). Focus areas: (a) map click writes NOTHING — no server call on any open/close path; (b) seq key stability — pending id adoption cannot remount the popup, and every popup open/replace bumps seq; (c) `ensureId` failure paths — error surfaces via role="alert", no updateDot/convert call, onCreated not called; (d) absence-close rule can never kill a pending popup; convert/drawer/fresh handshakes preserved; (e) `remove()` on pending makes no server call; (f) 5fa824c coords observable + createDot-failure observable both still test-enforced; (g) CSS deltas are exactly the three rules (width 300 / dp-body scrollbar / .pop select), dp- block and color-mixes otherwise byte-identical; clamp 150 matches width 300. Fix findings TDD-style, re-verify.

- [ ] **Step 3: Ledger entry**

Append to `.superpowers/sdd/progress.md`: wave commits, battery counts, review verdict, deferred minors, and this owner walkthrough checklist:

```
[ ] Misclick on map -> popup opens, ✕/Esc/click-away -> NO dot anywhere (check /map after refresh)
[ ] Click-away while popup open: closes only; next click opens new popup
[ ] Chip on fresh click -> dot appears with that status, popup stays, edits survive
[ ] Save with label+notes on fresh click -> dot persisted with fields
[ ] Lead/Job on fresh click -> lead/job created, dot gone (converted), drawer opens
[ ] Offline/failure on first action -> error INSIDE popup, no ghost dot after retry
[ ] Existing dot click -> popup/edit/delete unchanged
[ ] Card 300px: forms breathe, scrollbar thin + beside inputs, selects full width (both forms)
[ ] Both themes still correct (no CSS regression in chips/caret)
```

- [ ] **Step 4: Commit ledger + push**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(ledger): dot pending-commit closeout"
git push origin feat/dotpopover-redesign
```

Do NOT merge — owner walkthrough decides.

---

## Self-Review Notes (already applied)

- **Remount hazard:** popup key moved from `openDot.id` to `openDot.seq` — pending id adoption (null→99) keeps the same mounted instance; typed label/notes survive. The MapView adoption-guard test pins this.
- **Seq collisions are safe:** consecutive popups can both get seq 1 only when a null-overlay render sits between them — React discards the old instance regardless of key equality across an unmount.
- **`dots.find(d => d.id === openDot.id)` with null id:** never matches (DB ids are numbers) → falls through to the placeholder branch by design.
- **`toHaveBeenCalledTimes(1)` instead of exact coords in the MapView chip test:** unproject floats are fixture-dependent; id adoption is proven by `updateDot(99,…)`. Coord fidelity is separately pinned by the data-attr assertions.
- **Cleaner safety:** `canCreate=false` returns before any pending open; read-only branch never sees `id: null` in practice, and takes no action requiring one.
- **Adoption callback also fires `router.refresh()`** — same post-create handshake the old create-on-click path ran, so DotCounts/pins pick the new dot up identically.
