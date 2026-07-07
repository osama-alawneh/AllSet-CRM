begin;
select plan(4);
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner@test.dev'),
  ('90000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-c@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000002','Cleaner Two','cleaner'),
  ('90000000-0000-0000-0000-000000000003','Rep Claim','rep');
insert into customers(id,name) overriding system value values (900009,'Claim Co');
insert into jobs(id,customer_id,status) overriding system value values (900099,900009,'unclaimed');
insert into jobs(id,customer_id,status) overriding system value values (900098,900009,'unclaimed');

set local role authenticated;
-- rep may NOT claim (PRD: rep is view-only). 900098 is still unclaimed, so the failure
-- is the new role guard, not the 'already claimed' guard.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000003"}';
select throws_ok($$ select claim_job(900098) $$, 'P0001', 'Not authorized to claim jobs', 'rep claim rejected');

-- cleaner: first claim wins, second raises.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000002"}';
select lives_ok($$ select claim_job(900099) $$, 'first claim succeeds');
select throws_ok($$ select claim_job(900099) $$, 'P0001', 'Job already claimed', 'second claim rejected');

-- SEC-1: claim_job must not return the jobs row (price leak); it returns the claimed id.
select function_returns('public', 'claim_job', array['bigint'], 'bigint',
  'claim_job returns bigint (id), not the jobs row');
select * from finish();
rollback;
