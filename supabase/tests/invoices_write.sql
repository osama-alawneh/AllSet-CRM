begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-i@test.dev'),
  ('90000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-i@test.dev'),
  ('90000000-0000-0000-0000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-i@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000040','Admin Inv','admin'),
  ('90000000-0000-0000-0000-000000000041','Rep Inv','rep'),
  ('90000000-0000-0000-0000-000000000042','Cleaner Inv','cleaner');
insert into customers(id,name) overriding system value values (900040,'Invoice Co');

set local role authenticated;

-- (admin) ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000040"}';
-- 1. admin insert with NO number → the sequence-backed default fills it (INV-<nextval>)
select lives_ok(
  $$ insert into invoices(customer_id) values (900040) $$,
  'admin invoice insert runs (number defaulted from sequence)'
);
-- 2. the defaulted number looks like INV-<digits> (first test-DB insert → INV-1001)
select ok(
  (select number ~ '^INV-\d+$' from invoices where customer_id=900040 order by id desc limit 1),
  'defaulted invoice number matches INV-<digits>'
);
-- 3. admin may add items
select lives_ok(
  $$ insert into invoice_items(invoice_id, description, qty, unit_price)
     values ((select id from invoices where customer_id=900040 order by id desc limit 1),'Window cleaning',1,150) $$,
  'admin invoice_items insert runs'
);
-- 4. admin may update an item
select lives_ok(
  $$ update invoice_items set unit_price=175
      where invoice_id=(select id from invoices where customer_id=900040 order by id desc limit 1) $$,
  'admin item update runs'
);
-- 5. admin may delete items
select lives_ok(
  $$ delete from invoice_items
      where invoice_id=(select id from invoices where customer_id=900040 order by id desc limit 1) $$,
  'admin item delete runs'
);

-- (rep) -----------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000041"}';
-- 6. rep insert violates the invoices_admin WITH CHECK → RLS error 42501
select throws_ok(
  $$ insert into invoices(customer_id) values (900040) $$,
  '42501', null, 'rep invoice insert blocked by RLS'
);

-- (cleaner) -------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000042"}';
-- 7. cleaner sees no invoices (RLS select filters to zero rows)
select is_empty(
  $$ select 1 from invoices where customer_id=900040 $$,
  'cleaner sees no invoices'
);

select * from finish();
rollback;
