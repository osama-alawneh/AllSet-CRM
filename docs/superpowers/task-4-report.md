# Task 4 Report — Atomic job claim (`claim_job()`)

## STATUS: DONE
- Commit: `da5acd5b8bd42d79d2dc0424f3643bb9b79306f6` (`feat(db): race-safe claim_job()`) on branch `feat/foundation`.
- Files added:
  - `supabase/tests/claim_job.sql` (pgTAP test, 2 assertions)
  - `supabase/migrations/0003_claim_job.sql` (function)

## TDD cycle

### Failing run (before migration 0003)
```
/Development/ClearViewCRM/supabase/tests/claim_job.sql ..
# Failed test 1: "first claim succeeds"
#     died: 42883: function claim_job(integer) does not exist
# Failed test 2: "second claim rejected"
#       caught: 42883: function claim_job(integer) does not exist
#       wanted: P0001: Job already claimed
# Looks like you failed 2 tests of 2
Failed 2/2 subtests
/Development/ClearViewCRM/supabase/tests/rls_money.sql .. ok
/Development/ClearViewCRM/supabase/tests/schema.sql ..... ok

Test Summary Report
-------------------
/Development/ClearViewCRM/supabase/tests/claim_job.sql (Wstat: 0 Tests: 2 Failed: 2)
  Failed tests:  1-2
Files=3, Tests=7
Result: FAIL
```

### Passing run (after migration 0003)
```
Applying migration 0001_schema.sql...
Applying migration 0002_rls.sql...
Applying migration 0003_claim_job.sql...

/Development/ClearViewCRM/supabase/tests/claim_job.sql .. ok
/Development/ClearViewCRM/supabase/tests/rls_money.sql .. ok
/Development/ClearViewCRM/supabase/tests/schema.sql ..... ok
All tests successful.
Files=3, Tests=7
Result: PASS
```
All three test files pass; prior tests (schema, rls_money) remained green.

## Details / decisions
- **`throws_ok` form:** The 4-arg form `throws_ok($$...$$, 'P0001', 'Job already claimed', 'second claim rejected')` worked as-is. `P0001` is the SQLSTATE for a plpgsql `raise exception`. No fallback to the message-only form was needed.
- **Execute grant:** Added `grant execute on function claim_job(bigint) to authenticated;` in the migration. It is included proactively; the test authenticates as the `authenticated` role and calls the function, so an explicit grant is the correct, robust choice (functions default to `PUBLIC` execute, but pinning the grant is explicit and matches least-surprise). Tests pass with it present.
- **search_path hardening:** Applied `set search_path = ''` (matching the `auth_role()` SECURITY DEFINER pattern in 0002). Consequently all object references inside the function are schema-qualified: `public.jobs` (both the declared type `j public.jobs` and the UPDATE target) and `auth.uid()`. Behavior is identical to the spec's version.
- **Atomicity:** Kept the single-statement `UPDATE ... WHERE id=p_job_id AND status='unclaimed' RETURNING * INTO j` guard. First writer wins; the losing concurrent claim matches no row, `j.id IS NULL`, and it raises `P0001 'Job already claimed'`. No read-then-write.
- SECURITY DEFINER is required because `jobs` has select-only RLS (`jobs_admin`) and no update policy for cleaners; the definer function performs the privileged UPDATE.

## Concerns
- The test proves the *logical* guard (sequential second claim fails), not true concurrent contention. Genuine race safety rests on Postgres row-level locking: the second session's UPDATE blocks on the first's row lock, then re-evaluates the `status='unclaimed'` predicate after commit and matches zero rows. This is correct under default READ COMMITTED. A concurrency test would need two sessions, which pgTAP-in-one-transaction cannot express — the single-statement guard is the standard, correct pattern.
- `integer` literal `99` in the test implicitly casts to the `bigint` parameter — fine in Postgres.
- No RLS update policy exists for `jobs`; all claims must go through `claim_job()`. If direct client UPDATEs on `jobs` are ever needed, that path is currently closed by design.
