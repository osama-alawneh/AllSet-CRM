# Task 2 Report — Database schema (create the tables)

**STATUS:** DONE

**Commit:** `1968c607782c2098ce33cf960cbaf908d176bf4c` — "feat(db): core schema (customers, leads, jobs, invoices)"

## Summary

Created a pgTAP test (`supabase/tests/schema.sql`) that asserts the existence of the
`customers` and `jobs` tables and that `jobs.status` is a `job_status` enum. Confirmed
it failed against an empty database, then wrote `supabase/migrations/0001_schema.sql`
containing the exact SQL from `docs/ARCHITECTURE.md` §3 (five enums, six tables:
profiles, customers, leads, jobs, invoices, invoice_items, plus job_photos). Applied
the migration via `supabase db reset` and confirmed all 3 tests pass. No RLS, views,
functions (`auth_role()`), or seed data were included — those are later tasks per the
architecture doc's own separation (§3 vs §4).

## Step 2 — failing run (before migration existed)

```
$ npx --yes supabase test db
Connecting to local database...
/Development/ClearViewCRM/supabase/tests/schema.sql ..
# Failed test 1: "customers table exists"
# Failed test 2: "jobs table exists"
# Failed test 3: "jobs.status is job_status enum"
#    Column public.jobs.status does not exist
# Looks like you failed 3 tests of 3
Failed 3/3 subtests

Test Summary Report
-------------------
/Development/ClearViewCRM/supabase/tests/schema.sql (Wstat: 0 Tests: 3 Failed: 3)
  Failed tests:  1-3
Files=1, Tests=3,  0 wallclock secs ( 0.02 usr +  0.01 sys =  0.03 CPU)
Result: FAIL
error running container: exit 1
```

## Step 4 — passing run (after migration applied via `supabase db reset`)

```
$ npx --yes supabase db reset
Resetting local database...
Recreating database...
Initialising schema...
Seeding globals from roles.sql...
Applying migration 0001_schema.sql...
WARN: no files matched pattern: supabase/seed.sql
Restarting containers...
Finished supabase db reset on branch feat/foundation.

$ npx --yes supabase test db
Connecting to local database...
/Development/ClearViewCRM/supabase/tests/schema.sql .. ok
All tests successful.
Files=1, Tests=3,  0 wallclock secs ( 0.01 usr +  0.01 sys =  0.02 CPU)
Result: PASS
```

## pgTAP setup notes

Nothing extra was required. `npx supabase test db` pulls the
`public.ecr.aws/supabase/pg_prove:3.36` runner container itself and pgTAP was already
available/enabled in the local stack — no `create extension pgtap` statement had to be
added manually. The `WARN: no files matched pattern: supabase/seed.sql` message is
benign (no seed file exists yet, not part of this task).

One transient hiccup during `supabase start` (first-time image pull): Docker Hub/ECR
returned `429 Too Many Requests` on the first attempt to pull `postgrest` and `studio`
images. The CLI/Docker automatically retried and the pull succeeded on subsequent
attempts within the same `supabase start` invocation — no manual intervention needed,
just patience. Full stack came up healthy (`Started supabase local development
setup.`).

## Migration file

`supabase/migrations/0001_schema.sql` — copied verbatim from `docs/ARCHITECTURE.md`
§3 "Database schema (Postgres)": enum types `user_role`, `customer_type`,
`lead_status`, `job_status`, `invoice_status`; tables `profiles`, `customers`,
`leads`, `jobs`, `invoices`, `invoice_items`, `job_photos`, in that order (enums
before the tables that reference them). Excludes `auth_role()` and all RLS/policy
statements from §4, as instructed.

## Deviations / concerns

None. Migration matches ARCHITECTURE.md §3 exactly (verified line-by-line against the
doc while authoring). No RLS, views, functions, or seed data added.

## Local Supabase state

Left **running** (`supabase start` was not stopped) so the next task (RLS) can build
on this database without re-pulling images or re-running `db reset`. Local dashboard:
`http://127.0.0.1:54323`, DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
