# Plan 4 — Jobs Board + Realtime Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Jobs board (4-column drag-to-restatus Kanban: Unclaimed → Claimed → In progress → Done), a race-safe **Claim** button (first-claim-wins, locks the job to the current user, shows 🔒 + first name), the role-gated job detail drawer (`?j=<id>` with customer + origin-lead links, admin-only price, a disabled Plan-5 "Create invoice" stub), and **live realtime sync** so another client's claim or status change updates every open board within ~250 ms.

**Architecture:** Server components fetch per route via `supabaseServer()` (role-split: admins read the base `jobs` table for `price`, everyone else reads the `jobs_public` view); mutations are Server Actions calling security-definer RPCs (`claim_job`, `set_job_status`) then `revalidatePath('/jobs')`. The board is a client `JobsBoard` (page stays a server component) using `@dnd-kit/core` for cross-column drags with React 19 `useOptimistic` (snap-back on action error). Realtime is **broadcast-from-the-database**: an `AFTER` trigger on `public.jobs` emits a tiny `{id,status}` ping on the `jobs` topic via `realtime.send()`; each `JobsBoard` subscribes to a private channel and debounces the ping into `router.refresh()`, which re-runs the role-split server fetch (price/names never travel over the wire). All authorization (who may claim, who may transition) lives in the DB RPCs; `lib/jobs.ts`'s `canTransition()` is the client-side mirror that drives UI affordances only.

**Tech Stack:** Next.js 16 (App Router, async `searchParams`), React 19 (`useOptimistic`, `useTransition`), `@dnd-kit/core` (already installed, `^6.3.1`), Supabase (`@supabase/ssr` + `@supabase/supabase-js@^2.110.0` — verified to support `realtime.setAuth()` + private broadcast channels), Vitest (node env), pgTAP.

## Global Constraints

- **This is NOT the Next.js you know (Next 16).** `searchParams` page prop is a `Promise` (`await searchParams`); `cookies()` is async. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed `AGENTS.md`.
- **Any client component using `useSearchParams` must sit under `<Suspense>`.** We avoid it entirely: read `searchParams` in the server page and pass values down.
- **New table/RPC write access needs BOTH an RLS policy AND a `grant` to `authenticated`** (local Supabase does not auto-grant). RPCs need `grant execute ... to authenticated`.
- **pgTAP fixtures** use id range `900000+`, uuids `90000000-…`, emails `t-*@test.dev` (avoid seed collisions). Tests live in `supabase/tests/*.sql`, run with `npx supabase test db`.
- **Design source of truth:** `docs/design/clearview-proto.html` (jobs screen ~L276-280, job board/claim JS ~L489-520, job drawer ~L575-590). Mirror its markup/classes/tokens. Job-status colors: `unclaimed=var(--new)`, `claimed=var(--sched)`, `in_progress=var(--prog)`, `done=var(--done)`. The board/drawer/claim CSS (`.kanban`, `.col`, `.card2`, `.ch`, `.cnt`, `.claim`, `.claim.locked`, `.statuspick`, `.drawer`, `.dh`, `.kv`, `.qa`, `.acts`, `.minirow`, `.money-hidden`, `.kanban .card2{touch-action:none}`) already exists in `app/globals.css` from Plans 2–3 — reuse verbatim. **No `globals.css` change is required.**
- **Roles:** `admin | rep | cleaner` (`lib/auth.ts` exports `Role`, `getRole()`, `getSession()`). All three roles may **view** `/jobs`. **Cleaner** sees only claimable + own jobs (`visibleJobs`), never prices, and may claim + transition only their own jobs. **Rep** is view-only (no claim, no drag). **Admin** sees everything incl. price and may set any status.
- **Money (`jobs.price`) is admin-only:** never place it in client props for non-admins — admins read base `jobs` (with `price`), non-admins read the `jobs_public` view (no `price`). Non-admin drawers show `•••••`; non-admin cards omit price entirely.
- **Realtime payloads carry NO price and NO names — ping only** (`{id, status}`). Sensitive data is always re-fetched server-side through role-split RLS on `router.refresh()`.
- **Unclaimed → Claimed is the Claim button's job, NOT a drag.** `canTransition` returns `false` for `unclaimed→claimed` for every role, preserving first-claim-wins (the atomic `where status='unclaimed'` guard in `claim_job`). Drags route through `set_job_status`; claims route through `claim_job`.
- **Migrations are one concern per file:** `0008_profiles_read.sql`, `0009_claim_job_role.sql`, `0010_set_job_status.sql`, `0011_jobs_realtime.sql`.
- **`import type { Role } from '@/lib/auth'` in client components is safe:** it is a type-only import, fully erased at compile — no server module (`next/headers`) is bundled.
- Commands run from repo root `D:\Development\ClearViewCRM`. Unit tests: `npm test`. pgTAP: `npx supabase test db`. Dev DB must be up: `npx supabase start` (Docker running). Apply migrations+seed with `npx supabase db reset`. On Windows PowerShell, quote parenthesised paths (`app/(app)/...`).
- Commit after every task with a conventional message. Branch: `feat/jobs`.

---

### Task 1: Job RPCs + realtime trigger (DB migrations 0008-0011 + pgTAP)

Widen profile reads (for locked chips), add a role guard to `claim_job` (rep may not claim — a PRD fix), add the `set_job_status` definer RPC (admin-any / cleaner-own), and wire broadcast-from-DB realtime. Extend `claim_job.sql` with a rep-rejection assertion; add `jobs_board.sql` for the `set_job_status` matrix + a realtime-trigger assertion.

**Files:**
- Create: `supabase/migrations/0008_profiles_read.sql`
- Create: `supabase/migrations/0009_claim_job_role.sql`
- Create: `supabase/migrations/0010_set_job_status.sql`
- Create: `supabase/migrations/0011_jobs_realtime.sql`
- Modify: `supabase/tests/claim_job.sql` (plan 2 → 3; add rep rejection)
- Create: `supabase/tests/jobs_board.sql`

**Interfaces:**
- Consumes: `auth_role()` (0002), `auth.uid()`, `public.jobs` / `public.profiles` tables (0001), enums `job_status` (`'unclaimed'|'claimed'|'in_progress'|'done'`), `user_role`, `realtime.send(jsonb,text,text,boolean)` + `realtime.messages` (Supabase local).
- Produces:
  - `profiles_read` policy: `select using (auth.uid() is not null)` (replaces `profiles_self`).
  - `claim_job(p_job_id bigint) returns jobs` — NULL-safe role guard `auth_role() in ('admin','cleaner')`, atomic `where status='unclaimed'`.
  - `set_job_status(p_job_id bigint, p_status job_status) returns void` — admin any (clears `claimed_by` on unclaim); cleaner only `claimed|in_progress|done` on own job; rep/roleless raise `'Not authorized'`; 0 rows raise `'Job % not found or not yours'`.
  - Trigger `jobs_notify_change` → `notify_job_change()` writing a `{id,status}` broadcast row to `realtime.messages` on topic `jobs`; RLS policy `jobs_topic_read` on `realtime.messages`.

- [ ] **Step 1: Write the failing pgTAP — extend `claim_job.sql` (rep rejection)**

Replace `supabase/tests/claim_job.sql` entirely:

```sql
begin;
select plan(3);
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner@test.dev'),
  ('90000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-c@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000002','Cleaner Two','cleaner'),
  ('90000000-0000-0000-0000-000000000003','Rep Claim','rep');
insert into customers(id,name) overriding system value values (900009,'Claim Co');
insert into jobs(id,customer_id,status) overriding system value values (900099,900009,'unclaimed');
insert into jobs(id,customer_id,status) overriding system value values (900098,900009,'unclaimed');

set local role authenticated;
-- rep may NOT claim (PRD: rep is view-only). 900098 is still unclaimed, so the failure
-- is the new role guard, not the 'already claimed' guard.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000003"}';
select throws_ok($$ select claim_job(900098) $$, 'P0001', 'Not authorized to claim jobs', 'rep claim rejected');

-- cleaner: first claim wins, second raises.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000002"}';
select lives_ok($$ select claim_job(900099) $$, 'first claim succeeds');
select throws_ok($$ select claim_job(900099) $$, 'P0001', 'Job already claimed', 'second claim rejected');
select * from finish();
rollback;
```

- [ ] **Step 2: Write the failing pgTAP — `jobs_board.sql` (set_job_status matrix + realtime)**

Create `supabase/tests/jobs_board.sql`:

```sql
begin;
select plan(12);

-- fixtures
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-j@test.dev'),
  ('90000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-j@test.dev'),
  ('90000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-j@test.dev'),
  ('90000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner2-j@test.dev'),
  ('90000000-0000-0000-0000-000000000034','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-roleless-j@test.dev');
-- NOTE: no profiles row for ...034 — deliberately roleless (auth_role() returns NULL).
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000030','Admin Job','admin'),
  ('90000000-0000-0000-0000-000000000031','Rep Job','rep'),
  ('90000000-0000-0000-0000-000000000032','Cleaner Job','cleaner'),
  ('90000000-0000-0000-0000-000000000033','Cleaner Two Job','cleaner');
insert into customers(id,name) overriding system value values (900030,'Job Co');
insert into jobs(id,customer_id,status) overriding system value values (900301,900030,'unclaimed');
insert into jobs(id,customer_id,status,claimed_by) overriding system value values
  (900302,900030,'claimed','90000000-0000-0000-0000-000000000032'),
  (900303,900030,'claimed','90000000-0000-0000-0000-000000000032');

-- 1. realtime: the AFTER trigger wrote a broadcast ping to realtime.messages on 'jobs'
--    (the three job inserts above fired notify_job_change()).
select isnt_empty(
  $$ select 1 from realtime.messages where topic = 'jobs' and extension = 'broadcast' $$,
  'job write broadcasts a change ping to realtime.messages'
);

set local role authenticated;

-- (as admin) ------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000030"}';
-- 2 + 3. admin may set any status
select lives_ok($$ select set_job_status(900301, 'claimed'::job_status) $$, 'admin set_job_status runs');
select is((select status from jobs_public where id=900301), 'claimed'::job_status, 'admin status change persisted');
-- 4 + 5. admin unclaim clears claimed_by (rides along)
select lives_ok($$ select set_job_status(900303, 'unclaimed'::job_status) $$, 'admin unclaim runs');
select ok((select claimed_by is null from jobs_public where id=900303), 'admin unclaim cleared claimed_by');

-- (as cleaner owner ...032) ---------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000032"}';
-- 6 + 7. cleaner may advance their own job
select lives_ok($$ select set_job_status(900302, 'in_progress'::job_status) $$, 'cleaner owner set_job_status runs');
select is((select status from jobs_public where id=900302), 'in_progress'::job_status, 'cleaner owner status persisted');
-- 8. cleaner may NOT unclaim (not in allowed set)
select throws_ok($$ select set_job_status(900302, 'unclaimed'::job_status) $$, 'P0001', 'Not authorized', 'cleaner cannot unclaim');

-- (as cleaner NON-owner ...033) ------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000033"}';
-- 9. cleaner may not touch a job they do not own (0 rows -> not-found-or-not-yours)
select throws_ok($$ select set_job_status(900302, 'done'::job_status) $$, 'P0001', 'Job 900302 not found or not yours', 'cleaner non-owner blocked');

-- (as rep ...031) -------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}';
-- 10. rep denied entirely
select throws_ok($$ select set_job_status(900301, 'claimed'::job_status) $$, 'P0001', 'Not authorized', 'rep set_job_status blocked');

-- (as roleless ...034) --------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000034"}';
-- 11. NULL-role caller denied (regression: NULL role must fall through to the else)
select throws_ok($$ select set_job_status(900301, 'claimed'::job_status) $$, 'P0001', 'Not authorized', 'roleless set_job_status blocked');

-- (as admin) ------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000030"}';
-- 12. unknown job id raises the not-found guard
select throws_ok($$ select set_job_status(999999999, 'done'::job_status) $$, 'P0001', 'Job 999999999 not found or not yours', 'unknown job raises');

select * from finish();
rollback;
```

- [ ] **Step 3: Run to verify both fail**

Run: `npx supabase test db`
Expected: `claim_job` fails (rep claim currently succeeds — no role guard yet) and `jobs_board` fails (`set_job_status` does not exist; no realtime trigger yet).

- [ ] **Step 4: Write `0008_profiles_read.sql`**

Create `supabase/migrations/0008_profiles_read.sql`:

```sql
-- Locked chips on the jobs board show the claimer's first name, so every authenticated
-- user must read profile names, not just their own row. The 0002 profiles_self policy
-- (id = auth.uid() or admin) is too narrow. Widen SELECT to any logged-in user.
-- auth_role() is SECURITY DEFINER, so it does not recurse through this policy — no loop.
drop policy profiles_self on profiles;
create policy profiles_read on profiles for select using (auth.uid() is not null);
```

- [ ] **Step 5: Write `0009_claim_job_role.sql`**

Create `supabase/migrations/0009_claim_job_role.sql`:

```sql
-- PRD role matrix: only Admin + Cleaner may claim jobs; Rep is view-only. The original
-- claim_job (0003) had NO role check, so a rep could claim (a PRD violation). Re-create
-- it with a NULL-safe role guard at the top: coalesce(... in (...), false) so a roleless
-- caller (where `IN` yields NULL) is rejected, not silently allowed. The atomic
-- `where status='unclaimed'` guard is unchanged — first-write-wins, the loser's UPDATE
-- matches no row and raises 'Job already claimed'.
create or replace function claim_job(p_job_id bigint)
returns jobs language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  if coalesce(public.auth_role() in ('admin','cleaner'), false) is not true then
    raise exception 'Not authorized to claim jobs';
  end if;
  update public.jobs set status='claimed', claimed_by=auth.uid()
   where id=p_job_id and status='unclaimed'
  returning * into j;
  if j.id is null then raise exception 'Job already claimed'; end if;
  return j;
end $$;

grant execute on function claim_job(bigint) to authenticated;
```

- [ ] **Step 6: Write `0010_set_job_status.sql`**

Create `supabase/migrations/0010_set_job_status.sql`:

```sql
-- Status changes for the jobs board. Cleaners lack an UPDATE policy on jobs and cannot
-- SELECT the base table (price column), so a plain UPDATE is an RLS no-op for them:
-- route through this SECURITY DEFINER RPC (set_lead_status precedent, 0007). Rules:
--   admin   -> any status; moving to 'unclaimed' also clears claimed_by (unclaim).
--   cleaner -> only claimed/in_progress/done, and only on a job they already claimed
--              (claimed_by = auth.uid()); may NOT unclaim.
--   rep / roleless -> rejected.
-- NULL-safe: a NULL role fails every branch and lands in the final `else` (raise).
create or replace function set_job_status(p_job_id bigint, p_status job_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.auth_role();
  v_uid  uuid := auth.uid();
  updated int := 0;
begin
  if v_role = 'admin' then
    update public.jobs
       set status = p_status,
           claimed_by = case when p_status = 'unclaimed' then null else claimed_by end
     where id = p_job_id;
    get diagnostics updated = row_count;
  elsif v_role = 'cleaner' and p_status in ('claimed','in_progress','done') then
    update public.jobs
       set status = p_status
     where id = p_job_id and claimed_by = v_uid;
    get diagnostics updated = row_count;
  else
    raise exception 'Not authorized';
  end if;
  if updated = 0 then
    raise exception 'Job % not found or not yours', p_job_id;
  end if;
end $$;

grant execute on function set_job_status(bigint, job_status) to authenticated;
comment on function set_job_status is 'Jobs board status changes; definer because cleaners lack UPDATE/SELECT on base jobs (price column).';
```

- [ ] **Step 7: Write `0011_jobs_realtime.sql`**

Create `supabase/migrations/0011_jobs_realtime.sql`:

```sql
-- Realtime board sync via "broadcast from the database": an AFTER trigger emits a tiny
-- ping (id + status only — NEVER price or names) on the 'jobs' topic; every subscribed
-- client debounces it into a router.refresh(). We do NOT touch the publication or the
-- replica identity — realtime.send() writes a broadcast row directly.
--
-- The realtime.send() call is wrapped in begin/exception so a realtime outage can never
-- roll back or block the underlying job write. SECURITY DEFINER + pinned search_path
-- mirror the hardening on the other definer functions (0002/0003/0007).
create or replace function notify_job_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('id', new.id, 'status', new.status),  -- payload
      'change',                                                -- event
      'jobs',                                                  -- topic
      true                                                     -- private
    );
  exception when others then
    null; -- realtime is best-effort; never fail the job write
  end;
  return new;
end $$;

create trigger jobs_notify_change
  after insert or update on public.jobs
  for each row execute function notify_job_change();

-- A private broadcast requires the subscriber to pass RLS on realtime.messages. Allow any
-- authenticated user to read the 'jobs' broadcast topic — the ping carries no sensitive
-- data (price/names are fetched server-side through role-split RLS on refresh).
create policy jobs_topic_read on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'jobs' and extension = 'broadcast');
```

- [ ] **Step 8: Apply + run tests**

Run: `npx supabase db reset` then `npx supabase test db`
Expected: all pgTAP files pass — `schema`, `rls_money`, `claim_job` (3/3), `customers_write`, `leads_map` (19/19), `jobs_board` (12/12). If `schema`/`rls_money` reference the dropped `profiles_self` policy they would fail here; they do not (they only insert `profiles` fixtures), so they stay green.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0008_profiles_read.sql supabase/migrations/0009_claim_job_role.sql supabase/migrations/0010_set_job_status.sql supabase/migrations/0011_jobs_realtime.sql supabase/tests/claim_job.sql supabase/tests/jobs_board.sql
git commit -m "feat(db): job claim role guard, set_job_status RPC, broadcast-from-DB realtime + profiles read widening"
```

---

### Task 2: `lib/jobs.ts` (pure helpers + unit tests)

All pure, DB-free, client-safe job logic: status maps, the `Job` shape, `buildJobs`, `groupJobsByStatus`, `visibleJobs`, and `canTransition` — the single source of truth for UI affordances that mirrors the RPC rules. Must NOT import any server-only module (only a type-only `Role` import).

**Files:**
- Create: `lib/jobs.ts`
- Test: `tests/unit/jobs.test.ts`

**Interfaces:**
- Consumes: `import type { Role } from '@/lib/auth'` (type-only).
- Produces:
  - `type JobStatus = 'unclaimed' | 'claimed' | 'in_progress' | 'done'`
  - `const JOB_STATUSES: JobStatus[]` (order above)
  - `const jobStatusLabel: Record<JobStatus,string>`, `const jobStatusColor: Record<JobStatus,string>`
  - `type Job` (incl. `claimed_by: string|null`, `claimed_by_name: string|null`, `price: number|null`)
  - `type JobRow`, `type JobCustomer` (the DB shapes the page fetches)
  - `buildJobs(rows: JobRow[], customers: JobCustomer[], priceById: Map<number,number>|null, names: Map<string,string>): Job[]`
  - `groupJobsByStatus(jobs: Job[]): Record<JobStatus, Job[]>`
  - `visibleJobs(role: Role|null, uid: string, jobs: Job[]): Job[]`
  - `canTransition(role: Role|null, uid: string, job: Job, to: JobStatus): boolean`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/jobs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  JOB_STATUSES,
  jobStatusLabel,
  jobStatusColor,
  buildJobs,
  groupJobsByStatus,
  visibleJobs,
  canTransition,
  type Job,
  type JobRow,
  type JobCustomer,
} from '@/lib/jobs';

const job = (over: Partial<Job>): Job => ({
  id: 1, customer_id: 1, lead_id: 5, status: 'unclaimed', claimed_by: null,
  claimed_by_name: null, scheduled_date: null, service: 'In + out', price: null,
  customer_name: 'X', address: null, phone: null, email: null, ...over,
});

describe('status maps', () => {
  it('lists the four job statuses in board order', () => {
    expect(JOB_STATUSES).toEqual(['unclaimed', 'claimed', 'in_progress', 'done']);
  });
  it('has a label and a CSS-var color for every status', () => {
    for (const s of JOB_STATUSES) {
      expect(jobStatusLabel[s]).toBeTruthy();
      expect(jobStatusColor[s]).toMatch(/^var\(--/);
    }
    expect(jobStatusColor.unclaimed).toBe('var(--new)');
    expect(jobStatusColor.claimed).toBe('var(--sched)');
    expect(jobStatusColor.in_progress).toBe('var(--prog)');
    expect(jobStatusColor.done).toBe('var(--done)');
  });
});

describe('buildJobs', () => {
  const rows: JobRow[] = [
    { id: 10, customer_id: 1, lead_id: 5, status: 'claimed', claimed_by: 'u-1', scheduled_date: '2026-07-03', service: 'In + out' },
    { id: 11, customer_id: 2, lead_id: null, status: 'unclaimed', claimed_by: null, scheduled_date: null, service: null },
  ];
  const customers: JobCustomer[] = [
    { id: 1, name: 'Sarah Kim', address: '142 Maple Ave', phone: '555-0142', email: 's@k.io' },
  ];
  const names = new Map<string, string>([['u-1', 'Dylan Cruz']]);

  it('joins customer fields and resolves the claimer name', () => {
    const out = buildJobs(rows, customers, null, names);
    expect(out[0].customer_name).toBe('Sarah Kim');
    expect(out[0].address).toBe('142 Maple Ave');
    expect(out[0].claimed_by_name).toBe('Dylan Cruz');
    expect(out[1].customer_name).toBe('Unknown'); // customer 2 absent
    expect(out[1].claimed_by_name).toBeNull();
  });
  it('exposes price only when a price map is supplied (admin)', () => {
    const p = new Map<number, number>([[10, 180]]);
    const admin = buildJobs(rows, customers, p, names);
    expect(admin[0].price).toBe(180);
    expect(admin[1].price).toBeNull();
    const nonAdmin = buildJobs(rows, customers, null, names);
    expect(nonAdmin[0].price).toBeNull();
  });
});

describe('groupJobsByStatus', () => {
  it('buckets jobs and always returns all four keys', () => {
    const g = groupJobsByStatus([
      job({ id: 1, status: 'done' }),
      job({ id: 2, status: 'done' }),
      job({ id: 3, status: 'claimed' }),
    ]);
    expect(g.done.map(j => j.id)).toEqual([1, 2]);
    expect(g.claimed.map(j => j.id)).toEqual([3]);
    expect(g.unclaimed).toEqual([]);
    expect(g.in_progress).toEqual([]);
  });
});

describe('visibleJobs', () => {
  const jobs = [
    job({ id: 1, status: 'unclaimed', claimed_by: null }),
    job({ id: 2, status: 'claimed', claimed_by: 'me' }),
    job({ id: 3, status: 'in_progress', claimed_by: 'other' }),
  ];
  it('cleaner sees unclaimed + own only', () => {
    expect(visibleJobs('cleaner', 'me', jobs).map(j => j.id)).toEqual([1, 2]);
  });
  it('admin and rep see everything', () => {
    expect(visibleJobs('admin', 'me', jobs).map(j => j.id)).toEqual([1, 2, 3]);
    expect(visibleJobs('rep', 'me', jobs).map(j => j.id)).toEqual([1, 2, 3]);
  });
});

describe('canTransition', () => {
  const unclaimed = job({ status: 'unclaimed', claimed_by: null });
  const mineClaimed = job({ status: 'claimed', claimed_by: 'me' });
  const theirsClaimed = job({ status: 'claimed', claimed_by: 'other' });

  it('never allows a no-op (to === current status)', () => {
    expect(canTransition('admin', 'me', mineClaimed, 'claimed')).toBe(false);
  });
  it('never allows dragging unclaimed -> claimed (claim button only) for anyone', () => {
    expect(canTransition('admin', 'me', unclaimed, 'claimed')).toBe(false);
    expect(canTransition('cleaner', 'me', unclaimed, 'claimed')).toBe(false);
  });
  it('admin may make any other transition, including unclaim', () => {
    expect(canTransition('admin', 'me', mineClaimed, 'in_progress')).toBe(true);
    expect(canTransition('admin', 'me', mineClaimed, 'unclaimed')).toBe(true);
    expect(canTransition('admin', 'me', unclaimed, 'in_progress')).toBe(true);
  });
  it('cleaner may advance only their own job and may not unclaim', () => {
    expect(canTransition('cleaner', 'me', mineClaimed, 'in_progress')).toBe(true);
    expect(canTransition('cleaner', 'me', mineClaimed, 'done')).toBe(true);
    expect(canTransition('cleaner', 'me', mineClaimed, 'unclaimed')).toBe(false); // cannot unclaim
    expect(canTransition('cleaner', 'me', theirsClaimed, 'in_progress')).toBe(false); // not owner
    expect(canTransition('cleaner', 'me', unclaimed, 'in_progress')).toBe(false); // not owner (null)
  });
  it('rep and roleless may never transition', () => {
    expect(canTransition('rep', 'me', mineClaimed, 'in_progress')).toBe(false);
    expect(canTransition('rep', 'me', unclaimed, 'claimed')).toBe(false);
    expect(canTransition(null, 'me', mineClaimed, 'done')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/jobs'`.

- [ ] **Step 3: Implement `lib/jobs.ts`**

Create `lib/jobs.ts`:

```ts
import type { Role } from '@/lib/auth';

export type JobStatus = 'unclaimed' | 'claimed' | 'in_progress' | 'done';

export const JOB_STATUSES: JobStatus[] = ['unclaimed', 'claimed', 'in_progress', 'done'];

export const jobStatusLabel: Record<JobStatus, string> = {
  unclaimed: 'Unclaimed', claimed: 'Claimed', in_progress: 'In progress', done: 'Done',
};
export const jobStatusColor: Record<JobStatus, string> = {
  unclaimed: 'var(--new)', claimed: 'var(--sched)', in_progress: 'var(--prog)', done: 'var(--done)',
};

export type Job = {
  id: number;
  customer_id: number;
  lead_id: number | null;
  status: JobStatus;
  claimed_by: string | null;        // uuid of the claimer (or null)
  claimed_by_name: string | null;   // resolved full name (or null)
  scheduled_date: string | null;
  service: string | null;
  price: number | null;             // null = not visible (non-admin) or unset — admin-only
  customer_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

// DB shapes the page fetches: jobs_public view (non-admin) / base jobs projection (admin),
// plus a slim customers projection.
export type JobRow = {
  id: number;
  customer_id: number;
  lead_id: number | null;
  status: JobStatus;
  claimed_by: string | null;
  scheduled_date: string | null;
  service: string | null;
};
export type JobCustomer = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export function buildJobs(
  rows: JobRow[],
  customers: JobCustomer[],
  priceById: Map<number, number> | null,
  names: Map<string, string>
): Job[] {
  const byId = new Map(customers.map(c => [c.id, c]));
  return rows.map(r => {
    const c = byId.get(r.customer_id);
    return {
      id: r.id,
      customer_id: r.customer_id,
      lead_id: r.lead_id,
      status: r.status,
      claimed_by: r.claimed_by,
      claimed_by_name: r.claimed_by ? (names.get(r.claimed_by) ?? null) : null,
      scheduled_date: r.scheduled_date,
      service: r.service,
      price: priceById ? (priceById.get(r.id) ?? null) : null,
      customer_name: c?.name ?? 'Unknown',
      address: c?.address ?? null,
      phone: c?.phone ?? null,
      email: c?.email ?? null,
    };
  });
}

export function groupJobsByStatus(jobs: Job[]): Record<JobStatus, Job[]> {
  const out: Record<JobStatus, Job[]> = { unclaimed: [], claimed: [], in_progress: [], done: [] };
  for (const j of jobs) out[j.status].push(j);
  return out;
}

// Cleaner sees only claimable + own jobs; admin/rep see everything.
export function visibleJobs(role: Role | null, uid: string, jobs: Job[]): Job[] {
  if (role === 'cleaner') return jobs.filter(j => j.status === 'unclaimed' || j.claimed_by === uid);
  return jobs;
}

// Single source of truth for drag affordances — mirrors the set_job_status RPC rules.
// unclaimed -> claimed is deliberately excluded (that is the Claim button's job, which
// routes through claim_job to preserve first-claim-wins).
export function canTransition(role: Role | null, uid: string, job: Job, to: JobStatus): boolean {
  if (to === job.status) return false;
  if (job.status === 'unclaimed' && to === 'claimed') return false;
  if (role === 'admin') return true;
  if (role === 'cleaner') {
    if (job.claimed_by !== uid) return false; // only own jobs
    if (to === 'unclaimed') return false;      // cleaner may not unclaim
    return true;                               // claimed/in_progress/done
  }
  return false; // rep / roleless: view-only
}
```

- [ ] **Step 4: Run — tests pass**

Run: `npm test`
Expected: `jobs.test.ts` PASS (all prior unit tests still green).

- [ ] **Step 5: Commit**

```bash
git add lib/jobs.ts tests/unit/jobs.test.ts
git commit -m "feat(jobs): pure job helpers (status maps, buildJobs, visibleJobs, canTransition)"
```

---

### Task 3: Jobs board + drawer + actions + page (no realtime yet)

The `/jobs` board for all three roles: drag-to-restatus (per `canTransition`), Claim button on unclaimed cards (first-claim-wins via `claim_job`), locked cards showing 🔒 + first name, optimistic moves with snap-back, and the deep-linked `?j=<id>` drawer (customer + origin-lead links, admin price, disabled Plan-5 "Create invoice"). Realtime is added in Task 4.

**Files:**
- Create: `app/(app)/jobs/actions.ts`
- Create: `components/jobs/JobCard.tsx`, `components/jobs/JobColumn.tsx`, `components/jobs/JobsBoard.tsx`, `components/jobs/JobDrawer.tsx`
- Modify: `app/(app)/jobs/page.tsx` (full replace — role-split fetch + board + drawer)

**Interfaces:**
- Consumes: `Job`, `JobStatus`, `JOB_STATUSES`, `jobStatusLabel`, `jobStatusColor`, `groupJobsByStatus`, `visibleJobs`, `canTransition`, `buildJobs`, `JobRow`, `JobCustomer` (Task 2); `Role`, `getRole`, `getSession` (`lib/auth`); `Drawer` (`components/ui/Drawer.tsx`, Plan 2); `supabaseServer()`; `claim_job` / `set_job_status` RPCs (Task 1).
- Produces:
  - `app/(app)/jobs/actions.ts`: `claimJob(id: number): Promise<{ error?: string }>`, `setJobStatus(id: number, status: JobStatus): Promise<{ error?: string }>` (both `revalidatePath('/jobs')`).
  - `components/jobs/JobsBoard.tsx`: `function JobsBoard({ jobs, role, uid, meName, admin }: { jobs: Job[]; role: Role; uid: string; meName: string; admin: boolean })`.
  - `components/jobs/JobDrawer.tsx`: `function JobDrawer({ job, role, uid, admin }: { job: Job; role: Role; uid: string; admin: boolean })`.

- [ ] **Step 1: Write the server actions**

Create `app/(app)/jobs/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { JOB_STATUSES, type JobStatus } from '@/lib/jobs';

// First-claim-wins is enforced atomically inside claim_job (0009): the loser's UPDATE
// matches no row and the RPC raises 'Job already claimed', surfaced here as {error}.
export async function claimJob(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('claim_job', { p_job_id: id });
  if (error) return { error: error.message };
  revalidatePath('/jobs');
  return {};
}

// Cleaners lack UPDATE/SELECT on base jobs, so route through the set_job_status definer
// RPC (0010), which enforces admin-any / cleaner-own and raises on 0 rows affected.
export async function setJobStatus(id: number, status: JobStatus): Promise<{ error?: string }> {
  if (!JOB_STATUSES.includes(status)) return { error: 'Invalid status' };
  const sb = await supabaseServer();
  const { error } = await sb.rpc('set_job_status', { p_job_id: id, p_status: status });
  if (error) return { error: error.message };
  revalidatePath('/jobs');
  return {};
}
```

- [ ] **Step 2: Build `JobCard`**

Create `components/jobs/JobCard.tsx` (clones `LeadCard`'s `downPos` post-drag click suppression; adds Claim button + locked chip):

```tsx
'use client';
import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Job } from '@/lib/jobs';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export function JobCard({
  job, admin, draggable, canClaim, onOpen, onClaim,
}: {
  job: Job;
  admin: boolean;
  draggable: boolean;
  canClaim: boolean;
  onOpen: (id: number) => void;
  onClaim: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(job.id),
    disabled: !draggable,
  });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  // dnd-kit fires a native click on mouseup after a completed drag; suppress onOpen when
  // pointer travel between down and click exceeds the 5px threshold (LeadCard pattern).
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const firstName = job.claimed_by_name ? job.claimed_by_name.split(' ')[0] : '';
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card2${isDragging ? ' dragging' : ''}`}
      onPointerDown={e => {
        downPos.current = { x: e.clientX, y: e.clientY };
        listeners?.onPointerDown?.(e);
      }}
      onClick={e => {
        const d = downPos.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
        onOpen(job.id);
      }}
      {...attributes}
    >
      <span className="addr">{job.customer_name}</span>
      <span className="meta">
        {job.address ?? '—'}
        <br />
        {job.service ?? 'TBD'} · {job.scheduled_date ?? 'TBD'}
        {admin && job.price ? ` · ${fmt(job.price)}` : ''}
      </span>
      <div style={{ marginTop: 8 }}>
        {canClaim ? (
          <button
            type="button"
            className="claim"
            onClick={e => { e.stopPropagation(); onClaim(job.id); }}
          >
            Claim
          </button>
        ) : job.claimed_by_name ? (
          <button type="button" className="claim locked" onClick={e => e.stopPropagation()}>
            🔒 {firstName}
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build `JobColumn`**

Create `components/jobs/JobColumn.tsx`:

```tsx
'use client';
import { useDroppable } from '@dnd-kit/core';
import {
  JOB_STATUSES,
  jobStatusLabel,
  jobStatusColor,
  canTransition,
  type Job,
  type JobStatus,
} from '@/lib/jobs';
import type { Role } from '@/lib/auth';
import { JobCard } from './JobCard';

export function JobColumn({
  status, jobs, admin, role, uid, onOpen, onClaim,
}: {
  status: JobStatus;
  jobs: Job[];
  admin: boolean;
  role: Role;
  uid: string;
  onOpen: (id: number) => void;
  onClaim: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`col box${isOver ? ' dragover' : ''}`}>
      <div className="ch">
        <b style={{ color: jobStatusColor[status] }}>{jobStatusLabel[status]}</b>
        <span className="cnt">{jobs.length}</span>
      </div>
      {jobs.map(j => {
        const draggable = JOB_STATUSES.some(to => canTransition(role, uid, j, to));
        const canClaim = j.status === 'unclaimed' && (role === 'admin' || role === 'cleaner');
        return (
          <JobCard
            key={j.id}
            job={j}
            admin={admin}
            draggable={draggable}
            canClaim={canClaim}
            onOpen={onOpen}
            onClaim={onClaim}
          />
        );
      })}
      {jobs.length === 0 && (
        <div className="meta" style={{ color: 'var(--muted)', fontSize: 10 }}>— drop here —</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build `JobsBoard` (no realtime yet)**

Create `components/jobs/JobsBoard.tsx`:

```tsx
'use client';
import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  JOB_STATUSES,
  groupJobsByStatus,
  canTransition,
  type Job,
  type JobStatus,
} from '@/lib/jobs';
import type { Role } from '@/lib/auth';
import { claimJob, setJobStatus } from '@/app/(app)/jobs/actions';
import { JobColumn } from './JobColumn';

type Patch = { id: number; status: JobStatus; claimed_by?: string | null; claimed_by_name?: string | null };

export function JobsBoard({
  jobs, role, uid, meName, admin,
}: {
  jobs: Job[];
  role: Role;
  uid: string;
  meName: string;
  admin: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimistic patch; reverts automatically when the action returns without a revalidate
  // (i.e. on error), and reconciles with fresh server data on success/realtime refresh.
  const [optimistic, applyOptimistic] = useOptimistic(
    jobs,
    (state: Job[], p: Patch) => state.map(j => (j.id === p.id ? { ...j, ...p } : j))
  );
  // 5px activation distance so a tap still fires the card's onClick (opens drawer).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const grouped = groupJobsByStatus(optimistic);

  const onDragEnd = (e: DragEndEvent) => {
    const id = Number(e.active.id);
    const to = e.over?.id as JobStatus | undefined;
    if (!to || !JOB_STATUSES.includes(to)) return;
    const job = optimistic.find(j => j.id === id);
    if (!job || !canTransition(role, uid, job, to)) return;
    setError(null);
    startTransition(async () => {
      const patch: Patch = to === 'unclaimed'
        ? { id, status: to, claimed_by: null, claimed_by_name: null }
        : { id, status: to };
      applyOptimistic(patch);
      const res = await setJobStatus(id, to);
      if (res?.error) setError(res.error);
    });
  };

  const onClaim = (id: number) => {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ id, status: 'claimed', claimed_by: uid, claimed_by_name: meName });
      const res = await claimJob(id);
      if (res?.error) setError(res.error);
    });
  };

  const open = (id: number) => router.push(`/jobs?j=${id}`, { scroll: false });

  return (
    <section className="screen">
      <div className="scrhead">
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          drag between statuses · claim to lock
        </span>
      </div>
      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {JOB_STATUSES.map(st => (
            <JobColumn
              key={st}
              status={st}
              jobs={grouped[st]}
              admin={admin}
              role={role}
              uid={uid}
              onOpen={open}
              onClaim={onClaim}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}
```

- [ ] **Step 5: Build `JobDrawer`**

Create `components/jobs/JobDrawer.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import {
  JOB_STATUSES,
  jobStatusLabel,
  jobStatusColor,
  canTransition,
  type Job,
  type JobStatus,
} from '@/lib/jobs';
import type { Role } from '@/lib/auth';
import { claimJob, setJobStatus } from '@/app/(app)/jobs/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export function JobDrawer({
  job, role, uid, admin,
}: {
  job: Job;
  role: Role;
  uid: string;
  admin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const close = () => router.push('/jobs', { scroll: false });
  const canClaim = job.status === 'unclaimed' && (role === 'admin' || role === 'cleaner');

  const change = (status: JobStatus) => {
    if (status === job.status) return;
    setError(null);
    startTransition(async () => {
      const res = await setJobStatus(job.id, status);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };
  const claim = () => {
    setError(null);
    startTransition(async () => {
      const res = await claimJob(job.id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <Drawer onClose={close}>
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: jobStatusColor[job.status] }}>
            {jobStatusLabel[job.status]}
          </span>
          <h2>{job.customer_name}</h2>
        </div>
        <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
      </div>
      <div className="lbl" style={{ marginTop: 4 }}>
        JOB #{String(job.id).padStart(4, '0')}
        {job.lead_id != null ? ` · from lead #${String(job.lead_id).padStart(4, '0')}` : ''}
      </div>

      <div className="sec">
        <span className="lbl">Customer</span>
        <div className="minirow" onClick={() => router.push(`/customers?c=${job.customer_id}`, { scroll: false })}>
          <span><b>{job.customer_name}</b> · {job.address ?? '—'}</span>
          <span>→</span>
        </div>
        {job.lead_id != null && (
          <div className="minirow" onClick={() => router.push(`/leads?l=${job.lead_id}`, { scroll: false })}>
            <span>Origin lead #{String(job.lead_id).padStart(4, '0')}</span>
            <span>→</span>
          </div>
        )}
        <div className="qa">
          <a href={`tel:${job.phone ?? ''}`}>📞 Call</a>
          <a href={`sms:${job.phone ?? ''}`}>💬 Text</a>
          <a href={`mailto:${job.email ?? ''}`}>✉ Email</a>
        </div>
      </div>

      <div className="sec">
        <span className="lbl">Job</span>
        <div className="kv">
          <span className="k">Service</span>
          <span className="v">{job.service ?? 'TBD'}</span>
          <span className="k">Date</span>
          <span className="v">{job.scheduled_date ?? 'TBD'}</span>
          <span className="k">Claimed by</span>
          <span className="v">{job.claimed_by_name ?? '—'}</span>
          <span className="k">Price</span>
          {admin ? (
            <span className="v" style={{ color: 'var(--won)' }}>{job.price ? fmt(job.price) : '—'}</span>
          ) : (
            <span className="v money-hidden">•••••</span>
          )}
        </div>
      </div>

      <div className="sec">
        <span className="lbl">Change status</span>
        <div className="statuspick">
          {JOB_STATUSES.map(st => {
            const sel = st === job.status;
            const allowed = sel || canTransition(role, uid, job, st);
            return (
              <button
                key={st}
                type="button"
                className={sel ? 'sel' : ''}
                disabled={pending || !allowed}
                style={sel ? { background: jobStatusColor[st], color: '#fff', borderColor: 'transparent' } : undefined}
                onClick={() => change(st)}
              >
                {jobStatusLabel[st]}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}

      <div className="acts">
        {canClaim && (
          <button className="btn-p" type="button" disabled={pending} onClick={claim}>
            Claim job
          </button>
        )}
        {admin && (
          <button className="btn-s" type="button" disabled title="Invoicing arrives in Plan 5">
            Create invoice
          </button>
        )}
        <button className="btn-s" type="button" onClick={close}>Close</button>
      </div>
      {admin && (
        <p className="cap" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
          Invoicing (Create invoice) arrives in Plan 5.
        </p>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 6: Replace the jobs page (role-split fetch + board + drawer)**

Replace `app/(app)/jobs/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildJobs, visibleJobs, type JobRow, type JobCustomer } from '@/lib/jobs';
import { JobsBoard } from '@/components/jobs/JobsBoard';
import { JobDrawer } from '@/components/jobs/JobDrawer';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const { j: jParam } = await searchParams;
  const user = await getSession();
  if (!user) redirect('/login');
  const role = await getRole();
  if (!role) redirect('/login');
  const uid = user.id;
  const admin = role === 'admin';
  const sb = await supabaseServer();

  // Role-split fetch: admins read base jobs (incl. price); everyone else reads the
  // jobs_public view (no price column — money stays server-side).
  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (admin) {
    const { data } = await sb
      .from('jobs')
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,price')
      .order('id');
    const rows = data ?? [];
    jobRows = rows.map(r => ({
      id: r.id,
      customer_id: r.customer_id,
      lead_id: r.lead_id,
      status: r.status,
      claimed_by: r.claimed_by,
      scheduled_date: r.scheduled_date,
      service: r.service,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    const { data } = await sb
      .from('jobs_public')
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service')
      .order('id');
    jobRows = (data ?? []) as JobRow[];
  }

  const { data: cs } = await sb.from('customers').select('id,name,address,phone,email');
  const { data: ps } = await sb.from('profiles').select('id,full_name');
  const names = new Map((ps ?? []).map(p => [p.id as string, p.full_name as string]));

  const all = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const visible = visibleJobs(role, uid, all);
  const meName = names.get(uid) ?? '';
  // Resolve the drawer THROUGH visibleJobs: a cleaner deep-linking to a foreign job
  // (?j=<id> not in their visible set) must render no drawer.
  const selected = jParam ? visible.find(j => j.id === Number(jParam)) ?? null : null;

  return (
    <>
      <JobsBoard jobs={visible} role={role} uid={uid} meName={meName} admin={admin} />
      {selected && <JobDrawer job={selected} role={role} uid={uid} admin={admin} />}
    </>
  );
}
```

- [ ] **Step 7: Verify build + tests**

Run: `npm test` — green (no new unit tests; DnD/claim are exercised in the Task 5 live drive).
Run: `npm run build` — clean (server page compiles; client actions imported by client components; no Suspense/searchParams errors).

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/jobs/actions.ts" "app/(app)/jobs/page.tsx" components/jobs/JobCard.tsx components/jobs/JobColumn.tsx components/jobs/JobsBoard.tsx components/jobs/JobDrawer.tsx
git commit -m "feat(jobs): drag/claim board, role-gated job drawer + claim/setJobStatus actions"
```

---

### Task 4: Realtime wiring in `JobsBoard`

Subscribe each open board to the private `jobs` broadcast channel; debounce the DB ping (250 ms trailing) into `router.refresh()`, which re-runs the role-split server fetch so another client's claim/status change lands live. `useOptimistic` reconciles with the refreshed props.

**Files:**
- Modify: `components/jobs/JobsBoard.tsx` (add the realtime `useEffect`)

**Interfaces:**
- Consumes: `supabaseBrowser()` (`lib/supabase/client.ts`); `realtime.setAuth()` + `channel('jobs', { config: { private: true } })` (`@supabase/supabase-js@^2.110.0`); the `jobs_notify_change` trigger + `jobs_topic_read` policy (Task 1).
- Produces: no new exports — `JobsBoard`'s signature is unchanged.

- [ ] **Step 1: Add the realtime subscription to `JobsBoard`**

Replace `components/jobs/JobsBoard.tsx` entirely (adds `useEffect` + the client import; the rest is identical to Task 3):

```tsx
'use client';
import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  JOB_STATUSES,
  groupJobsByStatus,
  canTransition,
  type Job,
  type JobStatus,
} from '@/lib/jobs';
import type { Role } from '@/lib/auth';
import { supabaseBrowser } from '@/lib/supabase/client';
import { claimJob, setJobStatus } from '@/app/(app)/jobs/actions';
import { JobColumn } from './JobColumn';

type Patch = { id: number; status: JobStatus; claimed_by?: string | null; claimed_by_name?: string | null };

export function JobsBoard({
  jobs, role, uid, meName, admin,
}: {
  jobs: Job[];
  role: Role;
  uid: string;
  meName: string;
  admin: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, applyOptimistic] = useOptimistic(
    jobs,
    (state: Job[], p: Patch) => state.map(j => (j.id === p.id ? { ...j, ...p } : j))
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const grouped = groupJobsByStatus(optimistic);

  // Realtime: subscribe to the private 'jobs' broadcast topic. The DB trigger
  // (0011) sends a tiny {id,status} ping on any job insert/update; we debounce it
  // (250ms trailing) into router.refresh(), which re-runs the role-split server fetch.
  // Sensitive data (price/names) is NEVER in the ping — it comes back through RLS.
  useEffect(() => {
    const sb = supabaseBrowser();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    (async () => {
      await sb.realtime.setAuth(); // attach the current session token for RLS on realtime.messages
      channel = sb
        .channel('jobs', { config: { private: true } })
        .on('broadcast', { event: 'change' }, refresh)
        .subscribe();
    })();
    return () => {
      if (timer) clearTimeout(timer);
      if (channel) sb.removeChannel(channel);
    };
  }, [router]);

  const onDragEnd = (e: DragEndEvent) => {
    const id = Number(e.active.id);
    const to = e.over?.id as JobStatus | undefined;
    if (!to || !JOB_STATUSES.includes(to)) return;
    const job = optimistic.find(j => j.id === id);
    if (!job || !canTransition(role, uid, job, to)) return;
    setError(null);
    startTransition(async () => {
      const patch: Patch = to === 'unclaimed'
        ? { id, status: to, claimed_by: null, claimed_by_name: null }
        : { id, status: to };
      applyOptimistic(patch);
      const res = await setJobStatus(id, to);
      if (res?.error) setError(res.error);
    });
  };

  const onClaim = (id: number) => {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ id, status: 'claimed', claimed_by: uid, claimed_by_name: meName });
      const res = await claimJob(id);
      if (res?.error) setError(res.error);
    });
  };

  const open = (id: number) => router.push(`/jobs?j=${id}`, { scroll: false });

  return (
    <section className="screen">
      <div className="scrhead">
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          drag between statuses · claim to lock
        </span>
      </div>
      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {JOB_STATUSES.map(st => (
            <JobColumn
              key={st}
              status={st}
              jobs={grouped[st]}
              admin={admin}
              role={role}
              uid={uid}
              onOpen={open}
              onClaim={onClaim}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}
```

- [ ] **Step 2: Verify build + tests + lint**

Run: `npm test` — green.
Run: `npm run build` — clean.
Run: `npm run lint` — no errors (`useEffect` deps `[router]`; `useRouter` is stable in the App Router, so the effect subscribes once per mount and cleans up via `removeChannel`).

- [ ] **Step 3: Commit**

```bash
git add components/jobs/JobsBoard.tsx
git commit -m "feat(jobs): live board via private 'jobs' broadcast channel + debounced router.refresh"
```

---

### Task 5: Full verification pass

No new features. Prove Plan 4 works end-to-end against the live local stack, in all three roles, including the claim race and realtime.

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append results)

**Interfaces:** consumes everything above.

- [ ] **Step 1: Full automated suite**

```bash
npx supabase db reset
npx supabase test db     # expect: schema, rls_money, claim_job (3/3), customers_write, leads_map (19/19), jobs_board (12/12)
npm test                 # expect all unit tests pass (nav, customers-filter, customer-form, search, leads, geo, pin-form, jobs)
npm run build            # expect clean production build
npm run lint             # expect no errors
```

- [ ] **Step 2: DB-layer RPC matrix (psql, no app)**

Capture the DB URL once:
```bash
DBURL="$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')"
```
Seed roles: admin `111…`, rep `222…`, cleaner (Dylan) `333…`. Seed jobs: lead 1 → `claimed` by `333`, lead 2 → `unclaimed`, lead 5 → `in_progress` by `333`, lead 8 → `unclaimed`.

```bash
# rep may NOT claim an unclaimed job (lead 8's job) — raises 'Not authorized to claim jobs'
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"22222222-2222-2222-2222-222222222222\"}'; select claim_job((select id from jobs where lead_id=8));" || echo "OK: rep claim blocked"

# cleaner may claim an unclaimed job (lead 2's job) — returns the job row
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"33333333-3333-3333-3333-333333333333\"}'; select claim_job((select id from jobs where lead_id=2));"

# cleaner may advance their OWN job (lead 1, claimed by 333) — reports success (void)
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"33333333-3333-3333-3333-333333333333\"}'; select set_job_status((select id from jobs where lead_id=1),'in_progress');"

# cleaner may NOT touch a job they do not own (lead 8, unclaimed) — raises not-found-or-not-yours
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"33333333-3333-3333-3333-333333333333\"}'; select set_job_status((select id from jobs where lead_id=8),'done');" || echo "OK: cleaner foreign job blocked"

# admin may set any status and unclaim (clears claimed_by) — lead 5 back to unclaimed
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"11111111-1111-1111-1111-111111111111\"}'; select set_job_status((select id from jobs where lead_id=5),'unclaimed'); select claimed_by from jobs where lead_id=5;"
```
Expected: rep claim prints `OK: rep claim blocked`; cleaner claim returns a job row; cleaner own-job update succeeds; cleaner foreign-job prints `OK: cleaner foreign job blocked`; admin unclaim succeeds and `claimed_by` reads `NULL`. Reset afterward: `npx supabase db reset`.

- [ ] **Step 3: Claim race (two concurrent claims → exactly one loser)**

```bash
npx supabase db reset
DBURL="$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')"
JOBID="$(psql "$DBURL" -tA -c "select id from jobs where lead_id=8;")"   # lead 8 = unclaimed
CLAIM="set role authenticated; set request.jwt.claims='{\"sub\":\"33333333-3333-3333-3333-333333333333\"}'; select claim_job($JOBID);"
psql "$DBURL" -c "$CLAIM" >/tmp/c1.log 2>&1 &
psql "$DBURL" -c "$CLAIM" >/tmp/c2.log 2>&1 &
wait
grep -l "Job already claimed" /tmp/c1.log /tmp/c2.log | wc -l   # expect exactly 1
```
Expected: exactly one of the two logs contains `Job already claimed` (the atomic `where status='unclaimed'` guard makes the loser deterministic regardless of scheduling). Reset afterward.

- [ ] **Step 4: Realtime smoke (node script, two clients)**

Create a throwaway `scripts/realtime-smoke.mjs`:

```js
import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Subscriber: admin watches the private 'jobs' broadcast topic.
const a = createClient(url, anon);
await a.auth.signInWithPassword({ email: 'admin@clearview.dev', password: 'password123' });
await a.realtime.setAuth();
let got = false;
a.channel('jobs', { config: { private: true } })
  .on('broadcast', { event: 'change' }, p => { got = true; console.log('received', p.payload); })
  .subscribe();
await new Promise(r => setTimeout(r, 1500));

// Trigger: cleaner claims an unclaimed job in a second client.
const b = createClient(url, anon);
await b.auth.signInWithPassword({ email: 'cleaner@clearview.dev', password: 'password123' });
const { data: jobs } = await b.from('jobs_public').select('id').eq('status', 'unclaimed').limit(1);
await b.rpc('claim_job', { p_job_id: jobs[0].id });
await new Promise(r => setTimeout(r, 1500));

console.log(got ? 'PASS: broadcast received' : 'FAIL: no broadcast');
process.exit(got ? 0 : 1);
```

Run: `npx supabase db reset` then `node --env-file=.env.local scripts/realtime-smoke.mjs`
Expected: prints `received { id: <n>, status: 'claimed' }` then `PASS: broadcast received` (exit 0). Delete the script afterward: `rm scripts/realtime-smoke.mjs`.

- [ ] **Step 5: Live drive (dev server)**

Run `npm run dev`, verify against `http://localhost:3000` (browser automation; logins password `password123`):

1. `admin@clearview.dev` `/jobs`: 4 columns (Unclaimed/Claimed/In progress/Done); seed jobs show a `$` price on cards. Drag a Claimed card → In progress → moves instantly and persists after reload. Open an unclaimed card → drawer shows Price as a dollar amount, customer minirow → `/customers?c=<id>`, "Origin lead" minirow → `/leads?l=<id>`, a disabled "Create invoice" button with the Plan-5 caption. Click Claim on an unclaimed card → locks to 🔒 Marcus.
2. `cleaner@clearview.dev` `/jobs`: sees only unclaimed + own jobs (never other cleaners' or reps' non-claimable jobs); NO price on cards or in drawer (`•••••`). Claim an unclaimed card → it locks with 🔒 Dylan and moves to Claimed. Drag own Claimed → In progress works; there is no way to unclaim (drag back to Unclaimed is rejected — card snaps back). Direct nav `/jobs?j=<foreign job id>` renders NO drawer.
3. `rep@clearview.dev` `/jobs`: board is view-only — no Claim buttons, cards are not draggable, no price. Drawer status buttons are all disabled; no Claim button.
4. Realtime: open `/jobs` as admin in window A and as cleaner in window B. In B, claim an unclaimed job → within ~250 ms window A's board updates (that job leaves Unclaimed, shows 🔒 Dylan) with no manual reload. In A, drag a job to Done → B reflects it live.

- [ ] **Step 6: Record results + commit ledger**

Append verification results to `.superpowers/sdd/progress.md`, then:

```bash
git add .superpowers/sdd/progress.md
git commit -m "chore: plan 4 verification results"
```

---

## Execution notes (controller)

- Branch: `feat/jobs`. Merge to `main` only when Task 5 is fully green.
- The realtime trigger fires on every job write, including seed and other pgTAP suites; `realtime.send()` is wrapped in `begin/exception` so a realtime hiccup never blocks or rolls back a job write. If `jobs_board.sql` test 1 (the `realtime.messages` assertion) ever fails on a stripped-down local stack, it indicates `realtime.send` is unavailable — the swallow keeps writes working, but the ping (and live board) will not fire until realtime is present.
- `set_job_status` and `claim_job` are the authorization boundary; `canTransition`/`visibleJobs` are UI mirrors only — never rely on them for security.
- After merge, update `docs/superpowers/AUTONOMOUS_RUN.md` status section (mirrors the Plan 3 handoff).
