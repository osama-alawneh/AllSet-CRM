begin;
select plan(12);
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
-- SEC-3 fixtures: one unclaimed job and one job claimed by Cleaner B. Owner decision
-- 2026-07-09 widened jobs_public — Cleaner A now sees BOTH (foreign job view-only).
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
-- SEC-4 (0016): audit columns are stamped by the definer RPCs only — a rep must not be
-- able to spoof created_by (or created_at/updated_at) via direct PostgREST writes. Same
-- column-ACL mechanism as quote_value above: referencing a withheld column raises 42501.
select throws_ok($$ update leads set created_by='90000000-0000-0000-0000-000000000001' where id=900001 $$,
  '42501', null, 'rep cannot UPDATE created_by directly (column grant withheld)');
select throws_ok($$ insert into leads(customer_id,status,service,created_by) values (900001,'new','x','90000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'rep cannot INSERT created_by directly (column grant withheld)');

-- SEC-3 rep arm: the third predicate branch, coalesce(auth_role() in ('admin','rep'),
-- false), was untested — only the cleaner (own/unclaimed) branches were covered above.
-- A rep must see EVERY job through jobs_public, including 900003 which is claimed by
-- a cleaner other than the rep (i.e. the filter is bypassed entirely for reps/admins).
select is((select count(*)::int from jobs_public where id in (900002,900003)), 2,
  'rep sees ALL jobs via jobs_public (unclaimed + claimed-by-another), not just own/unclaimed');

-- Owner decision 2026-07-09: cleaners now see ALL non-deleted jobs through jobs_public,
-- including a job claimed by another cleaner (view-only; claim/drag/join gating lives in
-- the RPCs + UI, not the view). The old own/unclaimed filter has been dropped.
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from jobs_public where id=900003 and claimed_by <> auth.uid()), 1,
  'cleaner now sees the fixture job claimed by another user via jobs_public (widened visibility)');
select is((select count(*)::int from jobs_public where id=900003), 1,
  'cleaner sees the foreign-claimed job via jobs_public (owner decision 2026-07-09)');
select is((select count(*)::int from jobs_public where id=900002), 1,
  'cleaner still sees the unclaimed job via jobs_public');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001"}';
select isnt_empty($$ select 1 from invoices $$, 'admin sees invoice rows');
select * from finish();
rollback;
