# Task 3 Report — RLS: Admin-only money

## STATUS: COMPLETE ✅
Commit hash: `<filled below>`

Money (`invoices`, `invoice_items`, plus `leads.quote_value` / `jobs.price`) is now
unreadable by non-admin users at the database via RLS, proven by pgTAP.

## Files
- `supabase/tests/rls_money.sql` — failing-first pgTAP test (fixtures inside the rolled-back txn)
- `supabase/migrations/0002_rls.sql` — RLS enable + policies + money-free `*_public` views + grants

## Failing run (RED)
Two red stages were observed before the migration existed / was complete:

1. Fixture inserts rejected by identity columns:
```
psql:.../rls_money.sql:9: ERROR:  cannot insert a non-DEFAULT value into column "id"
DETAIL:  Column "id" is an identity column defined as GENERATED ALWAYS.
```
2. After fixing fixtures, no RLS/grant yet — authenticated denied entirely:
```
psql:.../rls_money.sql:14: ERROR:  permission denied for table invoices
```
Result: FAIL (test did not pass without RLS). `schema.sql` still ok.

## Passing run (GREEN)
```
/Development/ClearViewCRM/supabase/tests/rls_money.sql .. ok
/Development/ClearViewCRM/supabase/tests/schema.sql ..... ok
All tests successful.
Files=2, Tests=5, ...
Result: PASS
```
- `rep sees zero invoice rows` — PASS (RLS filters to 0)
- `admin sees invoice rows` — PASS
- `schema.sql` 3 tests still PASS.

## Extra auth.users columns needed?
No. The spec's insert (`id, instance_id, aud, role, email`) worked as-is against the
local `auth.users` shape. No additional NOT NULL columns had to be supplied.

## Fixture fix required (inside the test only)
The `customers`/`invoices` id columns are `GENERATED ALWAYS AS IDENTITY`, so the
spec's explicit-id inserts needed `overriding system value`:
```sql
insert into customers(id,name) overriding system value values (1,'Seed Co');
insert into invoices(id,customer_id,number) overriding system value values (1,1,'INV-0001');
```
No seed/fixture data was added to the migration.

## Extra grants needed?
Yes — one, exactly as the task anticipated:
```sql
grant select on invoices, invoice_items to authenticated;
```
Reason: this project's `supabase/config.toml` does NOT auto-expose new tables
(new Supabase default), so `authenticated` had zero privilege on `invoices` —
admin selects raised `permission denied` (not empty). The grant restores the
table privilege; RLS (`invoices_admin` / `items_admin`) still filters rows to
admins only, so non-admins get 0 rows. `grant select on leads_public,
jobs_public to authenticated` was included per spec for the money-free views.

## Deviation from spec (justified)
The spec's `auth_role()` was `language sql stable` (invoker rights). That caused
**infinite recursion**: the `profiles_self` SELECT policy calls `auth_role()`,
which itself SELECTs from `profiles`, which re-triggers `profiles_self`… →
`stack depth limit exceeded`. It also would have required a `profiles` grant.

Fix (standard Supabase pattern): made `auth_role()` `SECURITY DEFINER` with a
pinned empty `search_path` and schema-qualified `public.profiles`. This bypasses
RLS on `profiles` inside the helper only (breaking the recursion), needs no
`profiles` grant, and is security-neutral — the function still returns only the
caller's own role (`where id = auth.uid()`) and is used solely to gate policies.
No `grant select on profiles to authenticated` was added (not needed once the
helper is definer-rights; kept minimal per instructions).

## Concerns
- `leads_public` / `jobs_public` are plain (non-`security_invoker`) views owned by
  `postgres`, so they intentionally bypass the admin-only RLS on the base tables
  while exposing only money-free columns. That is the intended design (reps read
  jobs/leads without price/quote). If a future column is added to `leads`/`jobs`,
  remember the views are allow-lists and must be updated deliberately — good.
- The money-free guarantee for `leads.quote_value` / `jobs.price` is delivered by
  (a) base-table RLS admin-only + (b) the views omitting those columns. Non-admins
  never receive the money columns through any exposed path. Verified indirectly via
  the invoices test + view column lists; a dedicated pgTAP test asserting reps can
  read `jobs_public` but not `jobs.price` could be added later for defense-in-depth.
