# DotPopover Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the map dot popup to the owner's screenshot structure — 2-column always-tinted status chip grid with dot icons, accent Save in-grid, neutral Lead/Job, full-width danger-tinted Delete, caret tail — using existing app tokens in both themes, with zero behavior change.

**Architecture:** All chip color derives from a per-chip `--dp-c` custom property set inline; CSS `color-mix(in srgb, …)` produces the tints from existing status tokens (no new variables). Card root keeps `.pop`/`.box` positioning and chrome, gains a caret `::after` and `data-lat`/`data-lng` attributes; an inner `.dp-body` wrapper carries max-height scroll (the caret and floating ✕ sit outside it so overflow can't clip them).

**Tech Stack:** Next.js (App Router) client component, plain CSS in `app/globals.css`, Vitest + jsdom render tests.

**Spec:** `docs/superpowers/specs/2026-07-15-dotpopover-redesign-design.md` (owner-approved; fable-reviewed). Read it before starting any task.

## Global Constraints

- Branch: `feat/dotpopover-redesign` off `main`. Do NOT merge — owner decides after walkthrough.
- **Visual-only. Zero behavior change.** Same handlers, same server actions, same state machine, same view transitions, same `aria-pressed`/`role="alert"`.
- Every `color-mix()` uses `in srgb` (oklab gives visibly different tints).
- `.statuspick` / `.statuspick-wrap` CSS rules stay untouched — `LeadDrawer.tsx` and `JobDrawer.tsx` still use them. Only DotPopover stops using `.statuspick`.
- `.pop .go`, `.pop .x` CSS rules stay (spec decision); DotPopover just stops using those classes.
- Card width stays 260px max half-width 130px = the existing left-clamp; do not widen.
- Status colors (spec-locked, `lib/dots.ts`, unchanged): yes `var(--won)`, no `var(--lost)`, not_home `var(--prog)`, callback `var(--sched)`, unmarked `var(--new)`.
- TDD: tests change first (red), then implementation (green). Commit after each task.
- Test batteries: `npm test` (Vitest), `npm run lint`, `npx tsc --noEmit`, `npm run build`. No DB changes — pgTAP untouched.
- Windows/PowerShell environment; all commands work in both PowerShell and Git Bash.

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/unit/DotPopover.render.test.tsx` | selector/attr updates + new fallback test (Task 1) |
| `tests/unit/MapView.dots.test.tsx` | coords regression assertion moves to data attrs (Task 1) |
| `components/map/DotPopover.tsx` | markup/class-only rewrite (Task 2) |
| `app/globals.css` | `dp-` block, caret, retire `.pop .row` rules, width 250→260, coarse-pointer targets (Task 3) |

---

### Task 1: Update tests to the new contract (red)

**Files:**
- Modify: `tests/unit/DotPopover.render.test.tsx`
- Modify: `tests/unit/MapView.dots.test.tsx:60-64`

**Interfaces:**
- Produces (Task 2 must satisfy): chips are `button.dp-chip` (exactly 5 in main view), each containing an `<i>` and carrying inline `--dp-c: var(--<status-token>)`; selected chip keeps class `sel`; card root `.pop-dot` carries `data-lat`/`data-lng` = `lat.toFixed(4)`/`lng.toFixed(4)` in ALL views; read-only view renders NO coords text and falls back to the literal text `Unlabeled dot` when label is empty; button labels unchanged (`Save`, `Lead`, `Job`, `Delete Dot`, `Back`, `Save Lead`, `Save Job`).

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b feat/dotpopover-redesign
```

- [ ] **Step 2: Update `tests/unit/DotPopover.render.test.tsx`**

Replace the first test's chip block (currently lines 32–34):

```ts
    const chips = container.querySelectorAll('button.dp-chip');
    expect(chips).toHaveLength(5);
    // color flows through the --dp-c custom property, never inline background
    expect((chips[0] as HTMLElement).style.getPropertyValue('--dp-c')).toBe('var(--won)');
    expect([...chips].every(c => c.querySelector('i') !== null)).toBe(true);
    expect([...chips].find(c => c.textContent?.includes('Callback'))?.className).toContain('sel');
```

Add to the SAME first test (after the `for (const t of ['Save', …])` line):

```ts
    const card = container.querySelector('.pop-dot') as HTMLElement;
    expect(card.getAttribute('data-lat')).toBe('42.3000');
    expect(card.getAttribute('data-lng')).toBe('-83.0000');
```

In the `DotPopover cleaner read-only` describe, extend the existing test with a no-coords assertion (after the `'Callback'` line):

```ts
    expect(container.textContent).not.toContain('°'); // coords left the DOM
```

and add a second test to that describe:

```ts
  it('unlabeled dot falls back to "Unlabeled dot" (no coords)', () => {
    render(<DotPopover dot={{ ...dot, label: '' }} canEdit={false} xPct={50} yPct={50} onClose={() => {}} />);
    expect(container.textContent).toContain('Unlabeled dot');
    expect(container.textContent).not.toContain('42.3');
  });
```

- [ ] **Step 3: Update `tests/unit/MapView.dots.test.tsx`**

Replace lines 61–64 (the comment + two textContent assertions inside `'clicking empty map calls createDot and opens the popup on the new id'`):

```ts
    // Fresh dot (id 99) is absent from props — the placeholder must carry the
    // clicked coords (jsdom 0×0 rect → unproject(0,0)) as data attrs, not 0.0000.
    const card = container.querySelector('.pop-dot')!;
    expect(card.getAttribute('data-lat')).toBe('41.6730');
    expect(card.getAttribute('data-lng')).toBe('-91.5480');
```

(Same `toFixed(4)` strings the old text assertion checked — the 5fa824c fresh-dot-coords regression observable is preserved, moved from text to attributes.)

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- tests/unit/DotPopover.render.test.tsx tests/unit/MapView.dots.test.tsx`
Expected: FAIL — `button.dp-chip` finds 0 elements; `data-lat` is null. (MapView close/toggle tests still pass — they key on `.pop-dot`, which survives.)

- [ ] **Step 5: Commit**

```bash
git add tests/unit/DotPopover.render.test.tsx tests/unit/MapView.dots.test.tsx
git commit -m "test(map): DotPopover redesign contract — dp-chip grid, --dp-c, data-lat/lng attrs"
```

---

### Task 2: DotPopover markup rewrite (green)

**Files:**
- Modify: `components/map/DotPopover.tsx` (full replacement below)

**Interfaces:**
- Consumes: Task 1's contract; existing actions/vocab imports unchanged.
- Produces (Task 3 styles these): classes `dp-x` (floating close), `dp-body` (scroll wrapper), `dp-grid` (2-col), `dp-chip` (+`sel`), `dp-save`, `dp-btn`, `dp-danger`, `dp-full` (grid-column span), `dp-wide` (full-width block button). Root keeps `pop box pop-dot` in ALL views (read-only gains `pop-dot`).

- [ ] **Step 1: Replace `components/map/DotPopover.tsx` with:**

```tsx
'use client';
import { useState, useTransition, type CSSProperties } from 'react';
import { DOT_STATUSES, dotStatusColor, dotStatusLabel, type Dot, type DotStatus } from '@/lib/dots';
import { SERVICE_TYPES, LEAD_STATUSES, statusLabel } from '@/lib/leads';
import { updateDot, deleteDot, convertDotToLead, convertDotToJob } from '@/app/(app)/map/actions';

type View = 'main' | 'lead' | 'job';

// All chip color flows from --dp-c (globals.css color-mixes it into the card
// color). Never set background/color inline here — it would override the
// selected-state CSS entirely.
const chipStyle = (st: DotStatus) => ({ '--dp-c': dotStatusColor[st] }) as CSSProperties;

// Three-view dot popup (spec: main / Lead form / Job form). Positioned like
// the old create-lead popover: xPct/yPct clamped so it never hangs off the map edge.
export function DotPopover({
  dot, canEdit, xPct, yPct, onClose,
}: {
  dot: Dot; canEdit: boolean; xPct: number; yPct: number; onClose: () => void;
}) {
  const [view, setView] = useState<View>('main');
  const [label, setLabel] = useState(dot.label);
  const [notes, setNotes] = useState(dot.notes);
  const [status, setStatus] = useState<DotStatus>(dot.status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pos = { left: `min(max(${xPct}%, 130px), calc(100% - 130px))`, top: `${yPct}%` } as const;
  // Coords live as data attrs (MapView's fresh-dot regression test reads them);
  // they no longer render as text.
  const coords = { 'data-lat': dot.lat.toFixed(4), 'data-lng': dot.lng.toFixed(4) };

  const save = (st: DotStatus = status) => {
    setError(null);
    startTransition(async () => {
      const res = await updateDot(dot.id, label.trim(), notes.trim(), st);
      if (res.error) setError(res.error);
    });
  };
  const pick = (st: DotStatus) => { setStatus(st); save(st); }; // chip click saves immediately
  const remove = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteDot(dot.id);
      if (res.error) setError(res.error); else onClose();
    });
  };
  const convert = (fn: typeof convertDotToLead) => (fd: FormData) => {
    setError(null);
    fd.set('dot_id', String(dot.id));
    startTransition(async () => {
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

Deltas vs old file, for the reviewer: main-view `<h4>Dot</h4>` and coords `<p>` removed; `data-lat`/`data-lng` added to root (all views); chips gain `<i>` and lose the inline selected-style (now `--dp-c` only); Save moved into the grid; ✕ became floating `dp-x` (main + read-only); `.row`/`.go`/`.x`/`.btn-s`/`.btn-danger`/`.statuspick` classes no longer used here; read-only view gains `pop-dot` class, static chip, and `Unlabeled dot` fallback (coords fallback removed); forms keep their `<h4>` titles and gain no ✕ (Back remains the exit). Handlers, state, transitions: byte-identical.

- [ ] **Step 2: Run the two test files**

Run: `npm test -- tests/unit/DotPopover.render.test.tsx tests/unit/MapView.dots.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run the full unit suite + typecheck**

Run: `npm test` then `npx tsc --noEmit`
Expected: all pass (268 + the new fallback test = 269), tsc clean.

- [ ] **Step 4: Commit**

```bash
git add components/map/DotPopover.tsx
git commit -m "feat(map): DotPopover markup — dp- classes, --dp-c chips, data-lat/lng, minimal top"
```

---

### Task 3: CSS — dp- block, caret tail, retire old rules, touch targets

**Files:**
- Modify: `app/globals.css` (three regions: ~201–215 popup block, new dp- block after it, coarse-pointer block ~345–353)

**Interfaces:**
- Consumes: Task 2's class names (`dp-x`, `dp-body`, `dp-grid`, `dp-chip`, `sel`, `dp-save`, `dp-btn`, `dp-danger`, `dp-full`, `dp-wide`).
- Produces: final visual. No other file changes.

- [ ] **Step 1: Verify `.pop .row` has no remaining consumers**

Run: `grep -rn "pop .row\|className=\"row\"" components/ app/ --include=*.tsx | grep -iv drawer`
Expected: zero hits inside popup markup (DotPopover no longer renders `.row`; `.pop .row` was scoped to the popup). If a hit appears, STOP and reconcile before deleting CSS.

- [ ] **Step 2: Edit the popup block (globals.css ~201–215)**

Delete these two rules only:

```css
.pop .row { display: flex; gap: 6px; }
.pop .row + .row { margin-top: 6px; }
```

Change `.pop.pop-dot { width: 250px; }` → `.pop.pop-dot { width: 260px; }`.

KEEP untouched: `.pop` (201), `.pop h4`/`.pop p` (202 — form titles and read-only text still use them), `.pop input` (203), `.statuspick`/`.statuspick-wrap` (204–206, 214–215 — drawers), `.pop .go`/`.pop .x` (208–210 — spec: rules stay), `.pop textarea` (212), `.dotcounts` (216–218).

- [ ] **Step 3: Add the dp- block directly after the popup block**

```css
/* DotPopover redesign (spec 2026-07-15): 2-col tinted chip grid + caret tail.
   Every color-mix is pinned to srgb — oklab shifts the tints. All chip color
   flows from --dp-c set inline per chip; the caret and floating ✕ sit on the
   card root, OUTSIDE .dp-body's overflow, so scrolling can't clip them. */
.pop.pop-dot { padding: 14px; }
.pop-dot::after {
  content: ""; position: absolute; top: -7px; left: 50%; width: 12px; height: 12px;
  transform: translateX(-50%) rotate(45deg); background: var(--card);
  border-left: 1.5px solid var(--ink); border-top: 1.5px solid var(--ink);
}
[data-theme="dark"] .pop-dot::after { border-color: var(--line); }
.dp-body { max-height: min(72vh, 440px); overflow-y: auto; }
.dp-x {
  position: absolute; top: 6px; right: 6px; z-index: 1; width: 24px; height: 24px;
  display: grid; place-items: center; padding: 0; background: transparent;
  border: none; color: var(--muted); font-size: 12px; cursor: pointer;
}
.dp-x::after { content: ""; position: absolute; inset: -10px; } /* 44px hit area, 24px glyph */
.dp-x:hover { color: var(--ink); }
.pop-dot input[name="label"] { padding-right: 36px; } /* clearance under the floating ✕ */
.dp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dp-full { grid-column: 1 / -1; }
.dp-wide { width: 100%; margin-bottom: 8px; }
.dp-chip, .dp-btn, .dp-save, .dp-danger {
  min-height: 40px; padding: 0 8px; border-radius: 4px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  cursor: pointer;
}
.dp-chip {
  background: color-mix(in srgb, var(--dp-c) 12%, var(--card));
  border: 1.5px solid color-mix(in srgb, var(--dp-c) 35%, var(--card));
  color: var(--ink);
}
.dp-chip i { width: 8px; height: 8px; border-radius: 50%; background: var(--dp-c); flex-shrink: 0; }
.dp-chip:hover { border-color: color-mix(in srgb, var(--dp-c) 70%, var(--card)); }
/* Selected: stronger tint + solid status border. The border is load-bearing for
   dark-theme unmarked (tint delta is weak there) — keep it ≥1.5px. */
.dp-chip.sel { background: color-mix(in srgb, var(--dp-c) 26%, var(--card)); border-color: var(--dp-c); }
span.dp-chip { margin-bottom: 8px; cursor: default; } /* read-only static chip */
.dp-btn { background: var(--chip); border: 1.5px solid var(--line); color: var(--ink); }
.dp-btn:hover { border-color: var(--ink); }
.dp-save { background: var(--accent); border: 1.5px solid var(--ink); color: var(--on-accent); }
[data-theme="dark"] .dp-save { border-color: var(--accent); }
.dp-danger {
  background: color-mix(in srgb, var(--lost) 14%, var(--card));
  border: 1.5px solid var(--lost);
  /* plain --lost on the light tint is ~4.3:1 — mix toward ink to pass 4.5:1 */
  color: color-mix(in srgb, var(--lost) 75%, var(--ink));
}
[data-theme="dark"] .dp-danger { color: var(--lost); }
button.dp-chip:active, .dp-btn:active, .dp-save:active, .dp-danger:active { transform: scale(.97); }
.dp-chip:disabled, .dp-btn:disabled, .dp-save:disabled, .dp-danger:disabled { opacity: .45; cursor: default; }
```

Do NOT add any `:focus-visible` rule — the global outline (globals.css:50) must keep winning.

- [ ] **Step 4: Add dp- classes to the coarse-pointer 44px block (~line 349)**

In the `@media (pointer: coarse)` block, extend the existing min-height selector list — change:

```css
  .acts button, .pop .go, .pop .x, .statuspick button, .copybtn, .qa a { min-height: 44px; }
```

to:

```css
  .acts button, .pop .go, .pop .x, .statuspick button, .copybtn, .qa a,
  .dp-chip, .dp-btn, .dp-save, .dp-danger { min-height: 44px; }
```

(`.dp-x` needs no min-height — its 44px hit area is the inset `::after`.)

- [ ] **Step 5: Full battery**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all pass, build compiles all routes.

- [ ] **Step 6: Visual check, both themes**

Run: `npm run dev` (local supabase running: `npx supabase start` if not). On `/map` as admin:
- Click map → popup: caret on top edge pointing at dot, no header/coords, ✕ top-right not overlapping label text.
- Chips: tinted at rest, stronger tint + solid border when selected, dot icons colored, text readable.
- Save = accent; Lead/Job = neutral; Delete = red-tinted full width, text readable in LIGHT theme especially.
- Lead/Job forms: titles present, Save Lead/Save Job full-width accent, Back + Delete row, form scrolls inside card on a short window.
- Toggle theme (both light and dark): tints, borders, caret border color all follow.
- Cleaner login: read-only card = static tinted chip + label/notes + ✕ only.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css
git commit -m "feat(map): DotPopover dp- styles — color-mix tinted chips, caret tail, touch targets"
```

---

### Task 4: Whole-branch battery, review, ledger

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append entry)

- [ ] **Step 1: Full battery at branch tip**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: all green. Record counts.

- [ ] **Step 2: Whole-branch review**

Dispatch a code reviewer over `main..HEAD` with the spec (`docs/superpowers/specs/2026-07-15-dotpopover-redesign-design.md`). Focus areas: (a) zero behavior change — handlers/state/actions byte-identical vs old DotPopover; (b) no inline chip colors besides `--dp-c`; (c) MapView fresh-dot regression observable preserved via data attrs; (d) `.statuspick`, `.pop .go/.x` untouched and drawers unaffected; (e) contrast recipe transcribed exactly (12/35/26/14/75 percentages, `in srgb` everywhere); (f) coarse-pointer coverage of every interactive control in all 4 views. Fix findings TDD-style, re-verify.

- [ ] **Step 3: Ledger entry**

Append to `.superpowers/sdd/progress.md`: branch, commits, battery counts, review verdict, deferred minors, owner walkthrough checklist:

```
[ ] Light theme: chips tinted + readable, Delete Dot text legible on pink tint
[ ] Dark theme: same card, tints follow; unmarked selected state readable (border carries it)
[ ] Caret tail points at dot; clamped popup at map edge = tail stays on card (accepted)
[ ] ✕ top-right closes; doesn't cover label text; Esc still closes
[ ] Chip click recolors + saves immediately (unchanged behavior)
[ ] Save/Lead/Job/Delete all work as before; forms titled "New lead"/"New job"
[ ] Small window: job form scrolls INSIDE the card, ✕ stays pinned
[ ] Cleaner: read-only card — static chip, label/notes, "Unlabeled dot" fallback, ✕ only
[ ] Phone/touch: all buttons ≥44px
```

- [ ] **Step 4: Commit ledger + push branch**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(ledger): dotpopover-redesign closeout"
git push -u origin feat/dotpopover-redesign
```

Do NOT merge — owner walkthrough decides.

---

## Self-Review Notes (already applied)

- Caret + scroll conflict solved structurally: `max-height`/`overflow` lives on inner `.dp-body`, caret `::after` and `.dp-x` on the card root — overflow can't clip them, ✕ stays pinned while the body scrolls.
- `span.dp-chip` (read-only) is excluded from `:active` scale by using `button.dp-chip:active`.
- `data-lat`/`data-lng` use the same `toFixed(4)` strings the old text assertion checked — regression precision unchanged.
- `.pop h4`/`.pop p` deliberately kept: form titles and read-only text still consume them.
- Save/`Save Lead` both contain "Save" — the render test's `byText('Save')` check after Back still resolves (main-view Save exists; form is unmounted).
