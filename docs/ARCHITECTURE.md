# ClearView CRM — Architecture

**Status:** Draft v1
**Date:** 2026-07-02
**Companion to:** `PRD.md`

This document is the technical plan: system shape, database schema, the security rules that enforce the PRD's hard requirements (Admin-only money, race-safe job claiming), and how web + mobile fit together.

---

## 1. System overview

```
        ┌─────────────────────────────────────────────┐
        │  Clients                                     │
        │  • Web app (Next.js PWA)  — desktop + phone  │
        │  • Native app (Expo, Phase 2) — field crews  │
        └───────────────┬─────────────────────────────┘
                        │ HTTPS (Supabase JS client)
                        ▼
        ┌─────────────────────────────────────────────┐
        │  Supabase                                    │
        │  • Postgres (data + Row-Level Security)      │
        │  • Auth (email/password, JWT with role)      │
        │  • Storage (job photos — Phase 2)            │
        │  • Edge Functions / RPC (claim job, PDF)     │
        └───────────────┬─────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │  Mapbox (map tiles, geocoding) │
        └────────────────────────────────┘

Hosting: Cloudflare Pages / Netlify (web). Supabase cloud (backend).
```

**Principle:** the database is the security boundary. Permissions are enforced by Postgres Row-Level Security (RLS), so a compromised or hacked client still cannot read revenue or steal a claimed job. UI hiding is convenience, not security.

---

## 2. Tech stack & rationale

| Layer | Choice | Why |
|---|---|---|
| Web framework | **Next.js (App Router) + TypeScript** | React everywhere → reuse with Expo; SSR + PWA support |
| Styling | **Tailwind + shadcn/ui** | Fast, own-your-components; matches Blueprint+ tokens |
| Animation | **Motion** (+ small custom canvas) | Approved animated feel; light |
| Map | **Mapbox GL JS** | House-level satellite, custom colored markers, click-to-place, 50k loads/mo free |
| Backend | **Supabase** (Postgres, Auth, Storage, RLS) | One box for DB+auth+security; RLS is the cleanest way to hide revenue by role |
| Native (P2) | **Expo / React Native** + `@rnmapbox/maps` | Shares TS logic; consistent Mapbox model; OTA updates |
| Hosting | **Cloudflare Pages / Netlify** | Commercial-OK free tier (avoid Vercel hobby ToS) |
| PDF | Browser print (MVP) → **@react-pdf** or Edge Function (prod) | Cheap now, server-rendered later |
| Excel | CSV (MVP) → **ExcelJS** (prod) | CSV opens in Excel; xlsx later |

---

## 3. Database schema (Postgres)

```sql
-- Users: mirrors auth.users, holds role. role drives all RLS.
create type user_role as enum ('admin','rep','cleaner');
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'rep',
  created_at  timestamptz not null default now()
);

create type customer_type as enum ('residential','commercial');
create table customers (
  id          bigint generated always as identity primary key,
  name        text not null,
  phone       text,
  email       text,
  address     text,
  type        customer_type not null default 'residential',
  lat         double precision,
  lng         double precision,
  notes       text,
  tags        text[] default '{}',            -- Phase 2 (VIP, Commercial…)
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create type lead_status as enum ('new','follow','won','lost');
create table leads (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  status      lead_status not null default 'new',
  service     text,
  stories     int,
  panes       int,
  quote_value numeric(10,2) default 0,        -- money: admin-only via RLS/column
  note        text,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
-- pin = lead rendered at customers.lat/lng, color = leads.status. No separate table.

create type job_status as enum ('unclaimed','claimed','in_progress','done');
create table jobs (
  id            bigint generated always as identity primary key,
  customer_id   bigint not null references customers(id) on delete cascade,
  lead_id       bigint references leads(id) on delete set null,
  status        job_status not null default 'unclaimed',
  claimed_by    uuid references profiles(id),
  price         numeric(10,2) default 0,      -- money: admin-only
  scheduled_date date,
  service       text,
  created_at    timestamptz not null default now()
);

create type invoice_status as enum ('draft','sent','paid');
create table invoices (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  job_id      bigint references jobs(id) on delete set null,
  number      text not null unique,
  issue_date  date not null default current_date,
  status      invoice_status not null default 'draft',
  tax         numeric(10,2) default 0,        -- Phase 3
  deposit     numeric(10,2) default 0,        -- Phase 3
  created_at  timestamptz not null default now()
);
create table invoice_items (
  id          bigint generated always as identity primary key,
  invoice_id  bigint not null references invoices(id) on delete cascade,
  description text not null,
  qty         numeric(10,2) not null default 1,
  unit_price  numeric(10,2) not null default 0
);
-- invoice total = sum(qty*unit_price) + tax - deposit  (computed in a view)

-- Phase 2:
create table job_photos (
  id bigint generated always as identity primary key,
  job_id bigint references jobs(id) on delete cascade,
  kind text check (kind in ('before','after')),
  storage_path text, created_at timestamptz default now()
);
```

Helper to read the caller's role inside policies:
```sql
create or replace function auth_role() returns user_role
language sql stable as $$
  select role from profiles where id = auth.uid()
$$;
```

---

## 4. Row-Level Security — the hard requirements

RLS is turned on for every table. Two PRD requirements are enforced here.

### 4.1 Admin-only money
Money lives in `leads.quote_value`, `jobs.price`, and all of `invoices` / `invoice_items`. Approach:

- **Invoices & items:** only admins can select them at all.
```sql
alter table invoices enable row level security;
alter table invoice_items enable row level security;

create policy invoices_admin_only on invoices
  for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy items_admin_only on invoice_items
  for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
```
- **Money columns on shared tables (leads/jobs):** non-admins may read the row but must not receive the money column. Postgres RLS is row-level, not column-level, so we use **column privileges + role-filtered views**:
```sql
-- Reps/cleaners query these views, which omit money columns.
create view leads_public as
  select id, customer_id, status, service, stories, panes, note, created_at from leads;
create view jobs_public as
  select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at from jobs;

-- Revoke direct money-column access from the anon/auth role; grant full table to admins via policy.
revoke select on leads, jobs from authenticated;      -- clients hit the views
grant select on leads_public, jobs_public to authenticated;
```
Admins get a separate policy/grant that includes the money columns. Net effect: **a rep or cleaner client literally cannot fetch `price` / `quote_value` / invoices — the database refuses**, independent of the UI.

*(Alternative: keep money in a separate `job_pricing` table that only admins can select. Either works; decision at build time.)*

### 4.2 Race-safe job claiming
Claiming must be atomic so two cleaners can't grab the same job. Do it in a `SECURITY DEFINER` function with a conditional update — the `where status='unclaimed'` guard makes it first-write-wins:

```sql
create or replace function claim_job(p_job_id bigint)
returns jobs language plpgsql security definer as $$
declare j jobs;
begin
  update jobs
     set status = 'claimed', claimed_by = auth.uid()
   where id = p_job_id
     and status = 'unclaimed'          -- atomic guard: only if still free
  returning * into j;

  if j.id is null then
    raise exception 'Job already claimed';
  end if;
  return j;
end $$;
```
Row lock during `UPDATE` serializes concurrent claims; the loser gets "Job already claimed." Clients call `supabase.rpc('claim_job', { p_job_id })`.

### 4.3 General access policies (sketch)
```sql
-- Everyone signed in can read customers/leads(public)/jobs(public); write rules per role.
create policy customers_read on customers for select using (auth.uid() is not null);
create policy leads_write on leads for insert with check (auth_role() in ('admin','rep'));
create policy jobs_update_own on jobs for update
  using (auth_role() = 'admin' or claimed_by = auth.uid());
```
Cleaners can update only jobs they own; reps/admins manage leads; admins manage everything.

---

## 5. Auth & roles
- Supabase Auth (email/password; magic-link optional).
- On signup an admin assigns a role in `profiles`. Role is read server-side via `auth_role()`; never trusted from the client.
- JWT carries `sub` (user id); policies resolve role from `profiles`.

---

## 6. Frontend architecture (web)

```
app/
  (auth)/login
  (app)/
    dashboard/      KPIs (role-aware), chart, claimable jobs, mini-map
    map/            Mapbox GL, drop-pin popover, pin→lead
    leads/          kanban (dnd-kit), drag → status; won → create job
    jobs/           board (statuses), claim (rpc), job detail
    customers/      list + typeahead; [id] profile w/ related tabs
    invoices/       list, editor (line items), PDF, mark paid   (admin route guard)
    settings/       users & roles (admin)
components/  ui (shadcn), map/, kanban/, drawer/, search/
lib/  supabase client, queries, rls-aware hooks, csv/pdf export
```
- **State/data:** Supabase client + TanStack Query for fetching/caching; realtime subscriptions for the jobs board (see a claim happen live).
- **Drag & drop:** `dnd-kit`.
- **Search/typeahead:** debounced query on `customers` (name/phone/address), result cards.
- **Route guards:** server-side role check on `/invoices`, `/settings`; but real enforcement is RLS.

---

## 7. Map integration (Mapbox)
- `mapbox-gl` with a satellite-streets style.
- Pins = HTML markers colored by lead status; click → open lead drawer.
- Drop pin: map `click` → reverse-geocode (Mapbox Geocoding) to prefill address → create customer+lead at lat/lng.
- Territory centered on the business's neighborhood; store `lat/lng` per customer.

---

## 8. PWA (Phase 1 mobile)
- `manifest.json` (name, icons, theme color, standalone display).
- Service worker (via `next-pwa` or Workbox): cache app shell + static assets; network-first for data.
- "Add to Home Screen" → app icon, fullscreen. Push via Web Push (Phase 1.5).
- Offline v1 = read cached shell + last data; queued writes are best-effort (robust offline deferred to native).

## 9. Native app (Phase 2, Expo)
- Expo + React Native, `@rnmapbox/maps`, shared TS types + Supabase client + business logic from web.
- Adds: camera (before/after photos → Supabase Storage), GPS route, reliable offline sync (WatermelonDB or Supabase local cache), EAS Update for OTA fixes.
- Store: Apple $99/yr, Google $25 once.

---

## 10. Exports & PDF
- **CSV (MVP):** client-side Blob download from current query (leads/jobs/invoices/customers).
- **XLSX (prod):** ExcelJS in an Edge Function for formatting/multiple sheets.
- **Invoice PDF (MVP):** browser print of a print-CSS layout → Save as PDF.
- **Invoice PDF (prod):** `@react-pdf/renderer` or an Edge Function returning a PDF (consistent, emailable).

---

## 11. Environments, deploy, secrets
- **Envs:** local → staging → prod (separate Supabase projects).
- **Secrets:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (client), `SUPABASE_SERVICE_ROLE` (server only), `MAPBOX_TOKEN` (URL-restricted).
- **CI/CD:** GitHub → Cloudflare Pages/Netlify build on push; Supabase migrations via CLI (`supabase db push`).
- **Migrations:** SQL migration files in `supabase/migrations`, version-controlled.

---

## 12. Non-functional / security summary
- All tables RLS-on; money + invoices unreadable by non-admins **at the database**.
- Job claim atomic (first-write-wins) via `claim_job()`.
- Mapbox token domain-restricted; service-role key never shipped to client.
- Reduced-motion + keyboard focus honored; both themes meet contrast.
- Postgres backups (Supabase daily on paid; export routine on free).

---

## 13. Build order (feeds the Superpowers plan)
1. Supabase project + schema + RLS + `claim_job()` + seed data.
2. Auth + role plumbing + route guards.
3. Customers (list, profile, typeahead) — the entity everything hangs off.
4. Leads kanban + map drop-pin (creates customer+lead).
5. Jobs board + realtime claim (rpc).
6. Invoices + PDF (admin) + dashboard revenue.
7. Exports, dashboard polish, PWA manifest/SW.
8. QA/verify → deploy MVP. Then Phase 2 (Expo) as separate track.
```
```
