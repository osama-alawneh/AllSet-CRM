begin;
select plan(142);

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

-- Task 1 (0027) fixtures — 900080-900089 job/customer range, uuid suffixes 080/082 (see the
-- recurring-jobs assertion group near the end of this file for why these must be inserted
-- before `set local role authenticated;` below: auth.users is only writable as the superuser
-- fixture role, not as `authenticated`).
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000080','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-r@test.dev'),
  ('90000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-r-a@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000080','Admin Recur','admin'),
  ('90000000-0000-0000-0000-000000000082','Cleaner Recur A','cleaner');
insert into customers(id,name) overriding system value values (900080,'Recur Co');

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

-- ==== 0026 fixes ==========================================================================

-- 18. (Fix 1, owner decision 2026-07-09) cleaners now see ALL non-deleted jobs via
--     jobs_public — a colleague-claimed job and a done job are visible; a soft-deleted job
--     is not. Cleaner Flow C (074) is not a member of any of these. 900070 is claimed by
--     072 (a colleague), 900075 is a done job claimed by 072, 900074 is soft-deleted above.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000074"}';
select is((select count(*)::int from jobs_public where id=900070), 1,
  'cleaner sees a colleague-claimed job via jobs_public (widened visibility)');
select is((select count(*)::int from jobs_public where id=900075), 1,
  'cleaner sees a done job via jobs_public (widened visibility)');
select is((select count(*)::int from jobs_public where id=900074), 0,
  'cleaner cannot see a soft-deleted job via jobs_public');

-- 19. (Fix 2) admin unclaim wipes job_members so a later claim yields exactly one approved
--     owner row — no stale approved colleagues left to inflate the split.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok($$ select create_job(900070,'Unclaim Reset','reset job', current_date, 120, 60) $$,
  'admin create_job for the unclaim-reset fixture');
select set_config('test.reset_job_id', (select id::text from jobs where service='Unclaim Reset'), true);
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok($$ select claim_job(current_setting('test.reset_job_id')::bigint) $$,
  'cleaner A claims the unclaim-reset job');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000073"}';
select lives_ok($$ select request_join(current_setting('test.reset_job_id')::bigint) $$,
  'cleaner B requests to join the unclaim-reset job');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok(
  format($$ select decide_join(%s, true) $$,
    (select id from job_members where job_id=current_setting('test.reset_job_id')::bigint
       and cleaner_id='90000000-0000-0000-0000-000000000073')),
  'owner approves cleaner B on the unclaim-reset job');
select is((select count(*)::int from job_members where job_id=current_setting('test.reset_job_id')::bigint and status='approved'),
  2, 'two approved members before the admin unclaim');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok($$ select set_job_status(current_setting('test.reset_job_id')::bigint,'unclaimed'::job_status) $$,
  'admin unclaims the reset job');
select is((select count(*)::int from job_members where job_id=current_setting('test.reset_job_id')::bigint),
  0, 'admin unclaim deletes every job_members row for the job');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000073"}';
select lives_ok($$ select claim_job(current_setting('test.reset_job_id')::bigint) $$,
  'cleaner B re-claims the reset job');
select is((select count(*)::int from job_members where job_id=current_setting('test.reset_job_id')::bigint and status='approved' and is_owner),
  1, 'exactly one approved owner row after the re-claim');
select is((select count(*)::int from job_members where job_id=current_setting('test.reset_job_id')::bigint),
  1, 'exactly one job_members row total after the re-claim (no stale colleagues)');

-- 20. (Fix 3) soft-deleting a done job drops its auto payout from company_revenue expenses
--     (revenue is already excluded by the rev CTE, so net stays consistent); restore re-counts.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok($$ select create_job(900070,'Payout Consistency','payout job', current_date, 130, 70) $$,
  'admin create_job for the payout-consistency fixture');
select set_config('test.pc_job_id', (select id::text from jobs where service='Payout Consistency'), true);
select lives_ok($$ select set_job_status(current_setting('test.pc_job_id')::bigint,'done'::job_status) $$,
  'admin marks the payout-consistency job done');
select set_config('test.pc_exp0',
  (select expenses::text from company_revenue where month=to_char(now(),'YYYY-MM')), true);
select lives_ok($$ select delete_job(current_setting('test.pc_job_id')::bigint) $$,
  'admin soft-deletes the done payout job');
select is(
  (select expenses from company_revenue where month=to_char(now(),'YYYY-MM'))::numeric,
  (current_setting('test.pc_exp0')::numeric - 70),
  'soft-delete drops company_revenue expenses by the pot (auto payout excluded)');
select lives_ok($$ select restore_job(current_setting('test.pc_job_id')::bigint) $$,
  'admin restores the payout job');
select is(
  (select expenses from company_revenue where month=to_char(now(),'YYYY-MM'))::numeric,
  current_setting('test.pc_exp0')::numeric,
  'restore re-counts the auto payout in company_revenue expenses');

-- 21. (Fix 4) decide_join raises when the underlying job has been soft-deleted.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok($$ select create_job(900070,'Deleted Decide','deleted-decide job', current_date, 100, 40) $$,
  'admin create_job for the deleted-decide fixture');
select set_config('test.dd_job_id', (select id::text from jobs where service='Deleted Decide'), true);
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000072"}';
select lives_ok($$ select claim_job(current_setting('test.dd_job_id')::bigint) $$,
  'cleaner A claims the deleted-decide job');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000073"}';
select lives_ok($$ select request_join(current_setting('test.dd_job_id')::bigint) $$,
  'cleaner B requests to join the deleted-decide job');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000070"}';
select lives_ok($$ select delete_job(current_setting('test.dd_job_id')::bigint) $$,
  'admin soft-deletes the deleted-decide job');
select set_config('test.dd_member_id',
  (select id::text from job_members where job_id=current_setting('test.dd_job_id')::bigint
     and cleaner_id='90000000-0000-0000-0000-000000000073'), true);
select throws_ok(
  format($$ select decide_join(%s, true) $$, current_setting('test.dd_member_id')),
  'P0001', 'Job is deleted', 'decide_join on a soft-deleted job raises');

-- ==== Task 1 (0027): recurring jobs — spawn-on-done, once-only, every-N-days field ==========
-- Fixtures (auth.users/profiles/customers) were inserted near the top of this file, alongside
-- the other superuser-only fixtures — auth.users is not writable under `authenticated`.

-- 22. (item 1) create_job p_recur_days write semantics: stores a positive value; 0 and omitted
--     both store NULL.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000080"}';
select lives_ok($$ select create_job(900080,'Recur Weekly','recur job', current_date, 200, 80, p_recur_days => 14) $$,
  'admin create_job with p_recur_days => 14 runs');
select is((select recur_days from jobs where service='Recur Weekly'), 14, 'create_job stores p_recur_days => 14');

select lives_ok($$ select create_job(900080,'Recur Zero','recur job', current_date, 100, 40, p_recur_days => 0) $$,
  'admin create_job with p_recur_days => 0 runs');
select is((select recur_days from jobs where service='Recur Zero'), null, 'create_job with p_recur_days => 0 stores NULL');

select lives_ok($$ select create_job(900080,'Recur Omitted','recur job', current_date, 100, 40) $$,
  'admin create_job with p_recur_days omitted runs');
select is((select recur_days from jobs where service='Recur Omitted'), null, 'create_job with p_recur_days omitted stores NULL');

-- 23. (item 3) create_job with a negative p_recur_days raises.
select throws_ok($$ select create_job(900080,'Recur Negative','recur job', current_date, 100, 40, p_recur_days => -3) $$,
  'P0001', 'Repeat days must be positive', 'create_job with p_recur_days => -3 raises');

-- 24. (item 2) update_job p_recur_days write semantics: sets a value; null keeps the existing
--     value; 0 clears it to NULL.
select set_config('test.recur_update_job_id', (select id::text from jobs where service='Recur Zero'), true);
select lives_ok(format($$ select update_job(%s,'Recur Zero','recur job', current_date, 100, 40, p_recur_days => 7) $$,
  current_setting('test.recur_update_job_id')), 'update_job with p_recur_days => 7 runs');
select is((select recur_days from jobs where id=current_setting('test.recur_update_job_id')::bigint), 7,
  'update_job sets p_recur_days => 7');
select lives_ok(format($$ select update_job(%s,'Recur Zero','recur job', current_date, 100, 40, p_recur_days => null) $$,
  current_setting('test.recur_update_job_id')), 'update_job with p_recur_days => null runs');
select is((select recur_days from jobs where id=current_setting('test.recur_update_job_id')::bigint), 7,
  'update_job with p_recur_days => null keeps the existing value');
select lives_ok(format($$ select update_job(%s,'Recur Zero','recur job', current_date, 100, 40, p_recur_days => 0) $$,
  current_setting('test.recur_update_job_id')), 'update_job with p_recur_days => 0 runs');
select is((select recur_days from jobs where id=current_setting('test.recur_update_job_id')::bigint), null,
  'update_job with p_recur_days => 0 clears to NULL');

-- 25. (item 4) a recurring job (recur_days 14, known scheduled_date, price 200, pot 80,
--     description set) moved to done spawns exactly one successor that inherits the job's
--     money/identity fields and gets scheduled_date = parent.scheduled_date + 14 days.
select set_config('test.recur_parent_id', (select id::text from jobs where service='Recur Weekly'), true);
select lives_ok($$ select set_job_status(current_setting('test.recur_parent_id')::bigint,'done'::job_status) $$,
  'admin marks the recurring parent job done');
select is((select count(*)::int from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  1, 'exactly one successor job exists after the parent is marked done');
select is((select status from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  'unclaimed', 'successor job status is unclaimed');
select ok((select claimed_by is null from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  'successor job claimed_by is null');
select is((select customer_id from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  900080::bigint, 'successor job inherits customer_id');
select is((select service from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  'Recur Weekly', 'successor job inherits service');
select is((select description from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  'recur job', 'successor job inherits description');
select is((select price from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint)::numeric,
  200::numeric, 'successor job inherits price');
select is((select cleaner_amount from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint)::numeric,
  80::numeric, 'successor job inherits cleaner_amount');
select is((select recur_days from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  14, 'successor job inherits recur_days');
select is((select scheduled_date from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  (select scheduled_date + interval '14 days' from jobs where id=current_setting('test.recur_parent_id')::bigint),
  'successor scheduled_date = parent.scheduled_date + interval ''14 days''');

-- 26. (item 5) bouncing the parent done -> in_progress -> done still leaves exactly one successor
--     (the on-conflict do-nothing guard prevents a second spawn). The same-id pin right after
--     the bounce is what distinguishes "the successor survived" from "deleted and respawned" —
--     the partial unique index alone would not block a delete+respawn, so a bare count=1 after
--     the re-done could pass either way.
select set_config('test.recur_succ_id',
  (select id::text from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint), true);
select lives_ok($$ select set_job_status(current_setting('test.recur_parent_id')::bigint,'in_progress'::job_status) $$,
  'admin bounces the recurring parent off done');
select is((select id::text from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  current_setting('test.recur_succ_id'),
  'the successor survives the parent bouncing off done — same row id, not delete+respawn');
select lives_ok($$ select set_job_status(current_setting('test.recur_parent_id')::bigint,'done'::job_status) $$,
  'admin marks the recurring parent done again');
select is((select count(*)::int from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint),
  1, 'bouncing done -> in_progress -> done still leaves exactly one successor');

-- 27. (item 6) a non-recurring job moved to done spawns zero successors.
select lives_ok($$ select create_job(900080,'Recur None','no-recur job', current_date, 100, 40) $$,
  'admin create_job without recur_days for the non-recurring fixture');
select set_config('test.recur_none_id', (select id::text from jobs where service='Recur None'), true);
select lives_ok($$ select set_job_status(current_setting('test.recur_none_id')::bigint,'done'::job_status) $$,
  'admin marks the non-recurring job done');
select is((select count(*)::int from jobs where recur_parent_id=current_setting('test.recur_none_id')::bigint),
  0, 'non-recurring job to done spawns zero successors');

-- 28. (item 7) the successor itself inherits recur_days, so marking it done spawns its own
--     successor (the chain continues).
select set_config('test.recur_child_id',
  (select id::text from jobs where recur_parent_id=current_setting('test.recur_parent_id')::bigint), true);
select lives_ok($$ select set_job_status(current_setting('test.recur_child_id')::bigint,'done'::job_status) $$,
  'admin marks the successor job done');
select is((select count(*)::int from jobs where recur_parent_id=current_setting('test.recur_child_id')::bigint),
  1, 'the successor job itself spawns its own successor (chain)');

-- 29. (item 8) a recurring parent with a NULL scheduled_date, moved to done, spawns a successor
--     with a non-null (now()-based) scheduled_date.
select lives_ok($$ select create_job(900080,'Recur NullDate','null-date recur job', null, 100, 40, p_recur_days => 5) $$,
  'admin create_job with null scheduled_date + recur_days for the null-date fixture');
select set_config('test.recur_nulldate_id', (select id::text from jobs where service='Recur NullDate'), true);
select ok((select scheduled_date is null from jobs where id=current_setting('test.recur_nulldate_id')::bigint),
  'null-date recur job fixture has a null scheduled_date');
select lives_ok($$ select set_job_status(current_setting('test.recur_nulldate_id')::bigint,'done'::job_status) $$,
  'admin marks the null-date recurring job done');
select ok((select scheduled_date is not null from jobs where recur_parent_id=current_setting('test.recur_nulldate_id')::bigint),
  'successor of a null-scheduled_date parent gets a non-null (now()-based) scheduled_date');

-- 30. (item 9) a cleaner session reads the still-unclaimed successor via jobs_public as a normal
--     row; jobs_public does not expose recur_days (mirror the existing no-price column pin).
select set_config('test.recur_grandchild_id',
  (select id::text from jobs where recur_parent_id=current_setting('test.recur_child_id')::bigint), true);
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000082"}';
select is((select status from jobs_public where id=current_setting('test.recur_grandchild_id')::bigint),
  'unclaimed', 'cleaner reads the successor as a normal unclaimed row via jobs_public');
select hasnt_column('jobs_public','recur_days','jobs_public does not expose recur_days (0027)');
select hasnt_column('jobs_public','recur_parent_id','jobs_public does not expose recur_parent_id (0027)');

select * from finish();
rollback;
