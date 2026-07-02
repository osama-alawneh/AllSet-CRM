begin;
select plan(2);
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin@test.dev'),
  ('90000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000001','Admin One','admin'),
  ('90000000-0000-0000-0000-000000000002','Rep Two','rep');
insert into customers(id,name) overriding system value values (900001,'Seed Co');
insert into invoices(id,customer_id,number) overriding system value values (900001,900001,'INV-900001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000002"}';
select is_empty($$ select 1 from invoices $$, 'rep sees zero invoice rows');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000001"}';
select isnt_empty($$ select 1 from invoices $$, 'admin sees invoice rows');
select * from finish();
rollback;
