# Calendar as a third view on Leads and Jobs

Date: 2026-08-10
Branch base: `feat/small-changes`
Supersedes: the standalone `/calendar` page shipped in the small-changes wave (Tasks 4-7, commits `de07b18`..`edb51d8`) — that page is deleted here.

## Why

The owner does not want a separate Calendar nav tab. The calendar should be a view mode of
the records it shows, the same way Board and List already are: `/leads` gets a third toggle,
and `/jobs` gets the same one. Nav loses an item; each screen gains a way to look at its own
records by date.

The standalone page also mixed jobs and leads on one grid, which only made sense because it
had no home. Under `/leads` and `/jobs` each calendar shows exactly one record type.

## Scope

In scope:

- Third view (`?view=calendar`) on `/leads` and `/jobs`.
- `CalendarGrid` reused as-is, re-parameterized for the two hosts.
- Deletion of `app/(app)/calendar/page.tsx`, its nav item, and its title entry.

Out of scope:

- Any change to Board or List behavior.
- Any change to drawer internals, RLS, or DB (no migration in this work).
- Week/day calendar modes, drag-to-reschedule, unscheduled-jobs backlog rail.

## Behavior

### Toggle and URL

`ViewToggle` becomes three-state: `⌗ Board` | `☰ List` | `▦ Calendar`, on both hosts.

| View | URL |
|---|---|
| Board | `/leads` (base, no param) |
| List | `/leads?view=list` |
| Calendar | `/leads?view=calendar` (current month) or `/leads?view=calendar&m=YYYY-MM` |

Identical shape on `/jobs`. `m` is validated by the existing `resolveMonth` regex; anything
malformed falls back to the current month.

Deep links from a chip carry the month so Back/close returns to the same grid:
`/leads?view=calendar&m=2026-08&l=12`, `/jobs?view=calendar&m=2026-08&j=41`.
This is the existing `backTo` convention, extended with `view=calendar`.

Precedence rules that already exist stay as they are: on `/leads` and `/jobs`, the admin-only
History view (`?deleted=1`) wins over any `view` value; `?l=` wins over `?j=` where both hosts
accept both (they do not — each host handles only its own record type).

### Leads calendar

- Admin and rep only. The page already redirects everyone else, so no new gate.
- A lead lands on its **created date** (`created_at.slice(0,10)`).
- Chip color = lead status color (`statusColor`), glyph `◆`.
- Chip opens `LeadDrawer` via `?l=`.
- Deleted leads never appear (page's base fetch excludes them; History is its own view).

### Jobs calendar

- All roles, including cleaners.
- A job lands on its **scheduled date** (`scheduled_date.slice(0,10)`).
- Chip color = job status color (`jobStatusColor`), glyph `●`.
- Chip opens `JobDrawer` via `?j=`.
- Done jobs are included — the calendar doubles as recent history.
- Deleted jobs excluded; unscheduled jobs do not appear at all (the board owns those).
- Cleaners see only their own jobs: the page's existing `visibleJobs(role, uid, allJobs)`
  filter runs before bucketing, so role scoping is inherited, not re-implemented.

### Grid behavior (unchanged from the shipped page)

Month header with `‹ Prev` / `Today` / `Next ›`, weekday row, up to 3 chips per day cell then
`+n more`, click/Enter/Space on a day opens the day panel listing everything on it, and below
the phone breakpoint cells collapse to colored count dots. `key={month}` remount still clears
a stale day panel on month nav while leaving it alone when only a drawer param changes.

### Header actions

All three views render the same `scrhead` action set so the header does not shift as you
switch views:

- `/leads`: ViewToggle · History (admin) · Export CSV · + New lead
- `/jobs`: ViewToggle · History (admin) · Export CSV · + New job (admin/rep)

Export CSV in calendar view exports the same full record set the other views export — it is
not month-scoped. Rationale: the button means "export my leads/jobs" everywhere else, and a
silently different meaning per view is worse than a redundant one.

## Implementation

### Data: no new queries

`/leads` and `/jobs` already fetch their full non-deleted record set unbounded (`order('id')`).
The calendar reuses that data instead of adding a month-scoped fetch:

```
entries = bucketByDay([], leads)   // leads page
entries = bucketByDay(jobs, [])    // jobs page
```

`bucketByDay` already skips jobs with a null `scheduled_date` and needs no change. Buckets
cover every month present in the data; `CalendarGrid` renders only the requested month's days.
Month nav is a normal RSC navigation, exactly as the standalone page did it.

Payload: one `CalEntry` (`kind`, `id`, `label`, `color`) per record — smaller than the full
`Lead`/`Job` objects the Board already serializes to the client. No new payload concern.

### Components

**`components/ui/ViewToggle.tsx`** — `view` prop widens to `'board' | 'list' | 'calendar'`;
third button pushes `${base}?view=calendar`.

**`components/calendar/CalendarGrid.tsx`** — the `showLeads: boolean` prop is replaced by
`kind: 'lead' | 'job'`. That single prop derives:

- base path: `'/leads'` for `lead`, `'/jobs'` for `job`
- chip href: `${base}?view=calendar&m=${month}&${kind === 'lead' ? 'l' : 'j'}=${id}`
- nav hrefs: `${base}?view=calendar&m=${addMonths(month, ±1)}`, Today = `${base}?view=calendar`
- hint text: `◆ leads by created` or `● jobs by schedule`

Everything else in the component is untouched. `CalEntry.kind` still drives the per-chip glyph;
with single-kind hosts every chip in a grid now carries the same glyph, which is correct.

**`components/leads/LeadsCalendarSection.tsx`** (new, client) — props
`{ leads, month, entries, admin, money, canEdit }`. Renders the `scrhead` with ViewToggle
(`view="calendar"`), HistoryToggle for admin, Export CSV (built from `leads` via
`leadsCsvTable`, same as LeadsListSection), + New lead, then
`<CalendarGrid key={month} month={month} entries={entries} kind="lead" />`.
The + New button pushes `/leads?view=calendar&m=${month}&new=1` so the drawer closes back
onto the calendar.

**`components/jobs/JobsCalendarSection.tsx`** (new, client) — props
`{ jobs, month, entries, admin, money }`, `kind="job"`, + New job gated by `money`
(admin/rep — same `canCreate` rule as JobsListSection), pushing
`/jobs?view=calendar&m=${month}&new=1`. Calls `useJobsRealtime()` like the board and list
sections so a claim in another window refreshes the grid too.

### Pages

`app/(app)/leads/page.tsx`:

- `searchParams` gains `m?: string`.
- `const cal = view === 'calendar'`, `const month = resolveMonth(mParam, new Date())`.
- `backTo` becomes: history/list/calendar-aware — `cal ? \`/leads?view=calendar&m=${month}\` : list ? '/leads?view=list' : '/leads'`.
- Render `LeadsCalendarSection` when `cal`, before the existing list/board branch.
- Drawer rendering below is unchanged (`selected || isNew`).

`app/(app)/jobs/page.tsx`: the same three additions, `bucketByDay(jobs, [])`, `JobsCalendarSection`.

### Removals

- `app/(app)/calendar/page.tsx` — deleted.
- `lib/nav.ts` — `/calendar` NAV_ITEMS entry and TITLES entry removed; items renumbered
  `01`-`09` (Invoices 06→05, Customers 07→06, Cleaners 08→07, Expenses 09→08, Settings 10→09).
- `lib/calendar.ts` — `monthWindow()` loses its only caller (the deleted page did the
  month-scoped fetch); delete the function and its unit tests rather than keep dead code.
  `resolveMonth`, `addMonths`, `monthLabel`, `monthGrid`, `bucketByDay` all stay.
- No redirect stub for `/calendar`: the route only ever existed on the unmerged
  `feat/small-changes` branch, so no bookmark or shared link can point at it.

## Testing

New/updated unit tests (Vitest + Testing Library, matching existing patterns):

1. `ViewToggle` — renders three buttons; `aria-pressed` true on exactly the active one; each
   click pushes the right URL for both `base` values.
2. `CalendarGrid` — with `kind="lead"`, chip href is `/leads?view=calendar&m=..&l=<id>` and hint
   reads leads-by-created; with `kind="job"`, `/jobs?view=calendar&m=..&j=<id>` and jobs-by-schedule.
   Prev/Today/Next hrefs carry the right base. Existing grid/day-panel/cap tests retained.
3. `LeadsCalendarSection` / `JobsCalendarSection` — header renders ViewToggle + Export + New;
   History appears for admin only; New job hidden from cleaners.
4. `bucketByDay` — empty-jobs and empty-leads calls bucket only the populated side (guards the
   single-kind hosts).
5. `nav` tests — `/calendar` absent for every role; renumbering asserted; `titleFor('/calendar')`
   no longer special-cased.

Full battery before closeout: `npm run lint`, `tsc --noEmit`, unit suite, `next build`.
No DB changes, so pgTAP is unaffected (sanity run optional).

## Risks

- **Nav renumbering churn**: numbers are cosmetic labels, but the nav test asserts them. Update
  the test with the source, in the same commit.
- **URL param collision**: `/jobs` already uses `view`, `deleted`, `j`, `new`; adding `m` is
  additive. Verified no existing consumer reads `m` on either host.
- **Cleaner regression**: cleaners lose the nav Calendar item and gain it inside `/jobs`. The
  walkthrough must confirm a cleaner can reach the calendar and sees only their own jobs.
