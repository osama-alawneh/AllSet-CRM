# Money Model Implementation Plan (Tier-3 Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Job money split (`price` + `cleaner_amount` pot), multi-owner jobs with join requests, expenses + true revenue, cleaner earnings/leaderboard, and profile phone/DOB — per `docs/superpowers/specs/2026-07-08-money-model-design.md`.

**Architecture:** DB-centric. All money mutations go through SECURITY DEFINER RPCs, all derived money through SQL views (`cleaner_earnings` is the ONLY place split math lives), RLS enforces the visibility matrix, pgTAP proves it. App pages render; they never re-derive money. Two migrations: 0023 (schema + RLS), 0024 (RPCs + views).

**Tech Stack:** Next.js 16.2.10 App Router (verify conventions in `node_modules/next/dist/docs/`), React 19, Supabase (local stack on 54xxx), Vitest (+ jsdom per-file docblock for render tests), pgTAP via `npm run test:db`, plain CSS tokens.

**Spec:** `docs/superpowers/specs/2026-07-08-money-model-design.md` — read it if a requirement here seems ambiguous; the spec governs.

## Global Constraints

- **Visibility matrix (owner-locked):** admin + rep see/set `price` AND `cleaner_amount`; cleaners see only `cleaner_amount` (via `jobs_public`), never `price`. Expenses and `company_revenue` are admin/rep only. `cleaner_earnings` is transparent to ALL roles. `profiles_private` is admin/rep + own-row.
- `job_members` and `expenses` get **no direct insert/update/delete grants** — writes only through RPCs.
- **Verbatim-copy discipline:** every recreated view/RPC copies its NEWEST existing definition (grep ALL migrations for the last `create or replace` / `create view` of that object — do not trust a named migration hint; a prior wave's hint was stale and would have reintroduced a money leak) with only the described change applied. Preserve security settings, role checks, `deleted_at` guards, grants.
- Split math (`cleaner_amount / approved_count`) exists in exactly one place: the `cleaner_earnings` view.
- Approval policy lives in exactly one place: `can_decide_join()` — nothing else may inline the owner-or-admin rule.
- No new npm dependencies. Blueprint+ styling only (existing tokens/classes: `.box`, `.btn`, `.btn sec`, `.lbl`, `.num`, `.chip`, tokens). Touch targets ≥ 44px. Number inputs: no spinners (global CSS already handles `input[type=number]`).
- Every task ends green: `npm run lint && npx tsc --noEmit && npm test`; DB tasks add `npx supabase db reset` + `npm run test:db`; wave ends with `npm run build` + owner manual walkthrough.
- Commit after every task, staging only files the task touched. Do NOT stage the untracked `lint-output.txt` in the repo root.
- pgTAP fixture ids live in the 900k range (seed-collision convention); mirror the existing assertion style of the suite files exactly.

---

### Task 1: Migration 0023 — schema + RLS (tables, columns, rep money access)

**Files:**
- Create: `supabase/migrations/0023_money_schema.sql`
- Create: `supabase/tests/money_model.sql` (visibility assertions; flow/money assertions land in Task 2)

**Interfaces:**
- Produces: `jobs.cleaner_amount numeric`, `jobs.done_at timestamptz`, tables `job_members` / `expenses` / `profiles_private` (columns below), RLS policy `jobs_rep` (rep reads base `jobs`). Tasks 2–7 build on all of these; column names are load-bearing.

- [ ] **Step 1: Write failing pgTAP visibility assertions**

Create `supabase/tests/money_model.sql`. Read `supabase/tests/rls_money.sql` and `supabase/tests/crud_rpcs.sql` FIRST and mirror their exact idioms (session helpers, fixture insertion as postgres, `plan(n)`, `is`/`ok`/`throws_ok` style, 900k fixture ids). Assert:

1. rep (JWT role rep) selects `price` and `cleaner_amount` from base `jobs` → rows visible.
2. cleaner selects from base `jobs` → 0 rows (RLS).
3. cleaner selects `cleaner_amount` from `jobs_public` → value visible *(this assertion FAILS until Task 2 recreates the view — mark it in the file with a comment and add it in Task 2 instead; keep Task 1's plan-count to what 0023 alone satisfies)*.
4. cleaner selects from `expenses` → 0 rows; admin and rep → rows visible.
5. cleaner selects colleague's row from `profiles_private` → 0 rows; own row → visible; admin and rep → all rows.
6. direct `insert into job_members` / `insert into expenses` as any non-postgres role → permission denied (`throws_ok` … `42501`).

Run: `npm run test:db` → the new file FAILS (tables missing).

- [ ] **Step 2: Write migration 0023**

```sql
-- Money model phase 1 (owner requests 1-4, spec 2026-07-08-money-model-design.md).
alter table jobs add column cleaner_amount numeric;
-- Set when status enters 'done', cleared when it leaves. Drives month bucketing for
-- earnings/revenue and timestamps the auto payout expense (updated_at moves on any edit).
alter table jobs add column done_at timestamptz;

create table job_members (
  id           bigint generated always as identity primary key,
  job_id       bigint not null references jobs(id) on delete cascade,
  cleaner_id   uuid   not null references profiles(id),
  status       text   not null default 'pending' check (status in ('pending','approved','rejected')),
  is_owner     boolean not null default false,
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references profiles(id),
  unique (job_id, cleaner_id)
);

create table expenses (
  id         bigint generated always as identity primary key,
  label      text    not null,
  amount     numeric not null check (amount > 0),
  spent_on   date    not null default current_date,
  job_id     bigint references jobs(id) on delete set null,
  source     text    not null default 'manual' check (source in ('manual','job_payout')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
-- At most one auto payout row per job at a time; with the delete-on-leaving-Done rule
-- (0024's set_job_status) this makes Done-bounces idempotent.
create unique index expenses_one_payout_per_job on expenses (job_id) where source = 'job_payout';

-- Phone/DOB live OFF profiles: everyone shares the `authenticated` pg role, so column
-- privileges cannot express "admin/rep only" — a separate table with RLS can (DOB is PII).
create table profiles_private (
  profile_id uuid primary key references profiles(id) on delete cascade,
  phone text,
  dob   date
);

alter table job_members     enable row level security;
alter table expenses        enable row level security;
alter table profiles_private enable row level security;

-- Reads: members visible to all logged-in roles (drawer panel, board badge);
-- writes ONLY via 0024's SECURITY DEFINER RPCs — no insert/update/delete grants.
create policy job_members_read on job_members for select using (auth.uid() is not null);
grant select on job_members to authenticated;

create policy expenses_read on expenses for select using (auth_role() in ('admin','rep'));
grant select on expenses to authenticated;

create policy profiles_private_read on profiles_private for select
  using (auth_role() in ('admin','rep') or profile_id = auth.uid());
create policy profiles_private_admin_write on profiles_private for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
grant select, insert, update, delete on profiles_private to authenticated;

-- Owner 2026-07-08: rep = admin on job money. Reps gain base-table read (price included).
-- Cleaners keep jobs_public only. App code moves reps onto the admin data branch (Task 4).
create policy jobs_rep on jobs for select using (auth_role() = 'rep');
```

Before finalizing: read `supabase/migrations/0002_rls.sql` and `0004_grants.sql` to confirm `auth_role()` exists unqualified in `public` and jobs currently has only the admin select policy — adjust the policy name if `jobs_rep` collides.

- [ ] **Step 3: Apply + verify**

Run: `npx supabase db reset` → applies 0001–0023 + seed clean.
Run: `npm run test:db` → `money_model.sql` assertions from Step 1 PASS (minus the deferred jobs_public one); all pre-existing suites still green.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0023_money_schema.sql supabase/tests/money_model.sql
git commit -m "feat(money): schema + RLS — job pot, members, expenses, profiles_private, rep money read"
```

---

### Task 2: Migration 0024 — RPCs + views

**Files:**
- Create: `supabase/migrations/0024_money_rpcs_views.sql`
- Modify: `supabase/tests/money_model.sql` (flow + money assertions), `supabase/tests/schema.sql` ONLY if it pins function signatures (read it first)

**Interfaces:**
- Consumes: Task 1's tables/columns.
- Produces (exact signatures — Tasks 3–6 call these):
  - `request_join(p_job_id bigint) returns void`
  - `decide_join(p_member_id bigint, p_approve boolean) returns void`
  - `can_decide_join(p_job_id bigint) returns boolean` (policy swap point)
  - `add_expense(p_label text, p_amount numeric, p_spent_on date, p_job_id bigint default null) returns bigint`
  - `delete_expense(p_id bigint) returns void`
  - `create_job` / `update_job` recreated with added `p_cleaner_amount numeric default null`
  - `claim_job` recreated (also inserts owner member row) — signature unchanged
  - `set_job_status` recreated (done_at + auto-expense) — signature unchanged
  - view `jobs_public` + `cleaner_amount` column; view `cleaner_earnings (cleaner_id uuid, job_id bigint, done_at timestamptz, share numeric)`; view `company_revenue (month text, job_revenue numeric, expenses numeric, net numeric)`

- [ ] **Step 1: Provenance sweep**

Grep ALL of `supabase/migrations/` for the newest definition of: `claim_job`, `create_job`, `update_job`, `set_job_status`, `jobs_public`. Record each source in a comment at the top of 0024 (`-- claim_job copied from 00NN`). As of plan-writing the newest are expected in 0016/0018/0020 — but VERIFY; do not trust this sentence.

- [ ] **Step 2: Write failing pgTAP for the flow + money rules**

Extend `supabase/tests/money_model.sql` (same idioms), covering:

1. cleaner claims job → `job_members` has approved `is_owner=true` row for them.
2. second cleaner `request_join` → pending row; `request_join` again → raises (already pending).
3. non-owner cleaner `decide_join` → raises not-authorized; rep `decide_join` → raises (policy is owner-or-admin); owner approves → status approved + `decided_by` set; admin can decide too (separate fixture request).
4. rejected cleaner may `request_join` again → row flips back to pending.
5. `request_join` on an unclaimed job raises; on a soft-deleted job raises; on a done job raises.
6. `decide_join` on a request whose job is already done → raises (split never changes retroactively).
7. `set_job_status` → done: `done_at` set; exactly one `expenses` row (`source='job_payout'`, amount = pot); bounce done→scheduled→done: still exactly one row, `done_at` non-null; done with `cleaner_amount` null → zero expense rows.
8. `add_expense` as cleaner raises; as rep succeeds (`source='manual'`); `delete_expense` on the auto payout row raises; on a manual row succeeds.
9. `cleaner_earnings`: job with pot 100 and 2 approved members → two rows of share 50 each; visible to a cleaner session.
10. `company_revenue`: cleaner session → 0 rows; admin session → month row where `net = job_revenue - expenses`.
11. deferred Task-1 assertion: cleaner reads `cleaner_amount` via `jobs_public`, and `jobs_public` still has no `price` column (`hasnt_column`-style or select-fails assertion, mirroring how 0016's money tests pin this).

Run: `npm run test:db` → new assertions FAIL (functions/views missing).

- [ ] **Step 3: Write migration 0024**

Recreates (copy newest body verbatim per Step 1, apply ONLY the described delta):

- `claim_job` — after the existing claim update succeeds, add:

```sql
  insert into public.job_members (job_id, cleaner_id, status, is_owner, requested_at, decided_at, decided_by)
  values (p_id, v_uid, 'approved', true, now(), now(), v_uid)
  on conflict (job_id, cleaner_id) do update
    set status = 'approved', is_owner = true, decided_at = now(), decided_by = excluded.decided_by;
```

  (match the body's actual variable names for the job id and caller uid — `p_id`/`v_uid` here are placeholders for whatever the copied body uses).

- `create_job` / `update_job` — add `p_cleaner_amount numeric default null` as the LAST parameter; write it exactly where `p_price` is written (`cleaner_amount = coalesce(p_cleaner_amount, cleaner_amount)` in update; direct insert column in create). Keep every existing check verbatim. Drop the old signatures first (`drop function if exists public.create_job(<old arg list>)` — mirror how 0021 handled the update_lead re-signature) and re-grant execute.

- `set_job_status` — after the existing status update succeeds, add:

```sql
  if p_status = 'done' then
    update public.jobs set done_at = coalesce(done_at, now()) where id = p_id;
    insert into public.expenses (label, amount, spent_on, job_id, source, created_by)
    select 'Cleaner payout — job ' || j.id, j.cleaner_amount, current_date, j.id, 'job_payout', auth.uid()
      from public.jobs j
     where j.id = p_id and coalesce(j.cleaner_amount, 0) > 0
    on conflict (job_id) where source = 'job_payout' do nothing;
  else
    update public.jobs set done_at = null where id = p_id and done_at is not null;
    delete from public.expenses where job_id = p_id and source = 'job_payout';
  end if;
```

- `jobs_public` — recreate newest definition + `cleaner_amount` in the column list (NOT `price`, NOT `done_at` unless already present); keep role filters + `deleted_at is null`; re-grant select.

New functions (complete code — adjust only schema-qualification style to match the copied bodies):

```sql
create or replace function public.can_decide_join(p_job_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  -- APPROVAL POLICY LIVES HERE AND ONLY HERE. Owner may later restrict to admin-only:
  -- replace this body (drop the `or exists` branch) in a new migration; nothing else changes.
  select public.auth_role() = 'admin'
      or exists (select 1 from public.job_members
                  where job_id = p_job_id and cleaner_id = auth.uid()
                    and status = 'approved' and is_owner)
$$;
grant execute on function public.can_decide_join(bigint) to authenticated;

create or replace function public.request_join(p_job_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
begin
  if public.auth_role() <> 'cleaner' then
    raise exception 'Only cleaners can request to join a job';
  end if;
  select * into v_job from public.jobs where id = p_job_id and deleted_at is null;
  if not found then raise exception 'Job % not found', p_job_id; end if;
  if v_job.claimed_by is null then raise exception 'Job is not claimed yet — claim it instead'; end if;
  if v_job.status = 'done' then raise exception 'Job is already done'; end if;
  if exists (select 1 from public.job_members
              where job_id = p_job_id and cleaner_id = v_uid and status in ('pending','approved')) then
    raise exception 'Already requested or already a member';
  end if;
  insert into public.job_members (job_id, cleaner_id, status, requested_at)
  values (p_job_id, v_uid, 'pending', now())
  on conflict (job_id, cleaner_id) do update
    set status = 'pending', requested_at = now(), decided_at = null, decided_by = null;
end $$;
grant execute on function public.request_join(bigint) to authenticated;

create or replace function public.decide_join(p_member_id bigint, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.job_members;
begin
  select * into v_member from public.job_members where id = p_member_id;
  if not found then raise exception 'Join request % not found', p_member_id; end if;
  if v_member.status <> 'pending' then raise exception 'Request already decided'; end if;
  if exists (select 1 from public.jobs where id = v_member.job_id and status = 'done') then
    raise exception 'Job is already done — the payout split is final';
  end if;
  if not public.can_decide_join(v_member.job_id) then
    raise exception 'Not authorized to decide join requests for this job';
  end if;
  update public.job_members
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = auth.uid()
   where id = p_member_id;
end $$;
grant execute on function public.decide_join(bigint, boolean) to authenticated;

create or replace function public.add_expense(
  p_label text, p_amount numeric, p_spent_on date, p_job_id bigint default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if public.auth_role() not in ('admin','rep') then raise exception 'Not authorized'; end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'Label required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_job_id is not null
     and not exists (select 1 from public.jobs where id = p_job_id and deleted_at is null) then
    raise exception 'Job % not found', p_job_id;
  end if;
  insert into public.expenses (label, amount, spent_on, job_id, source, created_by)
  values (btrim(p_label), p_amount, coalesce(p_spent_on, current_date), p_job_id, 'manual', auth.uid())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.add_expense(text, numeric, date, bigint) to authenticated;

create or replace function public.delete_expense(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_source text;
begin
  if public.auth_role() not in ('admin','rep') then raise exception 'Not authorized'; end if;
  select source into v_source from public.expenses where id = p_id;
  if not found then raise exception 'Expense % not found', p_id; end if;
  if v_source <> 'manual' then
    raise exception 'Auto payout rows are managed by job status';
  end if;
  delete from public.expenses where id = p_id;
end $$;
grant execute on function public.delete_expense(bigint) to authenticated;
```

New views (complete code; owner-rights views like `jobs_public` — no `security_invoker`):

```sql
-- THE single source of split math. Per approved member of each Done, non-deleted job.
create view public.cleaner_earnings as
select
  jm.cleaner_id,
  j.id as job_id,
  j.done_at,
  (j.cleaner_amount / cnt.approved_count)::numeric as share
from public.jobs j
join public.job_members jm on jm.job_id = j.id and jm.status = 'approved'
join lateral (
  select count(*)::numeric as approved_count
  from public.job_members m
  where m.job_id = j.id and m.status = 'approved'
) cnt on true
where j.status = 'done'
  and j.deleted_at is null
  and j.done_at is not null
  and coalesce(j.cleaner_amount, 0) > 0;
grant select on public.cleaner_earnings to authenticated;  -- transparent leaderboard (owner call)

-- Admin/rep only: role gate INSIDE the view (cleaners get zero rows, not an error).
create view public.company_revenue as
with rev as (
  select to_char(done_at, 'YYYY-MM') as month, sum(price) as job_revenue
  from public.jobs
  where status = 'done' and deleted_at is null and done_at is not null
  group by 1
),
exp as (
  select to_char(spent_on, 'YYYY-MM') as month, sum(amount) as expenses
  from public.expenses
  group by 1
)
select
  coalesce(r.month, e.month) as month,
  coalesce(r.job_revenue, 0) as job_revenue,
  coalesce(e.expenses, 0)    as expenses,
  coalesce(r.job_revenue, 0) - coalesce(e.expenses, 0) as net
from rev r
full outer join exp e on e.month = r.month
where public.auth_role() in ('admin','rep');
grant select on public.company_revenue to authenticated;
```

- [ ] **Step 4: Apply + verify**

Run: `npx supabase db reset` (0001–0024 clean), then `npm run test:db` → ALL suites green including every Step 2 assertion.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0024_money_rpcs_views.sql supabase/tests/money_model.sql supabase/tests/schema.sql
git commit -m "feat(money): join/expense RPCs, payout-on-done, earnings + revenue views"
```

---

### Task 3: lib types, parsers, builders + server actions

**Files:**
- Modify: `lib/jobs.ts` (Job type + members helpers + parseJobForm), `lib/csv.ts` (expensesCsvTable), `app/(app)/jobs/actions.ts`
- Create: `lib/earnings.ts`, `app/(app)/expenses/actions.ts`
- Test: `tests/unit/jobs.test.ts`, `tests/unit/earnings.test.ts`, `tests/unit/csv.test.ts`

**Interfaces:**
- Consumes: Task 2 RPC signatures (exact names above).
- Produces (Tasks 4–6 import these):
  - `Job` gains `cleaner_amount: number | null; done_at: string | null;` (buildJobs maps them; rows from `jobs_public` have `cleaner_amount` but no `price` — keep the existing null-default pattern for missing columns)
  - `type JobMember = { id: number; job_id: number; cleaner_id: string; cleaner_name: string; status: 'pending' | 'approved' | 'rejected'; is_owner: boolean }`
  - `buildMembers(rows, names: Map<string, string>): JobMember[]` in `lib/jobs.ts` (name fallback `'—'`)
  - `shareOf(pot: number | null, approvedCount: number): number | null` in `lib/jobs.ts` — `null` when pot null/0 or count 0, else `pot / approvedCount`
  - `parseJobForm` accepts optional `cleaner_amount` (mirror EXACTLY how it parses `price`: same optional-number helper, same blank→null handling)
  - `lib/earnings.ts`: `type EarningRow = { cleaner_id: string; job_id: number; done_at: string; share: number }`; `monthKey(iso: string): string` (returns `'YYYY-MM'` from the ISO timestamp's UTC date — same string-slice convention as `dayTime`); `leaderboard(rows: EarningRow[], names: Map<string, string>, month?: string): { cleaner_id: string; name: string; jobsDone: number; earnings: number }[]` — filters to `month` when given, sums shares + counts distinct jobs per cleaner, sorts by earnings desc
  - `lib/csv.ts`: `expensesCsvTable(rows: { spent_on: string; label: string; amount: number; source: string; job_id: number | null }[]): CsvTable` — headers `['Date', 'Label', 'Amount', 'Source', 'Job']`
  - actions in `app/(app)/jobs/actions.ts`: `requestJoin(jobId: number)`, `decideJoin(memberId: number, approve: boolean)` — mirror `claimJob`'s exact shape (`rpc(...)`, error string return, `revalidatePath('/jobs')` + `revalidatePath('/map')`); `createJob`/`updateJob` thread `p_cleaner_amount` from the parsed form
  - actions in `app/(app)/expenses/actions.ts`: `addExpense(fd: FormData)`, `deleteExpense(id: number)` — same auth/error pattern as jobs actions, `revalidatePath('/expenses')` + `revalidatePath('/dashboard')`

- [ ] **Step 1: Failing unit tests**

Extend `tests/unit/jobs.test.ts` (mirror existing fixture style — see the `job()` factory in `tests/unit/csv.test.ts` for the current Job shape): `parseJobForm` accepts `cleaner_amount` and omits when blank; `shareOf(100, 2) === 50`, `shareOf(null, 2) === null`, `shareOf(100, 0) === null`; `buildMembers` resolves names with `'—'` fallback.

Create `tests/unit/earnings.test.ts`: `monthKey('2026-07-08T14:30:00+00:00') === '2026-07'`; `leaderboard` with 2 cleaners (one has two jobs summing 80, other one job of 50) → sorted [80, 50] with correct jobsDone counts; month filter drops out-of-month rows; unknown cleaner name falls back `'—'`.

Extend `tests/unit/csv.test.ts`: `expensesCsvTable` headers + a row with null `job_id` renders empty Job cell.

Run: `npm test -- tests/unit/earnings.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement lib changes**

`lib/earnings.ts` (complete):

```ts
export type EarningRow = { cleaner_id: string; job_id: number; done_at: string; share: number };

// 'YYYY-MM' from the ISO timestamp — same UTC string-slice convention as lib/jobs dayTime().
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function leaderboard(
  rows: EarningRow[],
  names: Map<string, string>,
  month?: string,
): { cleaner_id: string; name: string; jobsDone: number; earnings: number }[] {
  const scoped = month ? rows.filter(r => monthKey(r.done_at) === month) : rows;
  const byCleaner = new Map<string, { jobs: Set<number>; earnings: number }>();
  for (const r of scoped) {
    const e = byCleaner.get(r.cleaner_id) ?? { jobs: new Set<number>(), earnings: 0 };
    e.jobs.add(r.job_id);
    e.earnings += Number(r.share);
    byCleaner.set(r.cleaner_id, e);
  }
  return [...byCleaner.entries()]
    .map(([cleaner_id, e]) => ({
      cleaner_id,
      name: names.get(cleaner_id) ?? '—',
      jobsDone: e.jobs.size,
      earnings: e.earnings,
    }))
    .sort((a, b) => b.earnings - a.earnings);
}
```

`lib/jobs.ts`: add the two Job fields (+ map in `buildJobs` with the file's existing null-default idiom), `JobMember`, `buildMembers`, `shareOf`:

```ts
export type JobMember = {
  id: number; job_id: number; cleaner_id: string; cleaner_name: string;
  status: 'pending' | 'approved' | 'rejected'; is_owner: boolean;
};

export function buildMembers(
  rows: Array<Omit<JobMember, 'cleaner_name'>>,
  names: Map<string, string>,
): JobMember[] {
  return rows.map(r => ({ ...r, cleaner_name: names.get(r.cleaner_id) ?? '—' }));
}

// The DB view cleaner_earnings owns the REAL split; this mirrors it for drawer display only.
export function shareOf(pot: number | null, approvedCount: number): number | null {
  if (pot == null || pot <= 0 || approvedCount <= 0) return null;
  return pot / approvedCount;
}
```

`parseJobForm`: add `cleaner_amount` using the identical helper/branch `price` uses. `lib/csv.ts`: `expensesCsvTable` following the file's existing builder shape.

- [ ] **Step 3: Implement actions**

`app/(app)/jobs/actions.ts`: `requestJoin`/`decideJoin` mirroring `claimJob` exactly (same supabase client, `.rpc('request_join', { p_job_id: id })` / `.rpc('decide_join', { p_member_id: memberId, p_approve: approve })`, same error-string return, revalidate `/jobs` and `/map`). Thread `p_cleaner_amount: v.cleaner_amount` into the `create_job`/`update_job` rpc param objects.

`app/(app)/expenses/actions.ts` (new file, mirror the jobs actions file header/patterns):

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';

export async function addExpense(fd: FormData): Promise<{ error?: string }> {
  const label = String(fd.get('label') ?? '').trim();
  const amount = Number(fd.get('amount'));
  const spentOn = String(fd.get('spent_on') ?? '') || null;
  const jobRaw = String(fd.get('job_id') ?? '').trim();
  if (!label) return { error: 'Label required' };
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be positive' };
  const sb = await supabaseServer();
  const { error } = await sb.rpc('add_expense', {
    p_label: label, p_amount: amount, p_spent_on: spentOn,
    p_job_id: jobRaw ? Number(jobRaw) : null,
  });
  if (error) return { error: error.message };
  revalidatePath('/expenses'); revalidatePath('/dashboard');
  return {};
}

export async function deleteExpense(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('delete_expense', { p_id: id });
  if (error) return { error: error.message };
  revalidatePath('/expenses'); revalidatePath('/dashboard');
  return {};
}
```

(Adapt the import paths/error idiom to whatever `app/(app)/jobs/actions.ts` actually uses — read it first; the RPC guards make role checks server-enforced regardless.)

- [ ] **Step 4: Verify + commit**

Run: `npm test` (all green), `npm run lint`, `npx tsc --noEmit`.

```bash
git add lib/jobs.ts lib/earnings.ts lib/csv.ts "app/(app)/jobs/actions.ts" "app/(app)/expenses/actions.ts" tests/unit/jobs.test.ts tests/unit/earnings.test.ts tests/unit/csv.test.ts
git commit -m "feat(money): job pot parsing, members/earnings helpers, join + expense actions"
```

---

### Task 4: JobDrawer members panel + money inputs, JobCard badge, rep data branch

**Files:**
- Modify: `components/jobs/JobDrawer.tsx`, `components/jobs/JobCard.tsx`, `components/jobs/JobsBoard.tsx`, `components/jobs/JobsListSection.tsx` (prop threading), `app/(app)/jobs/page.tsx`, `app/(app)/map/page.tsx` (rep branch + members fetch)
- Test: `tests/unit/JobDrawer.render.test.tsx` (extend or create alongside the existing render tests; jsdom docblock pattern from `tests/unit/LeadDrawer.render.test.tsx`)

**Interfaces:**
- Consumes: `JobMember`, `buildMembers`, `shareOf`, `requestJoin`, `decideJoin`, `Job.cleaner_amount`.
- Produces: `JobDrawer` gains props `members: JobMember[]` and `uid: string` (role prop — reuse whatever role/admin props it already has; read the file first). `JobCard` gains `pendingCount?: number`.

- [ ] **Step 1: Rep data branch**

`app/(app)/jobs/page.tsx` and `app/(app)/map/page.tsx`: wherever the fetch splits `admin ? base jobs : jobs_public`, widen the condition to `role === 'admin' || role === 'rep'` (money now flows to reps by RLS). Add `cleaner_amount,done_at` to the base-table select lists and `cleaner_amount` to the `jobs_public` select lists. Keep `visibleJobs` for cleaners untouched. Both pages also fetch `job_members` (`id,job_id,cleaner_id,status,is_owner`) for the jobs in view and build `members` + per-job pending counts.

- [ ] **Step 2: Failing render test**

Extend the JobDrawer render test file (or create it mirroring `tests/unit/LeadDrawer.render.test.tsx`'s docblock/mock/cleanup pattern): (a) cleaner non-member on a claimed job sees `Request to join`; (b) owner sees Approve/Reject on a pending member; (c) non-owner cleaner sees neither buttons nor request (already-member case); (d) cleaner sees pot + share text, and the string `Price` is absent from their drawer. Run → FAIL.

- [ ] **Step 3: JobDrawer**

- Edit form (admin/rep): `Cleaner pot $` `<input name="cleaner_amount" type="number" step="0.01" className="num" defaultValue={job?.cleaner_amount ?? ''} />` beside the existing price input (same row style).
- Members section (all roles, view mode, only when job is claimed): heading `Members`; approved list — name + `★` when `is_owner`, per-head share via `shareOf(job.cleaner_amount, approvedCount)` rendered with the file's money formatter; pending list with `Approve`/`Reject` `.btn-s` buttons wired to `decideJoin` — rendered only when `role === 'admin' || members.some(m => m.is_owner && m.cleaner_id === uid && m.status === 'approved')` (mirrors `can_decide_join`; the RPC re-checks).
- Non-member cleaner on a claimed, not-done job: `Request to join` button (`.btn sec`, wired to `requestJoin`, error to the drawer's existing `form-err` slot). Own pending row renders `Requested · waiting` text instead.
- Cleaner money display: pot + `your share` line; never render price for cleaners (existing role gating already hides price — verify, don't assume).

- [ ] **Step 4: JobCard badge**

`JobCard` accepts `pendingCount?: number`; when `> 0` render `<span className="lbl" style={{ background: 'var(--follow)' }}>{pendingCount} ⏳</span>` in the card header (display-only; don't add click handlers — drag/activator wiring on these cards is delicate). Board/list wrappers pass the count only when `admin || job.claimed_by === uid` (pass `uid` down — follow how `claimedByName` style props already flow).

- [ ] **Step 5: Verify + commit**

Render tests green; full battery: `npm run lint && npx tsc --noEmit && npm test && npm run build`.

```bash
git add components/jobs/ "app/(app)/jobs/page.tsx" "app/(app)/map/page.tsx" tests/unit/JobDrawer.render.test.tsx
git commit -m "feat(jobs): members panel, join requests, pot input, pending badge, rep money branch"
```

---

### Task 5: Expenses page + nav

**Files:**
- Create: `app/(app)/expenses/page.tsx`, `components/expenses/ExpensesSection.tsx`
- Modify: `lib/nav.ts` (nav item + title)
- Test: `tests/unit/csv.test.ts` already covers the builder (Task 3); add `tests/unit/ExpensesSection.render.test.tsx`

**Interfaces:**
- Consumes: `addExpense`/`deleteExpense` actions, `expensesCsvTable`, `monthKey`.
- Produces: route `/expenses` (admin/rep), nav entry.

- [ ] **Step 1: Nav**

`lib/nav.ts`: insert `{ href: '/expenses', label: 'Expenses', num: '07', roles: ['admin', 'rep'] }` before Settings and renumber Settings to `'08'`; add `TITLES['/expenses'] = ['Expenses / Money Out', 'auto payouts + manual entries']`.

- [ ] **Step 2: Page (server component)**

`app/(app)/expenses/page.tsx`: role guard `if (role !== 'admin' && role !== 'rep') redirect('/dashboard')` (copy the invoices page guard shape). Fetch `expenses` (`id,label,amount,spent_on,job_id,source,created_at` ordered `spent_on desc, id desc`) with `logQueryError`; render `<ExpensesSection rows={...} />`.

- [ ] **Step 3: Failing render test, then ExpensesSection (client)**

Render test: month group headers appear (`2026-07` rows grouped), auto row (`source='job_payout'`) has NO delete button + shows `auto` chip, manual row has delete, add-form submit calls the mocked action. → FAIL, then implement:

- Group rows by `monthKey(spent_on)`; month header row with subtotal (existing money formatter), grand total in the scrhead caption.
- Table columns: Date, Label, Amount, Source (`.lbl` chip `auto`/`manual`), Job (link `/jobs?j=<id>` when set), Actions (Delete `.btn-s` for manual rows only; auto rows render a `title="created by job completion"` em-dash).
- Add form (scrhead or a `.box` above the table): label text input, amount `type="number" step="0.01" className="num"`, date input defaulting today, optional job id — wire to `addExpense` with `useTransition` + inline `form-err` (mirror an existing mutation section, e.g. the customers drawer save pattern).
- `⬇ Export CSV` button (`.btn sec`, `expensesCsvTable` + `downloadCSV('clearview-expenses.csv', …)`) placed in the scrhead action group like every other list screen.

- [ ] **Step 4: Verify + commit**

Battery + `npm run build` (new route compiles).

```bash
git add "app/(app)/expenses/" components/expenses/ lib/nav.ts tests/unit/ExpensesSection.render.test.tsx
git commit -m "feat(expenses): expenses page — month groups, add/delete, CSV, nav entry"
```

---

### Task 6: Dashboard role views — money row + leaderboard + my earnings

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Create: `components/dashboard/Leaderboard.tsx`, `components/dashboard/MoneyRow.tsx`
- Test: `tests/unit/Leaderboard.render.test.tsx`

**Interfaces:**
- Consumes: `cleaner_earnings` + `company_revenue` views, `leaderboard()`/`monthKey()` from `lib/earnings.ts`, profiles name map (dashboard already fetches or can fetch `profiles id,full_name`).
- Produces: dashboard sections; no new exports consumed elsewhere.

- [ ] **Step 1: Data**

Dashboard page fetches (parallel with the existing `Promise.all`): `cleaner_earnings` (`cleaner_id,job_id,done_at,share` — all roles), `company_revenue` (admin/rep get rows; cleaner gets `[]` by the view's role gate — fetch unconditionally, no branching needed), `profiles` (`id,full_name`) if not already fetched. `logQueryError` on each.

- [ ] **Step 2: Failing render test → Leaderboard component**

Test: renders rank/name/jobs/earnings rows sorted desc; month toggle switches datasets (pass both `monthRows`/`allRows` precomputed); current user's row gets the highlight class. → FAIL, then implement `Leaderboard` (client): props `{ month: LeaderRow[]; allTime: LeaderRow[]; uid: string }` where `LeaderRow` is `leaderboard()`'s return element type; `useState<'month' | 'all'>('month')`; two `.chip` toggle buttons (aria-pressed); `.tbl` table with rank `#n`, name (own row styled `fontWeight: 700`), jobs done, earnings (money formatter). Empty state: `no completed jobs yet`.

- [ ] **Step 3: MoneyRow + wiring**

`MoneyRow` (server-friendly, plain props): `{ month: { revenue: number; expenses: number; net: number } | null; allTimeNet: number }` rendered as three KPI tiles (reuse the dashboard's existing `.kpi` markup — read it first) + `all-time net` tile; link `→ Expenses` to `/expenses`.

Dashboard composition:
- admin/rep: existing KPIs, then `MoneyRow` (current month from `company_revenue` where `month === monthKey(now ISO)`, all-time net summed over rows), then `Leaderboard`.
- cleaner: `My earnings` card — this month + all-time + jobs done from their own `cleaner_earnings` rows (`leaderboard()` scoped to their id, or filter rows directly), then the same `Leaderboard`.

- [ ] **Step 4: Verify + commit**

Battery + build.

```bash
git add "app/(app)/dashboard/page.tsx" components/dashboard/ tests/unit/Leaderboard.render.test.tsx
git commit -m "feat(dashboard): money row, transparent leaderboard, cleaner earnings card"
```

---

### Task 7: Users panel — phone + DOB (profiles_private)

**Files:**
- Modify: `app/(app)/settings/page.tsx` (fetch `profiles_private`), the users panel component + create-user action (grep `UsersPanel` / the create-user server action file — read them first)
- Test: `supabase/tests/money_model.sql` already pins RLS (Task 1); extend the users panel's existing unit/render coverage only if a spec file already exists for it

**Interfaces:**
- Consumes: `profiles_private` table (RLS: admin/rep + self read, admin write).
- Produces: create-user form fields `phone`, `dob`; users table shows both.

- [ ] **Step 1: Create-user action**

After the existing profile creation succeeds, insert `{ profile_id, phone: phone || null, dob: dob || null }` into `profiles_private` (skip the insert when both empty). Non-fatal on error: log via the file's existing error path but don't fail user creation (the account matters more than the metadata) — surface the message in the returned error string if the file's pattern supports partial warnings, otherwise log only.

- [ ] **Step 2: Form + table**

Create-user form: `phone` (`type="tel"`, `autoComplete="off"` — this form already carries the Phase-D autofill guards, keep them) and `dob` (`type="date"`) inputs with `.lbl` labels matching the form's existing rows. Users table: `Phone` and `DOB` columns (em-dash when null); settings page fetches `profiles_private` and joins by `profile_id` in app code. If the panel has an edit flow, extend it with the same two fields writing an upsert to `profiles_private` through the same action file; if it has no edit flow, do NOT build one — note it in your report (owner re-creates or edits via SQL until a later pass).

- [ ] **Step 3: Verify + commit**

Battery. Manual spot: create a user with phone/DOB → row shows both; cleaner login cannot read colleagues' rows via REST (`curl` the PostgREST endpoint with the cleaner JWT — mirror how prior waves spot-checked `jobs_public`).

```bash
git add "app/(app)/settings/"   # plus the users-panel component files your grep found — stage exactly what you touched
git commit -m "feat(users): phone + DOB on create-user via profiles_private (admin/rep visibility)"
```

---

### Task 8: Verification pass

**Files:** none new.

- [ ] **Step 1: Full battery**

`npm run lint && npx tsc --noEmit && npm test && npm run build` clean; `npx supabase db reset` applies 0001–0024 + seed; `npm run test:db` green (all suites incl. `money_model.sql`).

- [ ] **Step 2: Owner acceptance walkthrough (dev server, all three roles)**

- Rep creates a job with price 200 + pot 80; rep sees both numbers; cleaner sees only 80.
- Cleaner A claims → appears as ★ owner in drawer members. Cleaner B requests join → badge `1 ⏳` on card for admin + Cleaner A only; Cleaner A approves → shares show 40/40.
- Admin rejects a third request; rejected cleaner can re-request.
- Move the job to Done → Expenses page shows auto row 80 (locked); bounce to Scheduled and back → still one row.
- Manual expense add/delete works; CSV downloads with month grouping intact.
- Dashboard: admin sees revenue 200 − 80 = net 120 for this month + leaderboard 40/40; cleaner sees own earnings card + full leaderboard with amounts.
- Cleaner REST probe: base `jobs` select → 0 rows; `jobs_public` has `cleaner_amount`, no `price`; `expenses` → 0 rows; colleague's `profiles_private` row → 0 rows.
- New user created with phone/DOB → visible in users table.

- [ ] **Step 3: Commit stragglers**

```bash
git status
git commit -m "fix(money): post-verification polish"  # only if fixes were needed
```
