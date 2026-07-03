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
