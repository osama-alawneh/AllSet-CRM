# Money Model — Design Spec (Tier-3 Phase 1)

**Date:** 2026-07-08 · **Status:** approved by owner (brainstorm session)
**Scope:** owner-request items 1–4 of the deferred Tier-3 list: job money split, join requests + multi-owner jobs, expenses + true revenue, cleaner earnings/leaderboard + profile phone/DOB.
**Out of scope (separate future specs):** recurring jobs, unclaimed-jobs nav badge, rep commissions (leads.rep_id already in place as the foundation).

## Owner decisions (locked)

- Jobs carry two money fields: `price` (charged to customer) and `cleaner_amount` (total cleaner pot). Admin **and rep** see/set both — this widens the previous admin-only job-money rule. Cleaners see only `cleaner_amount`, never `price`.
- Pot splits **equally** among approved job members; `cleaner_amount` typed manually (never a % of price).
- Multi-owner jobs: first claimer is auto-approved owner. The owner approves/rejects join requests in JobDrawer; admin can always override. **Approval policy must stay swappable** (owner may later restrict to admin-only).
- Pending join requests show as a badge on the job card.
- True revenue = `sum(price) − sum(expenses)` over **Done** jobs. Auto-expense = `cleaner_amount`, lands when job hits Done. Manual expenses also supported (admin/rep; label, amount, date, optional job link).
- Leaderboard fully transparent: cleaners see everyone's ranks AND earnings. Columns: jobs done + earnings, sorted by earnings. Timeframes: this month (default) + all-time.
- New **Expenses** nav page (admin/rep). Earnings/leaderboard/revenue live on the dashboard as role-aware views.
- Create-user gains phone + date of birth; visible to admin/rep (and self).

## Architecture

DB-centric (approach chosen over trigger-based and app-side): all money mutations through SECURITY DEFINER RPCs, all derived money through SQL views, RLS enforces the visibility matrix, pgTAP proves it. App pages render; they never re-derive money.

## Schema (migration 0023)

New columns:
- `jobs.cleaner_amount numeric` — total cleaner pot (nullable).
- `jobs.done_at timestamptz` — set on transition into Done, cleared on leaving Done. Drives month bucketing for earnings/revenue and timestamps the auto-expense. (`updated_at` moves on any edit — unusable for money periods.)
- `profiles` stays untouched for PII; see `profiles_private`.

New tables:
- `job_members`: `id bigint pk`, `job_id fk jobs`, `cleaner_id uuid fk profiles`, `status text check in (pending, approved, rejected)`, `is_owner boolean not null default false`, `requested_at timestamptz`, `decided_at timestamptz`, `decided_by uuid`. Unique `(job_id, cleaner_id)`.
- `expenses`: `id bigint pk`, `label text`, `amount numeric`, `spent_on date`, `job_id bigint null fk jobs`, `source text check in (manual, job_payout)`, `created_by uuid`, `created_at timestamptz`. **Partial unique index on `(job_id) where source = 'job_payout'`** — at most one auto payout row per job at a time; combined with the delete-on-leaving-Done rule this makes Done-bounces idempotent (re-entering Done after a bounce re-creates the row).
- `profiles_private`: `profile_id uuid pk fk profiles`, `phone text`, `dob date`. RLS: select/write for admin/rep, plus `profile_id = auth.uid()` self-read. Chosen over UI-only hiding: DOB is real PII and every other boundary in this codebase is DB-enforced.

## Visibility matrix

| | price | cleaner_amount | expenses | job_members | earnings view | profiles_private |
|---|---|---|---|---|---|---|
| admin | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| rep | ✔ (new base-table RLS select) | ✔ | ✔ | ✔ | ✔ | ✔ |
| cleaner | ✘ | ✔ via `jobs_public` (+column, recreate) | ✘ | ✔ read | ✔ (transparent) | own row only |

`job_members` and `expenses` have **no direct insert/update/delete grants** — writes go through RPCs only.

## RPCs (migration 0024; all SECURITY DEFINER, verbatim-copy discipline for recreates)

Recreated (single described change each; copy the newest existing body — grep all migrations for latest `create or replace`):
- `claim_job` — additionally inserts claimer's `job_members` row (approved, `is_owner = true`).
- `create_job` / `update_job` — gain `p_cleaner_amount` (admin/rep guard, same as price).
- `set_job_status` —
  - into Done: `done_at = now()`; insert auto-expense (`source='job_payout'`, `spent_on = current_date`, amount = `cleaner_amount`) skipped when pot null/0; `on conflict do nothing` on the partial unique index.
  - out of Done: `done_at = null`; delete the job's `job_payout` expense row.

New:
- `request_join(p_job_id)` — cleaner only; job must be claimed, not soft-deleted, not Done; caller not already an approved/pending member (a rejected row flips back to pending). Raises with clear messages otherwise.
- `decide_join(p_member_id, p_approve boolean)` — guard delegated to helper `can_decide_join(p_job_id)` (true for the job's owner-member or admin). **Policy swap point:** restricting to admin-only later is a one-function-body migration. Sets `status`, `decided_by`, `decided_at`.
- `add_expense(p_label, p_amount, p_spent_on, p_job_id default null)` — admin/rep; always `source='manual'` (auto source unreachable from this RPC).
- `delete_expense(p_id)` — admin/rep; manual rows only (auto rows die only via status-bounce).

## Views (migration 0024)

- `jobs_public` — recreate current definition + `cleaner_amount` column (still no price, still role-filtered + `deleted_at is null`).
- `cleaner_earnings` — THE single source of split math. Per approved member of each Done, non-deleted job: `share = cleaner_amount / approved_count`, with `done_at` for month bucketing. Row-level: exposed to all roles (transparent leaderboard). Aggregations (per-cleaner month/all-time totals, jobs-done counts) happen over this view.
- `company_revenue` — per month: job revenue (`sum price` of Done jobs, bucketed by `done_at`), expenses total (bucketed by `spent_on`), net. Gated inside the view: `where public.auth_role() in ('admin','rep')` — cleaners get zero rows.

Edge case pinned: joining a Done job is impossible (`request_join` rejects), so a paid-out split never changes retroactively.

Rollout note: no backfill. Pre-existing done jobs have no `done_at`/pot → they contribute nothing to earnings/revenue; historical money remains visible through invoices.

## UI

**JobDrawer**
- Admin/rep edit: `Cleaner pot $` input beside Price (`.num` styling, spinners off).
- Members panel (all roles): approved members with names, ★ on owner, per-head share (`pot ÷ approved`). Pending requests with Approve/Reject — rendered only for job owner or admin (mirrors `can_decide_join`).
- Non-member cleaner on a claimed job: `Request to join` button; own pending request renders "Requested · waiting".
- Cleaner sees pot + own share; never price.

**JobCard**: amber pending-count badge (e.g. `2 ⏳`) for admin + that job's owner; display-only (actions live in the drawer); 44px touch rules apply.

**Jobs page**: rep joins the admin data branch (base table, money included). `visibleJobs` for cleaners untouched.

**Expenses page** (new nav item, admin/rep route guard like invoices): month-grouped table (date, label, amount, source chip, job link), month subtotals, add-expense form (date defaults today, optional job picker), manual rows deletable, auto rows locked with explanatory tooltip, Export CSV.

**Dashboard (role-aware)**
- Admin/rep: existing KPIs + Money row — this month job revenue / expenses / **net**, all-time net; leaderboard (rank, cleaner, jobs done, earnings; month ⇄ all-time toggle); link to Expenses.
- Cleaner: My-earnings card (month + all-time, jobs done) + the same leaderboard.

**Users panel / create-user** (settings): phone + DOB on create/edit, shown in the users table (admin/rep); stored in `profiles_private`.

## Testing

pgTAP:
- Visibility: rep reads price+pot from base table; cleaner base-table read blocked, sees pot via `jobs_public`, no price column; expenses invisible to cleaner; `profiles_private` admin/rep + self only.
- Flow: claim → auto owner member; request → pending; owner approve; non-owner cleaner / rep `decide_join` raises; admin override; join on Done raises; re-request after reject.
- Money: Done creates payout expense exactly once (bounce Done→Scheduled→Done still one row; `done_at` cleared/reset); Done with null pot → no expense; `cleaner_earnings` equal-split math (2 members → half each); month bucketing via `done_at`; `company_revenue` empty for cleaner.

Unit/render: expenses CSV builder; JobDrawer members-panel gating; dashboard money row admin vs cleaner.

Gates per task: `npm run lint && npx tsc --noEmit && npm test` (+ `npm run test:db` and `npx supabase db reset` on DB tasks); wave ends with build + owner manual walkthrough.

## Rollout

Two migrations (0023 schema+RLS, 0024 RPCs+views) so each stays reviewable. Executed as one SDD wave with per-task reviews + whole-branch review, matching Waves 1–3 discipline.
