begin;
select plan(2);
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner@test.dev');
insert into profiles(id,full_name,role) values ('90000000-0000-0000-0000-000000000002','Cleaner Two','cleaner');
insert into customers(id,name) overriding system value values (900009,'Claim Co');
insert into jobs(id,customer_id,status) overriding system value values (900099,900009,'unclaimed');
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000002"}';
select lives_ok($$ select claim_job(900099) $$, 'first claim succeeds');
select throws_ok($$ select claim_job(900099) $$, 'P0001', 'Job already claimed', 'second claim rejected');
select * from finish();
rollback;
