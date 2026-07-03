begin;
select plan(12);

-- fixtures
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-j@test.dev'),
  ('90000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-j@test.dev'),
  ('90000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-j@test.dev'),
  ('90000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner2-j@test.dev'),
  ('90000000-0000-0000-0000-000000000034','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-roleless-j@test.dev');
-- NOTE: no profiles row for ...034 — deliberately roleless (auth_role() returns NULL).
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000030','Admin Job','admin'),
  ('90000000-0000-0000-0000-000000000031','Rep Job','rep'),
  ('90000000-0000-0000-0000-000000000032','Cleaner Job','cleaner'),
  ('90000000-0000-0000-0000-000000000033','Cleaner Two Job','cleaner');
insert into customers(id,name) overriding system value values (900030,'Job Co');
insert into jobs(id,customer_id,status) overriding system value values (900301,900030,'unclaimed');
insert into jobs(id,customer_id,status,claimed_by) overriding system value values
  (900302,900030,'claimed','90000000-0000-0000-0000-000000000032'),
  (900303,900030,'claimed','90000000-0000-0000-0000-000000000032');

-- 1. realtime: the AFTER trigger wrote a broadcast ping to realtime.messages on 'jobs'
--    (the three job inserts above fired notify_job_change()).
select isnt_empty(
  $$ select 1 from realtime.messages where topic = 'jobs' and extension = 'broadcast' $$,
  'job write broadcasts a change ping to realtime.messages'
);

set local role authenticated;

-- (as admin) ------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000030"}';
-- 2 + 3. admin may set any status
select lives_ok($$ select set_job_status(900301, 'claimed'::job_status) $$, 'admin set_job_status runs');
select is((select status from jobs_public where id=900301), 'claimed'::job_status, 'admin status change persisted');
-- 4 + 5. admin unclaim clears claimed_by (rides along)
select lives_ok($$ select set_job_status(900303, 'unclaimed'::job_status) $$, 'admin unclaim runs');
select ok((select claimed_by is null from jobs_public where id=900303), 'admin unclaim cleared claimed_by');

-- (as cleaner owner ...032) ---------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000032"}';
-- 6 + 7. cleaner may advance their own job
select lives_ok($$ select set_job_status(900302, 'in_progress'::job_status) $$, 'cleaner owner set_job_status runs');
select is((select status from jobs_public where id=900302), 'in_progress'::job_status, 'cleaner owner status persisted');
-- 8. cleaner may NOT unclaim (not in allowed set)
select throws_ok($$ select set_job_status(900302, 'unclaimed'::job_status) $$, 'P0001', 'Not authorized', 'cleaner cannot unclaim');

-- (as cleaner NON-owner ...033) ------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000033"}';
-- 9. cleaner may not touch a job they do not own (0 rows -> not-found-or-not-yours)
select throws_ok($$ select set_job_status(900302, 'done'::job_status) $$, 'P0001', 'Job 900302 not found or not yours', 'cleaner non-owner blocked');

-- (as rep ...031) -------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}';
-- 10. rep denied entirely
select throws_ok($$ select set_job_status(900301, 'claimed'::job_status) $$, 'P0001', 'Not authorized', 'rep set_job_status blocked');

-- (as roleless ...034) --------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000034"}';
-- 11. NULL-role caller denied (regression: NULL role must fall through to the else)
select throws_ok($$ select set_job_status(900301, 'claimed'::job_status) $$, 'P0001', 'Not authorized', 'roleless set_job_status blocked');

-- (as admin) ------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000030"}';
-- 12. unknown job id raises the not-found guard
select throws_ok($$ select set_job_status(999999999, 'done'::job_status) $$, 'P0001', 'Job 999999999 not found or not yours', 'unknown job raises');

select * from finish();
rollback;
