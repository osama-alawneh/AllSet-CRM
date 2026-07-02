-- Supabase local does not auto-grant table privileges to the shared `authenticated`
-- role, so RLS policies never get a chance to run (queries fail permission-denied,
-- or the app's getRole() silently returns null). Grant SELECT on the tables the
-- client reads directly; RLS policies (0002) still restrict WHICH rows each role sees.
--
-- profiles : getRole() reads the caller's own role (policy profiles_self)
-- customers: everyone reads (policy customers_read)
-- leads/jobs base tables: admins read money columns (policies leads_admin/jobs_admin
--   restrict rows to admins; non-admins get 0 rows here and use the *_public views).
grant select on profiles  to authenticated;
grant select on customers to authenticated;
grant select on leads     to authenticated;
grant select on jobs      to authenticated;
