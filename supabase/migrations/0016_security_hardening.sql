-- SEC-1: claim_job returned the full jobs row — including price — so a cleaner calling
-- POST /rest/v1/rpc/claim_job directly could read money for any job they claim. The app
-- ignores the return value (jobs/actions.ts checks only `error`), so returning the claimed
-- id is a pure narrowing. Return type changes require DROP (create or replace can't).
drop function if exists claim_job(bigint);

create function claim_job(p_job_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','cleaner'), false) is not true then
    raise exception 'Not authorized to claim jobs';
  end if;
  update public.jobs set status='claimed', claimed_by=auth.uid()
   where id=p_job_id and status='unclaimed'
  returning id into v_id;
  if v_id is null then raise exception 'Job already claimed'; end if;
  return v_id;
end $$;

grant execute on function claim_job(bigint) to authenticated;

-- SEC-2: job_photos (0001) was the only table without RLS. No policies yet = deny-all
-- for authenticated; Phase 2 adds policies when the table is actually used.
alter table job_photos enable row level security;

-- SEC-3 (decision 2026-07-07): PRD §6.5 "cleaner sees only claimable + own" moves from
-- app-side (lib/jobs.ts visibleJobs) into the view. View runs as owner, but auth.uid()/
-- auth_role() read the caller's JWT, so the filter is per-caller. Column list must match
-- 0014 exactly (create or replace view requirement).
create or replace view jobs_public as
  select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at, description, updated_at
  from jobs
  where status = 'unclaimed'
     or claimed_by = auth.uid()
     or coalesce(auth_role() in ('admin','rep'), false);

-- SEC-4: 0015 re-granted created_by/created_at/updated_at, letting a rep spoof authorship
-- timestamps via direct PostgREST writes. The definer RPCs stamp these themselves, and the
-- pgTAP direct writes (leads_map.sql) touch only customer_id/status/service — so drop the
-- three audit columns from the grant lists. (Integrity fix; money was already excluded.)
revoke insert, update on leads from authenticated;
grant insert (customer_id, status, service, stories, panes, note, description)
  on leads to authenticated;
grant update (customer_id, status, service, stories, panes, note, description)
  on leads to authenticated;
