begin;
select plan(34);

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
insert into dots(id,lat,lng,label,notes,created_by) overriding system value values
  (900033, 42.33, -83.03, '12 Oak St', 'said maybe', '90000000-0000-0000-0000-000000000031'),
  (900034, 42.34, -83.04, '', '', '90000000-0000-0000-0000-000000000031'),
  (900035, 42.35, -83.05, '', '', '90000000-0000-0000-0000-000000000031'),
  (900036, 42.36, -83.06, '', '', '90000000-0000-0000-0000-000000000031'),
  (900037, 42.37, -83.07, '', '', '90000000-0000-0000-0000-000000000031');

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
-- 18. rep converts a dot to a lead
select lives_ok($$
  select convert_dot_to_lead(900033, 'Oak Owner', '555-0100', '12 Oak St', 'Window Cleaning', 'new'::lead_status, 'front door', 250)
$$, 'rep convert_dot_to_lead runs');
-- 19. customer created AT THE DOT'S coordinates (dot row is the single source)
select is(
  (select lat::text || '|' || lng::text || '|' || coalesce(phone,'') from customers where name = 'Oak Owner'),
  '42.33|-83.03|555-0100', 'convert created customer at dot coords with phone');
-- 20. lead carries status/note/rep attribution (read back via leads_public — rep has no base read until 0029)
select is(
  (select l.status::text || '|' || l.note || '|' || l.rep_id::text
     from leads_public l join customers c on c.id = l.customer_id where c.name = 'Oak Owner'),
  'new|front door|90000000-0000-0000-0000-000000000031',
  'convert created lead with status, note, rep_id = caller');
-- 21. quote stored (caller is role-checked admin/rep; superuser read-back)
set local role postgres;
select is(
  (select (quote_value::bigint)::text from leads l join customers c on c.id = l.customer_id where c.name = 'Oak Owner'),
  '250', 'convert stored the quote');
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}';
-- 22. dot is gone after convert
select is((select count(*)::int from dots where id = 900033), 0, 'dot deleted by convert');
-- 23. converting a missing dot raises
select throws_ok($$
  select convert_dot_to_lead(999999999, 'X', null, '', 'Window Cleaning', 'new'::lead_status, null, null)
$$, 'P0001', 'Dot 999999999 not found', 'convert missing dot raises');
-- 24 + 25. double-convert: second call on the SAME id raises, no duplicate customer
select throws_ok($$
  select convert_dot_to_lead(900033, 'Oak Owner', null, '', 'Window Cleaning', 'new'::lead_status, null, null)
$$, 'P0001', 'Dot 900033 not found', 'double convert raises (claiming DELETE)');
select is((select count(*)::int from customers where name = 'Oak Owner'), 1, 'no duplicate customer from double convert');
-- 26. convert with status won fires the existing won->job trigger
select lives_ok($$
  select convert_dot_to_lead(900034, 'Won Door', null, '', 'Window Cleaning', 'won'::lead_status, null, null)
$$, 'convert with won status runs');
-- 27. ...and the trigger spawned the job
select is(
  (select count(*)::int from jobs_public jp
    join leads_public l on l.id = jp.lead_id
    join customers c on c.id = l.customer_id where c.name = 'Won Door'),
  1, 'won convert spawned a job via trigger');
-- 28. rep converts a dot to a job directly (no lead row)
select lives_ok($$
  select convert_dot_to_job(900035, 'Job Door', null, '9 Elm St', 'Pressure Washing', 'back deck', '2026-08-01T10:00:00Z'::timestamptz, 300, 120)
$$, 'rep convert_dot_to_job runs');
-- 29 + 30. job is unclaimed with money + customer at dot coords + dot gone + NO lead row
set local role postgres;
select is(
  (select j.status::text || '|' || (j.price::bigint)::text || '|' || (j.cleaner_amount::bigint)::text || '|' || (j.lead_id is null)::text
     from jobs j join customers c on c.id = j.customer_id where c.name = 'Job Door'),
  'unclaimed|300|120|true', 'convert_dot_to_job created unclaimed job with money, no lead');
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}';
select is(
  (select count(*)::int from dots where id = 900035) +
  (select count(*)::int from customers where name = 'Job Door' and lat = 42.35), -- 0 dots + 1 customer
  1, 'job convert: dot gone, customer at dot coords');
-- 31. null price coalesces to 0 (0027 create_job semantics)
select lives_ok($$
  select convert_dot_to_job(900036, 'Zero Door', null, '', 'Snow Plow', null, null, null, null)
$$, 'job convert with null money runs');
set local role postgres;
select is(
  (select (price::bigint)::text from jobs j join customers c on c.id = j.customer_id where c.name = 'Zero Door'),
  '0', 'null price stored as 0');
set local role authenticated;

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
-- 32 + 33. cleaner cannot convert
select throws_ok($$
  select convert_dot_to_lead(900037, 'X', null, '', 'Window Cleaning', 'new'::lead_status, null, null)
$$, 'P0001', 'Not authorized to convert dots', 'cleaner convert_dot_to_lead blocked');
select throws_ok($$
  select convert_dot_to_job(900037, 'X', null, '', 'Window Cleaning', null, null, null, null)
$$, 'P0001', 'Not authorized to convert dots', 'cleaner convert_dot_to_job blocked');

-- (as roleless authenticated user) --------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000033"}';
-- 16. NULL-role caller blocked (NULL NOT IN regression guard)
select throws_ok($$ select create_dot(1, 1) $$, 'P0001', 'Not authorized to create dots', 'roleless create_dot blocked');
-- 17. roleless (still authenticated) CAN read — spec: everyone sees all dots
select lives_ok($$ select count(*) from dots $$, 'roleless authenticated select does not error');

select * from finish();
rollback;
