-- Money model — whole-branch review fixes (feat/money-model, 2026-07-09). One migration,
-- four sectioned deltas. Every recreated object copies its NEWEST body (all four live in
-- 0024 — verified nothing between 0024 and 0025 redefines any of them; 0025 only widened
-- the create_job/update_job execute grants) with a single described delta each. Security
-- definer / search_path / grants are preserved; grants re-issued to match each brief's
-- checklist. Bodies copied from 0024_money_rpcs_views.sql.
--
-- Fix 1 (CRITICAL) — jobs_public: cleaners could not reach the join-request flow because the
--   view hid every job they neither owned nor could claim. Owner decision 2026-07-09:
--   cleaners see ALL non-deleted jobs (any status, including done and colleague-claimed);
--   foreign claimed jobs are view-only (interaction gating lives in the RPCs + UI, not the
--   view). Soft-deleted jobs stay hidden from everyone. WHERE collapses to `deleted_at is
--   null`; column list/order unchanged (still NO price, still cleaner_amount at the end).
-- Fix 2 (IMPORTANT) — set_job_status: admin unclaim nulled claimed_by but left stale approved
--   job_members, so a later claim inherited colleagues and inflated the split. Delta: the
--   admin unclaim path also wipes job_members for the job (a re-claim re-creates the owner
--   row). done_at / auto-payout logic kept byte-identical.
-- Fix 3 (IMPORTANT) — company_revenue: soft-deleting a done job dropped its revenue (the rev
--   CTE already filters deleted_at) but left the auto payout counted as an expense, skewing
--   net. Delta: the exp CTE excludes job_payout rows whose job is soft-deleted (manual
--   expenses always counted; self-heals on restore).
-- Fix 4 (MINOR) — decide_join: could approve a request on a soft-deleted job. Delta: raise
--   'Job is deleted' when the underlying job is no longer active.

-- ==== Fix 1: jobs_public — widen cleaner visibility to all non-deleted jobs ================
-- Copied from 0024 (lines ~86-94); the ONLY delta is the WHERE clause (the role/ownership
-- OR-chain is dropped — all authenticated roles now see every non-deleted row).
create or replace view jobs_public as
  select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at, description, updated_at, cleaner_amount
  from jobs
  where deleted_at is null;

grant select on jobs_public to authenticated;

-- ==== Fix 2: set_job_status — admin unclaim resets job_members =============================
-- Copied from 0024 (lines ~46-81) verbatim; the ONLY delta is the `delete from job_members`
-- on the unclaim path. Only an admin can pass p_status='unclaimed' (the cleaner branch is
-- restricted to claimed/in_progress/done, everything else raises), so gating on p_status
-- after the not-found guard keeps this on the admin unclaim path exactly. The done_at /
-- auto-payout block below is unchanged from 0024.
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
  else
    update public.jobs set done_at = null where id = p_job_id and done_at is not null;
    delete from public.expenses where job_id = p_job_id and source = 'job_payout';
  end if;
end $$;

-- ==== Fix 4: decide_join — refuse to decide a request on a soft-deleted job ===============
-- Copied from 0024 (lines ~180-198) verbatim; the ONLY delta is the added soft-delete guard
-- (the job lookup now also considers deleted_at) raising before the done-check.
create or replace function public.decide_join(p_member_id bigint, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.job_members;
begin
  select * into v_member from public.job_members where id = p_member_id;
  if not found then raise exception 'Join request % not found', p_member_id; end if;
  if v_member.status <> 'pending' then raise exception 'Request already decided'; end if;
  if not exists (select 1 from public.jobs where id = v_member.job_id and deleted_at is null) then
    raise exception 'Job is deleted';
  end if;
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

-- ==== Fix 3: company_revenue — auto payout mirrors its job's soft-delete ===================
-- Copied from 0024 (lines ~258-278) verbatim; the ONLY delta is the `where` on the exp CTE
-- excluding auto payout rows whose job is soft-deleted. Manual expenses stay counted always.
create or replace view public.company_revenue as
with rev as (
  select to_char(done_at, 'YYYY-MM') as month, sum(price) as job_revenue
  from public.jobs
  where status = 'done' and deleted_at is null and done_at is not null
  group by 1
),
exp as (
  select to_char(e.spent_on, 'YYYY-MM') as month, sum(e.amount) as expenses
  from public.expenses e
  where not (e.source = 'job_payout'
             and exists (select 1 from public.jobs j
                          where j.id = e.job_id and j.deleted_at is not null))
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
