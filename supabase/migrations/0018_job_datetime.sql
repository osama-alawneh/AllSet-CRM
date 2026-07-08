-- Owner request 2026-07-08: jobs need a time, not just a day.
-- jobs_public selects scheduled_date, so it must be dropped and recreated
-- verbatim (copy the CURRENT definition from 0016 — do not improvise).
drop view if exists jobs_public;

alter table jobs
  alter column scheduled_date type timestamptz
  using scheduled_date::timestamptz;  -- existing dates become midnight local server time

-- Recreated EXACTLY as 0016 defines it: same columns, same where clause. 0016's view has
-- NO security_invoker option (it deliberately runs as owner; auth.uid()/auth_role() read
-- the caller's JWT, so the filter is still per-caller) — do not add one here.
create view jobs_public as
  select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at, description, updated_at
  from jobs
  where status = 'unclaimed'
     or claimed_by = auth.uid()
     or coalesce(auth_role() in ('admin','rep'), false);

grant select on jobs_public to authenticated;

-- create_job/update_job (0014) took scheduled_date as `date`, which would silently truncate
-- any time component the new datetime-local input sends (implicit text->date cast just drops
-- the time, no error). Argument-type changes require DROP (create or replace can't change a
-- signature); pgTAP's `current_date` / `current_date + 1` / `null` call sites all still work
-- unchanged (date -> timestamptz is an implicit cast).
drop function if exists create_job(bigint, text, text, date, numeric);
drop function if exists update_job(bigint, text, text, date, numeric);

create function create_job(
  p_customer_id bigint, p_service text, p_description text,
  p_scheduled_date timestamptz, p_price numeric default null
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

create function update_job(
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
   where id = p_job_id;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Job % not found', p_job_id; end if;
end $$;

grant execute on function create_job(bigint, text, text, timestamptz, numeric) to authenticated;
grant execute on function update_job(bigint, text, text, timestamptz, numeric) to authenticated;
