begin;
select plan(6);
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin@test.dev'),
  ('90000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000001','Admin One','admin'),
  ('90000000-0000-0000-0000-000000000002','Rep Two','rep');
insert into customers(id,name) overriding system value values (900001,'Seed Co');
insert into invoices(id,customer_id,number) overriding system value values (900001,900001,'INV-900001');
-- lead fixture for the rep money-write-denial tests below (superuser insert bypasses grants+RLS).
insert into leads(id,customer_id,status,service,quote_value) overriding system value
  values (900001,900001,'new','Money guard',500);

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

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001"}';
select isnt_empty($$ select 1 from invoices $$, 'admin sees invoice rows');
select * from finish();
rollback;
