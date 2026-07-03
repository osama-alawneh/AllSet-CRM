-- Realtime board sync via "broadcast from the database": an AFTER trigger emits a tiny
-- ping (id + status only — NEVER price or names) on the 'jobs' topic; every subscribed
-- client debounces it into a router.refresh(). We do NOT touch the publication or the
-- replica identity — realtime.send() writes a broadcast row directly.
--
-- The realtime.send() call is wrapped in begin/exception so a realtime outage can never
-- roll back or block the underlying job write. SECURITY DEFINER + pinned search_path
-- mirror the hardening on the other definer functions (0002/0003/0007).
create or replace function notify_job_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('id', new.id, 'status', new.status),  -- payload
      'change',                                                -- event
      'jobs',                                                  -- topic
      true                                                     -- private
    );
  exception when others then
    null; -- realtime is best-effort; never fail the job write
  end;
  return new;
end $$;

create trigger jobs_notify_change
  after insert or update on public.jobs
  for each row execute function notify_job_change();

-- A private broadcast requires the subscriber to pass RLS on realtime.messages. Allow any
-- authenticated user to read the 'jobs' broadcast topic — the ping carries no sensitive
-- data (price/names are fetched server-side through role-split RLS on refresh).
create policy jobs_topic_read on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'jobs' and extension = 'broadcast');
