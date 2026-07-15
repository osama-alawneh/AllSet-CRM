begin;
select plan(54);

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

-- fixtures for the soft-delete + restore trio below (0020) — inserted as superuser like the
-- rest, since authenticated's column-scoped grant on leads (0019) does not cover `id`.
insert into leads(id,customer_id,status,service) overriding system value values (900033,900031,'follow','Restore lead me');
insert into jobs(id,customer_id,status,service) overriding system value values (900097,900031,'unclaimed','Restore job me');

-- (as rep) ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}';
select lives_ok($$ select create_lead(900031,'Rep lead','desc',2,10,'note',999) $$, 'rep create_lead runs');
select is((select service from leads_public where customer_id=900031 and service='Rep lead'), 'Rep lead',
          'rep-created lead visible via leads_public');
-- Task 22: create_lead without p_rep_id defaults rep_id to the caller (auth.uid()). The
-- base `leads` table is admin-only for SELECT (0002), so this is read back through
-- leads_public — which doubles as "rep can read rep_id via leads_public".
select is((select rep_id from leads_public where service='Rep lead'), '90000000-0000-0000-0000-000000000031'::uuid,
          'create_lead defaults rep_id to auth.uid() when p_rep_id is omitted (rep can read it back via leads_public)');
select lives_ok($$ select update_lead((select id from leads_public where service='Rep lead'),
  'Rep lead v2','desc2',3,12,'note2',777) $$, 'rep update_lead runs');
select throws_ok($$ select delete_lead(900031) $$, 'P0001', 'Not authorized to delete leads', 'rep cannot delete leads');
select lives_ok($$ select create_job(900031,'Rep job','d',null,200,80) $$, 'rep create_job runs (spec: rep = admin on job money)');
select is((select price from jobs where service='Rep job'), 200::numeric, 'rep job price applied');
select is((select cleaner_amount from jobs where service='Rep job'), 80::numeric, 'rep job cleaner_amount applied');
select lives_ok($$ select update_job((select id from jobs where service='Rep job'),
  'Rep job v2','d2',null,220,90) $$, 'rep update_job runs');
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
-- Task 22: admin attributes the lead to a different rep via explicit p_rep_id.
select lives_ok($$ select create_lead(900031,'Admin-attributed lead','d',1,4,'n',null,
  '90000000-0000-0000-0000-000000000031') $$, 'admin create_lead with explicit p_rep_id runs');
select is((select rep_id from leads where service='Admin-attributed lead'),
  '90000000-0000-0000-0000-000000000031'::uuid, 'admin create_lead persists explicit p_rep_id (can be a rep, not just self)');
select is((select quote_value from leads where service='Rep lead v2'), 777::numeric,
          'rep quote stored on update (money widened admin-or-rep)');
select lives_ok($$ select update_lead((select id from leads where service='Admin lead'),
  'Admin lead','d',1,4,'n',650) $$, 'admin update_lead runs');
select is((select quote_value from leads where service='Admin lead'), 650::numeric, 'admin quote update applied');
select lives_ok($$ select create_job(900031,'Manual job','wash all', current_date, 240) $$, 'admin create_job runs');
select is((select price from jobs where service='Manual job'), 240::numeric, 'admin job price applied');
select lives_ok($$ select update_job((select id from jobs where service='Manual job'),
  'Manual job v2','wash all v2', current_date + 1, 260) $$, 'admin update_job runs');
select lives_ok($$ select delete_job((select id from jobs where service='Manual job v2')) $$, 'admin delete_job runs');
-- 0020: delete_job is soft — the row stays in the base table (history), just hidden from
-- jobs_public. count(*)=0 is no longer true (that was the hard-delete assertion).
select is((select count(*)::int from jobs where service='Manual job v2'), 1, 'soft-deleted job row kept in base table');
select ok((select deleted_at is not null from jobs where service='Manual job v2'), 'soft-deleted job has deleted_at set');
select is((select count(*)::int from jobs_public where service='Manual job v2'), 0, 'soft-deleted job hidden from jobs_public');

-- 0020: delete_lead is soft too, so the lead row is never actually removed — the FK's
-- ON DELETE SET NULL on jobs.lead_id never fires. The won job keeps pointing at its
-- (now-hidden) origin lead; this replaces the old hard-delete "orphans the job" assertion.
select lives_ok($$ select delete_lead(900032) $$, 'admin delete_lead runs');
select is((select count(*)::int from leads where id=900032), 1, 'soft-deleted lead row kept in base table');
select ok((select deleted_at is not null from leads where id=900032), 'soft-deleted lead has deleted_at set');
select is((select count(*)::int from leads_public where id=900032), 0, 'soft-deleted lead hidden from leads_public');
select is((select lead_id from jobs where description='Front 12 panes, ladder needed'), 900032::bigint,
          'job keeps its origin lead_id — soft delete does not orphan via FK (lead row was never removed)');

-- Soft-delete + restore trio (0020, brief Step 2) -------------------------------
select lives_ok($$ select delete_lead(900033) $$, 'admin delete_lead soft-deletes a fresh lead');
select throws_ok($$ select set_lead_status(900033,'won'::lead_status) $$, 'P0001', 'Lead 900033 not found',
  'set_lead_status on a deleted lead raises');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}'; -- rep
select throws_ok($$ select restore_lead(900033) $$, 'P0001', 'Not authorized to restore leads', 'rep cannot restore leads');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000032"}'; -- cleaner
select throws_ok($$ select restore_lead(900033) $$, 'P0001', 'Not authorized to restore leads', 'cleaner cannot restore leads');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000030"}'; -- admin
select lives_ok($$ select restore_lead(900033) $$, 'admin restore_lead runs');
select is((select count(*)::int from leads_public where id=900033), 1, 'restored lead reappears in leads_public');
select ok((select deleted_at is null from leads where id=900033), 'restored lead has deleted_at cleared');

select lives_ok($$ select delete_job(900097) $$, 'admin delete_job soft-deletes a fresh job');
select throws_ok($$ select set_job_status(900097,'claimed'::job_status) $$, 'P0001', 'Job 900097 not found or not yours',
  'set_job_status on a deleted job raises');
select throws_ok($$ select claim_job(900097) $$, 'P0001', 'Job already claimed', 'claim_job on a deleted job raises');

set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000031"}'; -- rep
select throws_ok($$ select restore_job(900097) $$, 'P0001', 'Not authorized to restore jobs', 'rep cannot restore jobs');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000032"}'; -- cleaner
select throws_ok($$ select restore_job(900097) $$, 'P0001', 'Not authorized to restore jobs', 'cleaner cannot restore jobs');
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000030"}'; -- admin
select lives_ok($$ select restore_job(900097) $$, 'admin restore_job runs');
select is((select count(*)::int from jobs_public where id=900097), 1, 'restored job reappears in jobs_public');
select ok((select deleted_at is null from jobs where id=900097), 'restored job has deleted_at cleared');

select * from finish();
rollback;
