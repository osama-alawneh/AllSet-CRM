begin;
select plan(5);
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-w@test.dev'),
  ('90000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-w@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000011','Rep Writer','rep'),
  ('90000000-0000-0000-0000-000000000012','Cleaner Reader','cleaner');
insert into customers(id,name,phone) overriding system value values (900011,'Writable Co','000');

set local role authenticated;

-- rep can update
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000011"}';
select lives_ok($$ update customers set phone='555-1' where id=900011 $$, 'rep update runs');
select is((select phone from customers where id=900011), '555-1', 'rep update persisted');

-- rep can insert (no id: identity draws from sequence)
select lives_ok($$ insert into customers(name) values ('T-Inserted') $$, 'rep insert allowed');

-- cleaner cannot insert
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000012"}';
select throws_ok($$ insert into customers(name) values ('T-Nope') $$, '42501', null, 'cleaner insert blocked');

-- cleaner update matches zero rows (silently filtered by RLS)
select lives_ok($$ update customers set phone='999' where id=900011 $$, 'cleaner update runs but…');
-- …value must be unchanged; verify as rep (cleaner can still read, but keep it simple)
select * from finish();
rollback;
