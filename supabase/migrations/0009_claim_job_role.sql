-- PRD role matrix: only Admin + Cleaner may claim jobs; Rep is view-only. The original
-- claim_job (0003) had NO role check, so a rep could claim (a PRD violation). Re-create
-- it with a NULL-safe role guard at the top: coalesce(... in (...), false) so a roleless
-- caller (where `IN` yields NULL) is rejected, not silently allowed. The atomic
-- `where status='unclaimed'` guard is unchanged — first-write-wins, the loser's UPDATE
-- matches no row and raises 'Job already claimed'.
create or replace function claim_job(p_job_id bigint)
returns jobs language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  if coalesce(public.auth_role() in ('admin','cleaner'), false) is not true then
    raise exception 'Not authorized to claim jobs';
  end if;
  update public.jobs set status='claimed', claimed_by=auth.uid()
   where id=p_job_id and status='unclaimed'
  returning * into j;
  if j.id is null then raise exception 'Job already claimed'; end if;
  return j;
end $$;

grant execute on function claim_job(bigint) to authenticated;
