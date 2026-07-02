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

## CURRENT STATUS (as of 2026-07-02)

- **Foundation plan COMPLETE and merged to `main` @ `c2cef99`.** Verified end-to-end (logins, RLS money-hide, atomic job-claim). 7 pgTAP + 4 unit tests pass; `next build` clean.
- **Plan 2 COMPLETE and merged to `main` @ `9af91b0`** (branch `feat/customers`). Blueprint+ shell (sidebar role nav, theme cookie, placeholder routes with role guards), customers list + drawer (edit/create, related tabs, RLS-aware), global typeahead. Migration 0005 (admin/rep customer writes). pgTAP 12/12, unit 21/21, build + lint clean, 15/15 live E2E checks (all roles, RLS mutations). Plan doc: `docs/superpowers/plans/2026-07-02-plan2-customers-search-shell.md`. Backlog minors recorded in `.superpowers/sdd/progress.md` (auth round-trip consolidation, requireRole helper, error UI, a11y nits, drawer key on customer switch).
- Next: **Plan 3 — Leads pipeline + Map/pins** on branch `feat/leads-map`.
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
- **New tables need `grant select on <table> to authenticated;`** (local Supabase does NOT auto-grant) or RLS never runs and client reads return empty/permission-denied. Add write grants (insert/update) as features need them.
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
