# Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the ClearView CRM repo with a Postgres data model whose security rules (Admin-only money, race-safe job claiming) are proven by tests, plus email/password auth with three roles.

**Architecture:** Next.js (App Router, TypeScript) web app backed by Supabase (Postgres + Auth). The database is the security boundary: Row-Level Security (RLS) and a `SECURITY DEFINER` claim function enforce the PRD's hard rules, verified with pgTAP database tests. Reps/cleaners query money-free views; admins query full tables. Auth uses Supabase email/password; a `profiles` table holds the role.

**Tech Stack:** Next.js 15, TypeScript (strict), Tailwind, Supabase (local via CLI + Docker), pgTAP (DB tests), Vitest (unit), Playwright (later E2E).

## Global Constraints

- Node.js ≥ 20 LTS.
- TypeScript `strict: true`.
- Money (`leads.quote_value`, `jobs.price`, all `invoices`/`invoice_items`) is readable by **admin only**, enforced in the database — never rely on UI hiding.
- Job claiming is **first-write-wins**, enforced by a transactional guard, not client state.
- Hosting target: Cloudflare Pages / Netlify (do NOT assume Vercel — no Vercel-only APIs).
- Never commit secrets. `.env.local` is gitignored; use `.env.example` for shape.
- Every task ends green (all tests pass) and is committed.

---

## File Structure

```
ClearViewCRM/
  package.json, tsconfig.json, next.config.mjs, tailwind.config.ts
  .env.example, .gitignore
  app/
    layout.tsx, page.tsx
    login/page.tsx
    (app)/layout.tsx            # auth guard wrapper
    (app)/dashboard/page.tsx    # placeholder, proves guard
  lib/
    supabase/client.ts          # browser client
    supabase/server.ts          # server client (cookies)
    auth.ts                     # getSession/getRole helpers
  supabase/
    config.toml
    migrations/
      0001_schema.sql           # tables + enums
      0002_rls.sql              # RLS, auth_role(), views, grants
      0003_claim_job.sql        # atomic claim function
    tests/
      rls_money.sql             # pgTAP: money hidden from non-admin
      claim_job.sql             # pgTAP: race-safe claim
    seed.sql                    # demo data
  vitest.config.ts
  tests/unit/auth.test.ts
```

---

### Task 1: Project scaffold + toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/page.tsx`, `vitest.config.ts`
- Create: `supabase/config.toml` (via CLI)

**Interfaces:**
- Produces: a running Next.js dev server; `npm test` runs Vitest; local Supabase runs via `supabase start`.

- [ ] **Step 1: Scaffold Next.js**

Run in `D:\Development\ClearViewCRM`:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-turbopack
```
Expected: project files created; `npm run dev` serves http://localhost:3000.

- [ ] **Step 2: Add Supabase + test tooling**

```bash
npm i @supabase/supabase-js @supabase/ssr
npm i -D vitest supabase
npx supabase init
```
Expected: `supabase/config.toml` created; `node_modules` has vitest.

- [ ] **Step 3: Add test script + Vitest config**

Add to `package.json` scripts: `"test": "vitest run"`, `"test:db": "supabase test db"`.
Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
```

- [ ] **Step 4: Write a smoke test**

Create `tests/unit/smoke.test.ts`:
```ts
import { test, expect } from 'vitest';
test('toolchain works', () => { expect(1 + 1).toBe(2); });
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Env shape + gitignore**

Create `.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
```
Ensure `.gitignore` contains `.env*.local`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js + Supabase + Vitest"
```

---

### Task 2: Database schema

**Files:**
- Create: `supabase/migrations/0001_schema.sql`
- Test: `supabase/tests/schema.sql`

**Interfaces:**
- Produces tables: `profiles, customers, leads, jobs, invoices, invoice_items` and enums `user_role, customer_type, lead_status, job_status, invoice_status`. Later tasks reference these exact names/columns (see ARCHITECTURE.md §3).

- [ ] **Step 1: Write failing DB test**

Create `supabase/tests/schema.sql`:
```sql
begin;
select plan(3);
select has_table('public','customers','customers table exists');
select has_table('public','jobs','jobs table exists');
select col_type_is('public','jobs','status','job_status','jobs.status is job_status enum');
select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase start && npx supabase test db`
Expected: FAIL — tables/enum do not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0001_schema.sql` with the schema from `docs/ARCHITECTURE.md` §3 (copy verbatim: the six `create table` statements, five `create type ... enum`, and the `job_photos` table). Ensure `create type job_status as enum ('unclaimed','claimed','in_progress','done');` and all FKs are present.

- [ ] **Step 4: Apply + run test**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS (3 tests). `db reset` re-applies migrations from scratch.

- [ ] **Step 5: Commit**

```bash
git add supabase/ && git commit -m "feat(db): core schema (customers, leads, jobs, invoices)"
```

---

### Task 3: RLS — Admin-only money (HARD REQUIREMENT)

**Files:**
- Create: `supabase/migrations/0002_rls.sql`
- Test: `supabase/tests/rls_money.sql`

**Interfaces:**
- Consumes: tables from Task 2.
- Produces: `auth_role()` function; `leads_public`, `jobs_public` views (no money columns); RLS enabled on all tables; `invoices`/`invoice_items` admin-only.

- [ ] **Step 1: Write failing test — rep cannot read invoices, admin can**

Create `supabase/tests/rls_money.sql` (fixtures live INSIDE the test transaction, rolled back after):
```sql
begin;
select plan(2);
-- fixtures: auth users (profiles FK → auth.users), profiles with roles, one invoice
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.dev'),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rep@test.dev');
insert into profiles(id,full_name,role) values
  ('00000000-0000-0000-0000-000000000001','Admin One','admin'),
  ('00000000-0000-0000-0000-000000000002','Rep Two','rep');
insert into customers(id,name) values (1,'Seed Co');
insert into invoices(id,customer_id,number) values (1,1,'INV-0001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
select is_empty($$ select 1 from invoices $$, 'rep sees zero invoice rows');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
select isnt_empty($$ select 1 from invoices $$, 'admin sees invoice rows');
select * from finish();
rollback;
```
*(If the `auth.users` insert errors on a missing NOT NULL column, add the required column with a sane default — the local `auth.users` shape is the source of truth.)*

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: FAIL — RLS not defined; either both see rows or the function errors.

- [ ] **Step 3: Write RLS migration**

Create `supabase/migrations/0002_rls.sql`:
```sql
-- role helper
create or replace function auth_role() returns user_role
language sql stable as $$ select role from profiles where id = auth.uid() $$;

-- NOTE: no fixtures here — the pgTAP tests create their own fixtures inside a rolled-back transaction.

alter table customers      enable row level security;
alter table leads          enable row level security;
alter table jobs           enable row level security;
alter table invoices       enable row level security;
alter table invoice_items  enable row level security;
alter table profiles       enable row level security;

-- profiles: a user reads own row; admin reads all
create policy profiles_self on profiles for select using (id = auth.uid() or auth_role() = 'admin');

-- customers: any signed-in user reads
create policy customers_read on customers for select using (auth.uid() is not null);

-- money-free views for non-admins
create view leads_public as select id, customer_id, status, service, stories, panes, note, created_at from leads;
create view jobs_public  as select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at from jobs;

-- leads/jobs: admin reads full table; everyone reads via *_public views
create policy leads_admin on leads for select using (auth_role() = 'admin');
create policy jobs_admin  on jobs  for select using (auth_role() = 'admin');
grant select on leads_public, jobs_public to authenticated;

-- invoices/items: admin only
create policy invoices_admin on invoices for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy items_admin    on invoice_items for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
```

- [ ] **Step 4: Run test**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — rep sees 0 invoices, admin sees ≥1.

- [ ] **Step 5: Commit**

```bash
git add supabase/ && git commit -m "feat(db): RLS enforces admin-only money"
```

---

### Task 4: Atomic job claim (HARD REQUIREMENT)

**Files:**
- Create: `supabase/migrations/0003_claim_job.sql`
- Test: `supabase/tests/claim_job.sql`

**Interfaces:**
- Produces: `claim_job(p_job_id bigint) returns jobs`. Clients call `supabase.rpc('claim_job',{p_job_id})`.

- [ ] **Step 1: Write failing test — second claim fails**

Create `supabase/tests/claim_job.sql`:
```sql
begin;
select plan(2);
-- fixtures inside the transaction (jobs.claimed_by FK → profiles → auth.users)
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rep@test.dev');
insert into profiles(id,full_name,role) values ('00000000-0000-0000-0000-000000000002','Rep Two','cleaner');
insert into customers(id,name) values (9,'Claim Co');
insert into jobs(id,customer_id,status) values (99,9,'unclaimed');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

select lives_ok($$ select claim_job(99) $$, 'first claim succeeds');
select throws_ok($$ select claim_job(99) $$, 'Job already claimed', 'second claim rejected');
select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: FAIL — `claim_job` does not exist.

- [ ] **Step 3: Write the function**

Create `supabase/migrations/0003_claim_job.sql` (copy from `docs/ARCHITECTURE.md` §4.2):
```sql
create or replace function claim_job(p_job_id bigint)
returns jobs language plpgsql security definer as $$
declare j jobs;
begin
  update jobs set status='claimed', claimed_by=auth.uid()
   where id=p_job_id and status='unclaimed'
  returning * into j;
  if j.id is null then raise exception 'Job already claimed'; end if;
  return j;
end $$;
```

- [ ] **Step 4: Run test**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add supabase/ && git commit -m "feat(db): race-safe claim_job()"
```

---

### Task 5: Supabase clients + auth/role helpers

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/auth.ts`
- Test: `tests/unit/auth.test.ts`

**Interfaces:**
- Produces: `createBrowserClient()`, `createServerClient()`, `getSession()`, `getRole(): Promise<'admin'|'rep'|'cleaner'|null>`.

- [ ] **Step 1: Write failing test for role mapping**

Create `tests/unit/auth.test.ts`:
```ts
import { test, expect } from 'vitest';
import { normalizeRole } from '@/lib/auth';
test('normalizeRole maps known roles', () => {
  expect(normalizeRole('admin')).toBe('admin');
  expect(normalizeRole('bogus')).toBe(null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `@/lib/auth` has no `normalizeRole`.

- [ ] **Step 3: Implement clients + helper**

Create `lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';
export const supabaseBrowser = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
```
Create `lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export const supabaseServer = () => {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: (c) => c.forEach(({name,value,options}) => store.set(name,value,options)) },
  });
};
```
Create `lib/auth.ts`:
```ts
export type Role = 'admin' | 'rep' | 'cleaner';
export function normalizeRole(r: string | null | undefined): Role | null {
  return r === 'admin' || r === 'rep' || r === 'cleaner' ? r : null;
}
import { supabaseServer } from '@/lib/supabase/server';
export async function getSession() { return (await supabaseServer().auth.getUser()).data.user; }
export async function getRole(): Promise<Role | null> {
  const u = await getSession(); if (!u) return null;
  const { data } = await supabaseServer().from('profiles').select('role').eq('id', u.id).single();
  return normalizeRole(data?.role);
}
```

- [ ] **Step 4: Run test**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib tests && git commit -m "feat(auth): supabase clients + role helpers"
```

---

### Task 6: Login page + route guard

**Files:**
- Create: `app/login/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`
- Test: `tests/unit/guard.test.ts`

**Interfaces:**
- Consumes: `getRole()` from Task 5.
- Produces: `(app)` route group that redirects to `/login` when no session; a role is available to child pages.

- [ ] **Step 1: Write failing test — guard redirect decision**

Create `tests/unit/guard.test.ts`:
```ts
import { test, expect } from 'vitest';
import { guardDecision } from '@/lib/auth';
test('no role → redirect to login', () => { expect(guardDecision(null)).toBe('/login'); });
test('has role → allow', () => { expect(guardDecision('cleaner')).toBe(null); });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `guardDecision` undefined.

- [ ] **Step 3: Add guard helper**

Append to `lib/auth.ts`:
```ts
export function guardDecision(role: Role | null): string | null { return role ? null : '/login'; }
```

- [ ] **Step 4: Build login + guarded layout**

Create `app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { getRole, guardDecision } from '@/lib/auth';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  const to = guardDecision(role);
  if (to) redirect(to);
  return <div data-role={role}>{children}</div>;
}
```
Create `app/(app)/dashboard/page.tsx`:
```tsx
export default function Dashboard() { return <main style={{padding:24}}>Dashboard — you are signed in.</main>; }
```
Create `app/login/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
export default function Login() {
  const [email,setEmail]=useState(''); const [pw,setPw]=useState(''); const [err,setErr]=useState('');
  async function signIn(e:React.FormEvent){ e.preventDefault();
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message); else location.href='/dashboard'; }
  return (<main style={{padding:24,maxWidth:320}}><h1>ClearView</h1>
    <form onSubmit={signIn}>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/>
      <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Password"/>
      <button>Sign in</button>{err && <p>{err}</p>}
    </form></main>); }
```

- [ ] **Step 5: Run tests + manual check**

Run: `npm test` → PASS. Then `npm run dev`, visit `/dashboard` while signed out → redirects to `/login`.

- [ ] **Step 6: Commit**

```bash
git add app lib tests && git commit -m "feat(auth): login page + route guard"
```

---

### Task 7: Seed data + role users

**Files:**
- Create: `supabase/seed.sql`

**Interfaces:**
- Produces: demo customers/leads/jobs/invoices and three auth users (admin/rep/cleaner) for local dev + E2E.

- [ ] **Step 1: Write seed**

Create `supabase/seed.sql` inserting: the 3 profiles' matching `auth.users` (via `supabase.auth` admin or SQL insert into `auth.users` with encrypted passwords for local), ~8 customers, matching leads (statuses), 4 jobs (one pre-claimed), 3 invoices with items — mirroring the prototype seed data.

- [ ] **Step 2: Apply + verify**

Run: `npx supabase db reset` (runs migrations + seed).
Expected: `select count(*) from customers;` returns 8.

- [ ] **Step 3: Re-run DB tests to ensure seed didn't break policies**

Run: `npx supabase test db`
Expected: all pgTAP tests PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql && git commit -m "chore(db): demo seed + role users"
```

---

## Self-Review

- **Spec coverage:** auth+roles ✅ (T5,T6), schema/entities ✅ (T2), admin-only money ✅ (T3), race-safe claim ✅ (T4), seed ✅ (T7). Map/leads/jobs UI, invoices UI, dashboard, exports, PWA → **subsequent plans** (2–6), as scoped.
- **Placeholders:** Task 2 Step 3 and Task 7 Step 1 point to verbatim sources (ARCHITECTURE.md §3, prototype seed) rather than re-pasting large SQL — acceptable since the source is in-repo; the implementer copies exact content.
- **Type consistency:** `Role`, `normalizeRole`, `getRole`, `guardDecision` names consistent across T5/T6; `claim_job(p_job_id)` name consistent T4 ↔ future job board.

---

## Prerequisites (human, before Task 1)
- Install Node ≥20 and Docker Desktop (Supabase local needs Docker).
- No cloud accounts required for this plan (all local). Cloud Supabase + Mapbox token needed starting Plan 3 (map).
