begin;
select plan(3);
select has_table('public','customers','customers table exists');
select has_table('public','jobs','jobs table exists');
select col_type_is('public','jobs','status','job_status','jobs.status is job_status enum');
select * from finish();
rollback;
