# AllSet — Owner Request Backlog

Running list of what the owner has asked for and nobody has built yet. One entry per request, in the
order they were raised. Nothing here is started. When an item gets specced, link the spec; when it
ships, move it out and note the commit.

Source of truth for *status* is still `.superpowers/sdd/progress.md`; this file is the source of
truth for *what was asked and why*.

Raised 2026-08-10 by the owner, after walking the skinned build on `exp/theme-directions`.

---

## 1. Live GPS on the map

Reps and cleaners should see their own live position on `/map` — position that follows them, not the
one-shot recentre we ship today (`GeolocateControl`, commit `9ebb076`, which recentres until the
first pan and then stops).

Owner's second half, in his words — *"i dunno how hard it is, but can I make admin track the cleans
and reps if they have their live map on?"* — an admin view of where staff currently are, for those
who have sharing turned on.

**Open questions for the spec**
- Consent: this is staff location tracking. It needs an explicit, visible per-user opt-in, not a
  silent default, and the user needs to see when it's on.
- Storage: ephemeral broadcast over the existing realtime channel, or a persisted table with RLS and
  a retention window?
- Visibility: admins only, or can cleaners see each other?
- Phones: battery drain and the permission prompt story.

---

## 2. Create a lead or job with only a customer *name*

Today the lead/job create panel makes you pick an existing customer. A rep standing in front of a
prospect doesn't have time to fill a full customer record.

Wanted: type a **name** into the customer field; if nothing matches, creating the lead/job
auto-creates a customer carrying just that name, links it, and the lookup resolves to it from then
on.

**Touches** `components/customers/CustomerLookup.tsx`, the lead and job create paths, and the server
actions that insert them.

**Watch**
- Near-miss typing on an existing name would silently spawn duplicates — needs a dedup decision.
- Role gates: can a rep create customers this way, or only an admin?

---

## 3. Red dot on incomplete customers, plus created-by

The completion path for the shallow customers item 2 creates.

- A red dot beside the customer name in the customers view when **phone or address is missing**.
- Surface **who created** the record, so an admin looking at a pile of red dots can go back to that
  person and get the gaps filled.

**Watch**
- Check whether a `created_by` column already exists. If not, this needs a migration and pgTAP
  coverage, not just UI.
- Don't signal by colour alone — pair the dot with a title/aria-label such as "missing phone".

---

## 4. Backgrounds: transparent map popup, muddy dropdowns — FIXED 2026-08-13

Owner: the map popup is transparent and unreadable, and a lead's service-type dropdown renders grey
and hard to read — *"double check with all drop down lists"*.

**Both are regressions from the glass skin on `exp/theme-directions`**, confirmed in code, not
pre-existing:

- `DotPopover` renders `pop box pop-dot` (`components/map/DotPopover.tsx:35`), and commit `f2ef5bd`
  turned `.box` into a translucent white-alpha gradient (`--surface`). Over map tiles it shows
  straight through.
- `input, select, textarea` get `background: var(--field)`, which is `rgba(0, 0, 0, .22)` dark and
  `rgba(255, 255, 255, .80)` light. Native `<option>` lists inherit the select's background, so
  translucency turns them muddy.

**Fixed on `main`:** `--field-solid` (the flattened equivalent of `--field`) now backs `select`
and `option`, and `.pop` / `.sresults` override `.box`'s translucent `--surface` with `--card`.
`.searchbox-list` and `.drawer` were already opaque; `.caldaypanel` is in-flow, not an overlay,
so it keeps the glass.

**Original fix direction:** anything that floats over other content needs an opaque surface — `--card`, or a
`.box--solid` variant — and `select`/`option` need opaque backgrounds in both themes. Then sweep
every overlay: `.sresults` (global search), `.searchbox-list` (map search), `.caldaypanel`, and the
drawers.

---

## 5. Delete, not deactivate, for customers with no history

A customer with **no leads, no jobs and no invoices** should offer **Delete** rather than
Deactivate — the point is cleaning up mistyped customers, which item 2 will produce more of.

Keep Deactivate for customers that *do* have history; that distinction is the whole feature.

**Watch**
- The dependent check has to be server-side and race-safe, not a UI guess — a job could be created
  between render and click.
- Decide hard delete vs soft: the rest of the app uses `deleted_at` and the History view.
- Existing danger-button styling is uniform now; Delete should use it as-is.

---

## 6. Leads: rename the "Panes" field to "Windows"

Owner: *"on leads tape switch the field panes to windows instead."*

**Clarified 2026-08-10** — this is a copy change, not a layout one. "Panes" is a field on the lead
(`LeadDrawer.tsx:116` read view, `:201` edit input), sitting between Stories and Quote. The owner
wants it labelled **Windows**.

**Touches:** the label in both the read and edit views, the leads list/board column headers if they
name it, the CSV export header (`lib/csv.ts`), and any placeholder copy that says "panes" (e.g. the
lead description placeholder "12 front panes, 2nd-story ladder…").

**Watch:** rename the *label* only. The DB column, the `panes` form field name and the server action
all keep their names unless we deliberately do a migration — don't half-rename the data layer.

---

## 7. Jobs: the date picker's calendar icon is near-invisible

The job date field (`components/jobs/JobDrawer.tsx:356`, `type="datetime-local"`) shows a black
calendar glyph on the dark surface. Owner wants it light enough to see.

**Cause:** nothing in `app/globals.css` declares `color-scheme`, so the browser paints native form
controls — including the date picker's icon — with light-theme chrome regardless of our theme.

**Fix direction:** declare `color-scheme: light` on `:root` and `color-scheme: dark` under
`[data-theme="dark"]`. That fixes every native control at once (date pickers, scrollbars, spinners),
not just this one icon. Check the expenses date field too
(`components/expenses/ExpensesSection.tsx:112`).

---

## 8. Expenses rows should open like every other entity

Owner: *"on expenses, why it's not clickable? I wanna be able to see all it's details, edit it,
delete same as all other entities."*

Confirmed: `ExpensesSection` has a **create** drawer and a per-row delete button, but no row click
and no detail/edit drawer — so expenses is the one entity without the read/edit path that customers,
leads, jobs and invoices all have.

**Wanted:** click a row → drawer with full detail, edit in place, delete from there. Match the
existing drawer conventions (`?e=<id>` deep link, `backTo` on close, role gates, uniform danger
button) so it behaves like the rest.

---

## 9. Numeric fields seeded with 0 instead of an empty field + placeholder

Owner: the number fields start at `0`; clicking in doesn't clear it, so typing `500` with the caret
left of the existing zero yields `5000`. He wants the zero to be a **placeholder**, not a value.

**Confirmed, and it's narrower than it looks.** Only two fields actually seed a literal zero:

| Field | Where | Today |
|---|---|---|
| Stories | `components/leads/LeadDrawer.tsx:199` | `defaultValue={lead?.stories ?? 0}` — seeds `0` |
| Panes (→ Windows, item 6) | `components/leads/LeadDrawer.tsx:201` | `defaultValue={lead?.panes ?? 0}` — seeds `0` |

The money fields are already right on **create**: Quote (`LeadDrawer.tsx:214`) and Price
(`JobDrawer.tsx:358`) both use `?? ''` with a `0.00` placeholder, as do `cleaner_amount` (`:360`)
and `recur_days` (`:363`).

But they still show a hard `0` when **editing an existing record whose stored value is 0** — `??`
only falls through on null, so a real zero renders as `0` and hits the same caret trap. That's
probably where the owner saw it on jobs.

**Fix direction**
- Drop the `?? 0` on stories and panes; use `''` with a `0` placeholder, matching the money fields.
- Add select-on-focus to the numeric inputs (`onFocus={e => e.target.select()}`) so typing replaces
  the value instead of splicing into it. This is what actually kills the `5000` bug, including for
  legitimately-stored zeros where we can't just blank the field.
- Confirm the server actions still coerce empty → 0 (or null) on submit, so clearing a field doesn't
  become `NaN`. There's a prior rider about `recur` 0-coercion in the ledger worth re-reading.

---

## 10. Navigation feels slow — measured, with a ranked fix list

Raised 2026-08-13, after the first production deploy. Owner: *"why when navigating screens I feel
there is this delay. even the user noticed it."* The owner's own framing of the fix he wants: the
page should **open immediately showing the front end — table, dashboard, whatever — with a blurred
placeholder where the data will land**, rather than a spinner over a blank screen.

### What was already done (do not redo)

Functions ran in `iad1` (Virginia) while the Supabase project lives in `us-west-2` (Oregon).
`vercel.json` now pins them to `pdx1`, which is us-west-2. Authenticated pages went from ~880ms to
~490ms TTFB. Commit `102d7be`.

### Measured breakdown of one navigation

Taken on the live deployment via a temporary `/api/perf` probe that runs the same work a page render
does, phase by phase. The rig is on branch `perf/latency-probe` — reuse it to verify any fix rather
than re-deriving it.

| Phase | Warm | Cold |
| --- | --- | --- |
| `auth.getUser` — asks Supabase to identify the user, over the network | 55ms | 127ms |
| `auth.roleQuery` — the `profiles` role lookup, which cannot start until the above returns | 25ms | 53ms |
| dashboard's 9 queries — already parallel via `Promise.all` | 80ms | 93ms |
| Next render + function overhead | ~40ms | ~400ms |
| Network, Midwest user to Oregon | ~150-200ms | same |
| **Total per navigation** | **~350-500ms** | **~700-900ms** |

Two things this rules out. The app's own query code is **not** the problem: a bare
`select id limit 1` costs 25-35ms, and a raw `fetch` bypassing supabase-js costs the same, so that is
simply the floor for talking to Supabase at all. Nor is it connection setup: five identical queries
back to back measured 46, 25, 35, 27, 26ms — only the first pays warm-up.

**The dominant problem is perceptual, not arithmetic.** There is no `loading.tsx` anywhere in the
app. In the App Router a click to a fully dynamic route leaves the *old page on screen, unchanged*,
until the new one is completely ready — no spinner, no skeleton, no acknowledgement. 400ms of
nothing reads as a dead click. Per `node_modules/next/dist/docs/01-app/02-guides/prefetching.md`,
it also means dynamic routes are **not prefetched at all** without a loading boundary, and the
client route cache is off by default, so hovering a nav link currently does nothing and revisiting
a page you saw ten seconds ago still costs a full round trip.

There is no caching of any kind today: `next.config.ts` is empty (no `cacheComponents`), no
`use cache` exists in the codebase, and every response carries `Cache-Control: private, no-cache,
no-store`.

### Items 1-3 — DONE 2026-08-13, commits `0bc1154..67a01b8`

1. **Suspense boundaries with skeleton fallbacks on every list page.** This is precisely the
   behaviour the owner described: shell paints at once, each data region shows a placeholder, rows
   stream in. Reference: `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`.
2. **Prefetching, which switches itself on once item 1 exists.** No new code — a loading boundary is
   the precondition Next requires before it will prefetch a dynamic route. Hovering a nav link then
   warms the page, so the data is often already there on click.
3. **Client route cache** via `staleTimes` in `next.config.ts` (~30s for dynamic). Returning to a
   page you just visited becomes instant with no server call. The only cost is lists up to 30s
   stale, which is nothing for this app's cadence.

Together these fix what the owner and his user actually noticed, and none of them can serve wrong
data to the wrong person.

**What shipped.** `components/skeleton/Skeleton.tsx` (eight primitives reusing the real screens'
class names) plus a `loading.tsx` on all nine `(app)` routes — dashboard, customers, jobs, leads,
invoices, expenses, cleaners, settings, map. `next.config.ts` gained
`experimental.staleTimes = { dynamic: 30, static: 180 }`. Shimmer CSS is at the end of
`app/globals.css`; the existing global `prefers-reduced-motion` rule already kills it, so there is
no second opt-out. Item 1 landed as **route-level** loading boundaries, not in-page `<Suspense>`:
the finer-grained version means moving every page's fetching into child components and it tangles
with item 6, so it is deliberately not done here. No `cacheComponents`, no `use cache`, and nothing
in `lib/auth.ts` / `proxy.ts` was touched. 16 new tests, battery 327 → 343 green.

**Measured, same machine, production build, admin session, `/dashboard` `/jobs` `/customers`:**

| | prefetch payload | prefetch | RSC navigation |
| --- | --- | --- | --- |
| Before (no loading boundary) | **206-211 B, no shell** | 60-183ms | 117-247ms |
| After | **13.8-18.0 KB, contains the skeleton** | 109-142ms warm | 114-120ms warm |

The payload size is the whole point: at 211 bytes Next was declining to prefetch a dynamic route at
all, exactly as `prefetching.md` documents. Now hovering a nav link downloads the destination's
shell, so the click paints it with no server round trip, and `staleTimes.dynamic` keeps that shell
for 30s afterwards. Production baseline for comparison remains the numbers measured above:
`/dashboard` 310-520ms, `/customers` 317-518ms, no prefetch.

**Not yet measured on production.** The authenticated preview probe needs a session cookie, and the
production service-role key that would mint one comes back `[SENSITIVE]` from `vercel env pull`, so
the numbers above are local. Preview deployment carrying this work:
`https://allset-jk62mefx1-all-set-crm.vercel.app` (shimmer CSS confirmed present in its served
stylesheet). Owner to confirm the feel in a browser.

### Items 4-6 — NEED CARE. Real wins, but each can break something.

4. **Verify the auth token locally instead of asking Supabase over the network** (−55ms on *every*
   navigation, and it unblocks the role lookup 55ms earlier). Care: this is the authentication path.
   Getting local JWT verification subtly wrong — accepting an expired token, skipping signature
   checks, mishandling key rotation — is an auth bypass, not a slow page. Wants tests written before
   the change, and the existing `getSession`/`getRole` contract preserved exactly.
5. **Carry the user's role in their token** rather than querying `profiles` on every render (−25ms,
   and removes a step that currently blocks *all* data fetching behind it). Care: the role then
   lives in two places, so it goes stale the moment an admin changes someone's role — that user
   keeps their old permissions until their token refreshes. Needs a deliberate answer for
   invalidation, and it is implemented as a Supabase-side access-token hook, so it is infrastructure
   config that must be reproducible, not a code change alone.
6. **Cache Components (`cacheComponents: true` + `use cache`) for the shell.** Care: this app's rows
   are RLS-scoped per user and per role — a cleaner must never see admin money data. Cached results
   are keyed by the cached function's arguments, so a cache key that omits user or role serves one
   user's data to another. That is a data leak, not a rendering bug. Cache the *shell* — layout,
   nav, table chrome — freely; cache rows only with identity in the key, deliberately, and last.
   The `unstable_instant` route export exists to fail the build if a later change reintroduces a
   blocking query, and should be adopted alongside it.

### Ordering

Do 1-3 as one change, re-measure with the `perf/latency-probe` rig, then decide 4-6 with fresh
numbers rather than these ones. 4 and 5 roughly halve remaining server time (~160ms to ~80ms); 6 is
the finishing move once the rest is proven.
