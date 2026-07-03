# ClearView CRM — Autonomous Build Completion Log

**Date:** 2026-07-02/03 · **Status: MVP COMPLETE.** All 6 plans built, reviewed, live-verified, and merged to `main`.

Final state of `main`: pgTAP **51/51** (7 files) · unit **84/84** (14 files) · `next build` clean (Turbopack) · `eslint` 0 errors · every plan live-verified end-to-end against the running local stack in all three roles.

---

## 1. What was built (per plan)

### Foundation (pre-existing, merged @ `c2cef99`)
Next.js 16 + Supabase + Vitest scaffold; schema (customers/leads/jobs/invoices/items/profiles); RLS with `auth_role()` SECURITY DEFINER; money-free `leads_public`/`jobs_public` views; race-safe `claim_job()`; seed (10 customers w/ Detroit coords, 10 leads, 4 jobs, 3 invoices, 3 login users); login + route guard.

### Plan 2 — Customers + global search + app shell (merge `9af91b0`)
- **Blueprint+ design system** ported verbatim from the approved prototype into `app/globals.css` (tokens on `:root`/`[data-theme="dark"]`, Tailwind v4 `@theme inline` mapping, `@custom-variant dark`).
- App shell: sidebar (role-filtered nav via `lib/nav.ts`), topbar (route titles, theme toggle), **theme persisted in a cookie and rendered server-side** (zero FOUC).
- Customers list (job counts for all, invoice counts admin-only), **customer drawer** on `?c=<id>` (edit/create via Server Actions, related Jobs/Invoices(admin)/Leads tabs, cleaner read-only), global debounced typeahead (PostgREST `or()` with injection-safe filter builder).
- Migration `0005`: admin/rep customer write policies + grants.

### Plan 3 — Leads kanban + Map/pins (merge `984222e`)
- Kanban (4 columns) with **@dnd-kit/core** drag-to-restatus, `useOptimistic`, post-drag click suppression.
- **Won→job creation is a DB trigger** (partial unique index on `jobs(lead_id)`, idempotent `ON CONFLICT DO NOTHING`) — fires no matter which code path flips the status.
- Lead drawer on `?l=<id>` (both `/leads` and `/map`), money-gated, cleaner read-only.
- Map page: **SchematicMap** (grid/streets/pins, `lib/geo.ts` lat/lng⇄percent projection) is the live path; **MapboxMap fully built behind `NEXT_PUBLIC_MAPBOX_TOKEN`** (empty → schematic). Click→popover→`create_lead_from_pin` RPC (atomic customer+lead). Real lat/lng stored — Mapbox-ready with zero migration.
- Migrations `0006`/`0007`. **Live verification caught a real bug**: rep lead updates were RLS no-ops (Postgres `UPDATE…WHERE` needs SELECT-visible rows; base `leads` SELECT is admin-only to protect money). Fixed with `set_lead_status` SECURITY DEFINER RPC; all status changes route through it.

### Plan 4 — Jobs board + realtime claim (merge `12eeeb0`)
- Jobs board: claim button (optimistic, pending-gated), drags gated by `canTransition` (single source of truth mirroring DB rules), 🔒 + first-name lock chips, cleaner sees only claimable+own (list AND `?j=` deep links).
- **Realtime = broadcast-from-database**: DB trigger `realtime.send({id,status})` on private `'jobs'` topic (never price/names) → client debounced `router.refresh()`. `postgres_changes` was unusable (RLS blocks non-admins on base `jobs`; views unsupported).
- Migrations `0008–0011`: profiles read-all (names for lock chips), **`claim_job` role fix (rep could claim before — PRD violation found during planning)**, `set_job_status` RPC (admin any + unclaim clears claimer; cleaner own jobs forward), realtime trigger + `realtime.messages` RLS.
- Live-verified: concurrent claim race (exactly one winner), realtime ping received by two clients with no money in payload.

### Plan 5 — Invoices + PDF + dashboard revenue (merge `d0c557b`)
- Admin invoice CRUD: table + drawer editor (customer select, line items, live totals, status), **auto numbering** via `invoice_number_seq` (DB default `INV-<n>`, seed `setval` avoids collision).
- **Print→PDF**: `#printArea` rendered via `createPortal(document.body)` — must be a *sibling* of `.app` because print CSS hides `.app`/`.drawer` (ancestor `display:none` is absolute). Save-then-print flow.
- `createInvoiceFromJob` wired into the job drawer (admin).
- Dashboard: revenue MTD, overdue (sent >30d), 14-day canvas revenue chart (theme-aware, DPR-scaled, redraws on theme/resize), jobs/week, win rate, claimable top-3 with Claim, mini schematic map. **Money is structurally admin-only** — non-admins never receive the props/queries, chart shows `•••••`.
- Migration `0012`. Pure metric fns in `lib/dashboard.ts` (string-compare date logic, unit-tested boundaries).

### Plan 6 — Exports + PWA + polish (merge `5517da6`)
- **CSV exports** on customers/leads/jobs/invoices (client-side Blob from role-split server data; UTF-8 BOM for Excel; formula-injection guard; **money columns omitted entirely for non-admins** — unit-tested per role).
- **PWA hand-rolled** (next-pwa is dead since 2022; @serwist/next needs webpack — Turbopack ignores it): `app/manifest.ts`, `public/icon.svg` (◇ on accent, any+maskable), `public/sw.js` **default-deny allowlist** (non-GET and cross-origin untouched → login/server actions/Supabase never intercepted; navigations network-only with `/offline` fallback — role HTML never cached; only hashed static assets cache-first), prod-only registration.
- A11y: global `:focus-visible`, skip link + `<main>` landmark, drawer initial focus, `aria-current`/`aria-pressed`, labeled chart canvas, keyboard-activatable table rows (with inner-control guard).
- Dashboard fetches parallelized (`Promise.all`, money queries still structurally admin-gated).

---

## 2. Notable decisions (and why)

| Decision | Why |
|---|---|
| Server components + Server Actions, **no react-query** | App Router cache + `revalidatePath` covers CRUD; realtime board works with refresh-on-ping. Re-evaluated at Plan 4 — still unnecessary. |
| Drawers on URL search params (`?c=`, `?l=`, `?j=`, `?i=`) | Deep-linkable, back-button closes, one shared `ui/Drawer`+`Tabs`, list stays under scrim like the prototype. |
| Hand-rolled Blueprint+ CSS, **no shadcn/ui** | The prototype *is* the design system (~200 lines); shadcn's aesthetic would fight every token. |
| Theme in a cookie, rendered on `<html>` server-side | Zero FOUC, no inline script, PWA-friendly. |
| **Security-definer RPCs for non-admin writes** (`claim_job`, `set_lead_status`, `set_job_status`, `create_lead_from_pin`) | Postgres RLS: `UPDATE…WHERE` requires SELECT-visible rows; non-admins can't SELECT base tables (money columns). All RPCs use NULL-safe `coalesce(auth_role() in (…), false)` checks (a NULL-role bypass was caught in review and regression-tested). |
| Won→job in a **DB trigger**, not app code | Transactional, unskippable, race-safe (partial unique index), no widening of jobs RLS. |
| Realtime via `realtime.send()` DB trigger + refresh-on-ping | `postgres_changes` respects RLS (non-admins get nothing) and `broadcast_changes` would leak full rows incl. price. Ping payload is `{id,status}` only. |
| Invoice numbers from a dedicated DB sequence | Race-safe for free; app never computes numbers. |
| Invoice save = wholesale item replace (header→delete→insert), not atomic | Accepted MVP risk (single admin, re-save recovers); documented in code. Upgrade path: small invoker-rights transactional function. |
| Revenue attributed by `issue_date` | No `paid_at` column (deliberately not added). Documented in `lib/dashboard.ts`. |
| PWA hand-rolled per Next 16's own guide | next-pwa unmaintained; Serwist requires webpack config that Turbopack silently ignores. |

**Process:** each plan was written by a plan-writer subagent from advisor-locked decisions, then executed with a fresh implementer subagent per task (TDD), a task-scoped reviewer per task, fix→re-review loops, a live verification task, and a final whole-branch review before merge. Reviewers caught real bugs pre-merge: NULL-role RPC bypass, typeahead stale-response race, StrictMode realtime channel leak, duplicate-create pin popover, double-click claim false error, keyboard double-activation on invoice rows. Live verification caught the rep RLS no-op bug that pgTAP `lives_ok` missed.

---

## 3. How to run

```bash
cd D:\Development\ClearViewCRM
npx supabase start        # needs Docker Desktop
npx supabase db reset     # migrations 0001-0012 + seed
npm run dev               # http://localhost:3000  (SW disabled in dev)
# production (enables the service worker / PWA):
npm run build && npm run start

npm test                  # 84 unit tests
npx supabase test db      # 51 pgTAP assertions
npm run lint
```

**Logins** (password `password123`): `admin@clearview.dev` · `rep@clearview.dev` · `cleaner@clearview.dev`

---

## 4. Left for you (the user)

1. **Mapbox token** — create a free account at mapbox.com, put the public token in `.env.local` as `NEXT_PUBLIC_MAPBOX_TOKEN=pk.…`, restart. The satellite map (`components/map/MapboxMap.tsx`) is built and code-reviewed but has **never run live** (token was empty all day) — do one manual pass: pins render/glow, click-to-drop popover, marker styling (`.mpin` is on an inner child because Mapbox owns the marker transform). Also wrap `onPinClick` in the same ref-indirection as `onMapClick` when you touch it (known minor: marker churn on re-render).
2. **Cloud Supabase** — create a project, `supabase db push` the migrations, create the three users + profiles (see `seed.sql` for shape; don't push demo seed to prod), set `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Verify the realtime private-channel policy works on cloud (it's standard, but confirm).
3. **Branding** — name/logo/colors are placeholder "ClearView"/◇/blue. Tokens live at the top of `app/globals.css`; logo glyph in `components/shell/Sidebar.tsx` + `public/icon.svg` + `app/manifest.ts`. iOS home-screen icon needs a PNG `apple-touch-icon` (manifest SVG is ignored by iOS) — one-time `npx pwa-asset-generator` run.
4. **Old app git URL** — never provided; mine it for missed requirements when available.
5. **Deployment** — Cloudflare Pages or Netlify per architecture doc (avoid Vercel hobby ToS). Set env vars; ensure `/sw.js` is served with a short/no-cache `Cache-Control`.
6. **Residual manual PWA checks** (headless verification couldn't cover): real install prompt on phone/desktop Chrome, DevTools offline toggle → `/offline` page, confirm login POST + Supabase calls show no "from ServiceWorker" in the Network panel.

## 5. Backlog (recorded during reviews; none blocking)

- Consolidate `getRole()`/`getSession()`/profile fetch (3-4 round trips per request) into one helper; `requireRole()` helper for guarded routes.
- Drop now-inert `leads_insert`/`leads_update` policies + grants (all lead writes go through RPCs).
- `profiles` read-all exposes `role` to everyone — least-privilege option: name-only projection or definer RPC.
- Error UI for failed Supabase queries (lists render empty / "No match" today); toast system generally.
- Product questions for client: pin popover default status "won"?; "Jobs/week" = trailing 7 days (not upcoming)?; cleaners may move own jobs backward (done→claimed)?
- Align dashboard revenue with `invoiceTotal` (tax/deposit) when Phase-3 fields go live; `$0` price renders blank on admin job cards.
- SW: `res.ok` guard before caching static responses; per-card (vs board-wide) pending gate on claim; drawer `key` on entity switch if cross-drawer navigation is ever added.
- Tests: typeahead race + zero-row save error branches (component-level, needs jsdom/mocked client).
- Phase 2+ (PRD roadmap): recurring service, photos, routes, native Expo app, payments, notifications.
