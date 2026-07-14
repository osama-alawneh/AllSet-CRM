begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-q@test.dev'),
  ('90000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-q@test.dev'),
  ('90000000-0000-0000-0000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-q@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000040','Admin Q','admin'),
  ('90000000-0000-0000-0000-000000000041','Rep Q','rep'),
  ('90000000-0000-0000-0000-000000000042','Cleaner Q','cleaner');
insert into customers(id,name) overriding system value values (900041,'Quote Co');
-- a soft-deleted lead reps must NOT see
insert into leads(id,customer_id,status,service,quote_value,deleted_at) overriding system value
  values (900042,900041,'lost','Old',500,now());

-- (as rep) --------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000041"}';
-- 1 + 2. rep's quote is STORED by create_lead and rep can READ it back from base leads
select lives_ok($$ select create_lead(900041, 'Window Cleaning', null, 1, 10, 'note', 175) $$, 'rep create_lead with quote runs');
select is(
  (select quote_value::bigint::text from leads where customer_id = 900041 and deleted_at is null),
  '175', 'rep quote stored and readable via new leads_rep policy');
-- 3. rep update_lead changes the quote
select lives_ok($$
  select update_lead((select id from leads where customer_id = 900041 and deleted_at is null), 'Window Cleaning', null, 1, 10, 'note', 220)
$$, 'rep update_lead with quote runs');
-- 4. ...and it persisted
select is(
  (select quote_value::bigint::text from leads where customer_id = 900041 and deleted_at is null),
  '220', 'rep quote update persisted');
-- 5. rep does NOT see soft-deleted leads through the base table
select is((select count(*)::int from leads where id = 900042), 0, 'rep cannot read soft-deleted lead');

-- (as cleaner) ----------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000042"}';
-- 6. cleaner still reads nothing from base leads
select is((select count(*)::int from leads), 0, 'cleaner base leads read still empty');

-- (as admin) ------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000040"}';
-- 7. admin quote path unchanged (regression)
select lives_ok($$ select create_lead(900041, 'Window Cleaning', null, 0, 0, null, 999) $$, 'admin create_lead with quote still runs');

select * from finish();
rollback;
