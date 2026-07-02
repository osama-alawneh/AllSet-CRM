-- PRD role matrix: Admin + Rep create/edit customers; Cleaner is view-only.
create policy customers_insert on customers
  for insert with check (auth_role() in ('admin','rep'));
create policy customers_update on customers
  for update using (auth_role() in ('admin','rep'))
  with check (auth_role() in ('admin','rep'));

-- Local Supabase does not auto-grant table privileges (see 0004); RLS still gates rows.
grant insert, update on customers to authenticated;
-- identity columns draw from a sequence; inserts as `authenticated` need usage on it
grant usage, select on all sequences in schema public to authenticated;
