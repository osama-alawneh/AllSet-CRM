# Multi-Agent Review — Consolidated Findings (2026-07-07)

Four parallel read-only review agents (UI/UX, code quality + runtime, mobile/PWA, security/RLS)
audited the codebase at commit `3fe315c`. Baseline health: `tsc` clean, `eslint` clean,
vitest **111/111 pass**. Both hard PRD requirements verified:

- **Money invisible to rep/cleaner at the DB: HOLDS** — except one narrow leak (SEC-1).
- **Race-safe job claiming: HOLDS** — atomic guard + pgTAP coverage confirmed.

Findings below are deduplicated across agents and mapped to remediation waves.
Execution plans: `docs/superpowers/plans/2026-07-07-wave{1,2,3}-*.md`.

## Decisions (made 2026-07-07, baked into the plans)

| Decision | Choice |
|---|---|
| Mobile nav ≤860px | Hamburger in Topbar opening off-canvas Drawer (reuse `components/ui/Drawer.tsx`) |
| iOS PNG icons | Generate from existing `public/icon.svg` (sharp script), no new design |
| Cleaner job visibility | Move "unclaimed OR own OR admin/rep" filter into the `jobs_public` view (DB-enforced) |
| Mapbox phone gestures | Enable `cooperativeGestures: true` |
| Manifest `theme_color` | Dark paper `#070d18` (dark is the default theme) |

## Wave 1 — Security + server perf + iOS PWA (independent file territories, can parallelize)

| ID | Sev | Finding | Files |
|---|---|---|---|
| SEC-1 | High | `claim_job` `returns jobs` — full row incl. `price` leaks to cleaners calling the RPC via REST directly. App ignores the return value. Fix: return `bigint` (id). | `supabase/migrations/0009_claim_job_role.sql` → new migration |
| SEC-2 | Med | `job_photos` created without RLS or policies — landmine on hosted Supabase. | `0001_schema.sql:74-79` → new migration |
| SEC-3 | Med | Cleaner "only claimable + own" job visibility is app-side only (`lib/jobs.ts visibleJobs`); direct `jobs_public` query shows all jobs (no money). Decision: enforce in view. | `0002/0014` view defs → new migration |
| SEC-4 | Low | Rep can spoof `created_by`/`created_at`/`updated_at` via direct PostgREST write (0015 re-grants them). Integrity only. | `0015_leads_column_grants.sql` → new migration |
| PERF-1 | High | Auth re-fetched ~4×/page: `getRole()`+`getSession()` each do a GoTrue network round-trip; layout + page call both. Fix: React `cache()`. | `lib/auth.ts:9-20` |
| PERF-2 | Med | Serial query waterfalls on jobs/leads/map/invoices/customers pages (dashboard already uses `Promise.all`). | `app/(app)/*/page.tsx` |
| PERF-3 | Med | Every page read discards `error` — failed query renders as empty state, silently. | all pages |
| PWA-1 | Crit | iOS: no `apple-mobile-web-app-capable` meta → home-screen launch opens a Safari tab, not standalone. | `app/layout.tsx` |
| PWA-2 | Crit | SVG-only manifest icons; iOS ignores SVG and has no apple-touch-icon → blurry screenshot icon. | `app/manifest.ts`, `public/` |
| PWA-3 | Low | Manifest missing `id`; `theme_color` is light-mode accent though dark is default. | `app/manifest.ts` |

## Wave 2 — Contrast tokens + touch + keyboard drag (single territory: globals.css + boards/cards/pins)

| ID | Sev | Finding | Files |
|---|---|---|---|
| UI-1 | Crit | Selected status-pick buttons hardcode `color:'#fff'` on status-color fills → ~1.5:1 contrast in default dark theme (pastels). | `LeadDrawer.tsx:127`, `JobDrawer.tsx:171`, `PinPopover.tsx:53` |
| UI-5 | High | Light-theme `--won #0f9e63` (≈2.9:1) and `--follow #c98a12` (≈2.5:1) fail AA as small text. Darken ramp. | `app/globals.css:9-11` |
| UI-16 | Low | `--on-accent` token defined but never used; 5+ hardcoded `#fff` + dark-override pairs duplicate it. | `app/globals.css` |
| MOB-H1 | High | `touch-action:none` on kanban cards + 5px pointer activation → phone cannot scroll columns; every swipe is a drag. | `globals.css:237`, both boards |
| UI-2 | High | No `KeyboardSensor`; board cards can't be dragged or opened by keyboard. | `KanbanBoard.tsx:42`, `JobsBoard.tsx:48`, cards |
| MOB-H3 | High | 12px inputs → iOS auto-zoom on focus (also UI-19). | `globals.css:43` |
| MOB-M1 | Med | No safe-area insets / `viewport-fit=cover` (viewport half in Wave 1 PWA task). | `globals.css` |
| MOB-M2 | Med | `100vh` instead of `100dvh` (body, .app, .login, offline page). | `globals.css:36,50,240`, `app/offline/page.tsx` |
| MOB-M3/M4 | Med | Map pins 16px tap targets, hover-only affordance; nav/buttons below 44px. | `globals.css:133,65,92,98,189` |
| MOB-M6 | Med | Mapbox one-finger pan traps page scroll → `cooperativeGestures`. | `MapboxMap.tsx:28-36` |

## Wave 3 — Mobile nav + a11y primitives + polish

| ID | Sev | Finding | Files |
|---|---|---|---|
| MOB-H2 | High | No mobile nav collapse: full sidebar stacks above content ≤860px. Decision: hamburger + Drawer. | shell components, `globals.css:50-59` |
| UI-3 | High | Drawer: `aria-modal` but no focus trap, no focus restore, no accessible name, no body scroll lock (also UI-13). | `components/ui/Drawer.tsx` |
| UI-4 | High | GlobalSearch: clickable divs, no combobox/listbox ARIA, no arrow-key nav; Enter silently opens hit #1. | `components/search/GlobalSearch.tsx:92-111` |
| UI-6 | High | Zero `loading.tsx`/`error.tsx` in the repo — blank navigations, raw error screens. | `app/(app)/` |
| UI-7 | Med | Clickable `.minirow` divs lack keyboard support; `CustomerDrawer.tsx:47-57` already has the right `rowNav()` helper — extract + share. | LeadDrawer, JobDrawer |
| UI-8 | Med | Tabs: no ARIA roles/`aria-selected`/arrow keys. | `components/ui/Tabs.tsx` |
| UI-9 | Med | `.street`/`.block` classes in SchematicMap have no CSS anywhere — prototype styling never ported; map renders empty graph paper. | `SchematicMap.tsx:34-40`, `globals.css` |
| UI-10 | Med | ThemeToggle SSR always computes light; button label wrong on first dark load. Pass theme as server prop. | `ThemeToggle.tsx`, `Topbar.tsx`, layout |
| UI-11 | Med | Error `<p>`s lack `role="alert"` in 7 components (LoginForm/UsersPanel do it right); copy-pasted inline styles → `.form-err`. | boards, drawers, PinPopover, ClaimableJobs |
| UI-12 | Med | Map pins are `div onClick` — keyboard/AT can't open; make them `button`s with `aria-label`. | SchematicMap, MapboxMap, MiniMap |
| UI-14 | Med | "+ New customer" shown to cleaners but `?new=1` silently dropped — dead button. Gate on role. | `CustomersTable.tsx:32` |
| UI-15 | Med | UsersPanel create form: placeholder-as-label, unlabeled role select. | `UsersPanel.tsx:39-44` |
| UI-18/20/21, MOB-M5 | Low | Non-admin KPI grid half-empty (auto-fit); PinPopover no Escape + can overflow map edge (clamp); offline page hardcoded light palette. | dashboard, PinPopover, offline page |
| MOB-L3 | Low | No SW update-activation flow (skipWaiting/refresh prompt). Optional. | `public/sw.js`, `SWRegister.tsx` |

## Accepted / no action

- `saveInvoice` non-atomic — documented MVP risk; revisit with a DB-side RPC later (Code L3 / SEC L5).
- Seed `password123` logins — local `db reset` only; never apply `seed.sql` to hosted project (SEC L3).
- All-authenticated profile reads (names+roles) — deliberate, needed for claim chips (SEC L4).
- `update_job` `coalesce(p_price, price)` vs client blank→0 — semantic drift only, admin-gated (SEC L2).
- Null price vs real $0 conflation for admins — consistent with money-blanking design (Code L1).

## Untested critical paths (tracked, not scheduled)

- Claim first-wins under true concurrency (pgTAP covers single-session; guard is single-statement).
- Money-blank persistence end-to-end (`update_job`/`update_lead` → 0).
- Layout/page `redirect('/login')` flows.
- Consider `supabase gen types` for generated DB types (Code L2).

## Verified strengths (don't regress)

- SW: network-only navigations (no role-leaking cached HTML), versioned cache purge, precached offline page.
- Money structurally absent from non-admin fetches; `server-only` on admin client; role-split reads.
- All SECURITY DEFINER functions pin `search_path=''` with NULL-safe role guards.
- Zero-FOUC theme cookie; reduced-motion honored in CSS **and** JS; optimistic updates with revert; CSV formula-injection escaping; realtime payload money-free.
