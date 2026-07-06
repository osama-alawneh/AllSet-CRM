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
