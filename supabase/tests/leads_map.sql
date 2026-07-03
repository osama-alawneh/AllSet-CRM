begin;
select plan(10);

-- fixtures
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-l@test.dev'),
  ('90000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-l@test.dev');
insert into profiles(id,full_name,role) values
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

-- (as rep) -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000021"}';
-- 5. rep may insert a lead
select lives_ok($$ insert into leads(customer_id,status,service) values (900021,'new','Rep lead') $$, 'rep insert lead allowed');
-- 6. rep may update a lead's status
select lives_ok($$ update leads set status='follow' where id=900022 $$, 'rep update lead allowed');
-- 7 + 8. rep may create a lead+customer from a pin via the RPC
select lives_ok($$ select create_lead_from_pin('Pin Rep','1 Pin St',42.33,-83.04,'new'::lead_status) $$, 'rep pin RPC runs');
select isnt_empty($$ select 1 from customers where name='Pin Rep' and address='1 Pin St' $$, 'pin RPC created the customer');

-- (as cleaner) ---------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000022"}';
-- 9. cleaner may not insert a lead
select throws_ok($$ insert into leads(customer_id,status,service) values (900021,'new','Nope') $$, '42501', null, 'cleaner insert lead blocked');
-- 10. cleaner may not create via the RPC
select throws_ok($$ select create_lead_from_pin('Pin Cleaner','2 Pin St',42.33,-83.04,'new'::lead_status) $$, 'P0001', 'Not authorized to create leads', 'cleaner pin RPC blocked');

select * from finish();
rollback;
