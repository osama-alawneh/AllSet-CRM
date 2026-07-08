# Wave 1 — Security Hardening, Server Perf, iOS PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the one DB-level money leak (`claim_job` returns `price`), harden RLS gaps, collapse redundant auth round-trips, parallelize page queries, log swallowed query errors, and make the PWA actually installable on iOS.

**Architecture:** One new SQL migration (`0016`) fixes all four security findings at the DB; pgTAP pins each. App-side perf fixes are confined to `lib/auth.ts` + the five page components. PWA fixes touch only `app/layout.tsx`, `app/manifest.ts`, and generated PNGs in `public/`.

**Tech Stack:** Next.js 16.2.10 App Router, Supabase (Postgres RLS + pgTAP), React 19 `cache()`, sharp (dev-only, icon rasterization).

## Global Constraints

- **Next.js 16 has breaking changes vs training data** (repo `AGENTS.md`). Before using any Next.js API, verify against `node_modules/next/dist/docs/` (e.g. `generate-viewport.md`, metadata docs). Heed deprecation notices.
- Do not touch money semantics: non-admin fetches must remain structurally money-free (no `price`/`quote_value` in any non-admin payload).
- Every task ends green: `npm run lint && npx tsc --noEmit && npm test` (111 tests must stay passing). Task 1 additionally requires `npm run test:db` (needs local Supabase via Docker: `npx supabase start` first if not running).
- Preserve existing select strings and query shapes exactly when parallelizing — only the awaiting changes.
- Commit after every task. Findings context: `docs/superpowers/2026-07-07-multiagent-review-findings.md` (IDs referenced below).

---

### Task 1: Migration 0016 — claim_job return type, job_photos RLS, jobs_public visibility, leads grant tightening (SEC-1..4)

**Files:**
- Create: `supabase/migrations/0016_security_hardening.sql`
- Modify: `supabase/tests/claim_job.sql` (assert new return type; keep race assertions)
- Modify: `supabase/tests/rls_money.sql` (add: claim_job result carries no price)
- Reference: `supabase/migrations/0009_claim_job_role.sql`, `0014_crud_columns_rpcs.sql:30-35`, `0015_leads_column_grants.sql`

**Interfaces:**
- Produces: `claim_job(bigint) returns bigint` (the claimed job id). App already ignores the return value (`app/(app)/jobs/actions.ts` calls `sb.rpc('claim_job', ...)` and only checks `error`) — **no app change needed**, verify this stays true.
- Produces: `jobs_public` view now row-filtered: `status='unclaimed' OR claimed_by=auth.uid() OR admin/rep`. `lib/jobs.ts visibleJobs()` stays as defense-in-depth — do not remove it.

- [ ] **Step 1: Write failing pgTAP assertions first**

Append to `supabase/tests/claim_job.sql` (inside the existing plan; bump the `select plan(N)` count accordingly):

```sql
-- SEC-1: claim_job must not return the jobs row (price leak); it returns the claimed id.
select function_returns('public', 'claim_job', array['bigint'], 'bigint',
  'claim_job returns bigint (id), not the jobs row');
```

Append to `supabase/tests/rls_money.sql` (bump plan count):

```sql
-- SEC-3: cleaner sees only unclaimed + own rows through jobs_public.
-- (Use the suite's existing role-switch helpers / seeded cleaner uid, mirroring the
-- neighboring assertions in this file — claim one job as cleaner, leave one claimed
-- by someone else, then:)
--   results_eq on: select count(*) from jobs_public where claimed_by is not null
--                    and claimed_by <> auth.uid()
--   expected: 0 rows visible that are claimed by another user
```

Write the real assertions following the exact seeding/role-switch idiom already used in `rls_money.sql` (read the file first; it has `set local role` / `request.jwt.claims` patterns to copy).

- [ ] **Step 2: Run DB tests to verify the new assertions fail**

Run: `npm run test:db`
Expected: FAIL — `function_returns` reports `jobs` not `bigint`; visibility assertion reports other-cleaner rows visible.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0016_security_hardening.sql`:

```sql
-- SEC-1: claim_job returned the full jobs row — including price — so a cleaner calling
-- POST /rest/v1/rpc/claim_job directly could read money for any job they claim. The app
-- ignores the return value (jobs/actions.ts checks only `error`), so returning the claimed
-- id is a pure narrowing. Return type changes require DROP (create or replace can't).
drop function if exists claim_job(bigint);

create function claim_job(p_job_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','cleaner'), false) is not true then
    raise exception 'Not authorized to claim jobs';
  end if;
  update public.jobs set status='claimed', claimed_by=auth.uid()
   where id=p_job_id and status='unclaimed'
  returning id into v_id;
  if v_id is null then raise exception 'Job already claimed'; end if;
  return v_id;
end $$;

grant execute on function claim_job(bigint) to authenticated;

-- SEC-2: job_photos (0001) was the only table without RLS. No policies yet = deny-all
-- for authenticated; Phase 2 adds policies when the table is actually used.
alter table job_photos enable row level security;

-- SEC-3 (decision 2026-07-07): PRD §6.5 "cleaner sees only claimable + own" moves from
-- app-side (lib/jobs.ts visibleJobs) into the view. View runs as owner, but auth.uid()/
-- auth_role() read the caller's JWT, so the filter is per-caller. Column list must match
-- 0014 exactly (create or replace view requirement).
create or replace view jobs_public as
  select id, customer_id, lead_id, status, claimed_by, scheduled_date, service, created_at, description, updated_at
  from jobs
  where status = 'unclaimed'
     or claimed_by = auth.uid()
     or coalesce(auth_role() in ('admin','rep'), false);

-- SEC-4: 0015 re-granted created_by/created_at/updated_at, letting a rep spoof authorship
-- timestamps via direct PostgREST writes. The definer RPCs stamp these themselves, and the
-- pgTAP direct writes (leads_map.sql) touch only customer_id/status/service — so drop the
-- three audit columns from the grant lists. (Integrity fix; money was already excluded.)
revoke insert, update on leads from authenticated;
grant insert (customer_id, status, service, stories, panes, note, description)
  on leads to authenticated;
grant update (customer_id, status, service, stories, panes, note, description)
  on leads to authenticated;
```

- [ ] **Step 4: Apply migration + run DB tests to verify pass**

Run: `npx supabase db reset` (applies all migrations + seed to local stack), then `npm run test:db`
Expected: ALL pgTAP suites PASS, including the new assertions. If `leads_map.sql` or `claim_job.sql` reference the old return shape (e.g. `select id from claim_job(...)` — now invalid since it returns a scalar), update those call sites to `select claim_job(...)`.

- [ ] **Step 5: Verify app suite untouched**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, 111/111.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0016_security_hardening.sql supabase/tests/
git commit -m "fix(security): claim_job returns id not row; job_photos RLS; jobs_public row filter; drop audit-column grants"
```

---

### Task 2: React cache() for auth + parallelized page queries + query-error logging (PERF-1..3)

**Files:**
- Modify: `lib/auth.ts:9-20`
- Create: `lib/log.ts`
- Modify: `app/(app)/jobs/page.tsx`, `app/(app)/leads/page.tsx`, `app/(app)/map/page.tsx`, `app/(app)/invoices/page.tsx`, `app/(app)/customers/page.tsx`
- Test: `tests/` (existing suites must stay green; `guardDecision` tests unaffected)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getSession`/`getRole` same signatures (`() => Promise<User|null>`, `() => Promise<Role|null>`), now `cache()`-wrapped consts — call sites unchanged. `logQueryError(scope: string, error: { message: string } | null | undefined): void`.

- [ ] **Step 1: Rewrite lib/auth.ts with React cache()**

Replace the two functions (exact current code is at `lib/auth.ts:9-20`):

```ts
import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase/server';

export type Role = 'admin' | 'rep' | 'cleaner';

export function normalizeRole(r: string | null | undefined): Role | null {
  return r === 'admin' || r === 'rep' || r === 'cleaner' ? r : null;
}

// cache() dedupes per request: layout + page + proxy-refreshed renders previously issued
// ~4 GoTrue round-trips and ~3 profiles queries per navigation (review finding PERF-1).
export const getSession = cache(async () => {
  const sb = await supabaseServer();
  return (await sb.auth.getUser()).data.user;
});

export const getRole = cache(async (): Promise<Role | null> => {
  const u = await getSession();
  if (!u) return null;
  const sb = await supabaseServer();
  const { data, error } = await sb.from('profiles').select('role').eq('id', u.id).single();
  if (error) console.error('[query:profiles.role]', error.message);
  return normalizeRole(data?.role as string | undefined);
});

export function guardDecision(role: Role | null): string | null {
  return role ? null : '/login';
}
```

Verify first in `node_modules/next/dist/docs/` (authentication / caching guides) that `cache()` from `react` is still the documented per-request memoization for this Next version.

- [ ] **Step 2: Create lib/log.ts**

```ts
// Pages previously discarded `error` from every Supabase read, rendering silent empty
// states indistinguishable from "no records" (review finding PERF-3/M2).
export function logQueryError(scope: string, error: { message: string } | null | undefined): void {
  if (error) console.error(`[query:${scope}]`, error.message);
}
```

- [ ] **Step 3: Parallelize the five pages**

For each page, read it first, then: (a) keep every `.select(...)` string and filter chain **byte-identical**; (b) move independent awaits into one `Promise.all`; (c) destructure `error` and call `logQueryError` per read. `dashboard/page.tsx:32-39` is the house pattern to copy — admin-conditional queries resolve as `role === 'admin' ? sb.from(...)... : Promise.resolve({ data: null, error: null })`.

Shape for `app/(app)/jobs/page.tsx` (currently 3 sequential awaits at :30-57):

```ts
const [jobsRes, customersRes, profilesRes] = await Promise.all([
  admin ? sb.from('jobs').select(/* existing string */) : sb.from('jobs_public').select(/* existing string */),
  sb.from('customers').select(/* existing string */),
  sb.from('profiles').select(/* existing string */),
]);
logQueryError('jobs.page.jobs', jobsRes.error);
logQueryError('jobs.page.customers', customersRes.error);
logQueryError('jobs.page.profiles', profilesRes.error);
```

Apply the same transformation to `leads/page.tsx` (:23-32), `map/page.tsx` (:18-28), `invoices/page.tsx` (:18-28), `customers/page.tsx` (:23-28). Queries that genuinely depend on a prior result (if any) stay sequential — do not force-fit.

- [ ] **Step 4: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: clean, 111/111.
Run: `npm run build`
Expected: build succeeds, no new warnings about dynamic APIs.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/log.ts "app/(app)/jobs/page.tsx" "app/(app)/leads/page.tsx" "app/(app)/map/page.tsx" "app/(app)/invoices/page.tsx" "app/(app)/customers/page.tsx"
git commit -m "perf: cache() auth helpers, parallelize page queries, log swallowed query errors"
```

---

### Task 3: iOS PWA — PNG icons, apple meta, viewport-fit, manifest id/theme (PWA-1..3)

**Files:**
- Create: `scripts/gen-icons.mjs`
- Create (generated): `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`
- Modify: `app/layout.tsx`, `app/manifest.ts`
- Modify: `package.json` (devDependency `sharp`, script `icons`)

**Interfaces:**
- Consumes: existing `public/icon.svg` (decision: generate from it, no new design).
- Produces: viewport export with `viewportFit: 'cover'` — Wave 2's safe-area CSS (`env(safe-area-inset-*)`) depends on this existing.

- [ ] **Step 1: Install sharp + write the generator**

Run: `npm i -D sharp`

Create `scripts/gen-icons.mjs`:

```js
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
const out = (f) => fileURLToPath(new URL(`../public/${f}`, import.meta.url));

await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
// Maskable: 512 canvas, icon scaled to ~80% safe zone, dark-paper background.
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#070d18' } })
  .composite([{ input: await sharp(svg).resize(410, 410).png().toBuffer(), gravity: 'centre' }])
  .png().toFile(out('icon-maskable-512.png'));
await sharp(svg).resize(180, 180).flatten({ background: '#070d18' }).png().toFile(out('apple-touch-icon.png'));
console.log('icons written');
```

Add to `package.json` scripts: `"icons": "node scripts/gen-icons.mjs"`.

- [ ] **Step 2: Generate + verify files**

Run: `npm run icons`, then `ls public/*.png`
Expected: four PNGs exist; open `apple-touch-icon.png` (Read tool renders images) and confirm it is not blank/transparent-on-transparent.

- [ ] **Step 3: layout.tsx — apple meta + viewport (verify API names against node_modules/next/dist/docs first)**

Check `node_modules/next/dist/docs/` for the current `Viewport` type and `metadata.appleWebApp` / `metadata.icons` fields, then update `app/layout.tsx:1-9`:

```ts
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'ClearView CRM',
  description: 'Window-cleaning CRM — Blueprint+',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ClearView' },
  icons: { apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#070d18',
};
```

(Body of `RootLayout` unchanged.)

- [ ] **Step 4: manifest.ts — PNG icons, id, dark theme_color**

Replace `app/manifest.ts` body:

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'ClearView CRM',
    short_name: 'ClearView',
    display: 'standalone',
    start_url: '/',
    background_color: '#070d18',
    theme_color: '#070d18', // dark is the default theme (decision 2026-07-07)
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

Also update the now-stale comment at the top of the old file (it said apple-touch-icon is a post-MVP follow-up — no longer true). If `public/sw.js` precaches a static asset list, add the new PNGs to it and bump the SW cache version string.

- [ ] **Step 5: Verify**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: clean; build output shows `/manifest.webmanifest` route. Grep the built HTML head (or run `npm start` briefly and `curl -s localhost:3000 | grep -i apple`) for `apple-mobile-web-app-capable` and `apple-touch-icon`.

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-icons.mjs public/*.png app/layout.tsx app/manifest.ts package.json package-lock.json public/sw.js
git commit -m "feat(pwa): iOS standalone install — apple meta, PNG/maskable icons, viewport-fit, dark manifest theme"
```

---

## Wave 1 exit checklist

- [ ] `npm run test:db` all green (new SEC assertions included)
- [ ] `npm run lint && npx tsc --noEmit && npm test` — 111/111
- [ ] `npm run build` clean
- [ ] Manual: as cleaner (seed login), REST `POST /rest/v1/rpc/claim_job` response contains only a number
- [ ] Manual: Chrome DevTools → Application → Manifest shows PNG + maskable icons, no errors
