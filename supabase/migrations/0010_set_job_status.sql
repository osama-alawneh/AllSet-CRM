-- Status changes for the jobs board. Cleaners lack an UPDATE policy on jobs and cannot
-- SELECT the base table (price column), so a plain UPDATE is an RLS no-op for them:
-- route through this SECURITY DEFINER RPC (set_lead_status precedent, 0007). Rules:
--   admin   -> any status; moving to 'unclaimed' also clears claimed_by (unclaim).
--   cleaner -> only claimed/in_progress/done, and only on a job they already claimed
--              (claimed_by = auth.uid()); may NOT unclaim.
--   rep / roleless -> rejected.
-- NULL-safe: a NULL role fails every branch and lands in the final `else` (raise).
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
     where id = p_job_id;
    get diagnostics updated = row_count;
  elsif v_role = 'cleaner' and p_status in ('claimed','in_progress','done') then
    update public.jobs
       set status = p_status
     where id = p_job_id and claimed_by = v_uid;
    get diagnostics updated = row_count;
  else
    raise exception 'Not authorized';
  end if;
  if updated = 0 then
    raise exception 'Job % not found or not yours', p_job_id;
  end if;
end $$;

grant execute on function set_job_status(bigint, job_status) to authenticated;
comment on function set_job_status is 'Jobs board status changes; definer because cleaners lack UPDATE/SELECT on base jobs (price column).';
