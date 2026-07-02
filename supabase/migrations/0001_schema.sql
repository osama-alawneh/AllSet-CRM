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
