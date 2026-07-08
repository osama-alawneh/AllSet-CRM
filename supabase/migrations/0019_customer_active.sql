-- Owner request 2026-07-08 ("delete customers... or make their account inactive"):
-- soft flag. Hard delete would cascade leads/jobs and break invoice history.
-- Grants on customers (0004/0005) are table-wide, not column-scoped, so no grant
-- changes are needed here; the existing customers_update RLS policy (admin/rep)
-- already covers writes to this new column — the UI restricts the toggle to admins.
alter table customers add column active boolean not null default true;
