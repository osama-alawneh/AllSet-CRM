-- Owner request #10 (2026-07-08): deleting a lead/job should be recoverable, not
-- destructive — admins get a History view + Restore instead of a silent hard delete.
-- deleted_at timestamptz (NULL = active); every id-scoped mutation across the CRUD/status/
-- claim RPCs is closed to soft-deleted rows, and the money-free views hide them from
-- everyone (including admins reading through the views).
alter table leads add column deleted_at timestamptz;
alter table jobs  add column deleted_at timestamptz;

-- 1) Views hide deleted rows. leads_public's current definition (0014) has no where clause
--    and no security_invoker option — recreated verbatim (CREATE OR REPLACE: same column
--    list/order, so no drop needed, existing grant carries over; re-granted below anyway to
--    match the brief's checklist and remove any ambiguity).
create or replace view leads_public as
  select id, customer_id, status, service, stories, panes, note, created_at, description, updated_at
  from leads
  where deleted_at is null;

-- jobs_public's current definition is 0018's (timestamptz scheduled_date), no security_invoker
-- option either. Same column list/order; the OR-chain is wrapped in parens so `and deleted_at
-- is null` applies across the whole role filter, not just the last branch.
create or replace view jobs_public as
  select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at, description, updated_at
  from jobs
  where (status = 'unclaimed'
     or claimed_by = auth.uid()
     or coalesce(auth_role() in ('admin','rep'), false))
    and deleted_at is null;

grant select on leads_public to authenticated;
grant select on jobs_public to authenticated;

-- 2) delete_lead / delete_job (0014 signatures/role checks, unchanged) become soft: flip
--    deleted_at instead of removing the row. jobs.lead_id is no longer nulled by an ON DELETE
--    SET NULL trigger when a lead is "deleted" (the row is never actually removed), so a job's
--    lead_id keeps pointing at its (now-hidden) origin lead — this is the intended history-
--    preserving behavior, not a regression.
create or replace function delete_lead(p_lead_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare deleted int;
begin
  if coalesce(public.auth_role() = 'admin', false) is not true then
    raise exception 'Not authorized to delete leads';
  end if;
  update public.leads set deleted_at = now()
    where id = p_lead_id and deleted_at is null;
  get diagnostics deleted = row_count;
  if deleted = 0 then raise exception 'Lead % not found', p_lead_id; end if;
end $$;

create or replace function delete_job(p_job_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare deleted int;
begin
  if coalesce(public.auth_role() = 'admin', false) is not true then
    raise exception 'Not authorized to delete jobs';
  end if;
  update public.jobs set deleted_at = now()
    where id = p_job_id and deleted_at is null;
  get diagnostics deleted = row_count;
  if deleted = 0 then raise exception 'Job % not found', p_job_id; end if;
end $$;

-- 3) restore_lead / restore_job: same admin-only skeleton as delete_lead/delete_job, inverse
--    guard and effect.
create function restore_lead(p_lead_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare restored int;
begin
  if coalesce(public.auth_role() = 'admin', false) is not true then
    raise exception 'Not authorized to restore leads';
  end if;
  update public.leads set deleted_at = null
    where id = p_lead_id and deleted_at is not null;
  get diagnostics restored = row_count;
  if restored = 0 then raise exception 'Lead % not found', p_lead_id; end if;
end $$;

create function restore_job(p_job_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare restored int;
begin
  if coalesce(public.auth_role() = 'admin', false) is not true then
    raise exception 'Not authorized to restore jobs';
  end if;
  update public.jobs set deleted_at = null
    where id = p_job_id and deleted_at is not null;
  get diagnostics restored = row_count;
  if restored = 0 then raise exception 'Job % not found', p_job_id; end if;
end $$;

grant execute on function restore_lead(bigint) to authenticated;
grant execute on function restore_job(bigint) to authenticated;

-- 4) Sweep: every remaining `where id = ...` mutation on leads/jobs gains
--    `and deleted_at is null` so a soft-deleted row is dead to every other RPC too.

-- claim_job: current definition is 0016's (SEC-1 return-type narrowing to bigint), role
-- check + atomic first-write-wins guard unchanged.
create or replace function claim_job(p_job_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','cleaner'), false) is not true then
    raise exception 'Not authorized to claim jobs';
  end if;
  update public.jobs set status='claimed', claimed_by=auth.uid()
   where id=p_job_id and status='unclaimed' and deleted_at is null
  returning id into v_id;
  if v_id is null then raise exception 'Job already claimed'; end if;
  return v_id;
end $$;

-- set_lead_status: current definition is 0007's, unchanged otherwise.
create or replace function set_lead_status(p_lead_id bigint, p_status lead_status)
returns void language plpgsql security definer set search_path = '' as $$
declare updated int;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to update leads';
  end if;
  update public.leads set status = p_status where id = p_lead_id and deleted_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'Lead % not found', p_lead_id;
  end if;
end $$;

-- set_job_status: current definition is 0010's, both branches gated.
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
     where id = p_job_id and deleted_at is null;
    get diagnostics updated = row_count;
  elsif v_role = 'cleaner' and p_status in ('claimed','in_progress','done') then
    update public.jobs
       set status = p_status
     where id = p_job_id and claimed_by = v_uid and deleted_at is null;
    get diagnostics updated = row_count;
  else
    raise exception 'Not authorized';
  end if;
  if updated = 0 then
    raise exception 'Job % not found or not yours', p_job_id;
  end if;
end $$;

-- update_lead: current definition is 0014's, unchanged otherwise.
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
   where id = p_lead_id and deleted_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Lead % not found', p_lead_id; end if;
end $$;

-- update_job: current definition is 0018's (timestamptz p_scheduled_date), unchanged otherwise.
create or replace function update_job(
  p_job_id bigint, p_service text, p_description text,
  p_scheduled_date timestamptz, p_price numeric default null
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
   where id = p_job_id and deleted_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Job % not found', p_job_id; end if;
end $$;
