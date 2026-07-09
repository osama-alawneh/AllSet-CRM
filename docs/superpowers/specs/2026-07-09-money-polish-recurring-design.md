# Money-Model Polish + Recurring Jobs — Design

**Date:** 2026-07-09
**Source:** Owner walkthrough feedback round 1 (13 items, recorded in `.superpowers/sdd/progress.md` and memory `money-walkthrough-feedback-2026-07-09`) on branch `feat/money-model` (unmerged). Owner approved this design in-session 2026-07-09.
**Scope:** JobDrawer/JobCard polish, expenses + create-flow consistency, cleaners tab, jobs-nav unclaimed badge, recurring jobs, three bug fixes/guards.
**Out of scope:** realtime nav-badge push, a recurring-plan entity/table, rep commissions, unclaimed-badge for reps.

**Standing rule (owner mandate):** all frontend design work uses the `ui-ux-pro-max` skill; cross-screen consistency is rule #1. Blueprint+ tokens/classes (`.box`, `.btn`, `.btn sec`, `.btn-danger`, `.btn-s`, `.lbl`, `.num`, `.chip`, `.tbl`) remain the only styling vocabulary. Touch targets ≥ 44px.

---

## A. Recurring jobs

**Model — recurrence is a field on the job, not a separate entity.**

- `jobs.recur_days int` — null/absent = one-off job; `> 0` = "repeat every N days". Check `recur_days is null or recur_days > 0`.
- `jobs.recur_parent_id bigint references jobs(id)` — set on auto-created jobs, points at the finished job that spawned them.
- Unique partial index `jobs_one_spawn_per_parent on jobs (recur_parent_id) where recur_parent_id is not null` — a finished job spawns **at most one** successor, ever. Done → bounce → Done again cannot double-spawn (insert is `on conflict do nothing` / existence-guarded). The index also blocks respawn after the successor is soft-deleted — deliberate: owner deletes the successor to kill that occurrence, edits the chain's newest job to change or stop the recurrence.

**Spawn trigger — on Done, inside `set_job_status`** (SECURITY DEFINER; newest body currently in migration 0026 — verbatim-copy discipline applies, grep all migrations to confirm before recreating):

- When the status update lands a job with `recur_days > 0` on `done` and no row exists with `recur_parent_id = this job`: insert the successor with the same `customer_id`, `service`, `description`, `price`, `cleaner_amount`, `recur_days`; `recur_parent_id = this job`; `scheduled_date = coalesce(previous scheduled_date, now()) + (recur_days || ' days')::interval`; `status = 'unclaimed'`, no `claimed_by`, no members, `lead_id` null.
- Bounce-back (done → anything else) does NOT delete the successor (someone may have claimed it) — asymmetric with the payout expense, which does get deleted. This asymmetry is intentional: expenses are bookkeeping derived from the done state; the successor job is real scheduled work.

**Setting/changing/cancelling:** `create_job`/`update_job` gain `p_recur_days int default null` as the LAST parameter (newest bodies in 0025; signature change → drop old signatures + re-grant, mirroring 0024/0025 precedent). Job create/edit form (admin/rep only, existing gating) gets a `Repeat every ___ days` `.num` input; blank = not recurring.

- **Clear rule (explicit to avoid coalesce trap):** `update_job` treats `p_recur_days = 0` as "clear to null"; null keeps the current value (same convention family as `blankMoneyToZero` — the form-boundary helper maps a blank input to 0 = clear).
- To stop a chain: edit the newest job in the chain and blank the field (or delete that job). To change cadence/price/pot mid-stream: edit the newest job; the next spawn copies whatever the finished job carries.

**Visibility:** `recur_days`/`recur_parent_id` stay OFF `jobs_public` (column list unchanged) — cleaners structurally never see recurrence metadata. Admin/rep see a `↻ every N days` indicator in JobDrawer details (and the chain origin via `recur_parent_id` if present: "spawned from job #NNNN", plain text, no link required).

**Tests (pgTAP, `money_model.sql` idioms, 900k ids):** spawn on done copies all listed fields + correct date math; no spawn when `recur_days` null; done-bounce-done spawns exactly one; successor inherits `recur_days` (chain continues); `update_job` p_recur_days 0-clears / null-keeps; spawned job visible to cleaner via `jobs_public` (it's a normal unclaimed job) without recurrence columns.

## B. JobDrawer + JobCard polish

1. **Pot placement:** `Cleaner pot` renders inside the Job Details block directly beneath Price (admin/rep see both; cleaner sees pot only). Cleaner keeps the `your share` line. The per-member share numbers next to member names are REMOVED (the DB `cleaner_earnings` view remains the only split source; drawer no longer displays per-head math).
2. **Members table (replaces the current under-pot members list entirely):** one `.tbl` table at the BOTTOM of the drawer, below the actions/Close row. Columns: Member / Status / Action. Owner row shows ★ + "owner"; approved rows "approved"; pending rows show `Approve` / `Reject` `.btn-s` buttons, rendered only for owner-or-admin (`canDecide` gating unchanged; RPC re-checks). Empty state: single row "no joiners requested". Table visible to all roles on claimed jobs.
3. **Request-to-join button:** moves into the actions row ABOVE Close — full-width-of-group, bordered like other `.btn`s, in-progress accent color (`var(--prog)` family). After the caller has a pending request, the same slot renders a gray, non-interactive button labeled `Requested` (replaces the old "Requested · waiting" text).
4. **JobCard:** shows the job number (`#0042`, padStart-4 like drawers) in the card header/meta. Pending-join badge redesigned: standard `.chip`-vocabulary pill with proper padding that fits its content (count + ⏳), no bespoke amber border; still display-only, still shown only to admin + that job's owner.

## C. Expenses + create-flow consistency

**Create-flow rule (applies app-wide):** every entity create = a `＋ New X` / `Create X` button opening the side Drawer (existing `Drawer` component: focus trap, Escape, scroll lock); the drawer closes on successful create. Applied in this wave to:

- **New expense** (`/expenses`): the inline add form moves into a drawer. Fields unchanged (label, amount `.num`, date defaulting today) EXCEPT the job field, which becomes a combobox autocomplete (CustomerLookup/MapSearch pattern: filter as you type, ARIA combobox) listing jobs as `#id — customer name, address` so the owner can confirm the right job. Requires the expenses page to fetch jobs (id, customer_id) + customers (name, address) — page is admin/rep-gated, base-table reads fine.
- **Create user** (`/settings`): the inline create-user form moves into a `Create user` button + drawer, same fields (incl. phone/DOB), closes on success; form-reset + error patterns preserved.

**Delete button consistency:** expense delete becomes `.btn-danger` (red) like Lead/Job delete, keeps the confirm dialog. Audit other tables' row-delete affordances only if touched — no app-wide sweep this wave.

**Grouping (explained to owner, unchanged):** expenses group by MONTH (`monthKey`), month header row carries the subtotal; grand total in the screen caption. Not daily groups.

## D. Cleaners tab + jobs-nav badge

**Cleaners tab:** new nav item `Cleaners` (`/cleaners`), visible to ALL roles (transparent leaderboard, owner call re-confirmed). Route renders a full-width table: Rank / Cleaner / Jobs done / Total earned, with the month ⇄ all-time `.chip` toggle (aria-pressed). Data = `cleaner_earnings` view (all-roles readable) + profile names via the existing `leaderboard()` helper — split math stays DB-side. Rows = union of (profiles with role `cleaner`) and (anyone with earnings rows) — cleaners with zero earnings appear with 0/$0; admins/reps who claimed jobs and earned shares appear too (owner: "admin also does work"). NO revenue figures anywhere on this screen. Own row highlighted. Nav numbering shifts (Cleaners inserted; renumber like the Expenses insertion did).

**Dashboard:** keeps a COMPACT leaderboard (top rows) with a `→ Cleaners` link to the full tab; cleaner's personal My-earnings card unchanged.

**Jobs-nav unclaimed badge:** the Jobs nav item shows a red count badge (`.chip`-sized, `--lost`-family background, white text, fits 1-2 digits) = count of `status = 'unclaimed'`, non-deleted jobs. Shown to **admin + cleaners only** (it's a "claim this" signal); reps keep the Jobs tab with no badge. Count fetched server-side where the nav renders (one cheap head-count via `jobs_public`, which all roles can read), refreshed per navigation — NO realtime push in v1. Badge hidden when count = 0.

## E. Bug fixes + guards

1. **Drag unclaimed → Claimed = claim-to-self** for cleaners AND admins: the board's drag handler routes this specific transition through the existing race-safe `claimJob` action (`claim_job` RPC already permits admin + cleaner) instead of `set_job_status`. Losing a race surfaces the existing "already claimed" error. Rep drag to Claimed stays blocked (reps cannot claim). `canTransition` is updated so the drag UI permits the move for cleaner/admin; all other transition rules unchanged.
2. **InvoiceDrawer Bill-to starts empty on create:** no first-customer preselect; saving without a picked customer keeps the existing validation/error path.
3. **Done-without-pot warning:** moving a job to `done` when `coalesce(cleaner_amount, 0) = 0` triggers a confirm — "No cleaner pot set — no payout will be created. Continue?" — on BOTH the drawer status buttons and the board drag path. (Root cause of owner's "payout not working" report: the test job had a null pot; the DB payout path is correct and pgTAP-proven.)
4. **Revalidation:** `setJobStatus` adds `revalidatePath('/expenses')` (payout rows appear/disappear with status changes). The claim/join actions' existing revalidations stay as-is.

## Testing

- pgTAP: section A list above; everything else reuses the existing 224-assert suite (no RLS changes in this wave beyond the two new jobs columns, which stay off `jobs_public`).
- Unit/render (jsdom docblock pattern): members table (owner/approved/pending/empty states + gating), request-button two states, JobCard number + badge, expense drawer open→create→close + job combobox filter, create-user drawer, cleaners page table + toggle + zero-earnings row, nav badge role gating + hidden-at-zero, InvoiceDrawer empty Bill-to on create, done-without-pot confirm (accept + decline), drag-to-claim routing (claimJob called, not setJobStatus).
- Full battery per task + wave-end build; owner walkthrough round 2 at the end.

## Open items deliberately deferred

- Realtime unclaimed-badge updates (broadcast channel exists if wanted later).
- Recurring-plan entity + management screen — revisit if chains multiply.
- Double-submit hardening on expense add (3 duplicate rows observed in walkthrough DB; likely owner testing — watch in round 2).
