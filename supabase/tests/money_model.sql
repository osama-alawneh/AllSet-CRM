begin;
select plan(12);

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

select * from finish();
rollback;
