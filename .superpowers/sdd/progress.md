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
Task 6: complete (commit 435aaaa verification + 7d58b06 lint fixes; pgTAP 12/12, unit 21/21, build clean, lint 0 errors, 15/15 live E2E checks pass). FINAL REVIEW: READY TO MERGE (opus whole-branch). Backlog carried: auth round-trip consolidation, requireRole helper, error UI for failed queries, tr keyboard a11y, ?c=0 latent, not-found drawer feedback, readOnly-vs-disabled, encodeURIComponent quick actions, race/zero-row test coverage, drawer key on customer switch. PLAN 2 COMPLETE.
PLAN 3 (feat/leads-map): Task 1: complete (commits f5c0c06+88c1321, migration 0006 lead writes + won->job trigger + pin RPC with NULL-safe role check + seed rework; pgTAP 24/24 across 5 files, review approved. Minor: trigger fires on no-op status writes — harmless)
Task 2: complete (commit 52224a1, lib/leads + lib/geo pure helpers; 36/36 unit, build clean, review approved, no findings)
Task 3: complete (commit 42056cc, kanban + setLeadStatus; 36/36 unit, build+lint clean, review approved. CARRIED TO TASK 4 (Important): click event fires after drag ends -> onOpen would pop drawer after every drag once ?l= consumer exists; fix in Task 4 via pointer-distance click suppression in LeadCard. Minor: no try/catch around action call in onDragEnd)
Task 4: complete (commits a78d708+6f53753, LeadDrawer + ?l= wiring on /leads + Task 3's carried click-suppression fix in LeadCard; 36/36 unit, build+lint clean. Verbatim brief, no deviations besides the mandated fix.)
Task 4: complete (commits a78d708+6f53753, LeadDrawer + ?l= wiring + post-drag click suppression; 36/36 unit, build+lint clean, review approved. Minor: downPos ref not reset after consume)
Task 5+6: complete (commits 62ae12c+5a5e63a+6ec49a8, map page schematic+mapbox-behind-token + pin RPC action + popover-dismiss fix; 36/36 unit, build+lint clean, review approved. Minor backlog: onPinClick useCallback/ref indirection, marker-sync vs map-recreate effect coupling, PinPopover default status 'won' product decision)

PLAN 3 VERIFICATION (rerun after fix, Task 7, full E2E pass against live local stack, 2026-07-02):
- First pass found a real blocker: reps could never restatus a lead — base leads SELECT is admin-only (protects quote_value) and Postgres requires SELECT-visibility for UPDATE...WHERE, so 0006's leads_update policy was dead code for reps; kanban drag / drawer buttons / won->job silently no-opped. pgTAP missed it (lives_ok passes on 0-row UPDATE). Fixed in f8c4c1e: 0007 set_lead_status SECURITY DEFINER RPC (NULL-safe role check, raises on 0 rows) + actions.ts routes through it; leads_map.sql extended with persistence read-backs.
- Rerun results (all green):
  - `npx supabase db reset`: PASS (7 migrations 0001-0007 + seed clean).
  - `npx supabase test db`: PASS (5 files: schema, rls_money, claim_job, customers_write, leads_map; 31/31 assertions).
  - `npm test`: PASS (36/36 unit, 10 files). `npm run build`: PASS (clean, 10 routes). `npm run lint`: PASS (0 errors).
- Live drive (dev server :3000 + injected sb-127-auth-token cookies / bearer tokens, same method as Plan 2): 18/18 checks PASS:
  1. admin /leads: 4 kanban columns + customer names + $ quote on cards — PASS.
  2. rep /leads: renders, no $ amounts anywhere — PASS.
  3. cleaner /leads → 307 /dashboard — PASS.
  4. admin /leads?l=3 drawer: LEAD #0003 badge + $260 quote + status buttons — PASS. rep same: ••••• masked quote + status buttons — PASS.
  5. all roles /map: schematic .mpin pins (10 seeded); cleaner 200 view-only — PASS.
  6. cleaner /map?l=3: drawer present, NO status buttons, NO "Mark won" — PASS.
  7. rep RPC set_lead_status(7,'follow') → 204; admin GET confirms persisted — PASS. cleaner same → 400 P0001 "Not authorized to update leads" — PASS. rep on nonexistent lead → 400 P0001 "Lead 999999 not found" — PASS.
  8. won->job trigger: rep RPC set_lead_status(7,'won') → job created unclaimed; re-won → still exactly 1 job (idempotent) — PASS.
  9. pin RPC: rep create_lead_from_pin('E2E Pin','1 Test Way',42.33,-83.04,'new') → lead id; admin confirms customer+lead with coords — PASS. cleaner → 400 P0001 — PASS.
  10. admin /map pin count 10 → 11 after pin create — PASS.
- Only script-side fix during the run (not an app bug): restrict HTML matching to SSR body (exclude RSC flight payload — literal "$4" ref ids false-matched money regex) + normalize <!-- --> comment nodes (same artifact as Plan 2).
- DB reset to clean seed after run; verify-plan3.mjs deleted; dev server stopped. Full detail: .superpowers/sdd/task-7-report.md.
Task 7: complete (commit f8c4c1e fix + this ledger; pgTAP 31/31, unit 36/36, build clean, lint 0 errors, 18/18 live E2E checks pass). PLAN 3 VERIFIED.
Task 7 + FINAL: complete (verification rerun 18/18 live PASS after set_lead_status fix f8c4c1e; whole-branch review READY TO MERGE. PLAN 3 COMPLETE. Backlog: drop dead leads_insert/update policies+grant (inert defense-in-depth), Mapbox-path useCallback churn + marker/map effect coupling when token lands, onDragEnd try/catch)
PLAN 4 (feat/jobs): Task 1: complete (commit b4a4fd3, migrations 0008-0011 profiles read + claim_job role fix + set_job_status RPC + realtime ping trigger; pgTAP 44/44 across 6 files, review approved, only cosmetic nits)
Task 2: complete (commit 5d3d7df, lib/jobs pure helpers + canTransition matrix; 48/48 unit, build clean, review approved)
Task 3: complete (commit 8291638, jobs board/drawer/actions/page; 48/48 unit, build+lint clean, review approved. CARRIED TO TASK 4: disable claim/drag while action pending (double-click claim shows false 'already claimed' to owner); Minor: .claim.mine styling unused)
Task 4: complete (commits 0915830+9549a8e+ff29720, realtime wiring + pending gate + unmount-race guard; 48/48 unit, build+lint clean, review approved. Minor: board-wide pending disable accepted trade-off)

PLAN 4 VERIFICATION (Task 5, full E2E pass against live local stack, 2026-07-02):
- `npx supabase db reset`: PASS (11 migrations 0001-0011 + seed clean). Seed jobs confirmed: lead1 claimed by cleaner(333), lead2 unclaimed, lead5 in_progress by cleaner(333), lead8 unclaimed.
- `npx supabase test db`: PASS (6 files: schema, rls_money, claim_job, customers_write, leads_map, jobs_board; 44/44 assertions).
- `npm test`: PASS (48/48 unit, 11 files). `npm run build`: PASS (clean, 10 routes). `npm run lint`: PASS (0 errors).
- DB-layer RPC matrix (docker exec psql, no native psql on host — used `docker exec supabase_db_ClearViewCRM psql`): rep claim of unclaimed job -> `Not authorized to claim jobs` (blocked) — PASS. cleaner claim of unclaimed job -> returns claimed job row — PASS. cleaner `set_job_status` on OWN claimed job -> in_progress, persisted — PASS. cleaner `set_job_status` on a job they don't own (unclaimed, not theirs) -> `Job <id> not found or not yours` (blocked) — PASS. admin `set_job_status(...,'unclaimed')` on a job clears `claimed_by` to NULL — PASS. NOTE: the brief's own psql script resolves job ids via an inline subquery *inside* the `set role authenticated` cleaner/rep session; since the base `jobs` table's SELECT policy is admin-only (by design, protects `price`), that subquery silently returns NULL under non-admin roles and produces misleading "already claimed"/"NULL not found" errors that are artifacts of the test script, not the app. Fixed by resolving job ids via a superuser (RLS-bypassing) query first, then passing literal ids into the role-scoped calls — this is how the brief's own Step 3 script already does it. Documented here since it could trip up a future rerun of the raw brief text verbatim.
- Claim race (two concurrent `claim_job` calls, same unclaimed job, both cleaner-authenticated, backgrounded via `docker exec ... &`): exactly 1 of 2 logs contains `Job already claimed`; the other returned the claimed row; `claimed_by` set to the winner — PASS.
- Realtime smoke (`scripts/realtime-smoke.mjs`, deleted after run): admin client `setAuth()` + subscribed to private `channel('jobs',{config:{private:true}})`; cleaner client claimed an unclaimed job via RPC in parallel; admin received `broadcast{event:'change'}` with payload `{id:2,status:'claimed'}` — keys checked to be exactly `id,status` (no price/name leak) — PASS.
- Live drive (dev server :3000, cookie-injection `sb-127-auth-token` = `base64-` + base64url(session), same method as Plans 2/3; no browser-automation tool available in this environment so HTTP+cookie fetches against SSR'd pages were used, restricted to the SSR body excluding the RSC flight-payload script tags to avoid false-positive `$` matches): 18/18 checks PASS:
  1. admin `/jobs`: 4 column labels (Unclaimed/Claimed/In progress/Done), `$` price on cards, 🔒 locked pill on claimed job — PASS.
  2. rep `/jobs`: no `$` anywhere in SSR body, no `>Claim<` button — PASS.
  3. cleaner `/jobs`: no `$` anywhere; admin was made to claim lead8's job via RPC mid-run (seed only has one cleaner, so a genuinely "foreign-claimed" job was manufactured) — that job's customer name is absent from cleaner's board (visibleJobs correctly excludes it) — PASS.
  4. cleaner `/jobs?j=<own job>` renders a drawer (`role="dialog"`) with masked price (`•••••`) — PASS. cleaner `/jobs?j=<foreign job>` renders NO drawer — PASS.
  5. rep `/jobs?j=<unclaimed job>` renders a view-only drawer: no "Claim job" button, all status-transition buttons in the `statuspick` block carry `disabled` — PASS.
  6. admin `/leads` (regression check for the 0008 profiles-read-all policy change): still 200, still builds kanban HTML — PASS.
- Not independently re-driven as literal browser clicks/drags (no Playwright/Puppeteer tool available): claim-button click and drag-and-drop UI mechanics. These are thin wrappers — `app/(app)/jobs/actions.ts`'s `claimJob`/`setJobStatus` call `sb.rpc('claim_job'|'set_job_status', ...)` with no extra logic — over the exact RPCs proven correct (including the race and the full authorization matrix) at the DB layer above; `canTransition`/`groupJobsByStatus` drag-gating logic has its own 12/12 unit coverage in `tests/unit/jobs.test.ts`. Two-client live board sync was proven via the realtime smoke script (real supabase-js subscribe/broadcast, not a mock).
- DB reset to clean seed after the run; `verify-plan4.mjs` and `scripts/realtime-smoke.mjs` deleted; dev server process killed. No app bugs found — only the one test-script id-resolution issue documented above (not committed, caught and fixed during the run). Full detail: `.superpowers/sdd/task-5-report.md`.
Task 5: complete (verification pass; pgTAP 44/44, unit 48/48, build clean, lint 0 errors, DB RPC matrix 5/5, claim race 1/1, realtime smoke PASS, 18/18 live E2E checks pass). PLAN 4 VERIFIED.
Task 5 + FINAL: complete (verification 18/18 live + claim race + realtime smoke PASS; whole-branch review READY TO MERGE. PLAN 4 COMPLETE. Backlog: profiles role visible to all (least-priv option: definer RPC/projection), $0 price renders blank on admin card, cleaner backward moves allowed (product call), drawer non-optimistic + redundant refresh, stale 0004 comment, .claim.mine dead CSS)
