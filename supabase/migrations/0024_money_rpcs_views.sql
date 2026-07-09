-- Money model phase 2 (owner requests 1-4, spec 2026-07-08-money-model-design.md, Task 2 of
-- the 0023-0024 implementation plan). Adds the join-request workflow (request_join/decide_join
-- /can_decide_join), expense writes (add_expense/delete_expense), the payout-on-done side
-- effect in set_job_status, and the earnings/revenue reporting views.
--
-- Provenance sweep (grepped every migration 0001-0023 for `create or replace function`/
-- `create view`/`create or replace view` of each recreated object; verified by reading each
-- candidate migration in full, not just trusting a plan's parenthetical hint — 0021 and 0023
-- both merely MENTION claim_job/create_job/update_job/jobs_public/set_job_status in comments
-- without redefining them, which would have been a stale-hint trap):
--   claim_job      copied from 0020 (soft-delete sweep; return-type/role-check body is
--                  0016's, 0020 only added `and deleted_at is null` to the claim UPDATE)
--   create_job     copied from 0018 (job_datetime; timestamptz p_scheduled_date) — no later
--                  migration redefines create_job; 0020's sweep only touched update_job
--   update_job     copied from 0020 (soft-delete sweep added `and deleted_at is null`,
--                  layered on top of 0018's timestamptz body)
--   set_job_status copied from 0020 (soft-delete sweep added `and deleted_at is null` to
--                  both the admin and cleaner branches of 0010's body)
--   jobs_public    copied from 0020 (soft-delete sweep; same column list/order as 0018,
--                  `and deleted_at is null` added to the role-filter WHERE clause)

-- claim_job: signature unchanged (p_job_id bigint) — CREATE OR REPLACE keeps the existing
-- grant. Body is 0020's verbatim; the only delta is the job_members owner-row upsert appended
-- after the claim succeeds (before the RETURN), per the brief.
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
  insert into public.job_members (job_id, cleaner_id, status, is_owner, requested_at, decided_at, decided_by)
  values (p_job_id, auth.uid(), 'approved', true, now(), now(), auth.uid())
  on conflict (job_id, cleaner_id) do update
    set status = 'approved', is_owner = true, decided_at = now(), decided_by = excluded.decided_by;
  return v_id;
end $$;

-- set_job_status: signature unchanged — CREATE OR REPLACE keeps the existing grant. Body is
-- 0020's verbatim; the only delta is the done_at/auto-payout block appended after the existing
-- not-found guard, per the brief.
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
  if p_status = 'done' then
    update public.jobs set done_at = coalesce(done_at, now()) where id = p_job_id;
    insert into public.expenses (label, amount, spent_on, job_id, source, created_by)
    select 'Cleaner payout — job ' || j.id, j.cleaner_amount, current_date, j.id, 'job_payout', auth.uid()
      from public.jobs j
     where j.id = p_job_id and coalesce(j.cleaner_amount, 0) > 0
    on conflict (job_id) where source = 'job_payout' do nothing;
  else
    update public.jobs set done_at = null where id = p_job_id and done_at is not null;
    delete from public.expenses where job_id = p_job_id and source = 'job_payout';
  end if;
end $$;

-- jobs_public: same column list/order as 0020's plus `cleaner_amount` appended at the end
-- (append-only column change, same pattern 0021 used for leads_public + rep_id). Still no
-- `price`, still no `security_invoker`, still the same role/ownership WHERE clause.
create or replace view jobs_public as
  select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at, description, updated_at, cleaner_amount
  from jobs
  where (status = 'unclaimed'
     or claimed_by = auth.uid()
     or coalesce(auth_role() in ('admin','rep'), false))
    and deleted_at is null;

grant select on jobs_public to authenticated;

-- create_job / update_job: adding p_cleaner_amount changes the argument-type signature, so
-- (per 0018's and 0021's precedent) the old signatures are dropped first and re-granted after
-- create, rather than using CREATE OR REPLACE in place.
drop function if exists create_job(bigint, text, text, timestamptz, numeric);
drop function if exists update_job(bigint, text, text, timestamptz, numeric);

create function create_job(
  p_customer_id bigint, p_service text, p_description text,
  p_scheduled_date timestamptz, p_price numeric default null,
  p_cleaner_amount numeric default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if coalesce(public.auth_role() = 'admin', false) is not true then
    raise exception 'Not authorized to create jobs';
  end if;
  insert into public.jobs (customer_id, service, description, scheduled_date, price, cleaner_amount, status)
  values (p_customer_id, p_service, p_description, p_scheduled_date, coalesce(p_price, 0), p_cleaner_amount, 'unclaimed')
  returning id into v_id;
  return v_id;
end $$;

create function update_job(
  p_job_id bigint, p_service text, p_description text,
  p_scheduled_date timestamptz, p_price numeric default null,
  p_cleaner_amount numeric default null
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
         price = coalesce(p_price, price),
         cleaner_amount = coalesce(p_cleaner_amount, cleaner_amount)
   where id = p_job_id and deleted_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Job % not found', p_job_id; end if;
end $$;

grant execute on function create_job(bigint, text, text, timestamptz, numeric, numeric) to authenticated;
grant execute on function update_job(bigint, text, text, timestamptz, numeric, numeric) to authenticated;

-- New functions (join-request workflow + expense writes) ------------------------------------

create or replace function public.can_decide_join(p_job_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  -- APPROVAL POLICY LIVES HERE AND ONLY HERE. Owner may later restrict to admin-only:
  -- replace this body (drop the `or exists` branch) in a new migration; nothing else changes.
  select public.auth_role() = 'admin'
      or exists (select 1 from public.job_members
                  where job_id = p_job_id and cleaner_id = auth.uid()
                    and status = 'approved' and is_owner)
$$;
grant execute on function public.can_decide_join(bigint) to authenticated;

create or replace function public.request_join(p_job_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
begin
  if public.auth_role() <> 'cleaner' then
    raise exception 'Only cleaners can request to join a job';
  end if;
  select * into v_job from public.jobs where id = p_job_id and deleted_at is null;
  if not found then raise exception 'Job % not found', p_job_id; end if;
  if v_job.claimed_by is null then raise exception 'Job is not claimed yet — claim it instead'; end if;
  if v_job.status = 'done' then raise exception 'Job is already done'; end if;
  if exists (select 1 from public.job_members
              where job_id = p_job_id and cleaner_id = v_uid and status in ('pending','approved')) then
    raise exception 'Already requested or already a member';
  end if;
  insert into public.job_members (job_id, cleaner_id, status, requested_at)
  values (p_job_id, v_uid, 'pending', now())
  on conflict (job_id, cleaner_id) do update
    set status = 'pending', requested_at = now(), decided_at = null, decided_by = null;
end $$;
grant execute on function public.request_join(bigint) to authenticated;

create or replace function public.decide_join(p_member_id bigint, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.job_members;
begin
  select * into v_member from public.job_members where id = p_member_id;
  if not found then raise exception 'Join request % not found', p_member_id; end if;
  if v_member.status <> 'pending' then raise exception 'Request already decided'; end if;
  if exists (select 1 from public.jobs where id = v_member.job_id and status = 'done') then
    raise exception 'Job is already done — the payout split is final';
  end if;
  if not public.can_decide_join(v_member.job_id) then
    raise exception 'Not authorized to decide join requests for this job';
  end if;
  update public.job_members
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = auth.uid()
   where id = p_member_id;
end $$;
grant execute on function public.decide_join(bigint, boolean) to authenticated;

create or replace function public.add_expense(
  p_label text, p_amount numeric, p_spent_on date, p_job_id bigint default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if public.auth_role() not in ('admin','rep') then raise exception 'Not authorized'; end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'Label required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_job_id is not null
     and not exists (select 1 from public.jobs where id = p_job_id and deleted_at is null) then
    raise exception 'Job % not found', p_job_id;
  end if;
  insert into public.expenses (label, amount, spent_on, job_id, source, created_by)
  values (btrim(p_label), p_amount, coalesce(p_spent_on, current_date), p_job_id, 'manual', auth.uid())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.add_expense(text, numeric, date, bigint) to authenticated;

create or replace function public.delete_expense(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_source text;
begin
  if public.auth_role() not in ('admin','rep') then raise exception 'Not authorized'; end if;
  select source into v_source from public.expenses where id = p_id;
  if not found then raise exception 'Expense % not found', p_id; end if;
  if v_source <> 'manual' then
    raise exception 'Auto payout rows are managed by job status';
  end if;
  delete from public.expenses where id = p_id;
end $$;
grant execute on function public.delete_expense(bigint) to authenticated;

-- New views (earnings + revenue reporting) ---------------------------------------------------

-- THE single source of split math. Per approved member of each Done, non-deleted job.
create view public.cleaner_earnings as
select
  jm.cleaner_id,
  j.id as job_id,
  j.done_at,
  (j.cleaner_amount / cnt.approved_count)::numeric as share
from public.jobs j
join public.job_members jm on jm.job_id = j.id and jm.status = 'approved'
join lateral (
  select count(*)::numeric as approved_count
  from public.job_members m
  where m.job_id = j.id and m.status = 'approved'
) cnt on true
where j.status = 'done'
  and j.deleted_at is null
  and j.done_at is not null
  and coalesce(j.cleaner_amount, 0) > 0;
grant select on public.cleaner_earnings to authenticated;  -- transparent leaderboard (owner call)

-- Admin/rep only: role gate INSIDE the view (cleaners get zero rows, not an error).
create view public.company_revenue as
with rev as (
  select to_char(done_at, 'YYYY-MM') as month, sum(price) as job_revenue
  from public.jobs
  where status = 'done' and deleted_at is null and done_at is not null
  group by 1
),
exp as (
  select to_char(spent_on, 'YYYY-MM') as month, sum(amount) as expenses
  from public.expenses
  group by 1
)
select
  coalesce(r.month, e.month) as month,
  coalesce(r.job_revenue, 0) as job_revenue,
  coalesce(e.expenses, 0)    as expenses,
  coalesce(r.job_revenue, 0) - coalesce(e.expenses, 0) as net
from rev r
full outer join exp e on e.month = r.month
where public.auth_role() in ('admin','rep');
grant select on public.company_revenue to authenticated;
