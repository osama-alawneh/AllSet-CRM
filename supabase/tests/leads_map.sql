begin;
select plan(20);

-- fixtures
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-l@test.dev'),
  ('90000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-l@test.dev'),
  ('90000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-l@test.dev'),
  ('90000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-roleless-l@test.dev');
-- NOTE: no profiles row for ...0023 — deliberately roleless (auth_role() returns NULL).
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000020','Admin Lead','admin'),
  ('90000000-0000-0000-0000-000000000021','Rep Lead','rep'),
  ('90000000-0000-0000-0000-000000000022','Cleaner Lead','cleaner');
insert into customers(id,name) overriding system value values (900021,'Lead Co');

-- (superuser context: trigger fires, RLS bypassed) --------------------------
-- 1. direct won insert creates exactly one job
insert into leads(id,customer_id,status,service) overriding system value values (900021,900021,'won','In + out');
select is((select count(*)::int from jobs where lead_id=900021), 1, 'direct won insert creates one job');

-- 2 + 3. new lead has no job; transition to won creates one
insert into leads(id,customer_id,status,service) overriding system value values (900022,900021,'new','Outside only');
select is((select count(*)::int from jobs where lead_id=900022), 0, 'new lead has no job');
update leads set status='won' where id=900022;
select is((select count(*)::int from jobs where lead_id=900022), 1, 'won transition creates job');

-- 4. idempotent: re-touching the status of a won lead does not duplicate the job
update leads set status='won', note='again' where id=900022;
select is((select count(*)::int from jobs where lead_id=900022), 1, 'idempotent: no duplicate job');

-- fixture for the rep won->job RPC test below: a fresh lead with no job yet
insert into leads(id,customer_id,status,service) overriding system value values (900023,900021,'new','Fresh for RPC won test');

-- (as rep) -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000021"}';
-- 5. rep may insert a lead
select lives_ok($$ insert into leads(customer_id,status,service) values (900021,'new','Rep lead') $$, 'rep insert lead allowed');

-- 6 + 7. rep status changes must go through set_lead_status (plain UPDATE is an RLS
-- no-op for reps: base leads SELECT is admin-only, so UPDATE ... WHERE can never match
-- a row for them). The RPC is SECURITY DEFINER and must actually persist the change —
-- verified by reading back through leads_public (status-only view, no RLS gap for reps).
select lives_ok($$ select set_lead_status(900022, 'follow'::lead_status) $$, 'rep set_lead_status runs');
select is((select status from leads_public where id=900022), 'follow', 'rep set_lead_status persisted (read back via leads_public)');

-- 8 + 9. rep setting status to 'won' via the RPC fires the won->job trigger inside the
-- definer update (jobs_public used to read back: base jobs SELECT is admin-only too).
select lives_ok($$ select set_lead_status(900023, 'won'::lead_status) $$, 'rep set_lead_status to won runs');
select is((select count(*)::int from jobs_public where lead_id=900023), 1, 'rep won status via RPC creates job');

-- 10 + 11. rep may create a lead+customer from a pin via the RPC
select lives_ok($$ select create_lead_from_pin('Pin Rep','1 Pin St',42.33,-83.04,'new'::lead_status) $$, 'rep pin RPC runs');
select isnt_empty($$ select 1 from customers where name='Pin Rep' and address='1 Pin St' $$, 'pin RPC created the customer');
-- 0022 regression: pin-created lead is attributed to the caller (rep), not left null.
select is(
  (select rep_id from leads_public l join customers c on c.id = l.customer_id
    where c.name='Pin Rep' and c.address='1 Pin St'),
  '90000000-0000-0000-0000-000000000021'::uuid,
  'pin RPC attributes rep_id to the caller'
);

-- 12. unknown lead id raises (the RPC's own not-found guard, not a silent no-op)
select throws_ok($$ select set_lead_status(999999999, 'won'::lead_status) $$, 'P0001', 'Lead 999999999 not found', 'set_lead_status on unknown lead raises');

-- (as cleaner) ---------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000022"}';
-- 13. cleaner may not insert a lead
select throws_ok($$ insert into leads(customer_id,status,service) values (900021,'new','Nope') $$, '42501', null, 'cleaner insert lead blocked');
-- 14. cleaner may not create via the RPC
select throws_ok($$ select create_lead_from_pin('Pin Cleaner','2 Pin St',42.33,-83.04,'new'::lead_status) $$, 'P0001', 'Not authorized to create leads', 'cleaner pin RPC blocked');
-- 15. cleaner may not change status via the RPC
select throws_ok($$ select set_lead_status(900021, 'lost'::lead_status) $$, 'P0001', 'Not authorized to update leads', 'cleaner set_lead_status blocked');

-- (as roleless authenticated user: no profiles row, auth_role() is NULL) ------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000023"}';
-- 16. NULL-role caller may not create via the RPC (regression: NULL NOT IN (...) is
--     NULL, so a bare `if ... not in` check would silently let roleless callers through)
select throws_ok($$ select create_lead_from_pin('Pin Roleless','3 Pin St',42.33,-83.04,'new'::lead_status) $$, 'P0001', 'Not authorized to create leads', 'roleless pin RPC blocked');
-- 17. NULL-role caller may not change status via the RPC
select throws_ok($$ select set_lead_status(900021, 'lost'::lead_status) $$, 'P0001', 'Not authorized to update leads', 'roleless set_lead_status blocked');

-- (as admin) ------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000020"}';
-- 18. admin may update a lead directly (admin passes the leads_admin SELECT policy,
-- so the plain UPDATE path in 0006 still works for admins even though the app now
-- routes everyone through the RPC)
select lives_ok($$ update leads set status='follow' where id=900021 $$, 'admin update lead allowed');
-- 19. admin may also use the RPC
select lives_ok($$ select set_lead_status(900021, 'won'::lead_status) $$, 'admin set_lead_status allowed');

select * from finish();
rollback;
