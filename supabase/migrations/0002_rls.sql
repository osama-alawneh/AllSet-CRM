-- SECURITY DEFINER so this bypasses RLS on profiles: it is called from the
-- profiles_self policy, and an invoker-rights read of profiles here would recurse
-- into that policy infinitely (and also require a profiles grant). Pinned
-- search_path keeps the definer-rights function from resolving unqualified names
-- against a caller-controlled schema.
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table customers      enable row level security;
alter table leads          enable row level security;
alter table jobs           enable row level security;
alter table invoices       enable row level security;
alter table invoice_items  enable row level security;
alter table profiles       enable row level security;

create policy profiles_self on profiles for select using (id = auth.uid() or auth_role() = 'admin');
create policy customers_read on customers for select using (auth.uid() is not null);

create view leads_public as select id, customer_id, status, service, stories, panes, note, created_at from leads;
create view jobs_public  as select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at from jobs;

create policy leads_admin on leads for select using (auth_role() = 'admin');
create policy jobs_admin  on jobs  for select using (auth_role() = 'admin');
grant select on leads_public, jobs_public to authenticated;

create policy invoices_admin on invoices for all using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy items_admin    on invoice_items for all using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- Logged-in users share the Postgres `authenticated` role; row-level access is
-- restricted to admins by the policies above. These table grants are required so
-- admins pass the table-privilege check (without them, even admin selects raise
-- permission-denied). RLS still filters non-admin rows to zero.
grant select on invoices, invoice_items to authenticated;
