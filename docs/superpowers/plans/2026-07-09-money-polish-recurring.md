# Money Polish + Recurring Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner walkthrough feedback round 1 — recurring jobs, JobDrawer/JobCard polish, create-flow consistency (expense/user drawers), cleaners tab, unclaimed-jobs nav badge, and three fixes — per `docs/superpowers/specs/2026-07-09-money-polish-recurring-design.md`.

**Architecture:** Continues the DB-centric money model on branch `feat/money-model`. Recurrence is two columns on `jobs` + a spawn block inside `set_job_status` (SECURITY DEFINER), proven by pgTAP. All UI work restyles/rearranges existing client components; the only new data surfaces are a jobs+customers fetch on /expenses (combobox), a /cleaners page reusing the `cleaner_earnings` view + `leaderboard()` helper, and an unclaimed head-count in the app layout.

**Tech Stack:** Next.js 16.2.10 App Router (verify conventions in `node_modules/next/dist/docs/`), React 19, Supabase local, Vitest (+ jsdom per-file docblock render tests), pgTAP via `npm run test:db`, plain CSS tokens.

**Spec:** `docs/superpowers/specs/2026-07-09-money-polish-recurring-design.md` — read it if a requirement seems ambiguous; the spec governs.

## Global Constraints

- **Owner mandate:** all frontend design via the `ui-ux-pro-max` skill; cross-screen consistency is rule #1. Blueprint+ vocabulary only (`.box`, `.btn`, `.btn sec`, `.btn-danger`, `.btn-s`, `.lbl`, `.num`, `.chip`, `.tbl`, tokens). Touch targets ≥ 44px.
- **Verbatim-copy discipline:** every recreated DB function copies its NEWEST existing definition (grep ALL migrations — as of plan-writing: `set_job_status` newest in **0026**, `create_job`/`update_job` newest in **0025**; VERIFY, don't trust this sentence) with only the described delta. Preserve security definer, `search_path = ''`, role checks, grants.
- Visibility matrix unchanged: cleaners never see `price`; `recur_days`/`recur_parent_id` stay OFF `jobs_public` (cleaners never see recurrence metadata). Expenses/`company_revenue` admin/rep only. `cleaner_earnings` readable by all roles; split math lives ONLY in that view.
- Create-flow rule: entity create = button + side `Drawer` (components/ui/Drawer.tsx: `{ onClose, labelId?, children }`, focus trap + Escape built in), closes on successful create.
- Every task ends green: `npm run lint && npx tsc --noEmit && npm test`; DB tasks add `npx supabase db reset` + `npm run test:db`; wave ends with `npm run build` + owner walkthrough round 2.
- Commit after every task, staging only files the task touched. NEVER stage the untracked `lint-output.txt`.
- pgTAP fixture ids in the 900k range; mirror `supabase/tests/money_model.sql` idioms exactly.

---

### Task 1: Migration 0027 — recurring jobs schema + RPC deltas

**Files:**
- Create: `supabase/migrations/0027_recurring_jobs.sql`
- Modify: `supabase/tests/money_model.sql` (new assertion group; keep `plan(n)` accurate)

**Interfaces:**
- Produces: `jobs.recur_days int`, `jobs.recur_parent_id bigint`, partial unique index `jobs_one_spawn_per_parent`; `create_job`/`update_job` re-signatures with `p_recur_days int default null` as LAST parameter; `set_job_status` spawns the successor on done. Tasks 2-4 build on these names.

- [ ] **Step 1: Failing pgTAP**

Extend `supabase/tests/money_model.sql` (same session helpers / fixture style, 900k ids) with a new group asserting:

1. `create_job(..., p_recur_days => 14)` stores 14; `p_recur_days => 0` and omitted both store NULL.
2. `update_job(..., p_recur_days => 7)` sets 7; `p_recur_days => null` keeps 7; `p_recur_days => 0` clears to NULL.
3. `create_job(..., p_recur_days => -3)` raises.
4. Recurring job (recur_days 14, scheduled_date known, price 200, pot 80, description set) moved to done via `set_job_status`: exactly one new job exists with `recur_parent_id = <parent>`, `status='unclaimed'`, `claimed_by is null`, same customer/service/description/price/cleaner_amount/recur_days, `scheduled_date = parent.scheduled_date + interval '14 days'`.
5. Bounce parent done → in_progress → done: still exactly one successor.
6. Non-recurring job to done: zero successors.
7. Successor (inherits recur_days) to done: spawns its own successor (chain).
8. Parent with NULL scheduled_date to done: successor `scheduled_date` is not null (now()-based).
9. Cleaner session reads the successor via `jobs_public` (normal unclaimed row); `jobs_public` has no `recur_days` column (mirror the existing no-price column pin style).

Run: `npm run test:db` → new group FAILS (columns/params missing).

- [ ] **Step 2: Write migration 0027**

```sql
-- Recurring jobs (owner item 12, spec 2026-07-09-money-polish-recurring-design.md).
-- Provenance: set_job_status copied from 0026; create_job/update_job copied from 0025 — VERIFY via grep before finalizing.

alter table jobs add column recur_days int
  check (recur_days is null or recur_days > 0);
alter table jobs add column recur_parent_id bigint references jobs(id);
-- A finished job spawns at most one successor, ever — done-bounces and deleted
-- successors alike cannot respawn (owner edits the chain's newest job instead).
create unique index jobs_one_spawn_per_parent on jobs (recur_parent_id)
  where recur_parent_id is not null;
```

Then recreate, verbatim + delta:

- `create_job` / `update_job`: add `p_recur_days int default null` as LAST parameter. Drop the old 6-arg/`p_cleaner_amount`-tail signatures first and re-grant execute (mirror how 0024/0025 handled re-signatures). Shared validation in both: `if p_recur_days is not null and p_recur_days < 0 then raise exception 'Repeat days must be positive'; end if;`. Write semantics:
  - create: insert `case when coalesce(p_recur_days, 0) = 0 then null else p_recur_days end` into `recur_days`.
  - update: `recur_days = case when p_recur_days is null then recur_days when p_recur_days = 0 then null else p_recur_days end` (0 = clear, null = keep — same form-boundary convention as blankMoneyToZero).
- `set_job_status`: inside the existing `p_status = 'done'` branch, AFTER the payout-expense insert, add (match the copied body's variable names — `p_job_id` here stands for whatever it uses):

```sql
    insert into public.jobs
      (customer_id, service, description, scheduled_date, price, cleaner_amount,
       status, recur_days, recur_parent_id)
    select j.customer_id, j.service, j.description,
           coalesce(j.scheduled_date, now()) + make_interval(days => j.recur_days),
           j.price, j.cleaner_amount, 'unclaimed', j.recur_days, j.id
      from public.jobs j
     where j.id = p_job_id and coalesce(j.recur_days, 0) > 0
    on conflict (recur_parent_id) where recur_parent_id is not null do nothing;
```

  The bounce-back branch (leaving done) deletes the payout expense as today but does NOT touch the successor job (spec: real scheduled work survives).

- [ ] **Step 3: Apply + verify**

`npx supabase db reset` (0001-0027 clean) then `npm run test:db` → all suites green including Step 1's group. Also `npm run lint && npx tsc --noEmit && npm test` (no app changes yet — must stay green).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0027_recurring_jobs.sql supabase/tests/money_model.sql
git commit -m "feat(recur): recurring jobs — spawn-on-done, once-only, every-N-days field"
```

---

### Task 2: lib layer — Job recur fields, parser, drag-claim rule, action threading

**Files:**
- Modify: `lib/jobs.ts`, `app/(app)/jobs/actions.ts`, `app/(app)/jobs/page.tsx` + `app/(app)/map/page.tsx` (base-table select lists gain `recur_days,recur_parent_id` — admin/rep branch ONLY; jobs_public selects unchanged)
- Test: `tests/unit/jobs.test.ts`

**Interfaces:**
- Consumes: Task 1's `p_recur_days` param.
- Produces: `Job` gains `recur_days: number | null; recur_parent_id: number | null` (buildJobs maps with the existing null-default idiom for absent columns); `parseJobForm` returns `recur_days: number` (blank → 0, mirroring `blankMoneyToZero`'s clear convention — read that helper first); `canTransition` allows `unclaimed → claimed` for admin and cleaner (Tasks 3-4 rely on this exact rule).

- [ ] **Step 1: Failing unit tests**

Extend `tests/unit/jobs.test.ts`: `parseJobForm` blank recur → 0, `'14'` → 14, `'2.5'` → error `'Repeat days must be a whole number'`, negative → same error; `canTransition('cleaner', uid, unclaimedJob, 'claimed') === true`, same for `'admin'`, `false` for `'rep'`; all other transition cases unchanged (spot-check cleaner foreign job still false). Run → FAIL.

- [ ] **Step 2: Implement**

`canTransition` — replace the current line `if (job.status === 'unclaimed' && to === 'claimed') return false;` with:

```ts
  // Drag-to-claim (owner 2026-07-09): dropping an unclaimed job on Claimed is a CLAIM
  // for cleaners AND admins (admin does field work too) — the board routes it through
  // the race-safe claimJob action, never set_job_status. Reps stay view-only here.
  if (job.status === 'unclaimed' && to === 'claimed') return role === 'admin' || role === 'cleaner';
```

`parseJobForm`: add `recur_days` mirroring how the money fields flow through `blankMoneyToZero` (blank → 0 = clear), plus integer validation producing the error string above. `Job` type + `buildJobs` mapping. Actions: thread `p_recur_days: v.recur_days` into the `create_job`/`update_job` rpc param objects; add `revalidatePath('/expenses')` to `setJobStatus` (payout rows track status).

- [ ] **Step 3: Verify + commit**

`npm run lint && npx tsc --noEmit && npm test` green.

```bash
git add lib/jobs.ts "app/(app)/jobs/actions.ts" "app/(app)/jobs/page.tsx" "app/(app)/map/page.tsx" tests/unit/jobs.test.ts
git commit -m "feat(recur): job recur fields, parser + drag-claim transition rule"
```

---

### Task 3: JobDrawer — pot placement, members table, request button, recur field

**Files:**
- Modify: `components/jobs/JobDrawer.tsx`, `app/globals.css` (only if a new class is truly needed — prefer existing vocabulary)
- Test: `tests/unit/JobDrawer.render.test.tsx`

**Interfaces:**
- Consumes: `Job.recur_days`/`recur_parent_id`, `parseJobForm`, existing `members`/`uid`/`canDecide` wiring, `requestJoin`/`decideJoin` actions, `shareOf`.
- Produces: no new exports; drawer markup contract for Task 10's walkthrough.

Invoke `ui-ux-pro-max` before writing markup. Requirements (spec §B):

- [ ] **Step 1: Failing render tests** — update/extend `tests/unit/JobDrawer.render.test.tsx`: (a) members render as a table with rows for owner (★ + "owner"), approved, pending (Approve/Reject buttons only when canDecide); (b) empty-members claimed job shows "no joiners requested" row; (c) per-member share numbers ABSENT (assert the share string appears at most once — the cleaner's own "your share" line); (d) non-member cleaner sees a `Request to join` button inside the actions row; after own pending row exists, a gray `Requested` button renders instead; (e) admin sees `↻ every 14 days` when `recur_days: 14`; cleaner drawer never contains the string `Repeat`. Run → FAIL.
- [ ] **Step 2: Implement**
  - Details block: `Cleaner pot` kv row directly beneath Price (admin/rep both rows; cleaner pot-only + existing `your share` line, which stays and remains the ONLY share figure in the drawer).
  - Recur: admin/rep-only kv rows — `↻ Repeats` → `every N days` when set; `Spawned from` → `#NNNN` (padStart-4, plain text) when `recur_parent_id` set. Edit form gains `Repeat every ___ days` `.num` input (`name="recur_days"`, `defaultValue={job?.recur_days ?? ''}`) beside/below the money row.
  - Members table replaces the current members section, moved BELOW the actions row: `.tblwrap > table.tbl`, columns Member / Status / Action; pending rows show `Approve`/`Reject` `.btn-s` (canDecide gating unchanged); others em-dash; empty state one row colSpan 3 `no joiners requested`. Visible to all roles on claimed jobs.
  - Request-to-join: bordered button in the actions row ABOVE Close, in-progress accent (`borderColor`/`color` from the `--prog` token family); own-pending state renders a non-interactive gray `Requested` button in the same slot (`disabled`, muted token colors). Error still lands in the existing `form-err` slot.
- [ ] **Step 3: Verify + commit** — render tests green; `npm run lint && npx tsc --noEmit && npm test`.

```bash
git add components/jobs/JobDrawer.tsx tests/unit/JobDrawer.render.test.tsx app/globals.css
git commit -m "feat(jobs): drawer polish — pot under price, members table, prominent join button, recur field"
```

---

### Task 4: JobCard number + badge redesign, drag-to-claim, done-without-pot confirm

**Files:**
- Modify: `components/jobs/JobCard.tsx`, `components/jobs/JobsBoard.tsx`, `components/jobs/JobDrawer.tsx` (confirm in `change()`), `app/globals.css`
- Test: `tests/unit/JobCard.render.test.tsx` (new, jsdom docblock pattern from `tests/unit/LeadCard.render.test.tsx`)

**Interfaces:**
- Consumes: Task 2's `canTransition` rule, existing `claimJob`/`setJobStatus` actions, `pendingCount` prop.
- Produces: none new.

- [ ] **Step 1: Failing render test** — JobCard shows `#0042` for job id 42; badge renders `⏳ 2` inside one styled pill when `pendingCount={2}` and is absent when 0/undefined. Run → FAIL.
- [ ] **Step 2: JobCard** — job number in the meta line (`#${String(job.id).padStart(4, '0')}`); replace the amber `.lbl` badge with a fitted pill (new `.pendchip` class in globals.css: `--follow` background, `var(--on-status)` text, radius, `padding: 2px 8px`, `white-space: nowrap`, min-height respecting the coarse-pointer rules; ui-ux-pro-max for final values). Display-only, no handlers — drag wiring untouched.
- [ ] **Step 3: Drag-to-claim** — in `JobsBoard`'s drag-end handler: when the drop is `unclaimed → claimed`, call the existing `claimJob(jobId)` action instead of `setJobStatus` (read the handler first; keep the pending-gate and error surfacing it already has — a lost race shows the existing "already claimed" error).
- [ ] **Step 4: Done-without-pot confirm** — both paths, same message: `'No cleaner pot set — no payout will be created. Continue?'`. Drawer: at the top of `change(st)`, `if (st === 'done' && !(job.cleaner_amount != null && job.cleaner_amount > 0) && !window.confirm(...)) return;`. Board: same guard in the drag-end handler before dispatching a move to `done`. (Render test optional here; the JobDrawer test file already stubs confirm patterns — add accept/decline cases if cheap.)
- [ ] **Step 5: Verify + commit** — battery green.

```bash
git add components/jobs/ app/globals.css tests/unit/JobCard.render.test.tsx tests/unit/JobDrawer.render.test.tsx
git commit -m "feat(jobs): card number + pending pill, drag-to-claim, done-without-pot confirm"
```

---

### Task 5: Expenses — New-expense drawer + job combobox + danger delete

**Files:**
- Modify: `components/expenses/ExpensesSection.tsx`, `app/(app)/expenses/page.tsx`
- Create: `components/expenses/JobLookup.tsx`
- Test: `tests/unit/ExpensesSection.render.test.tsx`

**Interfaces:**
- Consumes: `Drawer` component, `addExpense`/`deleteExpense` actions, CustomerLookup as the combobox pattern (`components/customers/CustomerLookup.tsx` — read it first, mirror its ARIA/keyboard shape).
- Produces: `JobLookup` props `{ jobs: { id: number; label: string }[]; name: string }` (hidden input carries the picked id under `name`); page passes `jobOptions` to `ExpensesSection`.

- [ ] **Step 1: Page data** — `app/(app)/expenses/page.tsx` adds two parallel fetches (Promise.all with the expenses query): `jobs` base table `id,customer_id` (`deleted_at is null`, order id desc; page is admin/rep-gated so base reads are fine) and `customers` `id,name,address`. Build `jobOptions = [{ id, label: '#0007 — Sarah Kim, 142 Maple Ave' }]` (padStart-4; em-dash fallbacks for missing name/address).
- [ ] **Step 2: Failing render tests** — add form is NOT rendered inline; a `＋ New expense` button opens a dialog (`role="dialog"`) containing the form; successful submit closes the dialog (mock `addExpense` resolves `{}`); `JobLookup` filters options as you type and clicking an option sets the hidden `job_id` input; delete button carries `btn-danger` class. Update existing tests that assumed the inline form. Run → FAIL.
- [ ] **Step 3: Implement** — `ExpensesSection` gains `const [creating, setCreating] = useState(false)`; scrhead gets the `＋ New expense` `.btn` (before Export CSV); the existing form moves inside `<Drawer onClose={() => setCreating(false)} labelId="new-expense-title">` with an `<h2 id="new-expense-title">New expense</h2>`; on success: `formRef.reset()`, `setCreating(false)`, `router.refresh()` (keep existing transition/error patterns). Replace the raw job-id input with `<JobLookup jobs={jobOptions} name="job_id" />`. Delete button: `className="btn-s btn-danger"`, keep the confirm. `JobLookup`: mirror CustomerLookup's combobox (input + filtered listbox + hidden input; ARIA roles/keyboard identical; ui-ux-pro-max for presentation).
- [ ] **Step 4: Verify + commit** — battery green.

```bash
git add components/expenses/ "app/(app)/expenses/page.tsx" tests/unit/ExpensesSection.render.test.tsx
git commit -m "feat(expenses): create drawer, job lookup combobox, danger delete"
```

---

### Task 6: Settings — Create-user drawer

**Files:**
- Modify: `components/settings/UsersPanel.tsx`
- Test: `tests/unit/UsersPanel.render.test.tsx` (new, jsdom docblock pattern)

**Interfaces:** consumes `Drawer` + existing `createUser` action; no new exports.

- [ ] **Step 1: Failing render test** — users table renders WITHOUT an inline create form; `Create user` button opens `role="dialog"` with the form (all existing fields incl. phone/DOB); successful mocked create closes the dialog; error keeps it open with the `role="alert"` message. Run → FAIL.
- [ ] **Step 2: Implement** — same drawer pattern as Task 5 (`creating` state, button in the panel header, form unchanged inside `<Drawer labelId="create-user-title">`, close+reset on success only). Keep autofill guards and the formRef reset. Grid CSS for the old inline layout may simplify — remove only rules that become dead.
- [ ] **Step 3: Verify + commit** — battery green.

```bash
git add components/settings/UsersPanel.tsx tests/unit/UsersPanel.render.test.tsx app/globals.css
git commit -m "feat(users): create-user side drawer (create-flow consistency)"
```

---

### Task 7: Cleaners tab + compact dashboard leaderboard

**Files:**
- Create: `app/(app)/cleaners/page.tsx`
- Modify: `lib/nav.ts`, `components/dashboard/Leaderboard.tsx`, `app/(app)/dashboard/page.tsx`
- Test: `tests/unit/Leaderboard.render.test.tsx`, `tests/unit/nav.test.ts`

**Interfaces:**
- Consumes: `cleaner_earnings` view (all roles), `leaderboard()`/`monthKey()` from `lib/earnings.ts`, profiles.
- Produces: `Leaderboard` gains optional props `limit?: number` and `moreHref?: string`; route `/cleaners`.

- [ ] **Step 1: Nav** — insert `{ href: '/cleaners', label: 'Cleaners', num: '07', roles: ['admin', 'rep', 'cleaner'] }` after Customers; renumber Expenses `'08'`, Settings `'09'`; `TITLES['/cleaners'] = ['Cleaners / Leaderboard', 'jobs done + earnings — no revenue here']`. Update `tests/unit/nav.test.ts` counts/order.
- [ ] **Step 2: Failing render tests** — `Leaderboard` with `limit={2}` renders 2 rows + a `→ Cleaners` link when `moreHref` given; without `limit` renders all rows and no link; zero-earnings rows render `0` jobs and the money formatter's zero. Run → FAIL.
- [ ] **Step 3: Leaderboard props** — `limit` slices BOTH datasets for display (toggle unchanged); `moreHref` renders the link under the table. Default behavior without the props is byte-identical to today.
- [ ] **Step 4: Cleaners page** — server component, NO role redirect (all roles). Parallel fetch: `cleaner_earnings` (`cleaner_id,job_id,done_at,share`), `profiles` (`id,full_name,role`), auth uid. Compute `month = leaderboard(rows, names, monthKey(new Date().toISOString()))`, `allTime = leaderboard(rows, names)`, then append zero rows for cleaner-role profiles absent from `allTime` (`{ cleaner_id, name, jobsDone: 0, earnings: 0 }`) to BOTH datasets. Render `<Leaderboard month={...} allTime={...} uid={uid} />` full-width in a `.panel`. No revenue figures anywhere. `logQueryError` on fetches.
- [ ] **Step 5: Dashboard** — pass `limit={5}` and `moreHref="/cleaners"` to the existing dashboard `Leaderboard` usage; nothing else changes.
- [ ] **Step 6: Verify + commit** — battery + `npm run build` (new route compiles).

```bash
git add "app/(app)/cleaners/" lib/nav.ts components/dashboard/Leaderboard.tsx "app/(app)/dashboard/page.tsx" tests/unit/Leaderboard.render.test.tsx tests/unit/nav.test.ts
git commit -m "feat(cleaners): transparent cleaners leaderboard tab + compact dashboard version"
```

---

### Task 8: Jobs-nav unclaimed badge

**Files:**
- Modify: `app/(app)/layout.tsx`, `components/shell/Sidebar.tsx`, `components/shell/MobileNav.tsx`, `app/globals.css`
- Test: `tests/unit/nav-badge.render.test.tsx` (new, jsdom docblock; render Sidebar directly with props)

**Interfaces:**
- Consumes: `jobs_public` view (all roles can count), layout's existing role fetch.
- Produces: `Sidebar` and `MobileNav` gain `unclaimedCount?: number | null` (null or 0 → no badge).

- [ ] **Step 1: Failing render test** — Sidebar with `unclaimedCount={3}` renders `3` inside an element with class `navbadge` on the Jobs item only; `0`/`null` renders no `.navbadge`. Run → FAIL.
- [ ] **Step 2: Layout count** — in `app/(app)/layout.tsx` (read it first; it already resolves role): for role admin or cleaner, add a parallel head-count — `sb.from('jobs_public').select('id', { count: 'exact', head: true }).eq('status', 'unclaimed')` — and pass `unclaimedCount={count}`; for rep pass `null`. `logQueryError` on failure and pass null (badge absent beats a crash).
- [ ] **Step 3: Badge render** — in both nav components, on the item with `href === '/jobs'` render `{unclaimedCount ? <span className="navbadge" aria-label={`${unclaimedCount} unclaimed jobs`}>{unclaimedCount}</span> : null}`. CSS `.navbadge`: `--lost`-family red background, white text, `border-radius: 999px`, `min-width: 18px`, centered, small font — ui-ux-pro-max for final values; must not break the 44px nav row.
- [ ] **Step 4: Verify + commit** — battery green.

```bash
git add "app/(app)/layout.tsx" components/shell/Sidebar.tsx components/shell/MobileNav.tsx app/globals.css tests/unit/nav-badge.render.test.tsx
git commit -m "feat(nav): red unclaimed-jobs badge for admin + cleaners"
```

---

### Task 9: InvoiceDrawer — Bill-to starts empty on create

**Files:**
- Modify: `components/invoices/InvoiceDrawer.tsx`
- Test: `tests/unit/InvoiceDrawer.render.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Failing render test** — create mode (`isNew`, no invoice): the customer lookup input is empty (no preselected name in the Bill-to block); attempting save without picking surfaces an error and does NOT call the mocked save action. Run → FAIL.
- [ ] **Step 2: Implement** — `InvoiceDrawer.tsx:39`: `useState<number>(invoice?.customer_id ?? 0)` (drop the `customers[0]?.id` fallback). In the submit handler, before calling the save action: `if (!customerId) { setError('Pick a customer'); return; }` (reuse the drawer's existing error state/slot — read the submit function first). Verify edit mode + print payload still resolve Bill-to via the existing `picked ?? invoice` fallback chain (Task 20 fix) — no change expected there.
- [ ] **Step 3: Verify + commit** — battery green.

```bash
git add components/invoices/InvoiceDrawer.tsx tests/unit/InvoiceDrawer.render.test.tsx
git commit -m "fix(invoices): bill-to starts empty on create, save requires a customer"
```

---

### Task 10: Verification pass

**Files:** none new.

- [ ] **Step 1: Full battery** — `npm run lint && npx tsc --noEmit && npm test && npm run build`; `npx supabase db reset` (0001-0027 + seed); `npm run test:db` all green.
- [ ] **Step 2: Whole-branch final review** — this wave's commits since its start (record the base SHA before Task 1); apply fixes; update the ledger.
- [ ] **Step 3: Owner walkthrough round 2 checklist** — hand to owner: recurring job spawn (create job w/ repeat 7 + pot → done → successor appears unclaimed at +7 days; bounce → still one), drawer polish (pot under price, members table, join button states), expense drawer + job lookup, create-user drawer, cleaners tab all roles (no revenue), jobs badge count (admin + cleaner, absent for rep), drag unclaimed→claimed claims to self (cleaner + admin), Bill-to empty, done-without-pot confirm. Owner does the merge decision — do NOT merge.
- [ ] **Step 4: Stragglers** — `git status`; commit only if fixes were needed.
