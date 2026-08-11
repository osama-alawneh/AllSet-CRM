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

## 4. Backgrounds: transparent map popup, muddy dropdowns

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

**Fix direction:** anything that floats over other content needs an opaque surface — `--card`, or a
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
