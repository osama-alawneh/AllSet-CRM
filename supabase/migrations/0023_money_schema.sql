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
