# Plan 3 — Leads Pipeline + Map / Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Leads pipeline (4-column drag-to-restatus Kanban, won auto-creates an unclaimed job), the lead detail drawer (deep-linked `?l=<id>` on `/leads` and `/map`, role-aware quote), and the neighborhood Map (real lat/lng pins colored by lead status; admin/rep click empty space to create customer+lead+pin) — all backed by local Supabase with RLS, working fully with NO Mapbox token via a schematic fallback map.

**Architecture:** Server components fetch via `supabaseServer()` per route (no client store); mutations are Server Actions calling `revalidatePath`. The lead drawer is driven by the `?l=<id>` search param on both `/leads` and `/map`. The Kanban is a client `KanbanBoard` (page stays a server component) using `@dnd-kit/core` for cross-column status changes with React 19 `useOptimistic` (snap-back on action error). The Map renders one of two interchangeable client implementations chosen at runtime by `pickMapImpl(token)`: a pure-CSS `SchematicMap` (default — the prototype grid/streets/blocks with `%`-positioned pins via `project()`) or a `MapboxMap` (dynamically imported, `ssr:false`, only when a token exists). Won→job and the map's create-pin flow are enforced in the DB (a trigger + a security-definer RPC), never in the client.

**Tech Stack:** Next.js 16 (App Router, async `searchParams`), React 19 (`useOptimistic`, `useTransition`), `@dnd-kit/core`, Tailwind v4, Supabase (`@supabase/ssr`), `mapbox-gl` (optional), Vitest (node env), pgTAP.

## Global Constraints

- **This is NOT the Next.js you know (Next 16).** `searchParams` page prop is a `Promise` (`await searchParams`); `cookies()` is async. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed `AGENTS.md`.
- **`ssr:false` dynamic import requires a Client Component parent.** `MapboxMap` is loaded via `next/dynamic(..., { ssr:false })` inside `MapView` (a `'use client'` component). The map page (server) never imports `mapbox-gl` directly.
- **Any client component using `useSearchParams` must sit under `<Suspense>`.** We avoid it entirely: read `searchParams` in the server page and pass values down.
- **New table write access needs BOTH an RLS policy AND a `grant` to `authenticated`** (local Supabase does not auto-grant). Identity-column inserts additionally need sequence usage (already granted in 0005).
- **pgTAP fixtures** use id range `900000+`, uuids `90000000-…`, emails `t-*@test.dev` (avoid seed collisions). Tests live in `supabase/tests/*.sql`, run with `npx supabase test db`.
- **Design source of truth:** `docs/design/clearview-proto.html`. Mirror its markup/classes/tokens. Status colors: won=green, lost=red, follow=amber, new=grey. Mono font, graph-paper background, offset `4px 4px 0` shadows, 1.5px ink borders, cyan accent in dark mode. The map/kanban/lead CSS (`.map`, `.mpin`, `.pop`, `.statuspick`, `.legend`, `.kanban`, `.col`, `.card2`, `.drawer`, `.kv`, `.qa`, `.acts`, `.money-hidden`) already exists in `app/globals.css` from Plan 2 — reuse verbatim.
- **Roles:** `admin | rep | cleaner` (`lib/auth.ts` exports `Role`, `getRole()`). `/leads` is admin+rep only (route guard). On `/map` all three roles view; only admin+rep may create pins; cleaner's lead drawer is read-only. Money (`quote_value`) is admin-only: never place it in client props for non-admins — split by role server-side, show `•••••` otherwise. Non-admins read `leads_public`/`jobs_public` views, never `leads`/`jobs` base tables.
- **`NEXT_PUBLIC_MAPBOX_TOKEN` is EMPTY in `.env.local`.** The Map must work fully via `SchematicMap`. **No test may require the token.** `MapboxMap` correctness is verified by build + code review only (live Mapbox testing is impossible without a token — it is stubbed).
- **Vitest runs in the `node` environment** (`vitest.config.ts`), so there is no DOM. Unit tests cover pure functions only; the schematic-vs-mapbox branch is tested through the pure `pickMapImpl(token)` helper, never a render test.
- Commands run from repo root `D:\Development\ClearViewCRM`. Unit tests: `npm test`. pgTAP: `npx supabase test db`. Dev DB must be up: `npx supabase start` (Docker already running). Apply migrations+seed with `npx supabase db reset`.
- Commit after every task with a conventional message. Branch: `feat/leads-map`.

---

### Task 1: Lead writes, won→job trigger, pin RPC (DB migration + seed rework + pgTAP)

Admin+Rep may create/edit leads. A `won` lead auto-creates one unclaimed job (idempotently). A security-definer RPC atomically creates a customer+lead from a map pin. The seed's explicit job rows for won leads must be removed (they would collide with the new trigger) and re-derived as UPDATEs.

**Files:**
- Create: `supabase/migrations/0006_lead_writes.sql`
- Modify: `supabase/seed.sql:51-62` (replace explicit jobs insert with trigger-driven UPDATEs; make invoice `job_id` lookups lead-based)
- Test: `supabase/tests/leads_map.sql`

**Interfaces:**
- Consumes: `auth_role()` (0002), `leads`/`jobs`/`customers` tables (0001), `lead_status` enum (`'new' | 'follow' | 'won' | 'lost'`).
- Produces:
  - `leads` gains `insert`/`update` for `auth_role() in ('admin','rep')` + grants → later `setLeadStatus` uses plain `.update({status})`.
  - Partial unique index `jobs_lead_unique on jobs(lead_id) where lead_id is not null`.
  - Trigger `leads_won_creates_job` → security-definer `create_job_for_won_lead()`.
  - RPC `create_lead_from_pin(p_name text, p_address text, p_lat float8, p_lng float8, p_status lead_status) returns bigint` (later called by the pin action).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/leads_map.sql`:

```sql
begin;
select plan(10);

-- fixtures
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-l@test.dev'),
  ('90000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-l@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000021','Rep Lead','rep'),
  ('90000000-0000-0000-0000-000000000022','Cleaner Lead','cleaner');
insert into customers(id,name) overriding system value values (900021,'Lead Co');

-- (superuser context: trigger fires, RLS bypassed) --------------------------
-- 1. direct won insert creates exactly one job
insert into leads(id,customer_id,status,service) overriding system value values (900021,900021,'won','In + out');
select is((select count(*)::int from jobs where lead_id=900021), 1, 'direct won insert creates one job');

-- 2 + 3. new lead has no job; transition to won creates one
insert into leads(id,customer_id,status,service) overriding system value values (900022,900021,'new','Outside only');
select is((select count(*)::int from jobs where lead_id=900022), 0, 'new lead has no job');
update leads set status='won' where id=900022;
select is((select count(*)::int from jobs where lead_id=900022), 1, 'won transition creates job');

-- 4. idempotent: re-touching the status of a won lead does not duplicate the job
update leads set status='won', note='again' where id=900022;
select is((select count(*)::int from jobs where lead_id=900022), 1, 'idempotent: no duplicate job');

-- (as rep) -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000021"}';
-- 5. rep may insert a lead
select lives_ok($$ insert into leads(customer_id,status,service) values (900021,'new','Rep lead') $$, 'rep insert lead allowed');
-- 6. rep may update a lead's status
select lives_ok($$ update leads set status='follow' where id=900022 $$, 'rep update lead allowed');
-- 7 + 8. rep may create a lead+customer from a pin via the RPC
select lives_ok($$ select create_lead_from_pin('Pin Rep','1 Pin St',42.33,-83.04,'new'::lead_status) $$, 'rep pin RPC runs');
select isnt_empty($$ select 1 from customers where name='Pin Rep' and address='1 Pin St' $$, 'pin RPC created the customer');

-- (as cleaner) ---------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000022"}';
-- 9. cleaner may not insert a lead
select throws_ok($$ insert into leads(customer_id,status,service) values (900021,'new','Nope') $$, '42501', null, 'cleaner insert lead blocked');
-- 10. cleaner may not create via the RPC
select throws_ok($$ select create_lead_from_pin('Pin Cleaner','2 Pin St',42.33,-83.04,'new'::lead_status) $$, 'P0001', 'Not authorized to create leads', 'cleaner pin RPC blocked');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase test db`
Expected: `leads_map` fails — `create_lead_from_pin` does not exist and no job is created on won (no trigger yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0006_lead_writes.sql`:

```sql
-- PRD role matrix: Admin + Rep create/edit leads; Cleaner is view-only.
create policy leads_insert on leads
  for insert with check (auth_role() in ('admin','rep'));
create policy leads_update on leads
  for update using (auth_role() in ('admin','rep'))
  with check (auth_role() in ('admin','rep'));

-- Local Supabase does not auto-grant table privileges (see 0004); RLS still gates rows.
grant insert, update on leads to authenticated;

-- A won lead owns at most one job. Partial unique index makes the trigger idempotent
-- and leaves jobs with NULL lead_id (e.g. ad-hoc jobs) unconstrained.
create unique index jobs_lead_unique on jobs(lead_id) where lead_id is not null;

-- SECURITY DEFINER so the auto-insert bypasses the select-only RLS on jobs (there is
-- no insert policy for reps/cleaners). Pinned search_path matches the hardening in
-- 0002/0003. ON CONFLICT ... DO NOTHING (inferring the partial index) is what makes a
-- re-transition to 'won' a no-op instead of a duplicate.
create or replace function create_job_for_won_lead() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.jobs (customer_id, lead_id, status, service)
  values (new.customer_id, new.id, 'unclaimed', new.service)
  on conflict (lead_id) where lead_id is not null do nothing;
  return new;
end $$;

-- Fires on a fresh 'won' insert and on any status touch that lands on 'won'.
create trigger leads_won_creates_job
  after insert or update of status on leads
  for each row when (new.status = 'won')
  execute function create_job_for_won_lead();

-- Map pin flow: atomically create a customer + lead at a coordinate and return the
-- lead id. SECURITY DEFINER + explicit role check (raising otherwise) so cleaners are
-- rejected loudly; created_by is stamped from the caller on both rows. Pinned
-- search_path keeps definer-rights name resolution off any caller-controlled schema.
create or replace function create_lead_from_pin(
  p_name text, p_address text, p_lat float8, p_lng float8, p_status lead_status
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_customer_id bigint;
  v_lead_id bigint;
begin
  if public.auth_role() not in ('admin','rep') then
    raise exception 'Not authorized to create leads';
  end if;
  insert into public.customers (name, address, lat, lng, type, created_by)
  values (p_name, p_address, p_lat, p_lng, 'residential', v_uid)
  returning id into v_customer_id;
  insert into public.leads (customer_id, status, service, created_by)
  values (v_customer_id, p_status, 'TBD', v_uid)
  returning id into v_lead_id;
  return v_lead_id;
end $$;

grant execute on function create_lead_from_pin(text, text, float8, float8, lead_status) to authenticated;
```

- [ ] **Step 4: Rework the seed so it does not collide with the trigger**

In `supabase/seed.sql`, **replace the explicit jobs insert (lines 51-56)** with UPDATEs against the rows the trigger now creates for won leads 1, 2, 5, 8:

```sql
-- ===== jobs =====
-- Won leads (1,2,5,8) auto-create an 'unclaimed' job via the leads_won_creates_job
-- trigger (0006), already carrying service = lead.service. Re-derive the original
-- seed job states by UPDATE (match on lead_id — the trigger's job ids are sequence-
-- assigned, so never reference them by literal id).
update jobs set status='claimed',     claimed_by='33333333-3333-3333-3333-333333333333', price=180, scheduled_date='2026-07-03' where lead_id=1;
update jobs set                                                                          price=95,  scheduled_date='2026-07-03' where lead_id=2;
update jobs set status='in_progress', claimed_by='33333333-3333-3333-3333-333333333333', price=210, scheduled_date='2026-07-02' where lead_id=5;
update jobs set                                                                          price=140, scheduled_date='2026-07-04' where lead_id=8;
```

Then **replace the invoices insert (lines 59-62)** so `job_id` is looked up by lead (the literal ids 1/5/8 no longer exist):

```sql
-- ===== invoices + items =====
insert into invoices (id,customer_id,job_id,number,issue_date,status) overriding system value values
 (1,1,(select id from jobs where lead_id=1),'INV-1001','2026-06-20','paid'),
 (2,5,(select id from jobs where lead_id=5),'INV-1002','2026-06-25','sent'),
 (3,8,(select id from jobs where lead_id=8),'INV-1003','2026-05-28','sent');
```

Leave the `invoice_items` insert and the `setval(...)` sequence-advance block unchanged — `select setval(pg_get_serial_sequence('jobs','id'), (select max(id) from jobs));` still picks up the trigger-created rows.

- [ ] **Step 5: Apply + run tests**

Run: `npx supabase db reset` then `npx supabase test db`
Expected: all pgTAP files pass (`schema`, `rls_money`, `claim_job`, `customers_write`, `leads_map` = 10/10).

- [ ] **Step 6: Verify the seed still yields the same net job states**

Run:
```bash
npx supabase db reset
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c \
  "select lead_id, status, (claimed_by is not null) as claimed, price, scheduled_date, service from jobs order by lead_id;"
```
Expected 4 rows: lead 1 → `claimed` / claimed=t / 180 / 2026-07-03 / In + out; lead 2 → `unclaimed` / f / 95 / 2026-07-03 / Outside only; lead 5 → `in_progress` / t / 210 / 2026-07-02 / In + out + screens; lead 8 → `unclaimed` / f / 140 / 2026-07-04 / In + out. (Job ids will be 1-4, not 1/2/5/8 — that is expected and correct.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0006_lead_writes.sql supabase/seed.sql supabase/tests/leads_map.sql
git commit -m "feat(db): lead write policies, won->job trigger, pin RPC + seed rework"
```

---

### Task 2: `lib/leads.ts` + `lib/geo.ts` (pure helpers + unit tests)

All pure, DB-free, client-safe logic lives here (both server pages and client components import it, so it must NOT import any server-only module). This is the DRY seam for the lead shape, status maps, pin projection, and form parsing.

**Files:**
- Create: `lib/leads.ts`
- Create: `lib/geo.ts`
- Test: `tests/unit/leads.test.ts`, `tests/unit/geo.test.ts`, `tests/unit/pin-form.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `lib/leads.ts`:
    - `type LeadStatus = 'new' | 'follow' | 'won' | 'lost'`
    - `const LEAD_STATUSES: LeadStatus[]` (order: new, follow, won, lost)
    - `const statusLabel: Record<LeadStatus, string>`, `const statusColor: Record<LeadStatus, string>`
    - `type Lead = { id; customer_id; status: LeadStatus; service: string|null; stories: number|null; panes: number|null; note: string|null; quote_value: number|null; customer_name: string; address: string|null; phone: string|null; email: string|null; lat: number|null; lng: number|null }`
    - `type Pin = { id: number; lat: number; lng: number; status: LeadStatus; label: string }`
    - `type LeadPublicRow`, `type CustomerGeo` (the two DB shapes the pages fetch)
    - `buildLeads(rows: LeadPublicRow[], customers: CustomerGeo[], quoteById: Map<number, number> | null): Lead[]`
    - `groupByStatus(leads: Lead[]): Record<LeadStatus, Lead[]>`
    - `type PinInput`, `parsePinForm(fd: FormData): { ok:true; value:PinInput } | { ok:false; error:string }`
  - `lib/geo.ts`: `MAP_BOUNDS`, `project(lat, lng)`, `unproject(xPct, yPct)`, `pickMapImpl(token)`.

- [ ] **Step 1: Write the failing `lib/leads.ts` tests**

Create `tests/unit/leads.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  LEAD_STATUSES,
  statusLabel,
  statusColor,
  groupByStatus,
  buildLeads,
  type Lead,
  type LeadPublicRow,
  type CustomerGeo,
} from '@/lib/leads';

const lead = (over: Partial<Lead>): Lead => ({
  id: 1, customer_id: 1, status: 'new', service: 'TBD', stories: 2, panes: 12,
  note: null, quote_value: null, customer_name: 'X', address: null, phone: null,
  email: null, lat: null, lng: null, ...over,
});

describe('status maps', () => {
  it('lists the four statuses in pipeline order', () => {
    expect(LEAD_STATUSES).toEqual(['new', 'follow', 'won', 'lost']);
  });
  it('has a label and a color for every status', () => {
    for (const s of LEAD_STATUSES) {
      expect(statusLabel[s]).toBeTruthy();
      expect(statusColor[s]).toMatch(/^var\(--/);
    }
  });
});

describe('groupByStatus', () => {
  it('buckets leads and always returns all four keys', () => {
    const g = groupByStatus([lead({ id: 1, status: 'won' }), lead({ id: 2, status: 'won' }), lead({ id: 3, status: 'lost' })]);
    expect(g.won.map(l => l.id)).toEqual([1, 2]);
    expect(g.lost.map(l => l.id)).toEqual([3]);
    expect(g.new).toEqual([]);
    expect(g.follow).toEqual([]);
  });
});

describe('buildLeads', () => {
  const rows: LeadPublicRow[] = [
    { id: 10, customer_id: 1, status: 'won', service: 'In + out', stories: 2, panes: 18, note: 'Booked.' },
    { id: 11, customer_id: 2, status: 'new', service: null, stories: null, panes: null, note: null },
  ];
  const customers: CustomerGeo[] = [
    { id: 1, name: 'Sarah Kim', address: '142 Maple Ave', phone: '555-0142', email: 's@k.io', lat: 42.331, lng: -83.045 },
  ];
  it('joins customer fields and derives coords', () => {
    const out = buildLeads(rows, customers, null);
    expect(out[0].customer_name).toBe('Sarah Kim');
    expect(out[0].address).toBe('142 Maple Ave');
    expect(out[0].lat).toBe(42.331);
    expect(out[1].customer_name).toBe('Unknown'); // customer 2 absent
    expect(out[1].lat).toBeNull();
  });
  it('exposes quote only when a quote map is supplied (admin)', () => {
    const q = new Map<number, number>([[10, 180]]);
    const admin = buildLeads(rows, customers, q);
    expect(admin[0].quote_value).toBe(180);
    expect(admin[1].quote_value).toBeNull();
    const nonAdmin = buildLeads(rows, customers, null);
    expect(nonAdmin[0].quote_value).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/leads'`.

- [ ] **Step 3: Implement `lib/leads.ts`**

```ts
export type LeadStatus = 'new' | 'follow' | 'won' | 'lost';

export const LEAD_STATUSES: LeadStatus[] = ['new', 'follow', 'won', 'lost'];

export const statusLabel: Record<LeadStatus, string> = {
  new: 'New', follow: 'Follow-up', won: 'Won', lost: 'Lost',
};
export const statusColor: Record<LeadStatus, string> = {
  new: 'var(--new)', follow: 'var(--follow)', won: 'var(--won)', lost: 'var(--lost)',
};

export type Lead = {
  id: number;
  customer_id: number;
  status: LeadStatus;
  service: string | null;
  stories: number | null;
  panes: number | null;
  note: string | null;
  quote_value: number | null; // null = not visible (non-admin) or unset
  customer_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
};

export type Pin = { id: number; lat: number; lng: number; status: LeadStatus; label: string };

// Shapes the server pages fetch: leads_public view + a slim customers projection.
export type LeadPublicRow = {
  id: number;
  customer_id: number;
  status: LeadStatus;
  service: string | null;
  stories: number | null;
  panes: number | null;
  note: string | null;
};
export type CustomerGeo = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
};

export function buildLeads(
  rows: LeadPublicRow[],
  customers: CustomerGeo[],
  quoteById: Map<number, number> | null
): Lead[] {
  const byId = new Map(customers.map(c => [c.id, c]));
  return rows.map(r => {
    const c = byId.get(r.customer_id);
    return {
      id: r.id,
      customer_id: r.customer_id,
      status: r.status,
      service: r.service,
      stories: r.stories,
      panes: r.panes,
      note: r.note,
      quote_value: quoteById ? (quoteById.get(r.id) ?? null) : null,
      customer_name: c?.name ?? 'Unknown',
      address: c?.address ?? null,
      phone: c?.phone ?? null,
      email: c?.email ?? null,
      lat: c?.lat ?? null,
      lng: c?.lng ?? null,
    };
  });
}

export function groupByStatus(leads: Lead[]): Record<LeadStatus, Lead[]> {
  const out: Record<LeadStatus, Lead[]> = { new: [], follow: [], won: [], lost: [] };
  for (const l of leads) out[l.status].push(l);
  return out;
}

export type PinInput = { name: string; address: string; lat: number; lng: number; status: LeadStatus };

export function parsePinForm(
  fd: FormData
): { ok: true; value: PinInput } | { ok: false; error: string } {
  const name = String(fd.get('name') ?? '').trim();
  const address = String(fd.get('address') ?? '').trim();
  const lat = Number(fd.get('lat'));
  const lng = Number(fd.get('lng'));
  const status = String(fd.get('status') ?? '');
  if (!name) return { ok: false, error: 'Address or name is required' };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: 'Invalid coordinates' };
  if (!LEAD_STATUSES.includes(status as LeadStatus)) return { ok: false, error: 'Invalid status' };
  return { ok: true, value: { name, address, lat, lng, status: status as LeadStatus } };
}
```

- [ ] **Step 4: Run — leads tests pass**

Run: `npm test`
Expected: `leads.test.ts` PASS (existing tests still green).

- [ ] **Step 5: Write the failing `lib/geo.ts` tests**

Create `tests/unit/geo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MAP_BOUNDS, project, unproject, pickMapImpl } from '@/lib/geo';

// The 10 Detroit seed coordinates (supabase/seed.sql lines 27-36).
const SEED_COORDS: [number, number][] = [
  [42.3310, -83.0450], [42.3365, -83.0398], [42.3342, -83.0521], [42.3288, -83.0477],
  [42.3401, -83.0333], [42.3255, -83.0555], [42.3377, -83.0444], [42.3299, -83.0511],
  [42.3410, -83.0480], [42.3350, -83.0300],
];

describe('project / unproject', () => {
  it('round-trips a point back to itself', () => {
    const { xPct, yPct } = project(42.33, -83.04);
    const { lat, lng } = unproject(xPct, yPct);
    expect(lat).toBeCloseTo(42.33, 5);
    expect(lng).toBeCloseTo(-83.04, 5);
  });
  it('lands every seed coordinate inside 0-100', () => {
    for (const [lat, lng] of SEED_COORDS) {
      const { xPct, yPct } = project(lat, lng);
      expect(xPct).toBeGreaterThanOrEqual(0);
      expect(xPct).toBeLessThanOrEqual(100);
      expect(yPct).toBeGreaterThanOrEqual(0);
      expect(yPct).toBeLessThanOrEqual(100);
    }
  });
  it('clamps out-of-bounds coordinates to the edges', () => {
    const north = project(MAP_BOUNDS.maxLat + 1, MAP_BOUNDS.minLng - 1);
    expect(north.yPct).toBe(0);   // north (high lat) is the top edge
    expect(north.xPct).toBe(0);   // west of min lng clamps left
    const east = project(MAP_BOUNDS.minLat - 1, MAP_BOUNDS.maxLng + 1);
    expect(east.yPct).toBe(100);
    expect(east.xPct).toBe(100);
  });
  it('clamps unproject percentages into the bounds', () => {
    expect(unproject(-50, 150).lng).toBeCloseTo(MAP_BOUNDS.minLng, 6);
    expect(unproject(-50, 150).lat).toBeCloseTo(MAP_BOUNDS.minLat, 6);
    expect(unproject(150, -50).lng).toBeCloseTo(MAP_BOUNDS.maxLng, 6);
    expect(unproject(150, -50).lat).toBeCloseTo(MAP_BOUNDS.maxLat, 6);
  });
});

describe('pickMapImpl', () => {
  it('falls back to the schematic map when there is no token', () => {
    expect(pickMapImpl('')).toBe('schematic');
    expect(pickMapImpl('   ')).toBe('schematic');
    expect(pickMapImpl(null)).toBe('schematic');
    expect(pickMapImpl(undefined)).toBe('schematic');
  });
  it('uses mapbox when a token is present', () => {
    expect(pickMapImpl('pk.eyJ...')).toBe('mapbox');
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/geo'`.

- [ ] **Step 7: Implement `lib/geo.ts`**

```ts
// Pure equirectangular projection over a fixed Detroit bounding box. Bounds are the
// extent of the seed coordinates (supabase/seed.sql lines 27-36) padded out so every
// seed pin lands comfortably inside 0-100%. North (high lat) maps to the top (yPct 0).
export const MAP_BOUNDS = {
  minLat: 42.320,
  maxLat: 42.345,
  minLng: -83.060,
  maxLng: -83.025,
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function project(lat: number, lng: number): { xPct: number; yPct: number } {
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS;
  const xPct = clamp(((lng - minLng) / (maxLng - minLng)) * 100, 0, 100);
  const yPct = clamp(((maxLat - lat) / (maxLat - minLat)) * 100, 0, 100);
  return { xPct, yPct };
}

export function unproject(xPct: number, yPct: number): { lat: number; lng: number } {
  const { minLat, maxLat, minLng, maxLng } = MAP_BOUNDS;
  const x = clamp(xPct, 0, 100) / 100;
  const y = clamp(yPct, 0, 100) / 100;
  return {
    lng: minLng + x * (maxLng - minLng),
    lat: maxLat - y * (maxLat - minLat),
  };
}

// Runtime choice of map implementation. An empty/whitespace token (our .env.local
// default) means "no Mapbox" — render the schematic fallback. Kept pure so the
// branch is unit-tested without a DOM (vitest runs in the node environment).
export function pickMapImpl(token: string | null | undefined): 'mapbox' | 'schematic' {
  return token && token.trim() ? 'mapbox' : 'schematic';
}
```

- [ ] **Step 8: Write the failing `parsePinForm` tests**

Create `tests/unit/pin-form.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePinForm } from '@/lib/leads';

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('parsePinForm', () => {
  it('accepts a valid pin', () => {
    const r = parsePinForm(fd({ name: '12 Oak', address: '12 Oak St', lat: '42.33', lng: '-83.04', status: 'won' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ name: '12 Oak', address: '12 Oak St', lat: 42.33, lng: -83.04, status: 'won' });
    }
  });
  it('requires a name', () => {
    const r = parsePinForm(fd({ name: '  ', lat: '42.33', lng: '-83.04', status: 'won' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/i);
  });
  it('rejects non-numeric coordinates', () => {
    const r = parsePinForm(fd({ name: 'X', lat: 'abc', lng: '-83.04', status: 'won' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/coordinate/i);
  });
  it('rejects an unknown status', () => {
    const r = parsePinForm(fd({ name: 'X', lat: '42.33', lng: '-83.04', status: 'sold' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/status/i);
  });
});
```

- [ ] **Step 9: Run — all Task 2 tests pass**

Run: `npm test`
Expected: `leads.test.ts`, `geo.test.ts`, `pin-form.test.ts` all PASS (`parsePinForm` already implemented in Step 3).

- [ ] **Step 10: Commit**

```bash
git add lib/leads.ts lib/geo.ts tests/unit/leads.test.ts tests/unit/geo.test.ts tests/unit/pin-form.test.ts
git commit -m "feat(leads): pure lead/geo helpers (status maps, buildLeads, projection, pin parser)"
```

---

### Task 3: Leads Kanban board + `setLeadStatus` action

Drag-to-restatus Kanban on `/leads` (admin+rep only). Cross-column drag calls a server action; `useOptimistic` moves the card instantly and snaps back if the action errors. Tapping a card (drag threshold 5px) opens the drawer — wired in Task 4; here the click just pushes `?l=<id>`.

**Files:**
- Create: `components/leads/KanbanBoard.tsx`, `components/leads/KanbanColumn.tsx`, `components/leads/LeadCard.tsx`
- Create: `app/(app)/leads/actions.ts`
- Modify: `app/(app)/leads/page.tsx` (full replace — guard + fetch + render Kanban)
- Modify: `app/globals.css` (append `touch-action` rule for draggable cards)

**Interfaces:**
- Consumes: `Lead`, `LeadStatus`, `LEAD_STATUSES`, `statusLabel`, `statusColor`, `groupByStatus`, `buildLeads` (Task 2); `getRole()` (`lib/auth`); `supabaseServer()`; leads write policy (Task 1).
- Produces:
  - `app/(app)/leads/actions.ts`: `setLeadStatus(id: number, status: LeadStatus): Promise<{ error?: string }>` (plain `.update({status}, { count:'exact' })`, no `.select()`; `count===0` ⇒ error).
  - `components/leads/KanbanBoard.tsx`: `function KanbanBoard({ leads, admin, canEdit }: { leads: Lead[]; admin: boolean; canEdit: boolean })`.

- [ ] **Step 1: Install `@dnd-kit/core`**

Run: `npm install @dnd-kit/core@^6.3.1`
Expected: adds `@dnd-kit/core` to `dependencies`. (No `@dnd-kit/sortable` — we only need cross-column drops, not intra-column ordering.)

- [ ] **Step 2: Write the `setLeadStatus` server action**

Create `app/(app)/leads/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/leads';

// Reps cannot SELECT the base leads table (RLS admin-only for select), so we must NOT
// chain .select(): supabase-js default return=minimal succeeds, and count from the
// Content-Range header confirms a row actually matched the update policy.
export async function setLeadStatus(id: number, status: LeadStatus): Promise<{ error?: string }> {
  if (!LEAD_STATUSES.includes(status)) return { error: 'Invalid status' };
  const sb = await supabaseServer();
  const { count, error } = await sb.from('leads').update({ status }, { count: 'exact' }).eq('id', id);
  if (error) return { error: error.message };
  if (!count) return { error: 'Status change failed: not permitted or lead missing' };
  revalidatePath('/leads');
  revalidatePath('/map');
  return {};
}
```

- [ ] **Step 3: Build `LeadCard`**

Create `components/leads/LeadCard.tsx`:

```tsx
'use client';
import { useDraggable } from '@dnd-kit/core';
import type { Lead } from '@/lib/leads';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export function LeadCard({
  lead, admin, draggable, onOpen,
}: {
  lead: Lead;
  admin: boolean;
  draggable: boolean;
  onOpen: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(lead.id),
    disabled: !draggable,
  });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card2${isDragging ? ' dragging' : ''}`}
      onClick={() => onOpen(lead.id)}
      {...listeners}
      {...attributes}
    >
      <span className="addr">{lead.customer_name}</span>
      <span className="meta">
        {lead.address ?? '—'} · {lead.phone ?? '—'}
        <br />
        {lead.stories ?? '?'}-story · {lead.panes ?? '?'} panes · {lead.service ?? 'TBD'}
      </span>
      {admin && lead.quote_value ? <div className="val">{fmt(lead.quote_value)}</div> : null}
    </div>
  );
}
```

- [ ] **Step 4: Build `KanbanColumn`**

Create `components/leads/KanbanColumn.tsx`:

```tsx
'use client';
import { useDroppable } from '@dnd-kit/core';
import { statusLabel, statusColor, type Lead, type LeadStatus } from '@/lib/leads';
import { LeadCard } from './LeadCard';

export function KanbanColumn({
  status, leads, admin, canEdit, onOpen,
}: {
  status: LeadStatus;
  leads: Lead[];
  admin: boolean;
  canEdit: boolean;
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`col box${isOver ? ' dragover' : ''}`}>
      <div className="ch">
        <b style={{ color: statusColor[status] }}>{statusLabel[status]}</b>
        <span className="cnt">{leads.length}</span>
      </div>
      {leads.map(l => (
        <LeadCard key={l.id} lead={l} admin={admin} draggable={canEdit} onOpen={onOpen} />
      ))}
      {leads.length === 0 && (
        <div className="meta" style={{ color: 'var(--muted)', fontSize: 10 }}>— drop here —</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Build `KanbanBoard`**

Create `components/leads/KanbanBoard.tsx`:

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
  LEAD_STATUSES,
  groupByStatus,
  type Lead,
  type LeadStatus,
} from '@/lib/leads';
import { setLeadStatus } from '@/app/(app)/leads/actions';
import { KanbanColumn } from './KanbanColumn';

export function KanbanBoard({
  leads, admin, canEdit,
}: {
  leads: Lead[];
  admin: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimistic move; reverts automatically when the action returns without a
  // revalidate (i.e. on error), and matches the fresh server data on success.
  const [optimistic, moveOptimistic] = useOptimistic(
    leads,
    (state: Lead[], move: { id: number; status: LeadStatus }) =>
      state.map(l => (l.id === move.id ? { ...l, status: move.status } : l))
  );
  // 5px activation distance so a tap still fires the card's onClick (opens drawer).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const grouped = groupByStatus(optimistic);

  const onDragEnd = (e: DragEndEvent) => {
    const id = Number(e.active.id);
    const status = e.over?.id as LeadStatus | undefined;
    if (!status || !LEAD_STATUSES.includes(status)) return;
    const lead = optimistic.find(l => l.id === id);
    if (!lead || lead.status === status) return;
    setError(null);
    startTransition(async () => {
      moveOptimistic({ id, status });
      const res = await setLeadStatus(id, status);
      if (res?.error) setError(res.error);
    });
  };

  const open = (id: number) => router.push(`/leads?l=${id}`, { scroll: false });

  return (
    <section className="screen">
      <div className="scrhead">
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          drag cards between columns to change status
        </span>
      </div>
      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {LEAD_STATUSES.map(st => (
            <KanbanColumn
              key={st}
              status={st}
              leads={grouped[st]}
              admin={admin}
              canEdit={canEdit}
              onOpen={open}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}
```

- [ ] **Step 6: Append the draggable-card CSS**

Append to the end of `app/globals.css` (dnd-kit's PointerSensor needs pointer events to not be stolen by touch-scrolling on the cards):

```css
/* Plan 3: dnd-kit pointer dragging on Kanban cards */
.kanban .card2 { touch-action: none; }
```

- [ ] **Step 7: Replace the leads page (guard + fetch + Kanban)**

Replace `app/(app)/leads/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { KanbanBoard } from '@/components/leads/KanbanBoard';

export default async function LeadsPage() {
  const role = await getRole();
  if (role !== 'admin' && role !== 'rep') redirect('/dashboard');
  const admin = role === 'admin';
  const sb = await supabaseServer();

  const { data: lp } = await sb
    .from('leads_public')
    .select('id,customer_id,status,service,stories,panes,note')
    .order('id');
  const { data: cs } = await sb.from('customers').select('id,name,address,phone,email,lat,lng');

  let quoteById: Map<number, number> | null = null;
  if (admin) {
    const { data: base } = await sb.from('leads').select('id,quote_value');
    quoteById = new Map((base ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById);

  return <KanbanBoard leads={leads} admin={admin} canEdit={true} />;
}
```

- [ ] **Step 8: Verify build + tests**

Run: `npm test` — green (no new unit tests; DnD interactions are exercised in the Task 7 live drive).
Run: `npm run build` — clean (no Suspense/searchParams errors; client action imported by client component compiles).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json app/globals.css app/\(app\)/leads components/leads/KanbanBoard.tsx components/leads/KanbanColumn.tsx components/leads/LeadCard.tsx
git commit -m "feat(leads): drag-to-restatus Kanban with optimistic moves + setLeadStatus action"
```

---

### Task 4: Lead detail drawer + `?l=<id>` wiring on `/leads`

Slide-over lead drawer: customer link, window details, note, role-aware quote (`•••••` for non-admin), status-change buttons, "Mark won → job", quick call/text/email. Reuses the generic `Drawer` from Plan 2. Cleaner (only reachable via `/map` in Task 5) gets a read-only drawer — controlled by `canEdit`.

**Files:**
- Create: `components/leads/LeadDrawer.tsx`
- Modify: `app/(app)/leads/page.tsx` (read `?l=`, render drawer)

**Interfaces:**
- Consumes: `Drawer` (`components/ui/Drawer.tsx`, Plan 2); `Lead`, `LeadStatus`, `LEAD_STATUSES`, `statusLabel`, `statusColor` (Task 2); `setLeadStatus` (Task 3).
- Produces: `components/leads/LeadDrawer.tsx`: `function LeadDrawer({ lead, admin, canEdit, backTo }: { lead: Lead; admin: boolean; canEdit: boolean; backTo: '/leads' | '/map' })` — reused by `/map` in Task 5.

- [ ] **Step 1: Build `LeadDrawer`**

Create `components/leads/LeadDrawer.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import {
  LEAD_STATUSES,
  statusLabel,
  statusColor,
  type Lead,
  type LeadStatus,
} from '@/lib/leads';
import { setLeadStatus } from '@/app/(app)/leads/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export function LeadDrawer({
  lead, admin, canEdit, backTo,
}: {
  lead: Lead;
  admin: boolean;
  canEdit: boolean;
  backTo: '/leads' | '/map';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const close = () => router.push(backTo, { scroll: false });

  const change = (status: LeadStatus) => {
    if (status === lead.status) return;
    setError(null);
    startTransition(async () => {
      const res = await setLeadStatus(lead.id, status);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <Drawer onClose={close}>
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: statusColor[lead.status] }}>
            {statusLabel[lead.status]}
          </span>
          <h2>{lead.address ?? lead.customer_name}</h2>
        </div>
        <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
      </div>
      <div className="lbl" style={{ marginTop: 4 }}>
        LEAD #{String(lead.id).padStart(4, '0')} · ◆ pinned on map
      </div>

      <div className="sec">
        <span className="lbl">Customer</span>
        <div className="minirow" onClick={() => router.push(`/customers?c=${lead.customer_id}`, { scroll: false })}>
          <span><b>{lead.customer_name}</b> · {lead.phone ?? '—'}</span>
          <span>→</span>
        </div>
        <div className="qa">
          <a href={`tel:${lead.phone ?? ''}`}>📞 Call</a>
          <a href={`sms:${lead.phone ?? ''}`}>💬 Text</a>
          <a href={`mailto:${lead.email ?? ''}`}>✉ Email</a>
        </div>
      </div>

      <div className="sec">
        <span className="lbl">Property / window details</span>
        <div className="kv">
          <span className="k">Stories</span>
          <span className="v">{lead.stories ?? '—'}</span>
          <span className="k">Panes</span>
          <span className="v">{lead.panes ?? '—'}</span>
          <span className="k">Service</span>
          <span className="v">{lead.service ?? 'TBD'}</span>
          <span className="k">Quote</span>
          {admin ? (
            <span className="v" style={{ color: 'var(--won)' }}>{lead.quote_value ? fmt(lead.quote_value) : '—'}</span>
          ) : (
            <span className="v money-hidden">•••••</span>
          )}
        </div>
      </div>

      <div className="sec">
        <span className="lbl">Notes</span>
        <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0, color: 'var(--muted)' }}>{lead.note ?? '—'}</p>
      </div>

      {canEdit && (
        <div className="sec">
          <span className="lbl">Change status</span>
          <div className="statuspick">
            {LEAD_STATUSES.map(st => {
              const sel = st === lead.status;
              return (
                <button
                  key={st}
                  type="button"
                  className={sel ? 'sel' : ''}
                  disabled={pending}
                  style={sel ? { background: statusColor[st], color: '#fff', borderColor: 'transparent' } : undefined}
                  onClick={() => change(st)}
                >
                  {statusLabel[st]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}

      <div className="acts">
        {canEdit && lead.status !== 'won' && (
          <button className="btn-p" type="button" disabled={pending} onClick={() => change('won')}>
            Mark won → job
          </button>
        )}
        <button className="btn-s" type="button" onClick={close}>Close</button>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 2: Wire `?l=` into the leads page**

Replace `app/(app)/leads/page.tsx` (adds `searchParams` + drawer to Task 3's version):

```tsx
import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { KanbanBoard } from '@/components/leads/KanbanBoard';
import { LeadDrawer } from '@/components/leads/LeadDrawer';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string }>;
}) {
  const role = await getRole();
  if (role !== 'admin' && role !== 'rep') redirect('/dashboard');
  const { l: lParam } = await searchParams;
  const admin = role === 'admin';
  const sb = await supabaseServer();

  const { data: lp } = await sb
    .from('leads_public')
    .select('id,customer_id,status,service,stories,panes,note')
    .order('id');
  const { data: cs } = await sb.from('customers').select('id,name,address,phone,email,lat,lng');

  let quoteById: Map<number, number> | null = null;
  if (admin) {
    const { data: base } = await sb.from('leads').select('id,quote_value');
    quoteById = new Map((base ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById);
  const selected = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;

  return (
    <>
      <KanbanBoard leads={leads} admin={admin} canEdit={true} />
      {selected && <LeadDrawer lead={selected} admin={admin} canEdit={true} backTo="/leads" />}
    </>
  );
}
```

- [ ] **Step 3: Verify build + tests**

Run: `npm test` — green.
Run: `npm run build` — clean.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/leads/page.tsx components/leads/LeadDrawer.tsx
git commit -m "feat(leads): deep-linked lead drawer (?l=) with role-aware quote + status actions"
```

---

### Task 5: Map page + SchematicMap + PinPopover + Legend + `createLeadFromPin` action

The `/map` route for all three roles: pins colored by lead status, click a pin → lead drawer (`?l=`), admin/rep click empty space → popover to create customer+lead+pin via the RPC. Ships the schematic fallback map (works with no token) plus the shared `MapView` shell that Task 6 slots `MapboxMap` into.

**Files:**
- Create: `components/map/MapView.tsx`, `components/map/SchematicMap.tsx`, `components/map/PinPopover.tsx`, `components/map/Legend.tsx`
- Create: `app/(app)/map/actions.ts`
- Modify: `app/(app)/map/page.tsx` (full replace — fetch pins, read token, render `MapView` + drawer)

**Interfaces:**
- Consumes: `project`, `unproject`, `pickMapImpl` (`lib/geo`); `Pin`, `Lead`, `statusColor`, `statusLabel`, `buildLeads`, `parsePinForm` (`lib/leads`); `LeadDrawer` (Task 4); `create_lead_from_pin` RPC (Task 1).
- Produces:
  - `app/(app)/map/actions.ts`: `createLeadFromPin(fd: FormData): Promise<{ error?: string }>` (calls `sb.rpc('create_lead_from_pin', …)`, revalidates `/map` `/leads` `/customers`, redirects to `/map?l=<id>`).
  - `components/map/MapView.tsx`: `function MapView({ pins, token, canCreate }: { pins: Pin[]; token: string | null; canCreate: boolean })` — owns the pending-pin state, chooses the impl, renders `PinPopover` + `Legend`.
  - `components/map/SchematicMap.tsx`: `function SchematicMap(props: MapImplProps)` where `type MapImplProps = { pins: Pin[]; canCreate: boolean; overlay: React.ReactNode; onMapClick: (lat, lng, xPct, yPct) => void; onPinClick: (id: number) => void }` — Task 6's `MapboxMap` implements the same props.

- [ ] **Step 1: Build the `createLeadFromPin` action**

Create `app/(app)/map/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { parsePinForm } from '@/lib/leads';

export async function createLeadFromPin(fd: FormData): Promise<{ error?: string }> {
  const parsed = parsePinForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('create_lead_from_pin', {
    p_name: parsed.value.name,
    p_address: parsed.value.address,
    p_lat: parsed.value.lat,
    p_lng: parsed.value.lng,
    p_status: parsed.value.status,
  });
  if (error) return { error: error.message };
  revalidatePath('/map');
  revalidatePath('/leads');
  revalidatePath('/customers');
  redirect(`/map?l=${data}`); // redirect() throws — do not wrap in try/catch
}
```

- [ ] **Step 2: Build `Legend`**

Create `components/map/Legend.tsx`:

```tsx
export function Legend() {
  return (
    <div className="legend">
      <span><i className="lg" style={{ background: 'var(--won)' }} /> WON</span>
      <span><i className="lg" style={{ background: 'var(--follow)' }} /> FOLLOW-UP</span>
      <span><i className="lg" style={{ background: 'var(--lost)' }} /> LOST</span>
      <span><i className="lg" style={{ background: 'var(--new)' }} /> NEW</span>
    </div>
  );
}
```

- [ ] **Step 3: Build `PinPopover`**

Create `components/map/PinPopover.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { LEAD_STATUSES, statusLabel, statusColor, type LeadStatus } from '@/lib/leads';
import { createLeadFromPin } from '@/app/(app)/map/actions';

export function PinPopover({
  lat, lng, xPct, yPct, onCancel,
}: {
  lat: number;
  lng: number;
  xPct: number;
  yPct: number;
  onCancel: () => void;
}) {
  const [addr, setAddr] = useState('');
  const [status, setStatus] = useState<LeadStatus>('won');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    const name = addr.trim() || `Lot ${Math.abs(Math.round(lat * 1000))}`;
    const fd = new FormData();
    fd.set('name', name);
    fd.set('address', addr.trim());
    fd.set('lat', String(lat));
    fd.set('lng', String(lng));
    fd.set('status', status);
    startTransition(async () => {
      const res = await createLeadFromPin(fd); // success redirects away
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="pop box" style={{ left: `${xPct}%`, top: `${yPct}%` }}>
      <h4>New pin</h4>
      <p>{lat.toFixed(4)}°, {lng.toFixed(4)}°</p>
      <input
        placeholder="House / address"
        value={addr}
        onChange={e => setAddr(e.target.value)}
        autoFocus
      />
      <div className="statuspick">
        {LEAD_STATUSES.map(st => {
          const sel = st === status;
          return (
            <button
              key={st}
              type="button"
              className={sel ? 'sel' : ''}
              style={sel ? { background: statusColor[st], color: '#fff', borderColor: 'transparent' } : undefined}
              onClick={() => setStatus(st)}
            >
              {statusLabel[st]}
            </button>
          );
        })}
      </div>
      {error && <p style={{ color: 'var(--lost)' }}>{error}</p>}
      <div className="row">
        <button type="button" className="go" disabled={pending} onClick={create}>
          {pending ? 'Creating…' : 'Create lead'}
        </button>
        <button type="button" className="x" onClick={onCancel}>✕</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build `SchematicMap`**

Create `components/map/SchematicMap.tsx`:

```tsx
'use client';
import type React from 'react';
import { project, unproject } from '@/lib/geo';
import { statusColor, type Pin } from '@/lib/leads';

export type MapImplProps = {
  pins: Pin[];
  canCreate: boolean;
  overlay: React.ReactNode;
  onMapClick: (lat: number, lng: number, xPct: number, yPct: number) => void;
  onPinClick: (id: number) => void;
};

export function SchematicMap({ pins, canCreate, overlay, onMapClick, onPinClick }: MapImplProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canCreate) return;
    const target = e.target as HTMLElement;
    if (target.closest('.mpin') || target.closest('.pop')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - r.left) / r.width) * 100;
    const yPct = ((e.clientY - r.top) / r.height) * 100;
    const { lat, lng } = unproject(xPct, yPct);
    onMapClick(lat, lng, xPct, yPct);
  };

  return (
    <div className="map" onClick={handleClick} style={{ cursor: canCreate ? 'crosshair' : 'default' }}>
      {/* prototype street/block chrome (clearview-proto.html mapChrome) */}
      <div className="street" style={{ left: 0, top: '38%', width: '100%', height: 6 }} />
      <div className="street" style={{ left: 0, top: '72%', width: '100%', height: 6 }} />
      <div className="street" style={{ left: '28%', top: 0, width: 6, height: '100%' }} />
      <div className="street" style={{ left: '66%', top: 0, width: 6, height: '100%' }} />
      <div className="block" style={{ left: '6%', top: '8%', width: '18%', height: '24%' }} />
      <div className="block" style={{ left: '34%', top: '8%', width: '28%', height: '24%' }} />
      <div className="block" style={{ left: '72%', top: '44%', width: '20%', height: '22%' }} />

      {pins.map(pin => {
        const { xPct, yPct } = project(pin.lat, pin.lng);
        return (
          <div
            key={pin.id}
            className="mpin"
            title={pin.label}
            style={{ left: `${xPct}%`, top: `${yPct}%`, '--pc': statusColor[pin.status] } as React.CSSProperties}
            onClick={e => { e.stopPropagation(); onPinClick(pin.id); }}
          >
            <i />
          </div>
        );
      })}

      {overlay}
    </div>
  );
}
```

- [ ] **Step 5: Build `MapView`**

Create `components/map/MapView.tsx`:

```tsx
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pickMapImpl } from '@/lib/geo';
import type { Pin } from '@/lib/leads';
import { SchematicMap } from './SchematicMap';
import { PinPopover } from './PinPopover';
import { Legend } from './Legend';

// ssr:false requires a Client Component parent (this file). The schematic map never
// loads mapbox-gl; MapboxMap is only imported when a token exists (Task 6).
const MapboxMap = dynamic(() => import('./MapboxMap').then(m => m.MapboxMap), { ssr: false });

type Pending = { lat: number; lng: number; xPct: number; yPct: number };

export function MapView({
  pins, token, canCreate,
}: {
  pins: Pin[];
  token: string | null;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const impl = pickMapImpl(token);

  const onMapClick = (lat: number, lng: number, xPct: number, yPct: number) => {
    if (canCreate) setPending({ lat, lng, xPct, yPct });
  };
  const onPinClick = (id: number) => router.push(`/map?l=${id}`, { scroll: false });

  const overlay = pending ? (
    <PinPopover {...pending} onCancel={() => setPending(null)} />
  ) : null;

  return (
    <div className="panel box">
      <div className="maptools">
        <h3 style={{ marginRight: 'auto' }}>Pin map / neighborhood</h3>
        {canCreate && <span className="hint">✚ click empty space to drop a pin &amp; create a lead</span>}
      </div>
      {impl === 'mapbox' ? (
        <MapboxMap pins={pins} canCreate={canCreate} overlay={overlay} onMapClick={onMapClick} onPinClick={onPinClick} token={token!} />
      ) : (
        <SchematicMap pins={pins} canCreate={canCreate} overlay={overlay} onMapClick={onMapClick} onPinClick={onPinClick} />
      )}
      <Legend />
    </div>
  );
}
```

Note: `MapboxMap` (Task 6) takes the same `MapImplProps` plus a `token: string` prop. Until Task 6 creates `./MapboxMap`, the dynamic import is never resolved because `pickMapImpl(null)` returns `'schematic'` (token is empty in `.env.local`), so `next build` succeeds — but do not skip Task 6, or a future token would 500.

- [ ] **Step 6: Replace the map page (fetch pins + token + drawer)**

Replace `app/(app)/map/page.tsx`:

```tsx
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildLeads, statusLabel, type Pin, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { MapView } from '@/components/map/MapView';
import { LeadDrawer } from '@/components/leads/LeadDrawer';

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string }>;
}) {
  const { l: lParam } = await searchParams;
  const role = await getRole();
  const admin = role === 'admin';
  const canCreate = role === 'admin' || role === 'rep';
  const sb = await supabaseServer();

  const { data: lp } = await sb
    .from('leads_public')
    .select('id,customer_id,status,service,stories,panes,note')
    .order('id');
  const { data: cs } = await sb.from('customers').select('id,name,address,phone,email,lat,lng');

  let quoteById: Map<number, number> | null = null;
  if (admin) {
    const { data: base } = await sb.from('leads').select('id,quote_value');
    quoteById = new Map((base ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById);
  const pins: Pin[] = leads
    .filter(l => l.lat != null && l.lng != null)
    .map(l => ({
      id: l.id,
      lat: l.lat as number,
      lng: l.lng as number,
      status: l.status,
      label: `${l.customer_name} — ${statusLabel[l.status]}`,
    }));

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null; // empty string → null
  const selected = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;

  return (
    <section className="screen">
      <MapView pins={pins} token={token} canCreate={canCreate} />
      {selected && <LeadDrawer lead={selected} admin={admin} canEdit={canCreate} backTo="/map" />}
    </section>
  );
}
```

- [ ] **Step 7: Verify build + tests**

Run: `npm test` — green.
Run: `npm run build` — clean (schematic branch compiles; the `./MapboxMap` dynamic import is unresolved-but-tolerated because the module is only imported at runtime when the mapbox branch is chosen — however if `next build` tries to trace it and errors that the module is missing, proceed to Task 6 first and re-run; the two tasks may be merged into one commit if your bundler eagerly resolves the dynamic import).

- [ ] **Step 8: Commit**

```bash
git add app/\(app\)/map/actions.ts app/\(app\)/map/page.tsx components/map/MapView.tsx components/map/SchematicMap.tsx components/map/PinPopover.tsx components/map/Legend.tsx
git commit -m "feat(map): schematic pin map, pin-create popover + RPC action, lead drawer on /map"
```

---

### Task 6: `MapboxMap` behind the token

Real satellite-streets map, activated only when `NEXT_PUBLIC_MAPBOX_TOKEN` is set. Same `MapImplProps` as `SchematicMap` so `MapView` swaps them transparently. **No live test is possible without a token — correctness is verified by `npm run build` + code review only (stubbed).**

**Files:**
- Create: `components/map/MapboxMap.tsx`

**Interfaces:**
- Consumes: `MapImplProps` shape (Task 5) + `token: string`; `MAP_BOUNDS` (`lib/geo`); `statusColor`, `Pin` (`lib/leads`).
- Produces: `components/map/MapboxMap.tsx`: `function MapboxMap(props: MapImplProps & { token: string })`.

- [ ] **Step 1: Install `mapbox-gl`**

Run: `npm install mapbox-gl@^3.9.0` and `npm install -D @types/mapbox-gl@^3.4.0`
Expected: `mapbox-gl` in `dependencies`, `@types/mapbox-gl` in `devDependencies`.

- [ ] **Step 2: Build `MapboxMap`**

Create `components/map/MapboxMap.tsx`:

```tsx
'use client';
import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css'; // imported ONLY here, never in a server file
import { MAP_BOUNDS } from '@/lib/geo';
import { statusColor } from '@/lib/leads';
import type { MapImplProps } from './SchematicMap';

export function MapboxMap({
  pins, canCreate, overlay, onMapClick, onPinClick, token,
}: MapImplProps & { token: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  // Keep the latest callbacks reachable from the once-bound map click handler.
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const canCreateRef = useRef(canCreate);
  canCreateRef.current = canCreate;

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      bounds: [
        [MAP_BOUNDS.minLng, MAP_BOUNDS.minLat],
        [MAP_BOUNDS.maxLng, MAP_BOUNDS.maxLat],
      ],
      fitBoundsOptions: { padding: 30 },
    });
    mapRef.current = map;
    map.on('click', e => {
      if (!canCreateRef.current) return;
      const p = map.project(e.lngLat);
      const rect = containerRef.current!.getBoundingClientRect();
      const xPct = (p.x / rect.width) * 100;
      const yPct = (p.y / rect.height) * 100;
      clickRef.current(e.lngLat.lat, e.lngLat.lng, xPct, yPct);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  // Sync markers whenever pins change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    for (const pin of pins) {
      // Mapbox owns the OUTER marker element's transform, so put .mpin styling on an
      // INNER child (its own rotate/translate does not fight Mapbox's positioning).
      const el = document.createElement('div');
      const inner = document.createElement('div');
      inner.className = 'mpin';
      inner.title = pin.label;
      inner.style.setProperty('--pc', statusColor[pin.status]);
      inner.innerHTML = '<i></i>';
      inner.addEventListener('click', ev => {
        ev.stopPropagation();
        onPinClick(pin.id);
      });
      el.appendChild(inner);
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(map);
      markersRef.current.push(marker);
    }
  }, [pins, onPinClick]);

  return (
    <div className="map" ref={containerRef} style={{ cursor: canCreate ? 'crosshair' : 'default' }}>
      {overlay}
    </div>
  );
}
```

- [ ] **Step 3: Verify build (token stays empty)**

Run: `npm run build`
Expected: clean build. The app still renders `SchematicMap` at runtime because `.env.local` has no token; `MapboxMap` compiles and is code-reviewed but not live-driven.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json components/map/MapboxMap.tsx
git commit -m "feat(map): Mapbox satellite implementation behind NEXT_PUBLIC_MAPBOX_TOKEN (stubbed, no token)"
```

---

### Task 7: Full verification pass

No new features. Prove Plan 3 works end-to-end against the live local stack, in all three roles.

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append results)

**Interfaces:** consumes everything above.

- [ ] **Step 1: Full automated suite**

```bash
npx supabase db reset
npx supabase test db     # expect 5 files pass: schema, rls_money, claim_job, customers_write, leads_map (10/10)
npm test                 # expect all unit tests pass (nav, customers-filter, customer-form, search, leads, geo, pin-form)
npm run build            # expect clean production build
npm run lint             # expect no errors
```

- [ ] **Step 2: RLS + trigger + RPC matrix (PostgREST/psql, no app)**

Capture the DB URL once:
```bash
DBURL="$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')"
```
Then verify at the DB layer (each as the given role via JWT claim):

```bash
# rep may restatus a lead (leads_update policy) — should report UPDATE 1
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"22222222-2222-2222-2222-222222222222\"}'; update leads set status='follow' where id=7;"

# cleaner may NOT insert a lead — should raise 42501 permission denied
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"33333333-3333-3333-3333-333333333333\"}'; insert into leads(customer_id,status,service) values (1,'new','x');" || echo "OK: cleaner insert blocked"

# rep pin RPC creates customer+lead atomically — returns a bigint lead id
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"22222222-2222-2222-2222-222222222222\"}'; select create_lead_from_pin('Verify Rep','9 Verify St',42.335,-83.041,'new');"

# cleaner pin RPC blocked — raises 'Not authorized to create leads'
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"33333333-3333-3333-3333-333333333333\"}'; select create_lead_from_pin('Nope','x',42.3,-83.0,'new');" || echo "OK: cleaner RPC blocked"

# won transition creates exactly one job, idempotently (run twice) — count stays 1
psql "$DBURL" -c "update leads set status='won' where id=3; update leads set status='won' where id=3; select count(*) from jobs where lead_id=3;"
```
Expected: rep update = `UPDATE 1`; cleaner insert prints `OK: cleaner insert blocked`; rep RPC returns a lead id; cleaner RPC prints `OK: cleaner RPC blocked`; final `count` = `1`. Reset afterward: `npx supabase db reset`.

- [ ] **Step 3: Live drive (dev server)**

Run `npm run dev`, then verify against `http://localhost:3000` (browser automation; logins password `password123`):

1. `admin@clearview.dev`: `/leads` shows the Kanban with 4 columns; counts new=2, follow=3, won=4, lost=1; cards in Won show a `$` quote. Drag a `new` card (Alex Park) into `Won` → card moves instantly and stays after reload; `/jobs` (or the customer drawer Jobs tab) now shows a new unclaimed job for that lead. Open any lead card → drawer shows Quote as a dollar amount; click customer minirow → navigates to `/customers?c=<id>`.
2. `rep@clearview.dev`: `/leads` reachable; drawer shows Quote as `•••••`; drag a card between columns → status persists (RLS `leads_update` allows rep, `setLeadStatus` count>0). On `/map`, click empty space → popover; enter an address, pick a status, Create lead → lands on `/map?l=<newId>` with the drawer open and a new pin visible; the new customer appears in `/customers`.
3. `cleaner@clearview.dev`: sidebar has NO Leads item; direct nav to `/leads` redirects to `/dashboard`. `/map` renders pins (view-only); clicking empty space does nothing (no popover); clicking a pin opens the lead drawer with Quote `•••••`, no status buttons, and no "Mark won → job" button.
4. Map fallback: with `NEXT_PUBLIC_MAPBOX_TOKEN` empty, `/map` renders the schematic grid/streets/blocks with diamond pins (not a Mapbox canvas). Toggle dark mode → pins show the neon glow.
5. "Mark won → job" (admin, on a non-won lead's drawer) → lead flips to Won, drawer status updates, and a job is created (verify in `/jobs` mini or customer Jobs tab).

- [ ] **Step 4: Record results + commit ledger**

Append verification results to `.superpowers/sdd/progress.md`, then:

```bash
git add .superpowers/sdd/progress.md
git commit -m "chore: plan 3 verification results"
```

---

## Execution notes (controller)

- Branch: `feat/leads-map`. Merge to `main` only when Task 7 is fully green.
- Tasks 5 and 6 may be committed together if your Next/Turbopack build eagerly resolves the `dynamic(() => import('./MapboxMap'))` reference before `./MapboxMap` exists (Task 5 Step 7 note). Prefer separate commits; fall back to a combined commit only if the build demands it.
- After merge, update `docs/superpowers/AUTONOMOUS_RUN.md` status section (mirrors the Plan 2 handoff).
