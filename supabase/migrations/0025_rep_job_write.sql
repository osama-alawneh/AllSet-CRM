-- Rep job-money write parity (spec 2026-07-08-money-model-design.md: "Jobs carry two money
-- fields: price and cleaner_amount. Admin AND rep see/set both — this widens the previous
-- admin-only job-money rule."). The money-model plan's Task 8 acceptance walkthrough has a
-- rep creating a job with price 200 + pot 80 and seeing both numbers.
--
-- create_job/update_job bodies below are copied VERBATIM from 0024 (which itself carried the
-- role guard forward unchanged from the 0014/0018-era admin-only rule) with exactly one delta
-- each: the role guard widens `public.auth_role() = 'admin'` to
-- `public.auth_role() in ('admin','rep')`, matching 0024's own coalesce/is-not-true idiom.
-- Same signatures as 0024 (no arg-list change), so CREATE OR REPLACE keeps the existing grant
-- lineage; the grants are re-issued below anyway to match 0024's explicit-grant style.

create or replace function create_job(
  p_customer_id bigint, p_service text, p_description text,
  p_scheduled_date timestamptz, p_price numeric default null,
  p_cleaner_amount numeric default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to create jobs';
  end if;
  insert into public.jobs (customer_id, service, description, scheduled_date, price, cleaner_amount, status)
  values (p_customer_id, p_service, p_description, p_scheduled_date, coalesce(p_price, 0), p_cleaner_amount, 'unclaimed')
  returning id into v_id;
  return v_id;
end $$;

create or replace function update_job(
  p_job_id bigint, p_service text, p_description text,
  p_scheduled_date timestamptz, p_price numeric default null,
  p_cleaner_amount numeric default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare updated int;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to update jobs';
  end if;
  update public.jobs
     set service = p_service, description = p_description,
         scheduled_date = p_scheduled_date,
         price = coalesce(p_price, price),
         cleaner_amount = coalesce(p_cleaner_amount, cleaner_amount)
   where id = p_job_id and deleted_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Job % not found', p_job_id; end if;
end $$;

grant execute on function create_job(bigint, text, text, timestamptz, numeric, numeric) to authenticated;
grant execute on function update_job(bigint, text, text, timestamptz, numeric, numeric) to authenticated;
