begin;
select plan(29);

-- fixtures --------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-c@test.dev'),
  ('90000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-c@test.dev'),
  ('90000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-c@test.dev'),
  ('90000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-roleless-c@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000030','Admin Crud','admin'),
  ('90000000-0000-0000-0000-000000000031','Rep Crud','rep'),
  ('90000000-0000-0000-0000-000000000032','Cleaner Crud','cleaner');
insert into customers(id,name) overriding system value values (900031,'Crud Co');

-- (superuser) schema ----------------------------------------------------------
select has_column('leads','description','leads.description exists');
select has_column('jobs','description','jobs.description exists');
select has_column('leads','updated_at','leads.updated_at exists');
select has_column('jobs','updated_at','jobs.updated_at exists');
select has_column('customers','updated_at','customers.updated_at exists');
select has_column('invoices','updated_at','invoices.updated_at exists');

-- touch trigger: updated_at moves past created_at on update (trigger uses clock_timestamp()
-- precisely so this is observable inside one transaction — now() is txn-frozen).
insert into leads(id,customer_id,status,service) overriding system value values (900031,900031,'new','Touch me');
update leads set service='Touched' where id=900031;
select ok((select updated_at > created_at from leads where id=900031), 'updated_at bumps on update');

-- won->job trigger copies description
insert into leads(id,customer_id,status,service,description) overriding system value
  values (900032,900031,'won','Full clean','Front 12 panes, ladder needed');
select is((select description from jobs where lead_id=900032), 'Front 12 panes, ladder needed',
          'won trigger copies description to the job');

-- (as rep) ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}';
select lives_ok($$ select create_lead(900031,'Rep lead','desc',2,10,'note',999) $$, 'rep create_lead runs');
select is((select service from leads_public where customer_id=900031 and service='Rep lead'), 'Rep lead',
          'rep-created lead visible via leads_public');
select lives_ok($$ select update_lead((select id from leads_public where service='Rep lead'),
  'Rep lead v2','desc2',3,12,'note2',777) $$, 'rep update_lead runs');
select throws_ok($$ select delete_lead(900031) $$, 'P0001', 'Not authorized to delete leads', 'rep cannot delete leads');
select throws_ok($$ select create_job(900031,'Job','d',null,50) $$, 'P0001', 'Not authorized to create jobs', 'rep cannot create jobs');
select throws_ok($$ select update_job(1,'x','d',null,50) $$, 'P0001', 'Not authorized to update jobs', 'rep cannot update jobs');
select throws_ok($$ select delete_job(1) $$, 'P0001', 'Not authorized to delete jobs', 'rep cannot delete jobs');

-- (as cleaner) -----------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000032"}';
select throws_ok($$ select create_lead(900031,'x','d',1,1,'n',null) $$, 'P0001', 'Not authorized to create leads', 'cleaner cannot create leads');

-- (roleless) ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000033"}';
select throws_ok($$ select create_lead(900031,'x','d',1,1,'n',null) $$, 'P0001', 'Not authorized to create leads', 'roleless cannot create leads (NULL-safe)');

-- (as admin) ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000030"}';
select lives_ok($$ select create_lead(900031,'Admin lead','d',1,4,'n',500) $$, 'admin create_lead runs');
select is((select quote_value from leads where service='Admin lead'), 500::numeric, 'admin quote applied');
select is((select quote_value from leads where service='Rep lead v2'), 0::numeric,
          'rep quote arguments were ignored on create AND update (money admin-only)');
select lives_ok($$ select update_lead((select id from leads where service='Admin lead'),
  'Admin lead','d',1,4,'n',650) $$, 'admin update_lead runs');
select is((select quote_value from leads where service='Admin lead'), 650::numeric, 'admin quote update applied');
select lives_ok($$ select create_job(900031,'Manual job','wash all', current_date, 240) $$, 'admin create_job runs');
select is((select price from jobs where service='Manual job'), 240::numeric, 'admin job price applied');
select lives_ok($$ select update_job((select id from jobs where service='Manual job'),
  'Manual job v2','wash all v2', current_date + 1, 260) $$, 'admin update_job runs');
select lives_ok($$ select delete_job((select id from jobs where service='Manual job v2')) $$, 'admin delete_job runs');
select is((select count(*)::int from jobs where service='Manual job v2'), 0, 'job deleted');
-- delete_lead: the won lead 900032 has a job; FK is on delete set null, so the job survives
select lives_ok($$ select delete_lead(900032) $$, 'admin delete_lead runs');
select is((select count(*)::int from jobs where description='Front 12 panes, ladder needed' and lead_id is null), 1,
          'deleting a won lead orphans (not deletes) its job — lead_id set null');

select * from finish();
rollback;
