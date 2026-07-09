begin;
select plan(78);

-- fixtures (as postgres/superuser — bypasses RLS + grants, same idiom as other suites) ------
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000060','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-m@test.dev'),
  ('90000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-m@test.dev'),
  ('90000000-0000-0000-0000-000000000062','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-m-a@test.dev'),
  ('90000000-0000-0000-0000-000000000063','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-m-b@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000060','Admin Money','admin'),
  ('90000000-0000-0000-0000-000000000061','Rep Money','rep'),
  ('90000000-0000-0000-0000-000000000062','Cleaner Money A','cleaner'),
  ('90000000-0000-0000-0000-000000000063','Cleaner Money B','cleaner');
insert into customers(id,name) overriding system value values (900060,'Money Co');
insert into jobs(id,customer_id,status,claimed_by,price,cleaner_amount) overriding system value
  values (900060,900060,'done','90000000-0000-0000-0000-000000000062',200,80);
insert into expenses(label,amount,job_id,source,created_by)
  values ('Test payout',80,900060,'manual','90000000-0000-0000-0000-000000000060');
insert into profiles_private(profile_id,phone,dob) values
  ('90000000-0000-0000-0000-000000000062','555-0001','1990-01-01'),
  ('90000000-0000-0000-0000-000000000063','555-0002','1991-02-02');

-- ==== Task 2 (0024): join/expense RPC flow + payout/earnings/revenue money assertions ====
-- Fixtures use the 900070-900079 job/customer range and uuid suffixes 070-074, chosen to
-- avoid colliding with Task 1's money_model fixtures (900060 jobs/customers, uuids 060-063).
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000070','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-f@test.dev'),
  ('90000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-f@test.dev'),
  ('90000000-0000-0000-0000-000000000072','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-f-a@test.dev'),
  ('90000000-0000-0000-0000-000000000073','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-f-b@test.dev'),
  ('90000000-0000-0000-0000-000000000074','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-f-c@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000070','Admin Flow','admin'),
  ('90000000-0000-0000-0000-000000000071','Rep Flow','rep'),
  ('90000000-0000-0000-0000-000000000072','Cleaner Flow A','cleaner'),
  ('90000000-0000-0000-0000-000000000073','Cleaner Flow B','cleaner'),
  ('90000000-0000-0000-0000-000000000074','Cleaner Flow C','cleaner');
insert into customers(id,name) overriding system value values (900070,'Money Flow Co');
-- Plain unclaimed jobs for the request_join/decide_join flow (groups 1-6 below); money
-- amounts are irrelevant here so cleaner_amount is left null.
insert into jobs(id,customer_id,status) overriding system value values
  (900070,900070,'unclaimed'),
  (900071,900070,'unclaimed'),
  (900072,900070,'unclaimed'),
  (900073,900070,'unclaimed'),
  (900074,900070,'unclaimed'),
  (900075,900070,'unclaimed'),
  (900076,900070,'unclaimed');

set local role authenticated;

-- 1. rep reads price + cleaner_amount from base jobs (owner 2026-07-08: rep = admin on job money).
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000061"}';
select is((select price from jobs where id=900060)::numeric, 200::numeric, 'rep reads jobs.price via base table');
select is((select cleaner_amount from jobs where id=900060)::numeric, 80::numeric, 'rep reads jobs.cleaner_amount via base table');

-- 2. cleaner sees zero rows on base jobs (jobs_admin/jobs_rep don't cover cleaner; jobs_public only).
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000062"}';
select is((select count(*)::int from jobs where id=900060), 0, 'cleaner sees zero rows on base jobs (RLS)');

-- 3. DEFERRED to Task 2: cleaner selects cleaner_amount from jobs_public. The view does not
-- yet expose cleaner_amount until 0024 recreates jobs_public — assertion added there.

-- 4. expenses: hidden from cleaner, visible to admin and rep.
select is((select count(*)::int from expenses where label='Test payout'), 0, 'cleaner sees zero rows on expenses (RLS)');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000060"}';
select is((select count(*)::int from expenses where label='Test payout'), 1, 'admin sees expenses row');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000061"}';
select is((select count(*)::int from expenses where label='Test payout'), 1, 'rep sees expenses row');

-- 5. profiles_private: cleaner sees own row only; admin and rep see all rows.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000062"}';
select is((select count(*)::int from profiles_private where profile_id='90000000-0000-0000-0000-000000000063'), 0,
  'cleaner cannot read colleague row in profiles_private');
select is((select count(*)::int from profiles_private where profile_id='90000000-0000-0000-0000-000000000062'), 1,
  'cleaner can read own row in profiles_private');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000060"}';
select is((select count(*)::int from profiles_private where profile_id in
  ('90000000-0000-0000-0000-000000000062','90000000-0000-0000-0000-000000000063')), 2,
  'admin reads all profiles_private rows');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000061"}';
select is((select count(*)::int from profiles_private where profile_id in
  ('90000000-0000-0000-0000-000000000062','90000000-0000-0000-0000-000000000063')), 2,
  'rep reads all profiles_private rows');

-- 6. job_members/expenses writes are RPC-only (0024) — direct inserts denied at the table-grant
-- level, since neither table has an insert/update/delete grant to authenticated.
select throws_ok($$ insert into job_members(job_id,cleaner_id) values (900060,'90000000-0000-0000-0000-000000000061') $$,
  '42501', null, 'rep cannot INSERT into job_members directly (no grant)');
select throws_ok($$ insert into expenses(label,amount) values ('x',1) $$,
  '42501', null, 'rep cannot INSERT into expenses directly (no grant)');

-- 7. (flow group 1) cleaner claims job -> job_members gets an approved, is_owner=true row.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok($$ select claim_job(900070) $$, 'cleaner A claims job 900070');
select is((select status from job_members where job_id=900070 and cleaner_id='90000000-0000-0000-0000-000000000072'),
  'approved', 'claim_job inserts an approved job_members row for the claimer');
select ok((select is_owner from job_members where job_id=900070 and cleaner_id='90000000-0000-0000-0000-000000000072'),
  'claim_job marks the claimer as is_owner');

-- 8. (flow group 2) second cleaner requests to join -> pending row; requesting again while
--    still pending raises.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000073"}';
select lives_ok($$ select request_join(900070) $$, 'cleaner B requests to join 900070');
select is((select status from job_members where job_id=900070 and cleaner_id='90000000-0000-0000-0000-000000000073'),
  'pending', 'request_join inserts a pending row');
select throws_ok($$ select request_join(900070) $$, 'P0001', 'Already requested or already a member',
  'request_join while already pending raises');

-- 9. (flow group 3) decide_join policy: non-owner cleaner denied; rep denied; owner approves
--    (status flips to approved, decided_by stamped); admin can decide too (separate fixture).
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000074"}';
select throws_ok(
  format($$ select decide_join(%s, true) $$,
    (select id from job_members where job_id=900070 and cleaner_id='90000000-0000-0000-0000-000000000073')),
  'P0001', 'Not authorized to decide join requests for this job', 'non-owner cleaner cannot decide_join');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000071"}';
select throws_ok(
  format($$ select decide_join(%s, true) $$,
    (select id from job_members where job_id=900070 and cleaner_id='90000000-0000-0000-0000-000000000073')),
  'P0001', 'Not authorized to decide join requests for this job', 'rep cannot decide_join (policy is owner-or-admin)');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok(
  format($$ select decide_join(%s, true) $$,
    (select id from job_members where job_id=900070 and cleaner_id='90000000-0000-0000-0000-000000000073')),
  'owner cleaner A approves cleaner B''s join request');
select is((select status from job_members where job_id=900070 and cleaner_id='90000000-0000-0000-0000-000000000073'),
  'approved', 'owner-approved join request flips to approved');
select is((select decided_by from job_members where job_id=900070 and cleaner_id='90000000-0000-0000-0000-000000000073'),
  '90000000-0000-0000-0000-000000000072'::uuid, 'decided_by is stamped with the owner who approved');

-- separate fixture: admin can also decide a join request (not just the job owner).
select lives_ok($$ select claim_job(900071) $$, 'cleaner A claims job 900071 (admin-decides fixture)');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000074"}';
select lives_ok($$ select request_join(900071) $$, 'cleaner C requests to join 900071');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok(
  format($$ select decide_join(%s, true) $$,
    (select id from job_members where job_id=900071 and cleaner_id='90000000-0000-0000-0000-000000000074')),
  'admin approves cleaner C''s join request on 900071');
select is((select status from job_members where job_id=900071 and cleaner_id='90000000-0000-0000-0000-000000000074'),
  'approved', 'admin-approved join request flips to approved');
select is((select decided_by from job_members where job_id=900071 and cleaner_id='90000000-0000-0000-0000-000000000074'),
  '90000000-0000-0000-0000-000000000070'::uuid, 'decided_by is stamped with the deciding admin');

-- 10. (flow group 4) a rejected cleaner may request_join again -> row flips back to pending.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok($$ select claim_job(900072) $$, 'cleaner A claims job 900072 (reject/re-request fixture)');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000074"}';
select lives_ok($$ select request_join(900072) $$, 'cleaner C requests to join 900072');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok(
  format($$ select decide_join(%s, false) $$,
    (select id from job_members where job_id=900072 and cleaner_id='90000000-0000-0000-0000-000000000074')),
  'owner rejects cleaner C''s join request');
select is((select status from job_members where job_id=900072 and cleaner_id='90000000-0000-0000-0000-000000000074'),
  'rejected', 'rejected join request is marked rejected');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000074"}';
select lives_ok($$ select request_join(900072) $$, 'rejected cleaner C may request_join again');
select is((select status from job_members where job_id=900072 and cleaner_id='90000000-0000-0000-0000-000000000074'),
  'pending', 'request_join after rejection flips the row back to pending');

-- 11. (flow group 5) request_join raises on an unclaimed job, a soft-deleted job, and a done job.
select throws_ok($$ select request_join(900073) $$, 'P0001', 'Job is not claimed yet — claim it instead',
  'request_join on an unclaimed job raises');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok($$ select claim_job(900074) $$, 'cleaner A claims job 900074 (soft-delete fixture)');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok($$ select delete_job(900074) $$, 'admin soft-deletes job 900074');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000073"}';
select throws_ok($$ select request_join(900074) $$, 'P0001', 'Job 900074 not found',
  'request_join on a soft-deleted job raises');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok($$ select claim_job(900075) $$, 'cleaner A claims job 900075 (done fixture)');
select lives_ok($$ select set_job_status(900075,'done'::job_status) $$, 'cleaner A (owner) marks 900075 done');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000073"}';
select throws_ok($$ select request_join(900075) $$, 'P0001', 'Job is already done',
  'request_join on a done job raises');

-- 12. (flow group 6) decide_join on a request whose job is already done raises -- the split
--     never changes retroactively.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok($$ select claim_job(900076) $$, 'cleaner A claims job 900076 (done-decide fixture)');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000073"}';
select lives_ok($$ select request_join(900076) $$, 'cleaner B requests to join 900076');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok($$ select set_job_status(900076,'done'::job_status) $$, 'cleaner A (owner) marks 900076 done before deciding');
select throws_ok(
  format($$ select decide_join(%s, true) $$,
    (select id from job_members where job_id=900076 and cleaner_id='90000000-0000-0000-0000-000000000073')),
  'P0001', 'Job is already done — the payout split is final', 'decide_join on an already-done job raises');

-- 13. (flow group 7) set_job_status -> done: done_at set, exactly one job_payout expense row
--     equal to the pot; bouncing done -> in_progress -> done still leaves exactly one row and
--     a non-null done_at; done with a null cleaner_amount inserts zero expense rows.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok($$ select create_job(900070,'Money Pot Full','pot job', current_date, 150, 90) $$,
  'admin create_job with p_cleaner_amount runs');
select is((select cleaner_amount from jobs where service='Money Pot Full')::numeric, 90::numeric,
  'create_job persists p_cleaner_amount');
select lives_ok($$ select set_job_status((select id from jobs where service='Money Pot Full'),'done'::job_status) $$,
  'admin marks the pot job done');
select ok((select done_at is not null from jobs where service='Money Pot Full'), 'done_at is set on done');
select is((select count(*)::int from expenses where job_id=(select id from jobs where service='Money Pot Full') and source='job_payout'),
  1, 'exactly one job_payout expense row is created');
select is((select amount from expenses where job_id=(select id from jobs where service='Money Pot Full') and source='job_payout')::numeric,
  90::numeric, 'job_payout expense amount equals the pot (cleaner_amount)');

select lives_ok($$ select set_job_status((select id from jobs where service='Money Pot Full'),'in_progress'::job_status) $$,
  'admin bounces the pot job off done');
select is((select count(*)::int from expenses where job_id=(select id from jobs where service='Money Pot Full') and source='job_payout'),
  0, 'leaving done deletes the job_payout row');
select lives_ok($$ select set_job_status((select id from jobs where service='Money Pot Full'),'done'::job_status) $$,
  'admin marks the pot job done again');
select is((select count(*)::int from expenses where job_id=(select id from jobs where service='Money Pot Full') and source='job_payout'),
  1, 'bouncing done -> in_progress -> done still leaves exactly one job_payout row');
select ok((select done_at is not null from jobs where service='Money Pot Full'), 'done_at is non-null after the bounce');

select lives_ok($$ select create_job(900070,'Money Pot Null','no pot job', current_date, 150, null) $$,
  'admin create_job with null p_cleaner_amount runs');
select lives_ok($$ select set_job_status((select id from jobs where service='Money Pot Null'),'done'::job_status) $$,
  'admin marks the no-pot job done');
select is((select count(*)::int from expenses where job_id=(select id from jobs where service='Money Pot Null') and source='job_payout'),
  0, 'done with a null cleaner_amount inserts zero expense rows');

-- 14. (flow group 8) add_expense/delete_expense role + source guards.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select throws_ok($$ select add_expense('Snacks',10,current_date,null) $$, 'P0001', 'Not authorized',
  'cleaner cannot add_expense');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000071"}';
select lives_ok($$ select add_expense('Flow Supplies',25,current_date,900070) $$, 'rep add_expense succeeds');
select is((select source from expenses where label='Flow Supplies'), 'manual', 'rep-added expense has source=manual');

select throws_ok(
  format($$ select delete_expense(%s) $$,
    (select id from expenses where job_id=(select id from jobs where service='Money Pot Full') and source='job_payout')),
  'P0001', 'Auto payout rows are managed by job status', 'delete_expense on the auto payout row raises');

select lives_ok(
  format($$ select delete_expense(%s) $$, (select id from expenses where label='Flow Supplies')),
  'delete_expense on a manual row succeeds');
select is((select count(*)::int from expenses where label='Flow Supplies'), 0, 'manual expense row is gone after delete');

-- 15. (flow group 9) cleaner_earnings: a done job with a 100 pot and 2 approved members
--     produces two rows of share 50 each, visible to a cleaner session.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok($$ select create_job(900070,'Money Pot Split','split job', current_date, 250, 100) $$,
  'admin create_job for the split-earnings fixture');
-- Stash the identity-generated id in a transaction-local GUC while we still hold the admin
-- role (which can read the base jobs table via the jobs_admin policy): a cleaner session has
-- no SELECT policy on base `jobs` at all (only jobs_public), so re-querying `jobs` by service
-- name under a cleaner role a few lines down would silently return NULL, not an error.
select set_config('test.split_job_id', (select id::text from jobs where service='Money Pot Split'), true);
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok($$ select claim_job(current_setting('test.split_job_id')::bigint) $$,
  'cleaner A claims the split job');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000073"}';
select lives_ok($$ select request_join(current_setting('test.split_job_id')::bigint) $$,
  'cleaner B requests to join the split job');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok(
  format($$ select decide_join(%s, true) $$,
    (select id from job_members where job_id=current_setting('test.split_job_id')::bigint
       and cleaner_id='90000000-0000-0000-0000-000000000073')),
  'owner approves cleaner B on the split job');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok($$ select set_job_status(current_setting('test.split_job_id')::bigint,'done'::job_status) $$,
  'admin marks the split job done');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000074"}';
select is((select count(*)::int from cleaner_earnings where job_id=current_setting('test.split_job_id')::bigint),
  2, 'cleaner_earnings has two rows for the split job, visible to a cleaner session');
select is((select share from cleaner_earnings where job_id=current_setting('test.split_job_id')::bigint
  and cleaner_id='90000000-0000-0000-0000-000000000072')::numeric, 50::numeric, 'owner share is 50');
select is((select share from cleaner_earnings where job_id=current_setting('test.split_job_id')::bigint
  and cleaner_id='90000000-0000-0000-0000-000000000073')::numeric, 50::numeric, 'joined member share is 50');

-- 16. (flow group 10) company_revenue: cleaner session sees zero rows (role-gated inside the
--     view); admin session sees a current-month row where net = job_revenue - expenses.
select is((select count(*)::int from company_revenue), 0, 'cleaner sees zero rows from company_revenue');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select is((select count(*)::int from company_revenue where month = to_char(now(),'YYYY-MM')), 1,
  'admin sees exactly one company_revenue row for the current month');
select ok(
  (select net = job_revenue - expenses from company_revenue where month = to_char(now(),'YYYY-MM')),
  'company_revenue.net = job_revenue - expenses for the current month');

-- 17. (flow group 11, deferred Task-1 assertion) cleaner reads cleaner_amount via jobs_public;
--     jobs_public still does not expose price.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select is((select cleaner_amount from jobs_public where id=current_setting('test.split_job_id')::bigint)::numeric,
  100::numeric, 'cleaner reads cleaner_amount via jobs_public');
select hasnt_column('jobs_public','price','jobs_public does not expose price (0024 recreation)');

select * from finish();
rollback;
