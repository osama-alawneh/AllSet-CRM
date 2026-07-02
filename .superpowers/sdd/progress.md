Task 1: complete (commits 820db51..5dc7955, scaffold; review: low-risk scaffold, verified inline)
Task 2: complete (commit 1968c60, schema; 3 pgTAP pass)
Task 3: complete (commit 39f7a85, RLS admin-only money; 5 pgTAP pass). auth_role() made SECURITY DEFINER to break recursion; granted select on invoices/items to authenticated.
MINOR (defer to Leads/Jobs plan): admins reading leads.quote_value/jobs.price need 'grant select on leads,jobs to authenticated' + a test (rep 0 rows via policy, admin sees). Not yet granted.
Task 4: complete (commit da5acd5, race-safe claim_job; 7 pgTAP pass)
Task 5: complete (commit 0af0926, supabase clients + auth helpers; adapted Next16 async cookies + vitest @ alias)
Task 6: complete (commit 9aca9c9, login + route guard; next build clean, 4 unit tests pass)
Task 7: complete (commit 814e197, seed + 3 login users; 7 pgTAP pass, test ids bumped to 900k to avoid seed collision)
FOUNDATION PLAN COMPLETE (Tasks 1-7). Logins: admin@/rep@/cleaner@clearview.dev pw password123.
FIX: commit f5335fc — grants migration 0004 + seed token fix; E2E verified (logins, RLS, claim-lock all pass). Removed stray CleanView PDF + temp verify script.
