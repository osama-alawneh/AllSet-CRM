begin;
select plan(4);
select has_table('public','customers','customers table exists');
select has_table('public','jobs','jobs table exists');
select col_type_is('public','jobs','status','job_status','jobs.status is job_status enum');
-- SEC-2 (0016): job_photos must keep RLS enabled (no policies yet = deny-all for
-- authenticated until Phase 2 actually uses the table). A future migration disabling
-- RLS here would silently re-open the table — pin it.
select ok((select relrowsecurity from pg_class where oid = 'public.job_photos'::regclass),
  'job_photos has row level security enabled');
select * from finish();
rollback;
