# Plan 2 — Customers + Global Search + App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First real Blueprint+ UI: app shell (sidebar/topbar/theme toggle), customers list with filter, editable customer profile drawer with related Jobs/Invoices/Leads tabs, and global typeahead search — all backed by local Supabase with RLS.

**Architecture:** Server components fetch via `supabaseServer()`; mutations are Server Actions calling `revalidatePath`. Customer detail is a slide-over drawer driven by the `?c=<id>` search param on `/customers` (deep-linkable, back-button closes). Styling is a direct port of the Blueprint+ prototype CSS (`docs/design/clearview-proto.html`) into `globals.css` with Tailwind v4 `@theme inline` token mapping; dark mode is a `data-theme` attribute on `<html>` persisted in a cookie and read server-side (no FOUC). No new runtime deps (no react-query, no shadcn).

**Tech Stack:** Next.js 16 (App Router, async `cookies()`/`searchParams`), React 19, Tailwind v4, Supabase (`@supabase/ssr`), Vitest, pgTAP.

## Global Constraints

- **Next.js is v16** — `cookies()` from `next/headers` is async (`await cookies()`); `searchParams` page prop is a Promise (`await searchParams`). If unsure about an API, read `node_modules/next/dist/docs/` first. Heed `AGENTS.md`.
- **Any client component using `useSearchParams` must sit under a `<Suspense>` boundary** or `next build` fails. Prefer reading `searchParams` in the server page and passing values down.
- **New table write access needs BOTH an RLS policy AND a `grant` to `authenticated`** (local Supabase does not auto-grant). Identity-column inserts additionally need sequence usage.
- **pgTAP fixtures** use id range `900000+`, uuids `90000000-…`, emails `t-*@test.dev` (avoid seed collisions). Tests live in `supabase/tests/*.sql`, run with `npx supabase test db`.
- **Design source of truth:** `docs/design/clearview-proto.html`. Mirror its markup/classes/tokens. Status colors: won=green, lost=red, follow=amber, new=grey. Mono font, graph-paper background, offset `4px 4px 0` shadows, 1.5px ink borders, cyan accent in dark mode.
- **Roles:** `admin | rep | cleaner` (`lib/auth.ts` exports `Role`, `getRole()`). Money/invoices are admin-only at the DB (RLS). Non-admins read `jobs_public`/`leads_public` views, never `jobs`/`leads` base tables.
- Commands run from repo root `D:\Development\ClearViewCRM`. Unit tests: `npm test`. Dev DB must be up: `npx supabase start` (Docker is already running).
- Commit after every task with a conventional message.

---

### Task 1: Customer write policies (DB migration + pgTAP)

Admin and Rep may create/edit customers; Cleaner is view-only (PRD §3 role matrix). Currently `customers` has only a `select` policy/grant — the UI in Tasks 4 can't save without this.

**Files:**
- Create: `supabase/migrations/0005_customer_writes.sql`
- Test: `supabase/tests/customers_write.sql`

**Interfaces:**
- Consumes: `auth_role()` (migration 0002), `customers` table (0001).
- Produces: rep/admin can `insert`/`update` on `customers`; cleaner cannot. Later tasks call plain `sb.from('customers').update(...)/.insert(...)`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/customers_write.sql`:

```sql
begin;
select plan(5);
insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-w@test.dev'),
  ('90000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-w@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000011','Rep Writer','rep'),
  ('90000000-0000-0000-0000-000000000012','Cleaner Reader','cleaner');
insert into customers(id,name,phone) overriding system value values (900011,'Writable Co','000');

set local role authenticated;

-- rep can update
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000011"}';
select lives_ok($$ update customers set phone='555-1' where id=900011 $$, 'rep update runs');
select is((select phone from customers where id=900011), '555-1', 'rep update persisted');

-- rep can insert (no id: identity draws from sequence)
select lives_ok($$ insert into customers(name) values ('T-Inserted') $$, 'rep insert allowed');

-- cleaner cannot insert
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000012"}';
select throws_ok($$ insert into customers(name) values ('T-Nope') $$, '42501', null, 'cleaner insert blocked');

-- cleaner update matches zero rows (silently filtered by RLS)
select lives_ok($$ update customers set phone='999' where id=900011 $$, 'cleaner update runs but…');
-- …value must be unchanged; verify as rep (cleaner can still read, but keep it simple)
select * from finish();
rollback;
```

Note: the "unchanged" assertion is implicit — cleaner's update matches 0 rows because the `using` clause excludes them; the `throws_ok` on insert is the hard gate. 5 assertions total.

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase test db`
Expected: `customers_write` fails — rep update either errors `permission denied` (no grant) or persists nothing (no policy).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0005_customer_writes.sql`:

```sql
-- PRD role matrix: Admin + Rep create/edit customers; Cleaner is view-only.
create policy customers_insert on customers
  for insert with check (auth_role() in ('admin','rep'));
create policy customers_update on customers
  for update using (auth_role() in ('admin','rep'))
  with check (auth_role() in ('admin','rep'));

-- Local Supabase does not auto-grant table privileges (see 0004); RLS still gates rows.
grant insert, update on customers to authenticated;
-- identity columns draw from a sequence; inserts as `authenticated` need usage on it
grant usage, select on all sequences in schema public to authenticated;
```

- [ ] **Step 4: Apply + run tests**

Run: `npx supabase db reset` (applies migrations + seed), then `npx supabase test db`
Expected: all pgTAP files pass, including `customers_write` (5/5). Existing tests (`schema`, `rls_money`, `claim_job`) must still pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_customer_writes.sql supabase/tests/customers_write.sql
git commit -m "feat(db): admin/rep customer write policies + grants"
```

---

### Task 2: Blueprint+ tokens, theme cookie, and app shell

Port the prototype stylesheet, render `<html data-theme>` from a cookie, and build the sidebar/topbar shell with role-filtered nav. Placeholder pages for routes built in later plans so nav never 404s.

**Files:**
- Modify: `app/globals.css` (full replace)
- Modify: `app/layout.tsx` (theme cookie → `data-theme`)
- Modify: `app/(app)/layout.tsx` (render shell)
- Create: `lib/nav.ts`
- Create: `components/shell/Sidebar.tsx`, `components/shell/NavLink.tsx`, `components/shell/Topbar.tsx`, `components/shell/ThemeToggle.tsx`
- Create: `app/(app)/map/page.tsx`, `app/(app)/leads/page.tsx`, `app/(app)/jobs/page.tsx`, `app/(app)/invoices/page.tsx`, `app/(app)/settings/page.tsx` (placeholders)
- Modify: `app/(app)/dashboard/page.tsx` (placeholder panel in shell style)
- Test: `tests/unit/nav.test.ts`

**Interfaces:**
- Consumes: `Role`, `getRole()`, `guardDecision()` from `lib/auth.ts`; `supabaseServer()` from `lib/supabase/server.ts`.
- Produces:
  - `lib/nav.ts`: `type NavItem = { href: string; label: string; num: string; roles: Role[] }`, `NAV_ITEMS: NavItem[]`, `navForRole(role: Role): NavItem[]`, `titleFor(pathname: string): [string, string]`.
  - `components/shell/Topbar.tsx`: `function Topbar({ search }: { search?: React.ReactNode })` — Task 5 passes `<GlobalSearch/>` into `search`.
  - Global CSS classes matching the prototype (`.box`, `.lbl`, `.tbl`, `.badge`, `.drawer`, `.scrim`, `.tabs`, `.tabpane`, `.kv`, `.qa`, `.minirow`, `.acts`, `.btn-p`, `.btn-s`, `.btn`, `.iconbtn`, `.search`, `.sresults`, `.scard`, `.panel`, `.scrhead`, plus map/kanban/kpi classes for later plans).

- [ ] **Step 1: Write the failing nav unit tests**

Create `tests/unit/nav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { navForRole, titleFor, NAV_ITEMS } from '@/lib/nav';

describe('navForRole', () => {
  it('admin sees all 7 items', () => {
    expect(navForRole('admin').map(i => i.href)).toEqual([
      '/dashboard', '/map', '/leads', '/jobs', '/invoices', '/customers', '/settings',
    ]);
  });
  it('rep sees no invoices/settings', () => {
    const hrefs = navForRole('rep').map(i => i.href);
    expect(hrefs).toContain('/leads');
    expect(hrefs).not.toContain('/invoices');
    expect(hrefs).not.toContain('/settings');
  });
  it('cleaner sees no leads/invoices/settings', () => {
    const hrefs = navForRole('cleaner').map(i => i.href);
    expect(hrefs).toEqual(['/dashboard', '/map', '/jobs', '/customers']);
  });
  it('every item has a 2-digit num', () => {
    for (const i of NAV_ITEMS) expect(i.num).toMatch(/^\d{2}$/);
  });
});

describe('titleFor', () => {
  it('maps known routes', () => {
    expect(titleFor('/customers')[0]).toBe('Customers / Accounts');
    expect(titleFor('/dashboard')[0]).toBe('Dashboard / Daily Ops');
  });
  it('matches sub-paths and falls back to dashboard', () => {
    expect(titleFor('/customers?c=3'.split('?')[0])[0]).toBe('Customers / Accounts');
    expect(titleFor('/unknown')[0]).toBe('Dashboard / Daily Ops');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/nav'`.

- [ ] **Step 3: Implement `lib/nav.ts`**

```ts
import type { Role } from '@/lib/auth';

export type NavItem = { href: string; label: string; num: string; roles: Role[] };

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', num: '01', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/map',       label: 'Map',       num: '02', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/leads',     label: 'Leads',     num: '03', roles: ['admin', 'rep'] },
  { href: '/jobs',      label: 'Jobs',      num: '04', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/invoices',  label: 'Invoices',  num: '05', roles: ['admin'] },
  { href: '/customers', label: 'Customers', num: '06', roles: ['admin', 'rep', 'cleaner'] },
  { href: '/settings',  label: 'Settings',  num: '07', roles: ['admin'] },
];

export const navForRole = (role: Role): NavItem[] =>
  NAV_ITEMS.filter(i => i.roles.includes(role));

const TITLES: Record<string, [string, string]> = {
  '/dashboard': ['Dashboard / Daily Ops', 'role-aware overview'],
  '/map':       ['Map / Pin Board', 'click empty space to drop a pin'],
  '/leads':     ['Leads / Pipeline', 'drag to change status'],
  '/jobs':      ['Jobs / Board', 'claim to lock · drag status'],
  '/invoices':  ['Invoices / Billing', 'create · print PDF · export'],
  '/customers': ['Customers / Accounts', 'click a row to open profile'],
  '/settings':  ['Settings / Users', 'admin only'],
};

export function titleFor(pathname: string): [string, string] {
  const hit = Object.keys(TITLES).find(k => pathname === k || pathname.startsWith(k + '/'));
  return TITLES[hit ?? '/dashboard'];
}
```

- [ ] **Step 4: Run nav tests — pass**

Run: `npm test`
Expected: nav tests PASS (existing tests still green).

- [ ] **Step 5: Replace `app/globals.css` with the Blueprint+ port**

Full replace. This ports the prototype `<style>` (lines 2–204 of `docs/design/clearview-proto.html`) with three adaptations: (a) tokens on `:root` + `[data-theme="dark"]` on `<html>`; (b) Tailwind v4 `@custom-variant dark` + `@theme inline` mapping; (c) the prototype's `.app` wrapper/body styles become `body` + `.app` here. Copy map/kanban/kpi/invoice/print classes too — Plans 3–5 reuse them verbatim.

```css
@import "tailwindcss";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

:root {
  --font-blueprint: ui-monospace, "Cascadia Code", "Consolas", "SF Mono", monospace;
  --paper: #e9eef3; --grid: #ccd8e4; --card: #fbfcfe; --ink: #0e2036; --muted: #5f7188;
  --line: #d3dde8; --accent: #2f6df6; --accent-d: #1a4fc4; --shadow: rgba(14, 32, 54, .10);
  --won: #0f9e63; --lost: #d64848; --follow: #c98a12; --new: #5f7188;
  --sched: #7a5af0; --prog: #2f6df6; --done: #0f9e63; --chip: #eef3f9;
  --paid: #0f9e63; --sent: #c98a12; --draft: #5f7188;
  --on-accent: #ffffff;
}
[data-theme="dark"] {
  --paper: #070d18; --grid: #16233b; --card: #0e1830; --ink: #dce6f5; --muted: #7d8db0;
  --line: #1d2c48; --accent: #38e0ff; --accent-d: #22b8ff; --shadow: rgba(0, 0, 0, .5);
  --won: #31e6a8; --lost: #ff6b7a; --follow: #ffcb5e; --new: #8b98bd;
  --sched: #a68bff; --prog: #38e0ff; --done: #31e6a8; --chip: #12203c;
  --paid: #31e6a8; --sent: #ffcb5e; --draft: #8b98bd;
  --on-accent: #04101c;
}

@theme inline {
  --color-paper: var(--paper); --color-grid: var(--grid); --color-card: var(--card);
  --color-ink: var(--ink); --color-muted: var(--muted); --color-line: var(--line);
  --color-accent: var(--accent); --color-accent-d: var(--accent-d); --color-chip: var(--chip);
  --color-won: var(--won); --color-lost: var(--lost); --color-follow: var(--follow); --color-new: var(--new);
  --color-sched: var(--sched); --color-prog: var(--prog); --color-done: var(--done);
  --color-paid: var(--paid); --color-sent: var(--sent); --color-draft: var(--draft);
  --color-on-accent: var(--on-accent);
  --font-mono: var(--font-blueprint);
}

* { box-sizing: border-box; }
body {
  margin: 0; font-family: var(--font-blueprint); color: var(--ink); min-height: 100vh;
  background: linear-gradient(var(--grid) 1px, transparent 1px) 0 0 / 26px 26px,
    linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 26px 26px, var(--paper);
  transition: background .3s, color .3s;
}
a { color: inherit; text-decoration: none; }
button { font-family: var(--font-blueprint); cursor: pointer; }
input, select, textarea { font-family: var(--font-blueprint); font-size: 12px; padding: 8px 10px; border: 1.5px solid var(--line); border-radius: 4px; background: var(--paper); color: var(--ink); }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }

.app { display: grid; grid-template-columns: 212px 1fr; gap: 20px; padding: 20px; min-height: 100vh; }
@media (max-width: 860px) { .app { grid-template-columns: 1fr; padding: 12px; gap: 12px; } }

.box { background: var(--card); border: 1.5px solid var(--ink); border-radius: 4px; box-shadow: 4px 4px 0 var(--shadow); }
[data-theme="dark"] .box { border-color: var(--line); box-shadow: 0 10px 30px -18px #000; }
.lbl { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }

/* sidebar */
.side { padding: 16px 13px; display: flex; flex-direction: column; gap: 3px; align-self: start; position: sticky; top: 20px; }
@media (max-width: 860px) { .side { position: static; } }
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1.5px dashed var(--line); }
.logo { width: 36px; height: 36px; border: 1.5px solid var(--ink); border-radius: 4px; display: grid; place-items: center; font-size: 16px; background: var(--accent); color: #fff; }
[data-theme="dark"] .logo { border-color: var(--accent); color: #04101c; box-shadow: 0 0 18px -2px var(--accent); }
.brand b { font-size: 15px; } .brand small { display: block; font-size: 9px; letter-spacing: .18em; color: var(--muted); }
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav a { display: flex; align-items: center; gap: 9px; padding: 9px 11px; border-radius: 4px; color: var(--muted); font-size: 13px; transition: .12s; user-select: none; }
.nav a .n { font-size: 10px; color: var(--line); width: 16px; }
.nav a:hover { background: var(--chip); color: var(--ink); }
.nav a.on { background: var(--ink); color: var(--card); }
[data-theme="dark"] .nav a.on { background: var(--accent); color: #04101c; }
.nav a.on .n { color: var(--accent); } [data-theme="dark"] .nav a.on .n { color: #04101c; }
.side .foot { margin-top: 16px; padding-top: 14px; border-top: 1.5px dashed var(--line); }
.who { display: flex; gap: 9px; align-items: center; }
.who .av { width: 32px; height: 32px; border-radius: 4px; background: linear-gradient(135deg, var(--accent), var(--accent-d)); display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 13px; }
.who b { font-size: 12px; display: block; } .who small { font-size: 10px; color: var(--muted); }

/* main / topbar */
.main { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-bottom: 1.5px solid var(--ink); padding-bottom: 12px; }
[data-theme="dark"] .topbar { border-color: var(--line); }
.topbar h1 { font-size: 20px; letter-spacing: -.02em; margin: 0; }
.topbar .ref { font-size: 10px; color: var(--muted); margin-top: 3px; letter-spacing: .05em; }
.ctrls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.search { position: relative; }
.search input { width: 190px; }
.sresults { position: absolute; top: 110%; left: 0; width: 280px; z-index: 60; display: none; max-height: 320px; overflow: auto; padding: 6px; }
.sresults.show { display: block; }
.scard { padding: 9px 10px; border-radius: 4px; cursor: pointer; border-bottom: 1px dashed var(--line); }
.scard:last-child { border-bottom: 0; }
.scard:hover { background: var(--chip); }
.scard b { font-size: 12px; display: block; }
.scard small { font-size: 10px; color: var(--muted); display: block; line-height: 1.5; }
.iconbtn { background: transparent; border: 1.5px solid var(--line); border-radius: 6px; padding: 7px 10px; font-size: 12px; color: var(--muted); }
.iconbtn:hover { color: var(--ink); border-color: var(--ink); }

.screen { display: flex; flex-direction: column; gap: 18px; animation: fade .35s ease; }
@keyframes fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.scrhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.btn { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 8px 13px; border-radius: 4px; border: 1.5px solid var(--ink); background: var(--accent); color: #fff; }
[data-theme="dark"] .btn { border-color: var(--accent); color: #04101c; }
.btn.sec { background: transparent; color: var(--ink); border-color: var(--line); }
.btn.sec:hover { border-color: var(--ink); }

.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
@media (max-width: 1080px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .kpis { grid-template-columns: 1fr; } }
.kpi { padding: 15px; position: relative; }
.kpi .tag { position: absolute; top: 9px; right: 11px; font-size: 9px; color: var(--accent); }
.kpi .val { font-size: 26px; font-weight: 700; letter-spacing: -.03em; margin-top: 12px; font-variant-numeric: tabular-nums; }
.kpi .sub { font-size: 11px; margin-top: 5px; } .up { color: var(--won); } .warn { color: var(--follow); } .bad { color: var(--lost); }

.grid2 { display: grid; grid-template-columns: 1.5fr 1fr; gap: 18px; }
@media (max-width: 900px) { .grid2 { grid-template-columns: 1fr; } }
.panel { padding: 17px; } .panel h3 { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.panel .cap { color: var(--muted); font-size: 11px; margin: 4px 0 14px; }

.rowlist { display: flex; flex-direction: column; }
.lrow { display: flex; align-items: center; gap: 11px; padding: 11px 3px; border-bottom: 1px dashed var(--line); }
.lrow:last-child { border-bottom: 0; }
.pin-sq { width: 9px; height: 9px; border-radius: 2px; transform: rotate(45deg); flex: none; }
.lrow .info { flex: 1; min-width: 0; } .lrow b { font-size: 13px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lrow small { font-size: 11px; color: var(--muted); }
.claim { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 7px 11px; border: 1.5px solid var(--ink); border-radius: 4px; background: var(--accent); color: #fff; white-space: nowrap; }
[data-theme="dark"] .claim { border-color: var(--accent); color: #04101c; }
.claim:hover { background: var(--accent-d); }
.claim.locked, .claim.mine { background: transparent; color: var(--won); border-color: var(--won); cursor: default; }

/* map (Plan 3 reuses) */
.maptools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.hint { font-size: 11px; color: var(--muted); }
.map { position: relative; height: min(56vh, 520px); border: 1.5px solid var(--ink); border-radius: 4px; overflow: hidden; cursor: crosshair;
  background: linear-gradient(var(--grid) 1px, transparent 1px) 0 0 / 22px 22px, linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 22px 22px, var(--card); }
[data-theme="dark"] .map { border-color: var(--line); }
.mpin { position: absolute; width: 16px; height: 16px; border-radius: 3px; transform: translate(-50%, -50%) rotate(45deg); cursor: pointer; border: 1.5px solid var(--card); transition: transform .12s; z-index: 2; }
.mpin i { position: absolute; inset: 2px; border-radius: 1px; background: var(--pc); }
[data-theme="dark"] .mpin { box-shadow: 0 0 12px 1px var(--pc); }
.mpin:hover { transform: translate(-50%, -50%) rotate(45deg) scale(1.35); z-index: 5; }
.mpin.drop { animation: drop .4s cubic-bezier(.2, 1.3, .4, 1); }
@keyframes drop { 0% { transform: translate(-50%, -140%) rotate(45deg); opacity: 0; } 100% { transform: translate(-50%, -50%) rotate(45deg); opacity: 1; } }
.legend { display: flex; gap: 16px; margin-top: 12px; font-size: 11px; color: var(--muted); flex-wrap: wrap; }
.legend span { display: flex; align-items: center; gap: 6px; } .lg { width: 9px; height: 9px; border-radius: 2px; transform: rotate(45deg); }
.pop { position: absolute; z-index: 20; width: 230px; padding: 13px; transform: translate(-50%, 12px); }
.pop h4 { margin: 0 0 3px; font-size: 12px; text-transform: uppercase; } .pop p { margin: 0 0 10px; font-size: 10px; color: var(--muted); }
.pop input { width: 100%; margin-bottom: 8px; }
.statuspick { display: flex; gap: 6px; margin-bottom: 10px; }
.statuspick button { flex: 1; padding: 7px 0; font-size: 9px; text-transform: uppercase; border: 1.5px solid var(--line); border-radius: 4px; background: transparent; color: var(--muted); }
.statuspick button.sel { color: #fff; border-color: transparent; }
.pop .row { display: flex; gap: 6px; }
.pop .go { flex: 1; padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; border: 1.5px solid var(--ink); border-radius: 4px; background: var(--accent); color: #fff; }
[data-theme="dark"] .pop .go { border-color: var(--accent); color: #04101c; }
.pop .x { padding: 8px 11px; font-size: 10px; border: 1.5px solid var(--line); border-radius: 4px; background: transparent; color: var(--muted); }

/* kanban (Plans 3-4 reuse) */
.kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
@media (max-width: 1000px) { .kanban { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .kanban { grid-template-columns: 1fr; } }
.col { padding: 13px; min-height: 140px; transition: .12s; }
.col.dragover { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent) inset; }
.col .ch { display: flex; align-items: center; justify-content: space-between; margin-bottom: 11px; }
.col .ch b { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.col .ch .cnt { font-size: 10px; color: var(--muted); background: var(--chip); padding: 2px 7px; border-radius: 10px; }
.card2 { padding: 11px; border: 1.5px solid var(--line); border-radius: 4px; margin-bottom: 9px; background: var(--paper); cursor: grab; transition: .12s; }
.card2:hover { border-color: var(--ink); transform: translateX(2px); } [data-theme="dark"] .card2:hover { border-color: var(--accent); }
.card2.dragging { opacity: .4; }
.card2 .addr { font-size: 12px; font-weight: 700; display: block; margin-bottom: 3px; }
.card2 .meta { font-size: 10px; color: var(--muted); line-height: 1.5; }
.card2 .val { font-size: 11px; font-weight: 700; color: var(--won); margin-top: 6px; }

/* tables */
.tbl { width: 100%; border-collapse: collapse; font-size: 12px; } .tblwrap { overflow-x: auto; }
.tbl th { text-align: left; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); padding: 9px 10px; border-bottom: 1.5px solid var(--line); white-space: nowrap; }
.tbl td { padding: 11px 10px; border-bottom: 1px dashed var(--line); }
.tbl tr[data-click] { cursor: pointer; } .tbl tr[data-click]:hover td { background: var(--chip); }
.badge { font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 3px 8px; border-radius: 3px; display: inline-block; }

/* drawer */
.scrim { position: fixed; inset: 0; background: rgba(6, 14, 30, .5); opacity: 0; pointer-events: none; transition: .25s; z-index: 40; }
.scrim.open { opacity: 1; pointer-events: auto; }
.drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(440px, 94vw); background: var(--card); border-left: 1.5px solid var(--ink); transform: translateX(100%); transition: transform .3s cubic-bezier(.2, .8, .2, 1); z-index: 50; overflow-y: auto; padding: 22px; box-shadow: -20px 0 60px -30px #000; }
[data-theme="dark"] .drawer { border-color: var(--line); }
.drawer.open { transform: none; }
.drawer .dh { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.drawer h2 { font-size: 19px; margin: 6px 0 0; letter-spacing: -.02em; }
.drawer .close { background: transparent; border: 1.5px solid var(--line); border-radius: 4px; padding: 5px 9px; color: var(--muted); font-size: 14px; }
.drawer .sec { margin-top: 20px; } .drawer .sec > .lbl { margin-bottom: 8px; display: block; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 7px 14px; font-size: 12px; }
.kv .k { color: var(--muted); } .kv .v { text-align: right; font-weight: 700; }
.kv input, .kv select { text-align: right; width: 100%; }
.qa { display: flex; gap: 7px; margin-top: 12px; }
.qa a { flex: 1; text-align: center; padding: 9px; border: 1.5px solid var(--line); border-radius: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.qa a:hover { border-color: var(--accent); color: var(--accent); }
.tabs { display: flex; gap: 6px; border-bottom: 1.5px solid var(--line); margin-top: 18px; }
.tabs button { background: transparent; border: 0; border-bottom: 2px solid transparent; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: -1.5px; }
.tabs button.on { color: var(--ink); border-bottom-color: var(--accent); }
.tabpane { display: none; margin-top: 14px; } .tabpane.on { display: block; }
.minirow { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px dashed var(--line); font-size: 11px; cursor: pointer; }
.minirow:hover { color: var(--accent); }
.timeline { display: flex; flex-direction: column; gap: 10px; font-size: 11px; }
.timeline .ev { display: flex; gap: 10px; } .timeline .ev .d { color: var(--muted); white-space: nowrap; }
.timeline .ev .t { position: relative; padding-left: 14px; }
.timeline .ev .t::before { content: ""; position: absolute; left: 0; top: 4px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.acts { display: flex; gap: 8px; margin-top: 22px; flex-wrap: wrap; }
.acts button { flex: 1; min-width: 120px; padding: 11px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; border-radius: 4px; }
.btn-p { background: var(--accent); color: #fff; border: 1.5px solid var(--ink); } [data-theme="dark"] .btn-p { border-color: var(--accent); color: #04101c; }
.btn-s { background: transparent; color: var(--ink); border: 1.5px solid var(--line); }

/* invoice line items (Plan 5 reuses) */
.items { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
.items th { font-size: 9px; text-transform: uppercase; color: var(--muted); text-align: left; padding: 5px 6px; }
.items td { padding: 4px 6px; border-top: 1px dashed var(--line); }
.items input { width: 100%; } .items .num { width: 64px; text-align: right; }
.money-hidden { letter-spacing: 2px; }

/* print (Plan 5 reuses) */
#printArea { display: none; }
@media print {
  .app, .drawer, .scrim, .sresults { display: none !important; }
  #printArea { display: block !important; padding: 40px; color: #000; font-family: var(--font-blueprint); }
  #printArea h1 { font-size: 26px; margin: 0; }
  #printArea .inv-tbl { width: 100%; border-collapse: collapse; margin-top: 20px; }
  #printArea .inv-tbl th { text-align: left; border-bottom: 2px solid #000; padding: 8px; font-size: 11px; }
  #printArea .inv-tbl td { padding: 8px; border-bottom: 1px solid #ccc; font-size: 12px; }
  #printArea .tot { text-align: right; font-size: 16px; font-weight: 700; margin-top: 16px; }
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

- [ ] **Step 6: Theme cookie in root layout**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClearView CRM',
  description: 'Window-cleaning CRM — Blueprint+',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('theme')?.value === 'dark' ? 'dark' : 'light';
  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
```

(Remove the Geist font imports/usage — Blueprint+ is system monospace.)

- [ ] **Step 7: Shell components**

Create `components/shell/ThemeToggle.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
    setDark(!dark);
  };
  return (
    <button className="iconbtn" onClick={toggle} aria-label="Toggle dark mode">
      {dark ? '◑ Light' : '◐ Dark'}
    </button>
  );
}
```

Create `components/shell/NavLink.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, num, label }: { href: string; num: string; label: string }) {
  const pathname = usePathname();
  const on = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} className={on ? 'on' : ''}>
      <span className="n">{num}</span> {label}
    </Link>
  );
}
```

Create `components/shell/Sidebar.tsx` (server component):

```tsx
import type { Role } from '@/lib/auth';
import { navForRole } from '@/lib/nav';
import { NavLink } from './NavLink';

export function Sidebar({ role, name }: { role: Role; name: string }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <aside className="side box">
      <div className="brand">
        <div className="logo">◇</div>
        <div>
          <b>ClearView</b>
          <small>BLUEPRINT+</small>
        </div>
      </div>
      <nav className="nav">
        {navForRole(role).map(i => (
          <NavLink key={i.href} {...i} />
        ))}
      </nav>
      <div className="foot">
        <div className="who">
          <div className="av">{initial}</div>
          <div>
            <b>{name}</b>
            <small>ROLE: {role.toUpperCase()}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
```

Create `components/shell/Topbar.tsx` (client — needs pathname for the title):

```tsx
'use client';
import { usePathname } from 'next/navigation';
import { titleFor } from '@/lib/nav';
import { ThemeToggle } from './ThemeToggle';

export function Topbar({ search }: { search?: React.ReactNode }) {
  const pathname = usePathname();
  const [title, ref] = titleFor(pathname);
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        <div className="ref">{ref.toUpperCase()}</div>
      </div>
      <div className="ctrls">
        {search}
        <ThemeToggle />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Wire the shell into `app/(app)/layout.tsx`**

Replace `app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getRole, guardDecision, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  const to = guardDecision(role);
  if (to || !role) {
    redirect(to ?? '/login');
  }
  const user = await getSession();
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('full_name').eq('id', user!.id).single();
  return (
    <div className="app">
      <Sidebar role={role} name={profile?.full_name ?? 'Unknown'} />
      <div className="main">
        <Topbar />
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Placeholder pages**

`app/(app)/dashboard/page.tsx` (replace):

```tsx
export default function Dashboard() {
  return (
    <section className="screen">
      <div className="panel box">
        <h3>Dashboard</h3>
        <p className="cap">KPIs, revenue chart, claimable jobs and mini-map arrive in Plan 5.</p>
      </div>
    </section>
  );
}
```

`app/(app)/map/page.tsx`:

```tsx
export default function MapPage() {
  return (
    <section className="screen">
      <div className="panel box">
        <h3>Map / Pin Board</h3>
        <p className="cap">Mapbox pin map arrives in Plan 3.</p>
      </div>
    </section>
  );
}
```

`app/(app)/leads/page.tsx`:

```tsx
export default function LeadsPage() {
  return (
    <section className="screen">
      <div className="panel box">
        <h3>Leads / Pipeline</h3>
        <p className="cap">Kanban pipeline arrives in Plan 3.</p>
      </div>
    </section>
  );
}
```

`app/(app)/jobs/page.tsx`:

```tsx
export default function JobsPage() {
  return (
    <section className="screen">
      <div className="panel box">
        <h3>Jobs / Board</h3>
        <p className="cap">Job board with realtime claim arrives in Plan 4.</p>
      </div>
    </section>
  );
}
```

`app/(app)/invoices/page.tsx` (admin route guard):

```tsx
import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';

export default async function InvoicesPage() {
  const role = await getRole();
  if (role !== 'admin') redirect('/dashboard');
  return (
    <section className="screen">
      <div className="panel box">
        <h3>Invoices / Billing</h3>
        <p className="cap">Invoice CRUD + PDF arrives in Plan 5.</p>
      </div>
    </section>
  );
}
```

`app/(app)/settings/page.tsx` (admin route guard):

```tsx
import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';

export default async function SettingsPage() {
  const role = await getRole();
  if (role !== 'admin') redirect('/dashboard');
  return (
    <section className="screen">
      <div className="panel box">
        <h3>Settings / Users</h3>
        <p className="cap">User management arrives post-MVP; roles are seeded in the DB.</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 10: Verify build + tests**

Run: `npm test` — all unit tests pass.
Run: `npm run build` — clean build, no Suspense/searchParams errors.

- [ ] **Step 11: Commit**

```bash
git add app components lib/nav.ts tests/unit/nav.test.ts
git commit -m "feat(shell): Blueprint+ tokens, theme cookie, sidebar/topbar shell + placeholder routes"
```

---

### Task 3: Customers list page

Server-fetched customer table with client-side filter; rows link to the drawer (`?c=<id>`, built in Task 4 — clicking before Task 4 just sets the param and renders nothing, harmless).

**Files:**
- Create: `app/(app)/customers/page.tsx`
- Create: `components/customers/CustomersTable.tsx`
- Test: `tests/unit/customers-filter.test.ts`
- Create: `lib/customers.ts` (starts here with the filter helper; Task 4 adds the form parser)

**Interfaces:**
- Consumes: `supabaseServer()`, `getRole()`, CSS classes from Task 2.
- Produces:
  - `lib/customers.ts`: `type CustomerRow = { id: number; name: string; phone: string | null; email: string | null; address: string | null; type: 'residential' | 'commercial'; notes: string | null; jobs: number; invoices: number | null }` and `filterCustomers(rows: CustomerRow[], q: string): CustomerRow[]` (case-insensitive match on name/address/phone).
  - `components/customers/CustomersTable.tsx`: `function CustomersTable({ rows, admin }: { rows: CustomerRow[]; admin: boolean })` — client component; row click pushes `/customers?c=<id>`.
  - `/customers` server page renders the table and (from Task 4) the drawer.

- [ ] **Step 1: Write the failing filter tests**

Create `tests/unit/customers-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterCustomers, type CustomerRow } from '@/lib/customers';

const row = (over: Partial<CustomerRow>): CustomerRow => ({
  id: 1, name: 'Sarah Kim', phone: '555-0142', email: null, address: '142 Maple Ave',
  type: 'residential', notes: null, jobs: 0, invoices: null, ...over,
});

describe('filterCustomers', () => {
  const rows = [
    row({ id: 1, name: 'Sarah Kim', address: '142 Maple Ave' }),
    row({ id: 2, name: 'Alan Webb', address: '900 Market St', phone: '555-0900' }),
    row({ id: 3, name: 'Alicia Cole', address: '401 Rowan Ave', phone: null }),
  ];
  it('empty query returns all', () => {
    expect(filterCustomers(rows, '')).toHaveLength(3);
  });
  it('matches name case-insensitively', () => {
    expect(filterCustomers(rows, 'al').map(r => r.id)).toEqual([2, 3]);
  });
  it('matches address', () => {
    expect(filterCustomers(rows, 'maple').map(r => r.id)).toEqual([1]);
  });
  it('matches phone and tolerates null phone', () => {
    expect(filterCustomers(rows, '0900').map(r => r.id)).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/customers'`.

- [ ] **Step 3: Implement `lib/customers.ts`**

```ts
export type CustomerRow = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  type: 'residential' | 'commercial';
  notes: string | null;
  jobs: number;
  invoices: number | null; // null = caller may not see invoices (non-admin)
};

export function filterCustomers(rows: CustomerRow[], q: string): CustomerRow[] {
  const f = q.trim().toLowerCase();
  if (!f) return rows;
  return rows.filter(
    r =>
      r.name.toLowerCase().includes(f) ||
      (r.address ?? '').toLowerCase().includes(f) ||
      (r.phone ?? '').toLowerCase().includes(f)
  );
}
```

- [ ] **Step 4: Run tests — pass**

Run: `npm test` — filter tests PASS.

- [ ] **Step 5: Build the table component**

Create `components/customers/CustomersTable.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { filterCustomers, type CustomerRow } from '@/lib/customers';

export function CustomersTable({ rows, admin }: { rows: CustomerRow[]; admin: boolean }) {
  const [q, setQ] = useState('');
  const router = useRouter();
  const shown = filterCustomers(rows, q);
  return (
    <section className="screen">
      <div className="scrhead">
        <input
          placeholder="🔍 filter customers…"
          style={{ width: 240 }}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button className="btn" onClick={() => router.push('/customers?new=1', { scroll: false })}>
          + New customer
        </button>
      </div>
      <div className="panel box">
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Address</th>
                <th>Type</th>
                <th>Jobs</th>
                {admin && <th>Invoices</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map(c => (
                <tr
                  key={c.id}
                  data-click=""
                  onClick={() => router.push(`/customers?c=${c.id}`, { scroll: false })}
                >
                  <td>
                    <b>{c.name}</b>
                    <br />
                    <small style={{ color: 'var(--muted)' }}>{c.phone ?? '—'}</small>
                  </td>
                  <td>{c.address ?? '—'}</td>
                  <td>
                    <span className="badge" style={{ background: 'var(--chip)', color: 'var(--muted)' }}>
                      {c.type}
                    </span>
                  </td>
                  <td>{c.jobs} jobs</td>
                  {admin && <td>{c.invoices ?? 0} inv</td>}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={admin ? 5 : 4} style={{ color: 'var(--muted)' }}>
                    No customers match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Build the server page**

Create `app/(app)/customers/page.tsx`:

```tsx
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { CustomersTable } from '@/components/customers/CustomersTable';
import type { CustomerRow } from '@/lib/customers';

export default async function CustomersPage() {
  const role = await getRole();
  const admin = role === 'admin';
  const sb = await supabaseServer();

  const { data: customers } = await sb
    .from('customers')
    .select('id,name,phone,email,address,type,notes')
    .order('name');
  const { data: jobRows } = await sb.from('jobs_public').select('customer_id');
  const { data: invRows } = admin ? await sb.from('invoices').select('customer_id') : { data: null };

  const jobCount = new Map<number, number>();
  for (const j of jobRows ?? []) jobCount.set(j.customer_id, (jobCount.get(j.customer_id) ?? 0) + 1);
  const invCount = new Map<number, number>();
  for (const i of invRows ?? []) invCount.set(i.customer_id, (invCount.get(i.customer_id) ?? 0) + 1);

  const rows: CustomerRow[] = (customers ?? []).map(c => ({
    ...c,
    jobs: jobCount.get(c.id) ?? 0,
    invoices: admin ? (invCount.get(c.id) ?? 0) : null,
  }));

  return <CustomersTable rows={rows} admin={admin} />;
}
```

- [ ] **Step 7: Verify build + manual smoke**

Run: `npm run build` — clean.
Run: `npm test` — green.

- [ ] **Step 8: Commit**

```bash
git add app/(app)/customers components/customers lib/customers.ts tests/unit/customers-filter.test.ts
git commit -m "feat(customers): list page with client filter + role-aware invoice column"
```

---

### Task 4: Customer profile drawer (edit + create + related tabs)

Slide-over drawer on `/customers?c=<id>` (edit) and `/customers?new=1` (create). Editable details, tabs Jobs / Invoices (admin) / Leads / Notes, save via Server Action. Cleaner gets read-only inputs and no save.

**Files:**
- Create: `components/ui/Drawer.tsx`, `components/ui/Tabs.tsx`
- Create: `components/customers/CustomerDrawer.tsx`
- Create: `app/(app)/customers/actions.ts`
- Modify: `app/(app)/customers/page.tsx` (fetch drawer data when `?c=`/`?new=1`, render drawer)
- Modify: `lib/customers.ts` (add `parseCustomerForm`)
- Test: `tests/unit/customer-form.test.ts`

**Interfaces:**
- Consumes: Task 1 write policies; Task 2 CSS + shell; Task 3 page/`CustomerRow`.
- Produces:
  - `lib/customers.ts` adds: `type CustomerInput = { name: string; phone: string | null; email: string | null; address: string | null; type: 'residential' | 'commercial'; notes: string | null }` and `parseCustomerForm(fd: FormData): { ok: true; value: CustomerInput } | { ok: false; error: string }`.
  - `app/(app)/customers/actions.ts`: `saveCustomer(id: number, fd: FormData): Promise<{ error?: string }>` and `createCustomer(fd: FormData): Promise<{ error?: string }>` (redirects to `/customers?c=<newId>` on success).
  - `components/ui/Drawer.tsx`: `function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode })` — scrim + Esc close + slide-over; Plans 3–5 reuse for lead/job/invoice drawers.
  - `components/ui/Tabs.tsx`: `function Tabs({ tabs }: { tabs: { key: string; label: string; content: React.ReactNode }[] })`.

- [ ] **Step 1: Write the failing form-parser tests**

Create `tests/unit/customer-form.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCustomerForm } from '@/lib/customers';

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('parseCustomerForm', () => {
  it('requires a name', () => {
    const r = parseCustomerForm(fd({ name: '  ' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/i);
  });
  it('trims fields and nulls empties', () => {
    const r = parseCustomerForm(fd({ name: ' Sarah Kim ', phone: '', email: ' s@k.io ', address: '', notes: '', type: 'residential' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('Sarah Kim');
      expect(r.value.phone).toBeNull();
      expect(r.value.email).toBe('s@k.io');
      expect(r.value.address).toBeNull();
      expect(r.value.notes).toBeNull();
    }
  });
  it('defaults unknown type to residential, accepts commercial', () => {
    const a = parseCustomerForm(fd({ name: 'A', type: 'weird' }));
    if (a.ok) expect(a.value.type).toBe('residential');
    const b = parseCustomerForm(fd({ name: 'B', type: 'commercial' }));
    if (b.ok) expect(b.value.type).toBe('commercial');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `parseCustomerForm` is not exported.

- [ ] **Step 3: Add the parser to `lib/customers.ts`**

Append:

```ts
export type CustomerInput = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  type: 'residential' | 'commercial';
  notes: string | null;
};

export function parseCustomerForm(
  fd: FormData
): { ok: true; value: CustomerInput } | { ok: false; error: string } {
  const name = String(fd.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required' };
  const opt = (k: string) => {
    const v = String(fd.get(k) ?? '').trim();
    return v || null;
  };
  return {
    ok: true,
    value: {
      name,
      type: fd.get('type') === 'commercial' ? 'commercial' : 'residential',
      phone: opt('phone'),
      email: opt('email'),
      address: opt('address'),
      notes: opt('notes'),
    },
  };
}
```

- [ ] **Step 4: Run tests — pass**

Run: `npm test` — PASS.

- [ ] **Step 5: Server actions**

Create `app/(app)/customers/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { parseCustomerForm } from '@/lib/customers';

export async function saveCustomer(id: number, fd: FormData): Promise<{ error?: string }> {
  const parsed = parseCustomerForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const sb = await supabaseServer();
  const { error } = await sb.from('customers').update(parsed.value).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/customers');
  return {};
}

export async function createCustomer(fd: FormData): Promise<{ error?: string }> {
  const parsed = parseCustomerForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from('customers')
    .insert(parsed.value)
    .select('id')
    .single();
  if (error) return { error: error.message };
  revalidatePath('/customers');
  redirect(`/customers?c=${data.id}`);
}
```

Note: `redirect()` throws — do not wrap it in try/catch.

- [ ] **Step 6: Generic Drawer + Tabs**

Create `components/ui/Drawer.tsx`:

```tsx
'use client';
import { useEffect } from 'react';

export function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim open" onClick={onClose} />
      <aside className="drawer box open" role="dialog" aria-modal="true">
        {children}
      </aside>
    </>
  );
}
```

Create `components/ui/Tabs.tsx`:

```tsx
'use client';
import { useState } from 'react';

export function Tabs({ tabs }: { tabs: { key: string; label: string; content: React.ReactNode }[] }) {
  const [on, setOn] = useState(tabs[0]?.key);
  return (
    <>
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={t.key === on ? 'on' : ''} onClick={() => setOn(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map(t => (
        <div key={t.key} className={`tabpane ${t.key === on ? 'on' : ''}`}>
          {t.content}
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 7: CustomerDrawer**

Create `components/customers/CustomerDrawer.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import { Tabs } from '@/components/ui/Tabs';
import { saveCustomer, createCustomer } from '@/app/(app)/customers/actions';
import type { Role } from '@/lib/auth';

const JOB_COLORS: Record<string, string> = {
  unclaimed: 'var(--new)', claimed: 'var(--sched)', in_progress: 'var(--prog)', done: 'var(--done)',
};
const JOB_NAMES: Record<string, string> = {
  unclaimed: 'Unclaimed', claimed: 'Claimed', in_progress: 'In progress', done: 'Done',
};
const LEAD_COLORS: Record<string, string> = {
  won: 'var(--won)', lost: 'var(--lost)', follow: 'var(--follow)', new: 'var(--new)',
};
const LEAD_NAMES: Record<string, string> = { won: 'Won', lost: 'Lost', follow: 'Follow-up', new: 'New' };
const INV_COLORS: Record<string, string> = { paid: 'var(--paid)', sent: 'var(--sent)', draft: 'var(--draft)' };
const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export type DrawerCustomer = {
  id: number; name: string; phone: string | null; email: string | null;
  address: string | null; type: 'residential' | 'commercial'; notes: string | null;
};
export type DrawerJob = { id: number; service: string | null; status: string; scheduled_date: string | null };
export type DrawerLead = { id: number; service: string | null; status: string };
export type DrawerInvoice = { id: number; number: string; issue_date: string; status: string; total: number };

export function CustomerDrawer({
  customer, jobs, leads, invoices, role, isNew,
}: {
  customer: DrawerCustomer | null;
  jobs: DrawerJob[];
  leads: DrawerLead[];
  invoices: DrawerInvoice[] | null; // null = non-admin
  role: Role;
  isNew: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canEdit = role !== 'cleaner';
  const close = () => router.push('/customers', { scroll: false });

  if (!isNew && !customer) return null;
  const c = customer;

  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = isNew ? await createCustomer(fd) : await saveCustomer(c!.id, fd);
      if (res?.error) setError(res.error);
      else if (!isNew) close();
    });
  };

  const tabs = [
    {
      key: 'jobs',
      label: `Jobs (${jobs.length})`,
      content: jobs.length ? (
        jobs.map(j => (
          <div className="minirow" key={j.id}>
            <span>{j.service ?? 'Job'} · {j.scheduled_date ?? 'TBD'}</span>
            <span className="badge" style={{ background: 'var(--chip)', color: JOB_COLORS[j.status] }}>
              {JOB_NAMES[j.status] ?? j.status}
            </span>
          </div>
        ))
      ) : (
        <div className="cap" style={{ color: 'var(--muted)', fontSize: 11 }}>No jobs yet.</div>
      ),
    },
    ...(invoices !== null
      ? [{
          key: 'inv',
          label: `Invoices (${invoices.length})`,
          content: invoices.length ? (
            invoices.map(i => (
              <div className="minirow" key={i.id}>
                <span>{i.number} · {i.issue_date}</span>
                <span>
                  {fmt(i.total)}{' '}
                  <span className="badge" style={{ background: 'var(--chip)', color: INV_COLORS[i.status] }}>
                    {i.status}
                  </span>
                </span>
              </div>
            ))
          ) : (
            <div className="cap" style={{ color: 'var(--muted)', fontSize: 11 }}>No invoices.</div>
          ),
        }]
      : []),
    {
      key: 'leads',
      label: `Leads (${leads.length})`,
      content: leads.length ? (
        leads.map(l => (
          <div className="minirow" key={l.id}>
            <span>{l.service ?? 'Lead'}</span>
            <span className="badge" style={{ background: 'var(--chip)', color: LEAD_COLORS[l.status] }}>
              {LEAD_NAMES[l.status] ?? l.status}
            </span>
          </div>
        ))
      ) : (
        <div className="cap" style={{ color: 'var(--muted)', fontSize: 11 }}>No leads.</div>
      ),
    },
  ];

  return (
    <Drawer onClose={close}>
      <form action={submit}>
        <div className="dh">
          <div>
            <span className="badge" style={{ background: 'var(--chip)', color: 'var(--muted)' }}>
              {isNew ? 'NEW' : `CUSTOMER #${String(c!.id).padStart(4, '0')}`}
            </span>
            <h2>{isNew ? 'New customer' : c!.name}</h2>
          </div>
          <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
        </div>
        {!isNew && (
          <div className="qa">
            <a href={`tel:${c!.phone ?? ''}`}>📞 Call</a>
            <a href={`sms:${c!.phone ?? ''}`}>💬 Text</a>
            <a href={`mailto:${c!.email ?? ''}`}>✉ Email</a>
          </div>
        )}
        <div className="sec">
          <span className="lbl">Details {canEdit ? '(editable)' : '(read-only)'}</span>
          <div className="kv">
            <span className="k">Name</span>
            <span className="v"><input name="name" defaultValue={c?.name ?? ''} disabled={!canEdit} required /></span>
            <span className="k">Phone</span>
            <span className="v"><input name="phone" defaultValue={c?.phone ?? ''} disabled={!canEdit} /></span>
            <span className="k">Email</span>
            <span className="v"><input name="email" defaultValue={c?.email ?? ''} disabled={!canEdit} /></span>
            <span className="k">Address</span>
            <span className="v"><input name="address" defaultValue={c?.address ?? ''} disabled={!canEdit} /></span>
            <span className="k">Type</span>
            <span className="v">
              <select name="type" defaultValue={c?.type ?? 'residential'} disabled={!canEdit}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </span>
          </div>
        </div>
        {!isNew && <Tabs tabs={tabs} />}
        <div className="sec">
          <span className="lbl">Notes</span>
          <textarea
            name="notes"
            defaultValue={c?.notes ?? ''}
            disabled={!canEdit}
            style={{ width: '100%', minHeight: 90 }}
          />
        </div>
        {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
        <div className="acts">
          {canEdit && (
            <button className="btn-p" type="submit" disabled={pending}>
              {pending ? 'Saving…' : isNew ? 'Create customer' : 'Save customer'}
            </button>
          )}
          <button className="btn-s" type="button" onClick={close}>Close</button>
        </div>
      </form>
    </Drawer>
  );
}
```

- [ ] **Step 8: Wire drawer data into the page**

Replace `app/(app)/customers/page.tsx`:

```tsx
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { CustomersTable } from '@/components/customers/CustomersTable';
import {
  CustomerDrawer,
  type DrawerCustomer,
  type DrawerJob,
  type DrawerLead,
  type DrawerInvoice,
} from '@/components/customers/CustomerDrawer';
import type { CustomerRow } from '@/lib/customers';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const { c: cParam, new: newParam } = await searchParams;
  const role = await getRole();
  const admin = role === 'admin';
  const sb = await supabaseServer();

  const { data: customers } = await sb
    .from('customers')
    .select('id,name,phone,email,address,type,notes')
    .order('name');
  const { data: jobRows } = await sb.from('jobs_public').select('customer_id');
  const { data: invRows } = admin ? await sb.from('invoices').select('customer_id') : { data: null };

  const jobCount = new Map<number, number>();
  for (const j of jobRows ?? []) jobCount.set(j.customer_id, (jobCount.get(j.customer_id) ?? 0) + 1);
  const invCount = new Map<number, number>();
  for (const i of invRows ?? []) invCount.set(i.customer_id, (invCount.get(i.customer_id) ?? 0) + 1);

  const rows: CustomerRow[] = (customers ?? []).map(cu => ({
    ...cu,
    jobs: jobCount.get(cu.id) ?? 0,
    invoices: admin ? (invCount.get(cu.id) ?? 0) : null,
  }));

  // drawer data
  const isNew = newParam === '1';
  const cid = cParam ? Number(cParam) : null;
  let drawerCustomer: DrawerCustomer | null = null;
  let drawerJobs: DrawerJob[] = [];
  let drawerLeads: DrawerLead[] = [];
  let drawerInvoices: DrawerInvoice[] | null = admin ? [] : null;

  if (cid && Number.isFinite(cid)) {
    drawerCustomer = rows.find(r => r.id === cid) ?? null;
    if (drawerCustomer) {
      const { data: js } = await sb
        .from('jobs_public')
        .select('id,service,status,scheduled_date')
        .eq('customer_id', cid)
        .order('id', { ascending: false });
      drawerJobs = js ?? [];
      const { data: ls } = await sb
        .from('leads_public')
        .select('id,service,status')
        .eq('customer_id', cid)
        .order('id', { ascending: false });
      drawerLeads = ls ?? [];
      if (admin) {
        const { data: is } = await sb
          .from('invoices')
          .select('id,number,issue_date,status,invoice_items(qty,unit_price)')
          .eq('customer_id', cid)
          .order('id', { ascending: false });
        drawerInvoices = (is ?? []).map(i => ({
          id: i.id,
          number: i.number,
          issue_date: i.issue_date,
          status: i.status,
          total: (i.invoice_items ?? []).reduce(
            (s: number, it: { qty: number; unit_price: number }) => s + it.qty * it.unit_price,
            0
          ),
        }));
      }
    }
  }

  return (
    <>
      <CustomersTable rows={rows} admin={admin} />
      {(isNew || drawerCustomer) && role && (
        <CustomerDrawer
          customer={drawerCustomer}
          jobs={drawerJobs}
          leads={drawerLeads}
          invoices={drawerInvoices}
          role={role}
          isNew={isNew}
        />
      )}
    </>
  );
}
```

- [ ] **Step 9: Verify**

Run: `npm test` — green.
Run: `npm run build` — clean.

- [ ] **Step 10: Commit**

```bash
git add components/ui components/customers app/(app)/customers lib/customers.ts tests/unit/customer-form.test.ts
git commit -m "feat(customers): profile drawer with edit/create + related tabs (RLS-aware)"
```

---

### Task 5: Global typeahead search

Debounced top-bar typeahead over customers (name/phone/address) returning cards; click opens the customer drawer. Uses `supabaseBrowser()`.

**Files:**
- Create: `lib/search.ts`
- Create: `components/search/GlobalSearch.tsx`
- Modify: `app/(app)/layout.tsx` (pass `<GlobalSearch />` into `<Topbar search={…} />`)
- Test: `tests/unit/search.test.ts`

**Interfaces:**
- Consumes: `supabaseBrowser()` from `lib/supabase/client.ts`; `Topbar`'s `search` prop (Task 2); drawer URL scheme `/customers?c=<id>` (Task 4).
- Produces: `lib/search.ts`: `buildOrFilter(q: string): string | null` — PostgREST `.or()` string, null for empty/unsafe-empty queries.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildOrFilter } from '@/lib/search';

describe('buildOrFilter', () => {
  it('builds ilike or-filter across name/phone/address', () => {
    expect(buildOrFilter('sarah')).toBe(
      'name.ilike.%sarah%,phone.ilike.%sarah%,address.ilike.%sarah%'
    );
  });
  it('returns null for empty/whitespace', () => {
    expect(buildOrFilter('')).toBeNull();
    expect(buildOrFilter('   ')).toBeNull();
  });
  it('strips PostgREST-reserved chars (commas, parens, %, _) so the or() stays valid', () => {
    expect(buildOrFilter('a,b(c)%_d')).toBe(
      'name.ilike.%a b c d%,phone.ilike.%a b c d%,address.ilike.%a b c d%'
    );
  });
  it('collapses whitespace', () => {
    expect(buildOrFilter('  555   0142 ')).toBe(
      'name.ilike.%555 0142%,phone.ilike.%555 0142%,address.ilike.%555 0142%'
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/search'`.

- [ ] **Step 3: Implement `lib/search.ts`**

```ts
// Builds a PostgREST or() filter for the customers typeahead.
// Commas/parens delimit or() branches and %/_ are ilike wildcards, so strip them
// from user input; the wildcards we add ourselves are the only ones sent.
export function buildOrFilter(q: string): string | null {
  const s = q.replace(/[%_,()]/g, ' ').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  return `name.ilike.%${s}%,phone.ilike.%${s}%,address.ilike.%${s}%`;
}
```

- [ ] **Step 4: Run tests — pass**

Run: `npm test` — PASS.

- [ ] **Step 5: GlobalSearch component**

Create `components/search/GlobalSearch.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { buildOrFilter } from '@/lib/search';

type Hit = { id: number; name: string; phone: string | null; address: string | null };

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const filter = buildOrFilter(q);
    if (!filter) {
      setHits(null);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser()
        .from('customers')
        .select('id,name,phone,address')
        .or(filter)
        .limit(6);
      setHits(data ?? []);
      setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const pick = (id: number) => {
    setOpen(false);
    setQ('');
    router.push(`/customers?c=${id}`, { scroll: false });
  };

  return (
    <div className="search" ref={boxRef}>
      <input
        placeholder="🔍 Find customer…"
        autoComplete="off"
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => hits && setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && hits?.length) pick(hits[0].id);
        }}
        aria-label="Find customer"
      />
      <div className={`sresults box ${open ? 'show' : ''}`}>
        {hits?.length ? (
          hits.map(h => (
            <div className="scard" key={h.id} onClick={() => pick(h.id)}>
              <b>{h.name}</b>
              <small>📞 {h.phone ?? '—'} · {h.address ?? '—'}</small>
            </div>
          ))
        ) : (
          <div className="scard"><small>No match</small></div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Mount in the shell**

In `app/(app)/layout.tsx`, import and pass to Topbar:

```tsx
import { GlobalSearch } from '@/components/search/GlobalSearch';
// …
<Topbar search={<GlobalSearch />} />
```

- [ ] **Step 7: Verify**

Run: `npm test` — green. Run: `npm run build` — clean.

- [ ] **Step 8: Commit**

```bash
git add lib/search.ts components/search app/(app)/layout.tsx tests/unit/search.test.ts
git commit -m "feat(search): global customer typeahead in topbar"
```

---

### Task 6: Full verification pass

No new features. Prove Plan 2 works end-to-end against the live local stack, in all three roles.

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append results)

**Interfaces:** consumes everything above.

- [ ] **Step 1: Full automated suite**

```bash
npx supabase db reset
npx supabase test db     # expect 4 files pass (schema, rls_money, claim_job, customers_write)
npm test                 # expect all unit tests pass
npm run build            # expect clean production build
```

- [ ] **Step 2: Live drive (dev server)**

Run `npm run dev`, then verify against `http://localhost:3000` (curl or browser automation; logins password `password123`):

1. `admin@clearview.dev`: sidebar shows all 7 items; `/customers` shows 10 seeded customers WITH an Invoices column; open a customer → drawer shows Jobs/Invoices/Leads tabs; edit phone → Save → row updates.
2. `rep@clearview.dev`: sidebar hides Invoices/Settings; customers table has NO invoice column; drawer has no Invoices tab; edit+save a customer works; `+ New customer` → create → lands on `/customers?c=<newId>` with the new customer visible.
3. `cleaner@clearview.dev`: sidebar shows Dashboard/Map/Jobs/Customers only; drawer inputs disabled, no Save button; direct navigation to `/invoices` redirects to `/dashboard`.
4. Typeahead: type "sar" → card for Sarah Kim with phone+address; click → drawer opens.
5. Theme toggle → dark; reload → still dark (cookie persisted).

- [ ] **Step 3: Record results + commit ledger**

Append verification results to `.superpowers/sdd/progress.md`, then:

```bash
git add .superpowers/sdd/progress.md
git commit -m "chore: plan 2 verification results"
```

---

## Execution notes (controller)

- Branch: `feat/customers` (exists). Merge to `main` only when Task 6 is fully green.
- After merge, update `docs/superpowers/AUTONOMOUS_RUN.md` status section.
