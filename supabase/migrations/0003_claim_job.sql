-- Race-safe job claim. First-write-wins: the `where status='unclaimed'` guard is
-- the atomicity mechanism -- concurrent claims contend on the same row, exactly
-- one UPDATE matches, the loser's UPDATE returns no row and raises. This is a
-- single atomic statement, never a read-then-write.
--
-- SECURITY DEFINER so the claim bypasses the select-only RLS on jobs (there is no
-- update policy for cleaners). Pinned search_path keeps the definer-rights
-- function from resolving unqualified names against a caller-controlled schema,
-- matching the auth_role() hardening in 0002.
create or replace function claim_job(p_job_id bigint)
returns jobs language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  update public.jobs set status='claimed', claimed_by=auth.uid()
   where id=p_job_id and status='unclaimed'
  returning * into j;
  if j.id is null then raise exception 'Job already claimed'; end if;
  return j;
end $$;

grant execute on function claim_job(bigint) to authenticated;
