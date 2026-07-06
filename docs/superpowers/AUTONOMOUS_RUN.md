# ClearView CRM — Autonomous Build: Mandate, Status & Resume

**READ THIS FIRST** (and re-read after any context compaction), together with the progress ledger `.superpowers/sdd/progress.md` and `git log`.

---

## THE MANDATE (standing instructions from the user — 2026-07-02)

1. **Full autonomy. Never stop to ask the user.** The user is away all day.
2. **For any real decision, dispatch a specialized subagent to advise**, then decide and proceed. Do not surface decisions to the user.
3. Execute the remaining plans (2→6) end-to-end using **superpowers:subagent-driven-development**: fresh implementer subagent per task (with the task's brief + interfaces + global constraints), TDD, review, update the ledger after each task. Keep YOUR (controller) context lean by offloading plan-writing and implementation to subagents.
4. **When EVERYTHING is done and all tests pass:** write a complete completion log MD (what was built, decisions, how to run, remaining ideas) at `docs/superpowers/COMPLETION-LOG.md`, then **shut the PC down via CLI** (`powershell -Command "Stop-Computer -Force"` or `shutdown //s //t 60` from git-bash). **Only shut down after every plan is green.**
5. Before big work, check context; if a fresh session is better, persist state (this file + ledger) and hand off. (That is how THIS file came to exist.)

---

## PHASE 1.5 — MVP USABILITY WAVE (planned 2026-07-06, NOT yet executed)

The user tested the MVP on 2026-07-06 and filed 14 gaps/bugs. Four plans cover all of them —
**execute in order (8 and 9 are sequential; 7 is independent; 10 depends on 8+9), each on its
own branch, with superpowers:subagent-driven-development, merge to main when green:**

| Plan | File | Covers (user's item #s) | Status |
|---|---|---|---|
| 7 — Auth & admin surface | `plans/2026-07-06-plan7-auth-admin.md` | 1 login redesign · 2 theme default · 5 sign-out · 6 user management | **DONE — merged @ `0d1289a`** (dark default, migration 0013 service_role grants; plan 8's migration renumbers to 0014) |
| 8 — Data model & CRUD | `plans/2026-07-06-plan8-crud-datamodel.md` | 3 create/delete (DB+actions) · 7 timestamps · 9 drawer-tab bug · 14 description column | **DONE — merged @ `d2ca891`** (migration is 0014 not 0013; backlog: column-scope 0006 leads grants) |
| 9 — Drawer UX | `plans/2026-07-06-plan9-drawer-ux.md` | 3 create/delete UI · 10 editing · 11 read-only→Edit mode · 12 invoice placeholders · 13 job/lead quick-view · 14 field order | pending |
| 10 — Search & list views | `plans/2026-07-06-plan10-search-views.md` | 4 search everything · 8 board/list toggle | pending |

**Decisions locked 2026-07-06** (user was away when asked; revisit only if user objects):
- **Dark theme is default** (user confirmed in person 2026-07-06, overriding the earlier AFK light-default call: "Dark theme is default unless there is a reason otherwise").
- **Deletes are admin-only**, always behind a confirm dialog.
- Search = BOTH halves of the user's either/or: grouped multi-entity topbar search everywhere + per-page local filter inputs.
- Lead `description` also added to jobs and copied by the won→job trigger (the cleaner works from the job — that is where "what exactly to do" must surface).
- Edit-mode = read-only default with an explicit ✎ Edit button (user's stated preference in item 11).

Also done 2026-07-06 directly on main: `042f305` — root `/` was still the create-next-app
starter page (never replaced); now redirects to `/dashboard`.

---

## CURRENT STATUS (as of 2026-07-02)

- **Foundation plan COMPLETE and merged to `main` @ `c2cef99`.** Verified end-to-end (logins, RLS money-hide, atomic job-claim). 7 pgTAP + 4 unit tests pass; `next build` clean.
- **Plan 2 COMPLETE and merged to `main` @ `9af91b0`** (branch `feat/customers`). Blueprint+ shell (sidebar role nav, theme cookie, placeholder routes with role guards), customers list + drawer (edit/create, related tabs, RLS-aware), global typeahead. Migration 0005 (admin/rep customer writes). pgTAP 12/12, unit 21/21, build + lint clean, 15/15 live E2E checks (all roles, RLS mutations). Plan doc: `docs/superpowers/plans/2026-07-02-plan2-customers-search-shell.md`. Backlog minors recorded in `.superpowers/sdd/progress.md` (auth round-trip consolidation, requireRole helper, error UI, a11y nits, drawer key on customer switch).
- **Plan 3 COMPLETE and merged to `main` @ `984222e`** (branch `feat/leads-map`). Kanban (dnd-kit, optimistic, post-drag click suppression), LeadDrawer on `?l=` (both routes, money-gated, cleaner read-only), map page (SchematicMap live path — Mapbox token EMPTY, MapboxMap built behind token check, statically reviewed only), pin popover → `create_lead_from_pin` RPC. Migrations 0006 (lead writes + won→job trigger + pin RPC, NULL-safe role checks) and 0007 (`set_lead_status` definer RPC — plain rep UPDATEs were RLS no-ops because base leads SELECT is admin-only; all status changes route through RPC). Seed reworked (trigger creates jobs; seed updates them; invoices join by lead_id). pgTAP 31/31, unit 36/36, build+lint clean, 18/18 live E2E. Plan doc: `docs/superpowers/plans/2026-07-02-plan3-leads-map.md`.
- **Plan 4 COMPLETE and merged to `main` @ `12eeeb0`** (branch `feat/jobs`). Jobs board (claim button optimistic + pending gate, canTransition-gated drags, 🔒 name chips), JobDrawer `?j=` (visibleJobs-gated deep links), realtime = broadcast-from-DB ping trigger → debounced router.refresh (private 'jobs' topic, {id,status} only). Migrations 0008-0011 (profiles read-all, claim_job role fix — rep could claim before!, set_job_status RPC, realtime trigger). pgTAP 44/44, unit 48/48, build+lint clean, live claim-race + realtime smoke + 18/18 role checks PASS. Plan doc: `docs/superpowers/plans/2026-07-02-plan4-jobs-realtime.md`.
- **Plan 5 COMPLETE and merged to `main` @ `d0c557b`** (branch `feat/invoices`). Admin invoices CRUD (table + drawer editor + line items + live totals + status), print→PDF via body-portal `#printArea`, auto numbering (`invoice_number_seq`, seed setval 1003), createInvoiceFromJob wired into JobDrawer, role-aware dashboard (revenue MTD + overdue + 14d canvas chart admin-only structural isolation; jobs/week, win rate, claimable top-3 w/ Claim, mini schematic map for all). Migration 0012. pgTAP 51/51, unit 73/73, build+lint clean, 45/45 live checks. Plan doc: `docs/superpowers/plans/2026-07-02-plan5-invoices-dashboard.md`.
- **Plan 6 COMPLETE and merged to `main` @ `5517da6`** (branch `feat/exports-pwa`). Role-aware CSV exports, hand-rolled PWA (manifest + default-deny SW + offline page + install icon), a11y pass, dashboard Promise.all. pgTAP 51/51, unit 84/84, build+lint clean, 93/93 live checks.
- **ALL 6 PLANS COMPLETE — MVP DONE. See `docs/superpowers/COMPLETION-LOG.md`** for everything built, decisions, how to run, what's left for the user (Mapbox token + one manual map pass, cloud Supabase, branding, old-app URL, deployment, manual PWA checks), and backlog.
- Repo root: `D:\Development\ClearViewCRM`.

### Done (Foundation, Tasks 1–7 + fixes)
- Next.js 16 + Supabase + Vitest scaffold.
- DB: `supabase/migrations/0001_schema.sql` (tables), `0002_rls.sql` (RLS + `auth_role()` SECURITY DEFINER), `0003_claim_job.sql` (atomic claim), `0004_grants.sql` (SELECT grants to `authenticated`).
- `supabase/seed.sql` — 10 customers, 10 leads, 4 jobs, 3 invoices + items, and 3 login users.
- `lib/supabase/{client,server}.ts`, `lib/auth.ts` (`getRole`, `guardDecision`, `normalizeRole`).
- `app/login/page.tsx`, `app/(app)/layout.tsx` (guard), `app/(app)/dashboard/page.tsx` (placeholder).
- pgTAP tests in `supabase/tests/`, unit tests in `tests/unit/`.

### Logins (local, password = `password123`)
`admin@clearview.dev` (admin) · `rep@clearview.dev` (rep) · `cleaner@clearview.dev` (cleaner)

### Run it
```
cd D:\Development\ClearViewCRM
npx supabase start          # needs Docker Desktop running
npx supabase db reset       # applies migrations + seed
npm run dev                 # http://localhost:3000/login
npm test                    # unit
npx supabase test db        # pgTAP
```

---

## REMAINING PLANS (build in order, each on its own branch, merge to main when green)

- **Plan 2 — Customers + global search + app shell** (branch `feat/customers`). First real Blueprint+ UI. Customer list, editable customer profile with related Jobs/Invoices/Leads tabs, top-bar typeahead search (name/phone/address cards → open customer), the sidebar/topbar shell with role display + light/dark toggle. Local Supabase data. NO Mapbox needed.
- **Plan 3 — Leads pipeline + Map/pins.** Kanban (drag-drop status; won→creates job), Mapbox map (click house→drop pin→create lead; pin⇄lead). **Needs a Mapbox token** (`NEXT_PUBLIC_MAPBOX_TOKEN`) — the user must create a free Mapbox account; if absent, build the map behind an env check and stub/skip its live test, note it in the completion log.
- **Plan 4 — Jobs board + realtime claim.** Board with statuses, `claim_job` rpc wired, Supabase realtime so a claim locks live. Cleaner sees only claimable/own, no prices.
- **Plan 5 — Invoices + PDF + dashboard revenue.** Admin-only invoice CRUD (line items), PDF (print layout now; server PDF later), dashboard KPIs incl. revenue + overdue.
- **Plan 6 — Exports + PWA + polish.** CSV export (leads/jobs/invoices/customers), PWA manifest + service worker, dashboard polish, a11y, final review.

Write each plan with **superpowers:writing-plans** (save to `docs/superpowers/plans/`), then execute with **subagent-driven-development**.

---

## KEY FACTS & GOTCHAS (do not relearn the hard way)
- **Next.js is v16** — `cookies()` from `next/headers` is **async** (await it). `AGENTS.md` warns APIs differ from training; read `node_modules/next/dist/docs/` before non-trivial Next code.
- **New tables need `grant select on <table> to authenticated;`** (local Supabase does NOT auto-grant) or RLS never runs and client reads return empty/permission-denied. Add write grants (insert/update) as features need them. **Same for `service_role`**: RLS-bypass does NOT remove the need for table-level GRANTs — Plan 7's admin actions failed at runtime until migration 0013 granted service_role select/insert/update on profiles.
- **Seeding `auth.users`:** string token columns (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`, `reauthentication_token`) must be `''` not NULL or GoTrue login 500s.
- **pgTAP test fixtures** use id range `900000+` and uuids `90000000-…` / emails `t-*@test.dev` to avoid colliding with seed data.
- **RLS pattern:** money-free `leads_public`/`jobs_public` views for non-admins; base `leads`/`jobs`/`invoices` gated to admin. `auth_role()` is SECURITY DEFINER (breaks policy recursion).
- **Design = "Blueprint+"**: mono font, graph-paper grid, offset shadows, blue accent (light) / cyan glow (dark), status colors won=green/lost=red/follow=amber/new=grey, dark-mode toggle. **Full clickable reference prototype (all screens, DnD, typeahead, invoices, exports) is at `docs/design/clearview-proto.html`** — open it in a browser; mirror its UX + tokens. Also `docs/prd-brief.html`.
- Product spec: `docs/PRD.md`. Technical spec (schema, RLS SQL, claim fn, build order): `docs/ARCHITECTURE.md`.

## PENDING FROM USER (proceed without; fold in if it appears)
- Git URL of the user's old buggy vanilla HTML/CSS/JS CRM (never provided) — mine for missed requirements if given.
- Real business name / branding / logo (placeholder "ClearView").
- Mapbox account/token (needed for Plan 3 live map).
- Cloud Supabase project (needed only when deploying; all local for now).

## DECISION PROTOCOL
When a real choice arises (design, library, tradeoff), dispatch a specialized subagent (e.g. Explore/Plan/general-purpose with a focused brief) to research/advise, then decide and proceed. Record notable decisions in `docs/superpowers/COMPLETION-LOG.md`.
