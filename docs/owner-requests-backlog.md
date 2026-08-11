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

## 6. Leads: field panes → windows

Owner: *"on leads tape switch the field panes to windows instead."*

**Needs clarification before specced.** `LeadDrawer` currently stacks `.sec` blocks down a side
panel. Candidate readings:
- the drawer becomes a centred modal window instead of a side panel;
- the stacked sections become separate tabbed windows/panes within the drawer;
- something about the Leads board/list/calendar tabs specifically.

Ask the owner which, with the current screen on-screen, before designing anything.

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
