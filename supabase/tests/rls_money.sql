begin;
select plan(8);
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin@test.dev'),
  ('90000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep@test.dev'),
  ('90000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-a@test.dev'),
  ('90000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-b@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000001','Admin One','admin'),
  ('90000000-0000-0000-0000-000000000002','Rep Two','rep'),
  ('90000000-0000-0000-0000-000000000003','Cleaner A','cleaner'),
  ('90000000-0000-0000-0000-000000000004','Cleaner B','cleaner');
insert into customers(id,name) overriding system value values (900001,'Seed Co');
insert into invoices(id,customer_id,number) overriding system value values (900001,900001,'INV-900001');
-- lead fixture for the rep money-write-denial tests below (superuser insert bypasses grants+RLS).
insert into leads(id,customer_id,status,service,quote_value) overriding system value
  values (900001,900001,'new','Money guard',500);
-- SEC-3 fixtures: one unclaimed job (visible to everyone) and one job claimed by
-- Cleaner B (must stay invisible to Cleaner A through jobs_public).
insert into jobs(id,customer_id,status,claimed_by) overriding system value values
  (900002,900001,'unclaimed',null),
  (900003,900001,'claimed','90000000-0000-0000-0000-000000000004');

-- Structural guard: the money-free views must NOT surface money columns. This is the
-- primary defence (reps read leads/jobs only through these views), so it stays pinned
-- by a test — a careless `create or replace view` that re-adds the column would fail here.
select hasnt_column('leads_public','quote_value','leads_public does not expose quote_value');
select hasnt_column('jobs_public','price','jobs_public does not expose price');

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000002"}';
select is_empty($$ select 1 from invoices $$, 'rep sees zero invoice rows');
-- Integrity guard (0015): a rep must not be able to blind-write quote_value via a direct
-- PostgREST UPDATE/INSERT. Column-scoped grants withhold quote_value, so referencing it in
-- a write raises 42501 (insufficient_privilege) at the column-ACL check — before RLS row
-- filtering even runs. Reps still change everything else directly / via the definer RPCs.
select throws_ok($$ update leads set quote_value=999 where id=900001 $$, '42501', null,
  'rep cannot UPDATE quote_value directly (column grant withheld)');
select throws_ok($$ insert into leads(customer_id,status,service,quote_value) values (900001,'new','x',999) $$,
  '42501', null, 'rep cannot INSERT quote_value directly (column grant withheld)');

-- SEC-3: cleaner sees only unclaimed + own rows through jobs_public — never another
-- cleaner's claimed job, even though claimed_by itself is a visible column on rows they
-- are allowed to see.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from jobs_public where claimed_by is not null and claimed_by <> auth.uid()), 0,
  'cleaner sees zero rows in jobs_public claimed by another user');
select is((select count(*)::int from jobs_public where id=900003), 0,
  'cleaner cannot see the specific job claimed by another cleaner via jobs_public');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001"}';
select isnt_empty($$ select 1 from invoices $$, 'admin sees invoice rows');
select * from finish();
rollback;
