begin;
select plan(2);
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@test.dev'),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rep@test.dev');
insert into profiles(id,full_name,role) values
  ('00000000-0000-0000-0000-000000000001','Admin One','admin'),
  ('00000000-0000-0000-0000-000000000002','Rep Two','rep');
insert into customers(id,name) overriding system value values (1,'Seed Co');
insert into invoices(id,customer_id,number) overriding system value values (1,1,'INV-0001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';
select is_empty($$ select 1 from invoices $$, 'rep sees zero invoice rows');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
select isnt_empty($$ select 1 from invoices $$, 'admin sees invoice rows');
select * from finish();
rollback;
