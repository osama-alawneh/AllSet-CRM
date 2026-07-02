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
PLAN 2 (feat/customers): Task 1: complete (commit f685f24, customer write policies; pgTAP 12 assertions pass, review clean)
Task 2: complete (commits 574cfb7+6989399, Blueprint+ tokens/theme-cookie/shell + placeholders + /leads guard fix; 10/10 unit, build clean, review approved. Minor deferred to final review: layout getRole/getSession redundant round trips + user! assertion; guard duplication across invoices/settings/leads)
Task 3: complete (commit e1e2945, customers list page; 14/14 unit, build clean, review approved. Minor deferred: silent supabase error discard on list page, redundant getRole per page, tr keyboard a11y)
Task 4: complete (commits 259646c+b85f4a5, customer drawer edit/create + tabs + zero-row save fix; 17/17 unit, build clean, review approved. Minor deferred: ?c=0 truthy check, no not-found feedback, disabled-vs-readOnly a11y, unencoded tel/sms/mailto, untested zero-row error branch; pre-existing ThemeToggle lint error noted)
Task 5: complete (commits 56fb26b+a1cafd6, global typeahead + stale-response race fix; 21/21 unit, build clean, review approved. Minor deferred: supabase error discarded in GlobalSearch, no component-level race test)

PLAN 2 VERIFICATION (Task 6, full E2E pass against live local stack, 2026-07-02):
- `npx supabase db reset`: PASS (5 migrations + seed applied clean).
- `npx supabase test db`: PASS (4 files: schema, rls_money, claim_job, customers_write; 12/12 assertions).
- `npm test`: PASS (21/21 unit tests, 7 files).
- `npm run build`: PASS (clean production build, Turbopack, 10 routes).
- Live drive against `npm run dev` (localhost:3000) + local Supabase, using injected `sb-127-auth-token` auth cookies (base64url-encoded session, `base64-` prefix, per @supabase/ssr default storageKey derived from host `127.0.0.1`) for admin/rep/cleaner sessions obtained via `POST /auth/v1/token?grant_type=password`. Created a local-only `.env.local` (gitignored, not committed) pointing at the local Supabase instance since none existed. 15/15 scripted checks PASS:
  1. admin `/customers`: Sarah Kim row + Invoices column header + per-row inv counts + sidebar Invoices/Settings — PASS.
  2. admin `/customers?c=1` (Sarah Kim) drawer: "CUSTOMER #" badge + "Jobs (" / "Invoices (" / "Leads (" tabs — PASS.
  3. rep `/customers`: no Invoices column, sidebar lacks Invoices/Settings — PASS.
  4. rep `/customers?c=1` drawer: no "Invoices (" tab, has "Save customer" button — PASS.
  5. cleaner `/customers?c=1` drawer: inputs disabled, no "Save customer" button — PASS.
  6. cleaner GET `/invoices` → 307 to `/dashboard` — PASS. rep GET `/invoices` → 307 to `/dashboard` — PASS. cleaner GET `/leads` → 307 to `/dashboard` — PASS.
  7. Unauthenticated GET `/customers` → 307 to `/login` — PASS.
  8. RLS mutation: rep PATCH `customers?id=eq.1` (own-scope write) → 200 + 1 row — PASS.
  9. RLS mutation: cleaner PATCH `customers?id=eq.1` → 200 + 0 rows (RLS-filtered, no error) — PASS.
  10. RLS mutation: cleaner INSERT into `customers` → 403 `42501` — PASS.
  11. Typeahead PostgREST `or()` filter for "sar" (rep token) → returns Sarah Kim (id 1, 142 Maple Ave, 555-0142) — PASS.
- All checks green. No app bugs found; only a test-script regex bug (React SSR comment node `<!-- -->` between number and text) caught and fixed during the run, not an app defect.
- Full command transcript and per-check detail: `.superpowers/sdd/task-6-report.md`. `verify-plan2.mjs` deleted after run per instructions (not committed).
