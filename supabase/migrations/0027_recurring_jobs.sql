-- Recurring jobs (owner item 12, spec 2026-07-09-money-polish-recurring-design.md).
-- Provenance sweep (grepped every migration 0001-0026 for `create or replace function`/`create
-- function` of each recreated object, verified newest by reading the candidate in full):
--   set_job_status         newest body is 0026 (Fix 2: admin unclaim also wipes job_members;
--                           done_at/auto-payout block unchanged from 0024/0020/0010's lineage)
--   create_job / update_job newest body is 0025 (role guard widened to admin/rep; same 6-arg
--                           signature as 0024, so 0025 used CREATE OR REPLACE in place)

-- ==== Schema: recur_days + recur_parent_id + once-only spawn guard =========================
alter table jobs add column recur_days int
  check (recur_days is null or recur_days > 0);
alter table jobs add column recur_parent_id bigint references jobs(id);
-- A finished job spawns at most one successor, ever — done-bounces and deleted
-- successors alike cannot respawn (owner edits the chain's newest job instead).
create unique index jobs_one_spawn_per_parent on jobs (recur_parent_id)
  where recur_parent_id is not null;

-- ==== create_job / update_job: add p_recur_days int default null as the LAST parameter =====
-- Adding a parameter changes the argument-type signature, so (per 0024's precedent for the
-- p_cleaner_amount addition) the old 6-arg signatures are dropped first and re-granted after
-- create, rather than using CREATE OR REPLACE in place. Bodies below are 0025's verbatim (role
-- guard `public.auth_role() in ('admin','rep')`) plus: the shared p_recur_days validation, and
-- the write-semantics delta on the recur_days column (create: 0 or omitted -> NULL; update:
-- null keeps, 0 clears, matching the blankMoneyToZero form-boundary convention).
drop function if exists create_job(bigint, text, text, timestamptz, numeric, numeric);
drop function if exists update_job(bigint, text, text, timestamptz, numeric, numeric);

create function create_job(
  p_customer_id bigint, p_service text, p_description text,
  p_scheduled_date timestamptz, p_price numeric default null,
  p_cleaner_amount numeric default null, p_recur_days int default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to create jobs';
  end if;
  if p_recur_days is not null and p_recur_days < 0 then
    raise exception 'Repeat days must be positive';
  end if;
  insert into public.jobs (customer_id, service, description, scheduled_date, price, cleaner_amount, status, recur_days)
  values (p_customer_id, p_service, p_description, p_scheduled_date, coalesce(p_price, 0), p_cleaner_amount, 'unclaimed',
          case when coalesce(p_recur_days, 0) = 0 then null else p_recur_days end)
  returning id into v_id;
  return v_id;
end $$;

create function update_job(
  p_job_id bigint, p_service text, p_description text,
  p_scheduled_date timestamptz, p_price numeric default null,
  p_cleaner_amount numeric default null, p_recur_days int default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare updated int;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to update jobs';
  end if;
  if p_recur_days is not null and p_recur_days < 0 then
    raise exception 'Repeat days must be positive';
  end if;
  update public.jobs
     set service = p_service, description = p_description,
         scheduled_date = p_scheduled_date,
         price = coalesce(p_price, price),
         cleaner_amount = coalesce(p_cleaner_amount, cleaner_amount),
         recur_days = case when p_recur_days is null then recur_days
                           when p_recur_days = 0 then null
                           else p_recur_days end
   where id = p_job_id and deleted_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Job % not found', p_job_id; end if;
end $$;

grant execute on function create_job(bigint, text, text, timestamptz, numeric, numeric, int) to authenticated;
grant execute on function update_job(bigint, text, text, timestamptz, numeric, numeric, int) to authenticated;

-- ==== set_job_status: spawn a successor when a recurring job is marked done ================
-- Copied from 0026 verbatim; the ONLY delta is the insert block appended after the existing
-- payout-expense insert, inside the `if p_status = 'done'` branch. The bounce-back branch
-- (leaving done) is untouched — it deletes the payout expense as before but does not touch any
-- successor row (spec: real scheduled work survives).
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
  if p_status = 'unclaimed' then
    -- Reset membership: nulling claimed_by without this left stale approved colleagues that
    -- would inflate the split on the next claim. A re-claim re-creates the owner row.
    delete from public.job_members where job_id = p_job_id;
  end if;
  if p_status = 'done' then
    update public.jobs set done_at = coalesce(done_at, now()) where id = p_job_id;
    insert into public.expenses (label, amount, spent_on, job_id, source, created_by)
    select 'Cleaner payout — job ' || j.id, j.cleaner_amount, current_date, j.id, 'job_payout', auth.uid()
      from public.jobs j
     where j.id = p_job_id and coalesce(j.cleaner_amount, 0) > 0
    on conflict (job_id) where source = 'job_payout' do nothing;
    insert into public.jobs
      (customer_id, service, description, scheduled_date, price, cleaner_amount,
       status, recur_days, recur_parent_id)
    select j.customer_id, j.service, j.description,
           coalesce(j.scheduled_date, now()) + make_interval(days => j.recur_days),
           j.price, j.cleaner_amount, 'unclaimed', j.recur_days, j.id
      from public.jobs j
     where j.id = p_job_id and coalesce(j.recur_days, 0) > 0
    on conflict (recur_parent_id) where recur_parent_id is not null do nothing;
  else
    update public.jobs set done_at = null where id = p_job_id and done_at is not null;
    delete from public.expenses where job_id = p_job_id and source = 'job_payout';
  end if;
end $$;
