begin;
select plan(17);

-- fixtures
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-d@test.dev'),
  ('90000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-d@test.dev'),
  ('90000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-d@test.dev'),
  ('90000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-roleless-d@test.dev');
-- NOTE: no profiles row for ...0033 — deliberately roleless (auth_role() returns NULL).
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000030','Admin Dot','admin'),
  ('90000000-0000-0000-0000-000000000031','Rep Dot','rep'),
  ('90000000-0000-0000-0000-000000000032','Cleaner Dot','cleaner');
-- superuser fixture dots with fixed ids for update/delete/foreign tests
insert into dots(id,lat,lng,created_by) overriding system value values
  (900031, 42.30, -83.00, '90000000-0000-0000-0000-000000000031'),
  (900032, 42.31, -83.01, '90000000-0000-0000-0000-000000000031');

-- (as rep) --------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}';
-- 1 + 2. rep creates a dot; it lands unmarked with created_by = caller
select lives_ok($$ select create_dot(42.32, -83.02) $$, 'rep create_dot runs');
select is(
  (select status::text || '|' || created_by::text from dots where lat = 42.32 and lng = -83.02),
  'unmarked|90000000-0000-0000-0000-000000000031',
  'created dot is unmarked and attributed to the caller');
-- 3 + 4. rep updates own dot; persisted
select lives_ok($$ select update_dot(900031, 'Front door', 'big dog', 'yes'::dot_status) $$, 'rep update_dot runs');
select is(
  (select status::text || '|' || label || '|' || notes from dots where id = 900031),
  'yes|Front door|big dog', 'update_dot persisted label/notes/status');
-- 5. update_dot on a missing dot raises
select throws_ok($$ select update_dot(999999999, 'x', 'y', 'no'::dot_status) $$, 'P0001', 'Dot 999999999 not found', 'update_dot missing dot raises');
-- 6 + 7. delete_dot idempotent: first call deletes, second silently succeeds
select lives_ok($$ select delete_dot(900032) $$, 'rep delete_dot runs');
select lives_ok($$ select delete_dot(900032) $$, 'delete_dot idempotent on already-deleted');
-- 8. rep direct DML blocked (RPC-only writes: no grant)
select throws_ok($$ insert into dots(lat,lng) values (1,1) $$, '42501', null, 'rep direct insert blocked');

-- (as admin) — any admin/rep edits/deletes ANY dot (no ownership restriction) --
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000030"}';
-- 9 + 10. admin updates and deletes the rep's dot
select lives_ok($$ select update_dot(900031, 'Front door', 'big dog', 'callback'::dot_status) $$, 'admin update_dot on foreign dot runs');
select lives_ok($$ select delete_dot(900031) $$, 'admin delete_dot on foreign dot runs');

-- (as cleaner) — read-only ----------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000032"}';
-- 11. cleaner can read dots
select isnt_empty($$ select 1 from dots $$, 'cleaner can select dots');
-- 12-14. cleaner cannot write via RPCs
select throws_ok($$ select create_dot(1, 1) $$, 'P0001', 'Not authorized to create dots', 'cleaner create_dot blocked');
select throws_ok($$ select update_dot(900031, 'x', 'y', 'no'::dot_status) $$, 'P0001', 'Not authorized to update dots', 'cleaner update_dot blocked');
select throws_ok($$ select delete_dot(900031) $$, 'P0001', 'Not authorized to delete dots', 'cleaner delete_dot blocked');
-- 15. cleaner direct DML blocked
select throws_ok($$ insert into dots(lat,lng) values (1,1) $$, '42501', null, 'cleaner direct insert blocked');

-- (as roleless authenticated user) --------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000033"}';
-- 16. NULL-role caller blocked (NULL NOT IN regression guard)
select throws_ok($$ select create_dot(1, 1) $$, 'P0001', 'Not authorized to create dots', 'roleless create_dot blocked');
-- 17. roleless (still authenticated) CAN read — spec: everyone sees all dots
select lives_ok($$ select count(*) from dots $$, 'roleless authenticated select does not error');

select * from finish();
rollback;
