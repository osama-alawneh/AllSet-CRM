# Plan 8 — Data Model & CRUD Foundations (description · updated_at · create/update/delete RPCs · drawer-tab bug) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give leads and jobs a `description`, give every core table `updated_at`, add role-gated create/update/delete RPCs for leads and jobs, and fix the customer-drawer tab bug — the DB + actions layer that Plan 9's drawer UX builds on.

**Architecture:** One migration (0013) adds columns, touch-triggers, view columns, and six SECURITY DEFINER RPCs following the exact `set_lead_status`/`set_job_status` precedent (NULL-safe `coalesce(auth_role() in (…), false)` checks, pinned `search_path`, raise on 0 rows). Pure parse/build helpers in `lib/` are extended TDD-style; Server Actions wrap the RPCs. UI consumption is deliberately deferred to Plan 9.

**Tech Stack:** Supabase migrations + pgTAP, Next.js 16 Server Actions, Vitest.

**Branch:** `feat/crud-data` (from `main` after Plan 7 merges; merge to `main` when green).

## Global Constraints

- Next.js is **v16** (async `cookies()`); read `node_modules/next/dist/docs/` before non-trivial Next code.
- **Money stays structurally admin-only**: `quote_value`/`price` never reach non-admins. `create_lead`/`update_lead` ignore the quote argument for reps; job RPCs are admin-only outright.
- **Status is NOT writable via these RPCs** — status transitions stay exclusively in `set_lead_status`/`set_job_status`/`claim_job` (they carry the won→job trigger and claim-race semantics).
- **Decision (2026-07-06): deletes are admin-only** (leads, jobs). UI confirmation happens in Plan 9.
- `create or replace view` may only APPEND columns — keep existing column order in `leads_public`/`jobs_public` and add new ones at the end.
- New columns on RLS tables need no new grants (table-level `select`/`insert`/`update` grants already exist and are column-inclusive); new FUNCTIONS need `grant execute … to authenticated`.
- pgTAP fixtures: ids `900000+`, uuids `90000000-…`, emails `t-*@test.dev`. Existing suites must stay green: pgTAP 51/51 grows, unit 84/84 grows.
- Verification commands: `npx supabase db reset`, `npx supabase test db`, `npm test`, `npm run lint`, `npm run build`.

---

### Task 1: Migration 0013 + pgTAP

**Files:**
- Create: `supabase/migrations/0013_crud_columns_rpcs.sql`
- Test: `supabase/tests/crud_rpcs.sql`

**Interfaces:**
- Produces (DB): `leads.description text`, `jobs.description text`, `updated_at timestamptz` on customers/leads/jobs/invoices (touch-triggered), `leads_public` + `description, updated_at`, `jobs_public` + `description, updated_at`, and RPCs:
  - `create_lead(p_customer_id bigint, p_service text, p_description text, p_stories int, p_panes int, p_note text, p_quote numeric default null) returns bigint` — admin+rep; quote applied only for admin (else 0).
  - `update_lead(p_lead_id bigint, p_service text, p_description text, p_stories int, p_panes int, p_note text, p_quote numeric default null) returns void` — admin+rep; quote changed only when admin AND p_quote not null.
  - `delete_lead(p_lead_id bigint) returns void` — admin only.
  - `create_job(p_customer_id bigint, p_service text, p_description text, p_scheduled_date date, p_price numeric default null) returns bigint` — admin only; status `'unclaimed'`.
  - `update_job(p_job_id bigint, p_service text, p_description text, p_scheduled_date date, p_price numeric default null) returns void` — admin only.
  - `delete_job(p_job_id bigint) returns void` — admin only.

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/crud_rpcs.sql
begin;
select plan(26);

-- fixtures --------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-c@test.dev'),
  ('90000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-c@test.dev'),
  ('90000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-c@test.dev'),
  ('90000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-roleless-c@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000030','Admin Crud','admin'),
  ('90000000-0000-0000-0000-000000000031','Rep Crud','rep'),
  ('90000000-0000-0000-0000-000000000032','Cleaner Crud','cleaner');
insert into customers(id,name) overriding system value values (900031,'Crud Co');

-- (superuser) schema ----------------------------------------------------------
select has_column('leads','description','leads.description exists');
select has_column('jobs','description','jobs.description exists');
select has_column('leads','updated_at','leads.updated_at exists');
select has_column('jobs','updated_at','jobs.updated_at exists');
select has_column('customers','updated_at','customers.updated_at exists');
select has_column('invoices','updated_at','invoices.updated_at exists');

-- touch trigger: updated_at moves past created_at on update (trigger uses clock_timestamp()
-- precisely so this is observable inside one transaction — now() is txn-frozen).
insert into leads(id,customer_id,status,service) overriding system value values (900031,900031,'new','Touch me');
update leads set service='Touched' where id=900031;
select ok((select updated_at > created_at from leads where id=900031), 'updated_at bumps on update');

-- won->job trigger copies description
insert into leads(id,customer_id,status,service,description) overriding system value
  values (900032,900031,'won','Full clean','Front 12 panes, ladder needed');
select is((select description from jobs where lead_id=900032), 'Front 12 panes, ladder needed',
          'won trigger copies description to the job');

-- (as rep) ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}';
select lives_ok($$ select create_lead(900031,'Rep lead','desc',2,10,'note',999) $$, 'rep create_lead runs');
select is((select service from leads_public where customer_id=900031 and service='Rep lead'), 'Rep lead',
          'rep-created lead visible via leads_public');
select lives_ok($$ select update_lead((select id from leads_public where service='Rep lead'),
  'Rep lead v2','desc2',3,12,'note2',777) $$, 'rep update_lead runs');
select throws_ok($$ select delete_lead(900031) $$, 'P0001', 'Not authorized to delete leads', 'rep cannot delete leads');
select throws_ok($$ select create_job(900031,'Job','d',null,50) $$, 'P0001', 'Not authorized to create jobs', 'rep cannot create jobs');
select throws_ok($$ select update_job(1,'x','d',null,50) $$, 'P0001', 'Not authorized to update jobs', 'rep cannot update jobs');
select throws_ok($$ select delete_job(1) $$, 'P0001', 'Not authorized to delete jobs', 'rep cannot delete jobs');

-- (as cleaner) -----------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000032"}';
select throws_ok($$ select create_lead(900031,'x','d',1,1,'n',null) $$, 'P0001', 'Not authorized to create leads', 'cleaner cannot create leads');

-- (roleless) ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000033"}';
select throws_ok($$ select create_lead(900031,'x','d',1,1,'n',null) $$, 'P0001', 'Not authorized to create leads', 'roleless cannot create leads (NULL-safe)');

-- (as admin) ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000030"}';
select lives_ok($$ select create_lead(900031,'Admin lead','d',1,4,'n',500) $$, 'admin create_lead runs');
select is((select quote_value from leads where service='Admin lead'), 500::numeric, 'admin quote applied');
select is((select quote_value from leads where service='Rep lead v2'), 0::numeric,
          'rep quote arguments were ignored on create AND update (money admin-only)');
select lives_ok($$ select update_lead((select id from leads where service='Admin lead'),
  'Admin lead','d',1,4,'n',650) $$, 'admin update_lead runs');
select is((select quote_value from leads where service='Admin lead'), 650::numeric, 'admin quote update applied');
select lives_ok($$ select create_job(900031,'Manual job','wash all', current_date, 240) $$, 'admin create_job runs');
select is((select price from jobs where service='Manual job'), 240::numeric, 'admin job price applied');
select lives_ok($$ select update_job((select id from jobs where service='Manual job'),
  'Manual job v2','wash all v2', current_date + 1, 260) $$, 'admin update_job runs');
select lives_ok($$ select delete_job((select id from jobs where service='Manual job v2')) $$, 'admin delete_job runs');
select is((select count(*)::int from jobs where service='Manual job v2'), 0, 'job deleted');
-- delete_lead: the won lead 900032 has a job; FK is on delete set null, so the job survives
select lives_ok($$ select delete_lead(900032) $$, 'admin delete_lead runs');
select is((select count(*)::int from jobs where description='Front 12 panes, ladder needed' and lead_id is null), 1,
          'deleting a won lead orphans (not deletes) its job — lead_id set null');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify failure**

Run: `npx supabase test db`
Expected: `crud_rpcs.sql` FAILS (missing columns/functions); the seven existing files stay green.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0013_crud_columns_rpcs.sql
-- MVP 1.5: description on leads+jobs (item 14), updated_at everywhere (item 7),
-- create/update/delete RPCs for leads+jobs (item 3).

-- 1) description. The cleaner works from the JOB, so description must flow lead -> job
--    (won trigger below copies it).
alter table leads add column description text;
alter table jobs  add column description text;

-- 2) updated_at + touch triggers. clock_timestamp() (not now()) so successive writes in
--    one transaction still produce increasing values — also what makes it testable in pgTAP.
alter table customers add column updated_at timestamptz not null default now();
alter table leads     add column updated_at timestamptz not null default now();
alter table jobs      add column updated_at timestamptz not null default now();
alter table invoices  add column updated_at timestamptz not null default now();

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end $$;

create trigger customers_touch before update on customers for each row execute function set_updated_at();
create trigger leads_touch     before update on leads     for each row execute function set_updated_at();
create trigger jobs_touch      before update on jobs      for each row execute function set_updated_at();
create trigger invoices_touch  before update on invoices  for each row execute function set_updated_at();

-- 3) money-free views: append the new columns (create or replace view may only APPEND;
--    existing column order preserved exactly).
create or replace view leads_public as
  select id, customer_id, status, service, stories, panes, note, created_at, description, updated_at
  from leads;
create or replace view jobs_public as
  select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at, description, updated_at
  from jobs;

-- 4) won->job trigger now copies description (full replacement of 0006's function; the
--    trigger itself is unchanged and keeps firing this name).
create or replace function create_job_for_won_lead() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.jobs (customer_id, lead_id, status, service, description)
  values (new.customer_id, new.id, 'unclaimed', new.service, new.description)
  on conflict (lead_id) where lead_id is not null do nothing;
  return new;
end $$;

-- 5) CRUD RPCs. SECURITY DEFINER + pinned search_path + NULL-safe role checks, exactly
--    like set_lead_status (0007) / set_job_status (0010). Status is deliberately NOT a
--    parameter anywhere here — transitions stay in set_lead_status/set_job_status/claim_job.

create or replace function create_lead(
  p_customer_id bigint, p_service text, p_description text,
  p_stories int, p_panes int, p_note text, p_quote numeric default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean := coalesce(public.auth_role() = 'admin', false);
  v_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to create leads';
  end if;
  -- money admin-only: a rep's p_quote is ignored, never stored
  insert into public.leads (customer_id, service, description, stories, panes, note, quote_value, status, created_by)
  values (p_customer_id, p_service, p_description, p_stories, p_panes, p_note,
          case when v_admin then coalesce(p_quote, 0) else 0 end, 'new', auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function update_lead(
  p_lead_id bigint, p_service text, p_description text,
  p_stories int, p_panes int, p_note text, p_quote numeric default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean := coalesce(public.auth_role() = 'admin', false);
  updated int;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to update leads';
  end if;
  update public.leads
     set service = p_service, description = p_description, stories = p_stories,
         panes = p_panes, note = p_note,
         quote_value = case when v_admin and p_quote is not null then p_quote else quote_value end
   where id = p_lead_id;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Lead % not found', p_lead_id; end if;
end $$;

create or replace function delete_lead(p_lead_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare deleted int;
begin
  if coalesce(public.auth_role() = 'admin', false) is not true then
    raise exception 'Not authorized to delete leads';
  end if;
  delete from public.leads where id = p_lead_id;  -- jobs.lead_id is ON DELETE SET NULL: jobs survive
  get diagnostics deleted = row_count;
  if deleted = 0 then raise exception 'Lead % not found', p_lead_id; end if;
end $$;

create or replace function create_job(
  p_customer_id bigint, p_service text, p_description text,
  p_scheduled_date date, p_price numeric default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if coalesce(public.auth_role() = 'admin', false) is not true then
    raise exception 'Not authorized to create jobs';
  end if;
  insert into public.jobs (customer_id, service, description, scheduled_date, price, status)
  values (p_customer_id, p_service, p_description, p_scheduled_date, coalesce(p_price, 0), 'unclaimed')
  returning id into v_id;
  return v_id;
end $$;

create or replace function update_job(
  p_job_id bigint, p_service text, p_description text,
  p_scheduled_date date, p_price numeric default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare updated int;
begin
  if coalesce(public.auth_role() = 'admin', false) is not true then
    raise exception 'Not authorized to update jobs';
  end if;
  update public.jobs
     set service = p_service, description = p_description,
         scheduled_date = p_scheduled_date,
         price = coalesce(p_price, price)
   where id = p_job_id;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Job % not found', p_job_id; end if;
end $$;

create or replace function delete_job(p_job_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare deleted int;
begin
  if coalesce(public.auth_role() = 'admin', false) is not true then
    raise exception 'Not authorized to delete jobs';
  end if;
  delete from public.jobs where id = p_job_id;  -- invoices.job_id is ON DELETE SET NULL: invoices survive
  get diagnostics deleted = row_count;
  if deleted = 0 then raise exception 'Job % not found', p_job_id; end if;
end $$;

grant execute on function create_lead(bigint, text, text, int, int, text, numeric) to authenticated;
grant execute on function update_lead(bigint, text, text, int, int, text, numeric) to authenticated;
grant execute on function delete_lead(bigint) to authenticated;
grant execute on function create_job(bigint, text, text, date, numeric) to authenticated;
grant execute on function update_job(bigint, text, text, date, numeric) to authenticated;
grant execute on function delete_job(bigint) to authenticated;
```

- [ ] **Step 4: Apply + run to verify pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: all files pass, including `crud_rpcs.sql` (26). If an assertion count mismatches, fix `plan(n)` to the real count — never delete assertions to make it fit.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_crud_columns_rpcs.sql supabase/tests/crud_rpcs.sql
git commit -m "feat(db): description + updated_at + lead/job CRUD RPCs (0013, pgTAP)"
```

---

### Task 2: Fix the customer-drawer tab bug (MVP item 9)

**Root cause (verified):** `components/ui/Tabs.tsx` buttons have no `type` attribute → inside `CustomerDrawer`'s `<form>` they default to `type="submit"` → clicking the Invoices/Leads tab submits the form, `saveCustomer` succeeds, and the success path calls `close()`. Additionally the tab mini-rows are inert (`onClick` missing), which is the "clicking the job does nothing" half.

**Files:**
- Modify: `components/ui/Tabs.tsx:10` (add `type="button"`)
- Modify: `components/customers/CustomerDrawer.tsx` (mini-rows navigate to the entity's own drawer)

**Interfaces:**
- Consumes: existing `router` already in `CustomerDrawer`.
- Produces: nothing new — behavior fix only.

- [ ] **Step 1: Tabs must never submit an enclosing form**

```tsx
// components/ui/Tabs.tsx — the button line becomes:
          <button key={t.key} type="button" className={t.key === on ? 'on' : ''} onClick={() => setOn(t.key)}>
```

- [ ] **Step 2: Make tab rows navigate**

In `CustomerDrawer.tsx`, add `onClick` to each tab's `.minirow` (jobs → jobs drawer, invoices → invoice drawer, leads → lead drawer):

```tsx
// jobs tab row:
          <div className="minirow" key={j.id} onClick={() => router.push(`/jobs?j=${j.id}`, { scroll: false })}>
// invoices tab row:
              <div className="minirow" key={i.id} onClick={() => router.push(`/invoices?i=${i.id}`, { scroll: false })}>
// leads tab row:
          <div className="minirow" key={l.id} onClick={() => router.push(`/leads?l=${l.id}`, { scroll: false })}>
```

(Cross-page deep links are already role-guarded on the target pages: a cleaner clicking a foreign job simply gets no drawer, `/leads` redirects cleaners, `/invoices` redirects non-admins.)

- [ ] **Step 3: Verify live**

`npm run lint && npm run build` clean. In the browser as admin: open a customer with jobs+invoices+leads → click every tab — **the drawer must stay open**; click a job row → jobs page opens with that job's drawer; same for invoice and lead rows.

- [ ] **Step 4: Commit**

```bash
git add components/ui/Tabs.tsx components/customers/CustomerDrawer.tsx
git commit -m "fix(drawer): tab buttons no longer submit the customer form; tab rows deep-link"
```

---

### Task 3: Pure helpers — types, builders, parsers, CSV (TDD)

**Files:**
- Modify: `lib/leads.ts` (extend `Lead`/`LeadPublicRow` + `buildLeads`; add `parseLeadForm`)
- Modify: `lib/jobs.ts` (extend `Job`/`JobRow` + `buildJobs`; add `parseJobForm`)
- Modify: `lib/csv.ts` (`leadsCsvTable`/`jobsCsvTable` gain a `Description` column after `Service`)
- Test: `tests/unit/leads.test.ts`, `tests/unit/jobs.test.ts`, `tests/unit/csv.test.ts` (extend existing), create `tests/unit/lead-form.test.ts`, `tests/unit/job-form.test.ts`

**Interfaces:**
- Produces:
  - `Lead` gains `description: string | null; created_at: string; updated_at: string` (`LeadPublicRow` likewise; `buildLeads` copies them through).
  - `Job` gains `description: string | null; created_at: string; updated_at: string` (`JobRow` likewise; `buildJobs` copies them through).
  - `parseLeadForm(fd: FormData): { ok: true; value: LeadInput } | { ok: false; error: string }` with `type LeadInput = { customer_id: number; service: string; description: string | null; stories: number | null; panes: number | null; note: string | null; quote: number | null }`.
  - `parseJobForm(fd: FormData): { ok: true; value: JobInput } | { ok: false; error: string }` with `type JobInput = { customer_id: number; service: string; description: string | null; scheduled_date: string | null; price: number | null }`.
- Consumed by: Task 4 actions; Plan 9 drawers; Plan 10 list views.

- [ ] **Step 1: Write failing parser tests**

```ts
// tests/unit/lead-form.test.ts
import { describe, expect, it } from 'vitest';
import { parseLeadForm } from '@/lib/leads';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('parseLeadForm', () => {
  it('parses a full form', () => {
    const r = parseLeadForm(fd({
      customer_id: '7', service: 'In + out', description: 'Back panes fragile',
      stories: '2', panes: '14', note: 'gate code 1234', quote: '350',
    }));
    expect(r).toEqual({ ok: true, value: {
      customer_id: 7, service: 'In + out', description: 'Back panes fragile',
      stories: 2, panes: 14, note: 'gate code 1234', quote: 350,
    }});
  });
  it('empty optionals become null', () => {
    const r = parseLeadForm(fd({ customer_id: '7', service: 'Solo', description: '', stories: '', panes: '', note: '', quote: '' }));
    expect(r).toEqual({ ok: true, value: {
      customer_id: 7, service: 'Solo', description: null, stories: null, panes: null, note: null, quote: null,
    }});
  });
  it('requires a customer', () => {
    expect(parseLeadForm(fd({ customer_id: '', service: 'x' }))).toEqual({ ok: false, error: 'Customer is required' });
  });
  it('requires a service', () => {
    expect(parseLeadForm(fd({ customer_id: '7', service: '  ' }))).toEqual({ ok: false, error: 'Service is required' });
  });
  it('rejects negative numbers', () => {
    expect(parseLeadForm(fd({ customer_id: '7', service: 'x', quote: '-5' }))).toEqual({ ok: false, error: 'Numbers cannot be negative' });
    expect(parseLeadForm(fd({ customer_id: '7', service: 'x', stories: '-1' }))).toEqual({ ok: false, error: 'Numbers cannot be negative' });
  });
});
```

```ts
// tests/unit/job-form.test.ts
import { describe, expect, it } from 'vitest';
import { parseJobForm } from '@/lib/jobs';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('parseJobForm', () => {
  it('parses a full form', () => {
    expect(parseJobForm(fd({
      customer_id: '3', service: 'Full house', description: '22 panes', scheduled_date: '2026-07-10', price: '240',
    }))).toEqual({ ok: true, value: {
      customer_id: 3, service: 'Full house', description: '22 panes', scheduled_date: '2026-07-10', price: 240,
    }});
  });
  it('empty optionals become null', () => {
    expect(parseJobForm(fd({ customer_id: '3', service: 'S', description: '', scheduled_date: '', price: '' })))
      .toEqual({ ok: true, value: { customer_id: 3, service: 'S', description: null, scheduled_date: null, price: null } });
  });
  it('requires customer and service', () => {
    expect(parseJobForm(fd({ customer_id: '0', service: 'x' }))).toEqual({ ok: false, error: 'Customer is required' });
    expect(parseJobForm(fd({ customer_id: '3', service: '' }))).toEqual({ ok: false, error: 'Service is required' });
  });
  it('rejects a malformed date and negative price', () => {
    expect(parseJobForm(fd({ customer_id: '3', service: 'x', scheduled_date: '10/07/2026' }))).toEqual({ ok: false, error: 'Date must be YYYY-MM-DD' });
    expect(parseJobForm(fd({ customer_id: '3', service: 'x', price: '-1' }))).toEqual({ ok: false, error: 'Numbers cannot be negative' });
  });
});
```

Run: `npx vitest run tests/unit/lead-form.test.ts tests/unit/job-form.test.ts` → FAIL (functions missing).

- [ ] **Step 2: Implement the parsers**

Append to `lib/leads.ts`:

```ts
export type LeadInput = {
  customer_id: number; service: string; description: string | null;
  stories: number | null; panes: number | null; note: string | null; quote: number | null;
};

// Shared field readers: '' -> null; anything non-numeric -> error via NaN checks below.
const optText = (fd: FormData, k: string): string | null => {
  const v = String(fd.get(k) ?? '').trim();
  return v || null;
};
const optNum = (fd: FormData, k: string): number | null => {
  const v = String(fd.get(k) ?? '').trim();
  return v === '' ? null : Number(v);
};

export function parseLeadForm(
  fd: FormData
): { ok: true; value: LeadInput } | { ok: false; error: string } {
  const customer_id = Number(fd.get('customer_id'));
  if (!Number.isFinite(customer_id) || customer_id <= 0) return { ok: false, error: 'Customer is required' };
  const service = String(fd.get('service') ?? '').trim();
  if (!service) return { ok: false, error: 'Service is required' };
  const stories = optNum(fd, 'stories');
  const panes = optNum(fd, 'panes');
  const quote = optNum(fd, 'quote');
  for (const n of [stories, panes, quote]) {
    if (n !== null && !Number.isFinite(n)) return { ok: false, error: 'Invalid number' };
    if (n !== null && n < 0) return { ok: false, error: 'Numbers cannot be negative' };
  }
  return {
    ok: true,
    value: {
      customer_id, service,
      description: optText(fd, 'description'),
      stories: stories === null ? null : Math.trunc(stories),
      panes: panes === null ? null : Math.trunc(panes),
      note: optText(fd, 'note'),
      quote,
    },
  };
}
```

Append to `lib/jobs.ts` (duplicate the tiny opt helpers locally — the two files have no shared module today and two 3-line helpers don't justify one):

```ts
export type JobInput = {
  customer_id: number; service: string; description: string | null;
  scheduled_date: string | null; price: number | null;
};

export function parseJobForm(
  fd: FormData
): { ok: true; value: JobInput } | { ok: false; error: string } {
  const customer_id = Number(fd.get('customer_id'));
  if (!Number.isFinite(customer_id) || customer_id <= 0) return { ok: false, error: 'Customer is required' };
  const service = String(fd.get('service') ?? '').trim();
  if (!service) return { ok: false, error: 'Service is required' };
  const description = String(fd.get('description') ?? '').trim() || null;
  const dateRaw = String(fd.get('scheduled_date') ?? '').trim();
  if (dateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return { ok: false, error: 'Date must be YYYY-MM-DD' };
  const priceRaw = String(fd.get('price') ?? '').trim();
  const price = priceRaw === '' ? null : Number(priceRaw);
  if (price !== null && !Number.isFinite(price)) return { ok: false, error: 'Invalid number' };
  if (price !== null && price < 0) return { ok: false, error: 'Numbers cannot be negative' };
  return { ok: true, value: { customer_id, service, description, scheduled_date: dateRaw || null, price } };
}
```

- [ ] **Step 3: Extend the row types + builders**

In `lib/leads.ts`: add to BOTH `Lead` and `LeadPublicRow`:

```ts
  description: string | null;
  created_at: string;
  updated_at: string;
```

and in `buildLeads`'s returned object add:

```ts
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
```

In `lib/jobs.ts`: same three fields on `Job` and `JobRow`, same three pass-through lines in `buildJobs`.

In `lib/csv.ts`: insert `'Description'` into the headers after `'Service'` and the matching cell (`l.description` / `j.description`) in both `leadsCsvTable` and `jobsCsvTable`.

- [ ] **Step 4: Update the existing test fixtures and run everything**

`tests/unit/leads.test.ts`, `tests/unit/jobs.test.ts`, `tests/unit/csv.test.ts` construct `Lead`/`Job`/row literals — add the three new fields to each fixture (`description: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z'` or similar) and extend the CSV header expectations with `'Description'`.

Run: `npm test` → all suites pass (old + new).

- [ ] **Step 5: Commit**

```bash
git add lib/leads.ts lib/jobs.ts lib/csv.ts tests/unit
git commit -m "feat(lib): lead/job description+timestamps in types, parseLeadForm/parseJobForm, CSV columns (TDD)"
```

---

### Task 4: Server Actions + page fetches

**Files:**
- Modify: `app/(app)/leads/actions.ts` (add `createLead`, `updateLead`, `deleteLead`)
- Modify: `app/(app)/jobs/actions.ts` (add `createJob`, `updateJob`, `deleteJob`)
- Modify: `app/(app)/leads/page.tsx:21` (select the new view columns)
- Modify: `app/(app)/jobs/page.tsx:29,45` (select the new columns, both role branches)

**Interfaces:**
- Consumes: Task 1 RPCs, Task 3 parsers.
- Produces (Plan 9 calls these):
  - `createLead(fd: FormData): Promise<{ error?: string }>` — redirects to `/leads?l=<id>` on success.
  - `updateLead(id: number, fd: FormData): Promise<{ error?: string }>`
  - `deleteLead(id: number): Promise<{ error?: string }>`
  - `createJob(fd: FormData): Promise<{ error?: string }>` — redirects to `/jobs?j=<id>` on success.
  - `updateJob(id: number, fd: FormData): Promise<{ error?: string }>`
  - `deleteJob(id: number): Promise<{ error?: string }>`

- [ ] **Step 1: Append to `app/(app)/leads/actions.ts`**

```ts
import { redirect } from 'next/navigation';
import { parseLeadForm } from '@/lib/leads';

// All three route through the SECURITY DEFINER CRUD RPCs (0013): reps cannot touch the
// base leads table directly (money columns), and the RPCs are where role rules live.
export async function createLead(fd: FormData): Promise<{ error?: string }> {
  const parsed = parseLeadForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('create_lead', {
    p_customer_id: v.customer_id, p_service: v.service, p_description: v.description,
    p_stories: v.stories, p_panes: v.panes, p_note: v.note, p_quote: v.quote,
  });
  if (error) return { error: error.message };
  revalidatePath('/leads'); revalidatePath('/map'); revalidatePath('/customers'); revalidatePath('/dashboard');
  redirect(`/leads?l=${data}`); // redirect() throws — do not wrap in try/catch
}

export async function updateLead(id: number, fd: FormData): Promise<{ error?: string }> {
  const parsed = parseLeadForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { error } = await sb.rpc('update_lead', {
    p_lead_id: id, p_service: v.service, p_description: v.description,
    p_stories: v.stories, p_panes: v.panes, p_note: v.note, p_quote: v.quote,
  });
  if (error) return { error: error.message };
  revalidatePath('/leads'); revalidatePath('/map'); revalidatePath('/customers'); revalidatePath('/dashboard');
  return {};
}

export async function deleteLead(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('delete_lead', { p_lead_id: id });
  if (error) return { error: error.message };
  revalidatePath('/leads'); revalidatePath('/map'); revalidatePath('/customers'); revalidatePath('/dashboard');
  return {};
}
```

(Note: `updateLead`'s parser requires `customer_id` — the edit form includes it as a hidden field with the lead's current customer; the RPC does not change customers. Plan 9 wires that.)

- [ ] **Step 2: Append to `app/(app)/jobs/actions.ts`**

```ts
import { redirect } from 'next/navigation';
import { parseJobForm } from '@/lib/jobs';

export async function createJob(fd: FormData): Promise<{ error?: string }> {
  const parsed = parseJobForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('create_job', {
    p_customer_id: v.customer_id, p_service: v.service, p_description: v.description,
    p_scheduled_date: v.scheduled_date, p_price: v.price,
  });
  if (error) return { error: error.message };
  revalidatePath('/jobs'); revalidatePath('/dashboard'); revalidatePath('/customers');
  redirect(`/jobs?j=${data}`);
}

export async function updateJob(id: number, fd: FormData): Promise<{ error?: string }> {
  const parsed = parseJobForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { error } = await sb.rpc('update_job', {
    p_job_id: id, p_service: v.service, p_description: v.description,
    p_scheduled_date: v.scheduled_date, p_price: v.price,
  });
  if (error) return { error: error.message };
  revalidatePath('/jobs'); revalidatePath('/dashboard'); revalidatePath('/customers');
  return {};
}

export async function deleteJob(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('delete_job', { p_job_id: id });
  if (error) return { error: error.message };
  revalidatePath('/jobs'); revalidatePath('/dashboard'); revalidatePath('/customers'); revalidatePath('/invoices');
  return {};
}
```

- [ ] **Step 3: Widen the page selects**

`app/(app)/leads/page.tsx` — the `leads_public` select becomes:

```ts
    .select('id,customer_id,status,service,stories,panes,note,description,created_at,updated_at')
```

`app/(app)/jobs/page.tsx` — admin branch (base `jobs`):

```ts
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,price')
```

and add `description: r.description, created_at: r.created_at, updated_at: r.updated_at` to the admin branch's row-mapping object; non-admin branch (`jobs_public`):

```ts
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at')
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint && npm run build` → clean.
Live smoke: `/leads` and `/jobs` render exactly as before for all three roles (data-only change; the new fields ride along unused until Plan 9).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/leads/actions.ts" "app/(app)/jobs/actions.ts" "app/(app)/leads/page.tsx" "app/(app)/jobs/page.tsx"
git commit -m "feat(actions): lead/job create/update/delete via 0013 RPCs; pages fetch new columns"
```

---

### Task 5: Final review & merge

- [ ] Full battery: `npx supabase db reset && npx supabase test db && npm test && npm run lint && npm run build` — all green.
- [ ] Live spot-check (admin): customer drawer tabs stay open and rows deep-link (Task 2); leads/jobs boards unchanged visually.
- [ ] Whole-branch review (superpowers:requesting-code-review); fix findings.
- [ ] Merge `feat/crud-data` → `main`; update `docs/superpowers/AUTONOMOUS_RUN.md` Phase-1.5 status.

## Self-Review Notes

- Spec coverage: item 3 (create/delete backing) → Tasks 1+4; item 7 (timestamps) → Task 1; item 9 (tab bug) → Task 2; item 14 (description column + lead→job flow) → Tasks 1+3.
- Type consistency: `LeadInput.quote` maps to RPC arg `p_quote`; `JobInput.price` → `p_price`; parser field names match the form `name=` attributes Plan 9 uses (`service`, `description`, `stories`, `panes`, `note`, `quote`, `scheduled_date`, `price`, `customer_id`).
- `update_job` uses `coalesce(p_price, price)` (a null price argument keeps the old price) while `create_job` defaults null→0 — deliberate: edit forms send null when the admin leaves the field blank.
- Realtime: `update_job`/`delete_job` on `jobs` fire the 0011 broadcast trigger on update/insert only; deletes don't ping — acceptable (list refreshes on navigation/revalidate), recorded in backlog.
