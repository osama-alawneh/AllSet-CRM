# Task 7 Report — Seed data + three role login users

## STATUS: COMPLETE

Commit hash: _(see below after commit)_

## Deliverables
- Created `supabase/seed.sql` (exact spec content): 3 login users (auth.users + auth.identities + profiles), 10 customers, 10 leads, 4 jobs, 3 invoices, 4 invoice_items, plus setval() calls to advance IDENTITY sequences past the manual ids.
- Runs automatically on `supabase db reset` (seed enabled in config.toml).

## Row counts (after `supabase db reset`)
| table          | count |
|----------------|-------|
| customers      | 10    |
| profiles       | 3     |
| auth.users     | 3     |
| leads          | 10    |
| jobs           | 4     |
| invoices       | 3     |
| invoice_items  | 4     |

## config.toml
No change needed. `[db.seed]` was already `enabled = true` with `sql_paths = ["./seed.sql"]`.

## pgTAP tests — final `supabase test db` output (ALL PASS)
```
/Development/ClearViewCRM/supabase/tests/claim_job.sql .. ok
/Development/ClearViewCRM/supabase/tests/rls_money.sql .. ok
/Development/ClearViewCRM/supabase/tests/schema.sql ..... ok
All tests successful.
Files=3, Tests=7,  0 wallclock secs
Result: PASS
```

### Test-file id/email changes (to avoid collisions with seed data)
Seed data persists in the DB during `supabase test db`, so the tests' hard-coded ids/emails collided. Fixed by moving fixtures to a non-colliding high range (logic/assertions unchanged):

- `supabase/tests/rls_money.sql`
  - auth uuids `0000..0001/0002` -> `90000000-0000-0000-0000-000000000001/002`
  - emails `admin@test.dev` / `rep@test.dev` -> `t-admin@test.dev` / `t-rep@test.dev`
  - customer id `1` -> `900001`
  - invoice id `1` / customer_id `1` / number `INV-0001` -> `900001` / `900001` / `INV-900001`
  - jwt `sub` claims updated to the new uuids
- `supabase/tests/claim_job.sql`
  - auth uuid `0000..0002` -> `90000000-0000-0000-0000-000000000002`
  - email `cleaner@test.dev` -> `t-cleaner@test.dev`
  - customer id `9` -> `900009`
  - job id `99` -> `900099` (both `claim_job(99)` calls updated to `claim_job(900099)`)
  - jwt `sub` claim updated to the new uuid
- `supabase/tests/schema.sql` — no change needed (no fixture inserts).

Migrations 0001-0003 were NOT touched; RLS was NOT weakened.

## Login users (local dev)
Shared password for all three: `password123`

| email                  | role    | name        |
|------------------------|---------|-------------|
| admin@clearview.dev    | admin   | Marcus Reed |
| rep@clearview.dev      | rep     | Jess Lane   |
| cleaner@clearview.dev  | cleaner | Dylan Cruz  |

## Concerns
- Full auth login (via GoTrue endpoint) was NOT exercised end-to-end (no `npm run dev` per constraints). However, SQL-level verification confirms for all three users: `encrypted_password = crypt('password123', encrypted_password)` returns true and `email_confirmed_at` is set, and matching rows exist in `auth.identities` with an `email` provider. This is the standard shape GoTrue expects for email/password login, so login should work.
