# Plan 6 — CSV Exports + PWA + A11y + Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the final MVP layer — client-side CSV exports for leads/jobs/invoices/customers (role-aware money columns), a hand-rolled PWA (manifest + service worker + offline page + install icon), an accessibility pass (focus-visible, skip link, dialog focus, `aria-current`/`aria-pressed`, keyboard-navigable rows, canvas label), a dashboard fetch-parallelization polish, and a whole-app verification sweep.

**Architecture:** All exports are pure, DB-free, and role-aware — per-entity column builders live in `lib/csv.ts` (alongside `csvEscape`/`toCSV`/`downloadCSV`) so unit tests can assert non-admin column omission **without a DOM**; `downloadCSV` touches `document` only when invoked, keeping the module importable in the Vitest node env. The PWA is hand-rolled (next-pwa is unmaintained since 2022; `@serwist/next` needs a webpack config the Turbopack build ignores): a `MetadataRoute.Manifest`, a default-deny allowlist service worker that never caches role-specific navigation HTML, a client `SWRegister` that registers only in production, and a static `/offline` page outside the `(app)` auth group. The a11y and dashboard-polish changes are behavior-preserving.

**Tech Stack:** Next.js 16 (App Router, `app/manifest.ts`, `MetadataRoute.Manifest`), React 19, Vitest (node env), service worker (vanilla JS in `public/`).

## Global Constraints

- **This is NOT the Next.js you know (Next 16).** Read the relevant guide in `node_modules/next/dist/docs/` before writing code; heed `AGENTS.md`. The canonical PWA pattern is `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` — follow its `app/manifest.ts` + `public/sw.js` + `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })` shape. We deliberately do NOT implement its Web-Push section (out of scope) and we hand-roll offline caching instead of adopting Serwist (which the doc itself flags as "requires webpack configuration").
- **Money is admin-only and never leaks.** CSV money columns are **omitted entirely** for non-admins — the header AND the cell column are dropped, never blanked. Leads `Value` = `Lead.quote_value` (already `null` for non-admins, but the column is omitted regardless), Jobs `Price` = `Job.price`, Customers `Invoices` = `CustomerRow.invoices`. The `/invoices` page is admin-only, so its `Total` column is unconditional.
- **CSV correctness is load-bearing.** `csvEscape` blocks CSV formula injection (prefix a leading `'` when a cell begins with `=`, `+`, `-`, or `@`), double-quotes every cell and doubles embedded quotes; `toCSV` joins with `\r\n` and prepends a UTF-8 BOM (`﻿`) so Excel opens UTF-8 cleanly. `downloadCSV` builds a `Blob` + anchor and only then touches `document` — the module stays node-importable.
- **Exports read committed data, not optimistic UI state.** `KanbanBoard` exports from its `leads` **prop**, not `optimistic` state; `CustomersTable` exports **all** `rows`, not the search-filtered `shown` subset.
- **PWA verification is a build-time concern.** The service worker runs only against `npm run build && npm run start` (SW registers on `http://localhost`; `next dev` is excluded by the production-only guard). What is verifiable headless (via `curl`): `/manifest.webmanifest` is served with a JSON manifest, `/sw.js` is served and contains the allowlist rules, `/offline` returns 200, and the `SWRegister` component is present in served HTML. Real installability + the offline network-toggle need a browser and are documented as residual manual checks. **iOS caveat:** iOS ignores SVG manifest icons; an `apple-touch-icon` PNG is a documented **post-MVP follow-up** — do NOT build PNG-generation tooling in this plan.
- **The service worker is default-deny.** It intercepts ONLY the allowlisted cases and `return`s (no interception) for everything else — never touching non-GET requests (login POST, server actions), cross-origin requests (Supabase REST/auth; websockets bypass SW anyway), or caching navigation HTML (which is role-specific and must never be served to the wrong role).
- **A11y changes are behavior-preserving.** No data flow or route changes; only focus/ARIA/CSS additions and one landmark rename (`<div className="main">` → `<main className="main" id="main">`).
- **Dashboard polish is behavior-preserving.** Grouping independent fetches into `Promise.all` must respect the admin-only conditional queries; the rendered output is identical.
- Commands run from repo root `D:\Development\ClearViewCRM`. Unit tests: `npm test`. Build: `npm run build`. Lint: `npm run lint`. Prod PWA check: `npm run build && npm run start`. **On Windows PowerShell, quote parenthesised paths** (`"app/(app)/..."`). Every task ends with `npm test` / `npm run build` / `npm run lint` clean where applicable.
- **No DB changes this plan.** No migration, no new pgTAP; the existing pgTAP suite (51/51) is re-run in Task 5 only to confirm no regression. No `900000+` fixtures are added.
- Commit after every task with a conventional message. Branch: `feat/exports-pwa`.

---

## File Structure

- `lib/csv.ts` — `csvEscape`, `toCSV`, `downloadCSV`, and pure role-aware per-entity column builders (`leadsCsvTable`, `jobsCsvTable`, `invoicesCsvTable`, `customersCsvTable`). No DOM at import time.
- `tests/unit/csv.test.ts` — escaping, quotes-in-quotes, null/undefined, injection prefix, BOM, `\r\n`, and per-builder role-omission assertions (no DOM).
- `components/leads/KanbanBoard.tsx` (modify) — `⬇ Export CSV` button in the existing `.scrhead`.
- `components/jobs/JobsBoard.tsx` (modify) — same.
- `components/invoices/InvoicesTable.tsx` (modify) — same (unconditional `Total`).
- `components/customers/CustomersTable.tsx` (modify) — same (export all `rows`).
- `app/manifest.ts` — `MetadataRoute.Manifest`.
- `public/icon.svg` — hand-written app icon.
- `public/sw.js` — default-deny allowlist service worker.
- `components/shell/SWRegister.tsx` — production-only registration.
- `app/offline/page.tsx` — static offline fallback (outside the `(app)` group).
- `app/layout.tsx` (modify) — mount `SWRegister`.
- `app/globals.css` (modify) — `:focus-visible`, `.skip-link`, remove dead `.claim.mine`.
- `components/ui/Drawer.tsx` (modify) — initial dialog focus.
- `components/shell/NavLink.tsx` (modify) — `aria-current="page"`.
- `components/leads/LeadDrawer.tsx` / `components/jobs/JobDrawer.tsx` (modify) — `aria-pressed` on statuspick buttons.
- `components/dashboard/RevenueChart.tsx` (modify) — `role="img"` + `aria-label` on the canvas.
- `app/(app)/layout.tsx` (modify) — `<main id="main">` + skip link.
- `app/(app)/dashboard/page.tsx` (modify) — `Promise.all` fetch grouping.
- `.superpowers/sdd/progress.md` (modify) — append verification results.

> **Note on `KpiCountUp`:** Plan 5 already gives `components/dashboard/KpiCountUp.tsx` a `matchMedia('(prefers-reduced-motion: reduce)')` guard (verified at L19). No change is required — Task 3 only verifies it.

---

### Task 1: `lib/csv.ts` (pure CSV core + role-aware builders) + unit tests + 4 export buttons

Build the pure CSV core and the four role-aware column builders, unit-test them without a DOM, then wire a `⬇ Export CSV` button into each of the four boards/tables. Ships as one reviewable unit: the builders are useless without their buttons and the buttons cannot compile without the builders.

**Files:**
- Create: `lib/csv.ts`
- Test: `tests/unit/csv.test.ts`
- Modify: `components/leads/KanbanBoard.tsx`
- Modify: `components/jobs/JobsBoard.tsx`
- Modify: `components/invoices/InvoicesTable.tsx`
- Modify: `components/customers/CustomersTable.tsx`

**Interfaces:**
- Consumes: `Lead`, `statusLabel` (`lib/leads`); `Job`, `jobStatusLabel` (`lib/jobs`); `Invoice`, `invoiceTotal` (`lib/invoices`); `CustomerRow` (`lib/customers`).
- Produces:
  - `type CsvCell = string | number | null | undefined`.
  - `type CsvTable = { headers: string[]; rows: CsvCell[][] }`.
  - `csvEscape(v: CsvCell): string`.
  - `toCSV(headers: string[], rows: CsvCell[][]): string`.
  - `downloadCSV(filename: string, text: string): void`.
  - `leadsCsvTable(leads: Lead[], admin: boolean): CsvTable`.
  - `jobsCsvTable(jobs: Job[], admin: boolean): CsvTable`.
  - `invoicesCsvTable(invoices: Invoice[]): CsvTable`.
  - `customersCsvTable(rows: CustomerRow[], admin: boolean): CsvTable`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  csvEscape,
  toCSV,
  leadsCsvTable,
  jobsCsvTable,
  invoicesCsvTable,
  customersCsvTable,
} from '@/lib/csv';
import type { Lead } from '@/lib/leads';
import type { Job } from '@/lib/jobs';
import type { Invoice } from '@/lib/invoices';
import type { CustomerRow } from '@/lib/customers';

describe('csvEscape', () => {
  it('wraps every value in double quotes', () => {
    expect(csvEscape('hi')).toBe('"hi"');
    expect(csvEscape(42)).toBe('"42"');
  });
  it('renders null/undefined as an empty quoted cell', () => {
    expect(csvEscape(null)).toBe('""');
    expect(csvEscape(undefined)).toBe('""');
  });
  it('doubles embedded quotes', () => {
    expect(csvEscape('a "quoted" word')).toBe('"a ""quoted"" word"');
  });
  it('prefixes a leading = + - @ with an apostrophe to block formula injection', () => {
    expect(csvEscape('=1+1')).toBe('"\'=1+1"');
    expect(csvEscape('+SUM(A1)')).toBe('"\'+SUM(A1)"');
    expect(csvEscape('-2')).toBe('"\'-2"');
    expect(csvEscape('@cmd')).toBe('"\'@cmd"');
  });
  it('does not prefix a normal leading character', () => {
    expect(csvEscape('Sarah')).toBe('"Sarah"');
  });
});

describe('toCSV', () => {
  it('prepends a UTF-8 BOM and joins rows with CRLF', () => {
    const out = toCSV(['A', 'B'], [[1, 'x'], [2, 'y']]);
    expect(out.charCodeAt(0)).toBe(0xfeff); // BOM present
    const body = out.slice(1);
    expect(body).toBe('"A","B"\r\n"1","x"\r\n"2","y"');
  });
  it('handles an empty row set (header line only, after the BOM)', () => {
    expect(toCSV(['A'], []).slice(1)).toBe('"A"');
  });
});

const lead = (over: Partial<Lead>): Lead => ({
  id: 1, customer_id: 10, status: 'new', service: 'Standard', stories: 2, panes: 20,
  note: null, quote_value: 500, customer_name: 'Sarah Kim', address: '1 Elm St',
  phone: '555', email: 'a@b.co', lat: 1, lng: 2, ...over,
});

describe('leadsCsvTable', () => {
  it('includes Value only for admin (header AND cell column omitted otherwise)', () => {
    const rows = [lead({})];
    const asAdmin = leadsCsvTable(rows, true);
    expect(asAdmin.headers).toEqual(['ID', 'Customer', 'Address', 'Status', 'Service', 'Stories', 'Panes', 'Value']);
    expect(asAdmin.rows[0]).toEqual([1, 'Sarah Kim', '1 Elm St', 'New', 'Standard', 2, 20, 500]);
    const asRep = leadsCsvTable(rows, false);
    expect(asRep.headers).toEqual(['ID', 'Customer', 'Address', 'Status', 'Service', 'Stories', 'Panes']);
    expect(asRep.headers).not.toContain('Value');
    expect(asRep.rows[0]).toHaveLength(7);
  });
});

const job = (over: Partial<Job>): Job => ({
  id: 3, customer_id: 10, lead_id: null, status: 'claimed', claimed_by: 'u1',
  claimed_by_name: 'Cal Cleaner', scheduled_date: '2026-07-01', service: 'Standard',
  price: 180, customer_name: 'Sarah Kim', address: '1 Elm St', phone: null, email: null, ...over,
});

describe('jobsCsvTable', () => {
  it('includes Price only for admin', () => {
    const rows = [job({})];
    const asAdmin = jobsCsvTable(rows, true);
    expect(asAdmin.headers).toEqual(['ID', 'Customer', 'Service', 'Status', 'Claimed by', 'Scheduled', 'Price']);
    expect(asAdmin.rows[0]).toEqual([3, 'Sarah Kim', 'Standard', 'Claimed', 'Cal Cleaner', '2026-07-01', 180]);
    const asCleaner = jobsCsvTable(rows, false);
    expect(asCleaner.headers).not.toContain('Price');
    expect(asCleaner.rows[0]).toHaveLength(6);
  });
});

describe('invoicesCsvTable', () => {
  it('always includes Total (admin-only page) via invoiceTotal', () => {
    const inv: Invoice = {
      id: 1, customer_id: 10, job_id: null, number: 'INV-1001', issue_date: '2026-06-20',
      status: 'paid', tax: 0, deposit: 0,
      items: [{ description: 'A', qty: 2, unit_price: 100 }], customer_name: 'Sarah Kim',
    };
    const t = invoicesCsvTable([inv]);
    expect(t.headers).toEqual(['Number', 'Customer', 'Date', 'Status', 'Total']);
    expect(t.rows[0]).toEqual(['INV-1001', 'Sarah Kim', '2026-06-20', 'paid', 200]);
  });
});

const cust = (over: Partial<CustomerRow>): CustomerRow => ({
  id: 5, name: 'Acme Co', phone: '555', email: 'a@b.co', address: '2 Oak Ave',
  type: 'commercial', notes: null, jobs: 3, invoices: 4, ...over,
});

describe('customersCsvTable', () => {
  it('includes Invoices only for admin', () => {
    const rows = [cust({})];
    const asAdmin = customersCsvTable(rows, true);
    expect(asAdmin.headers).toEqual(['ID', 'Name', 'Phone', 'Email', 'Address', 'Type', 'Jobs', 'Invoices']);
    expect(asAdmin.rows[0]).toEqual([5, 'Acme Co', '555', 'a@b.co', '2 Oak Ave', 'commercial', 3, 4]);
    const asRep = customersCsvTable(rows, false);
    expect(asRep.headers).not.toContain('Invoices');
    expect(asRep.rows[0]).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/csv'`.

- [ ] **Step 3: Implement `lib/csv.ts`**

Create `lib/csv.ts`:

```ts
import { statusLabel, type Lead } from '@/lib/leads';
import { jobStatusLabel, type Job } from '@/lib/jobs';
import { invoiceTotal, type Invoice } from '@/lib/invoices';
import type { CustomerRow } from '@/lib/customers';

export type CsvCell = string | number | null | undefined;
export type CsvTable = { headers: string[]; rows: CsvCell[][] };

// Quote every cell (doubling embedded quotes) and neutralize CSV formula injection: a cell that
// begins with = + - @ is prefixed with an apostrophe so Excel/Sheets treats it as text, not a formula.
export function csvEscape(v: CsvCell): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// Join into RFC-4180-ish CSV: CRLF line endings + a leading UTF-8 BOM so Excel opens UTF-8 cleanly.
export function toCSV(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))];
  return '﻿' + lines.join('\r\n');
}

// Client-only: builds a Blob + anchor and clicks it. `document` is touched ONLY here (at call time),
// so importing this module in a node/Vitest env is safe.
export function downloadCSV(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- role-aware per-entity column builders (pure; unit-tested without a DOM) ----
// Money columns are OMITTED for non-admins — header and cell column both dropped, never blanked.

export function leadsCsvTable(leads: Lead[], admin: boolean): CsvTable {
  const headers = ['ID', 'Customer', 'Address', 'Status', 'Service', 'Stories', 'Panes', ...(admin ? ['Value'] : [])];
  const rows: CsvCell[][] = leads.map(l => [
    l.id, l.customer_name, l.address, statusLabel[l.status], l.service, l.stories, l.panes,
    ...(admin ? [l.quote_value] : []),
  ]);
  return { headers, rows };
}

export function jobsCsvTable(jobs: Job[], admin: boolean): CsvTable {
  const headers = ['ID', 'Customer', 'Service', 'Status', 'Claimed by', 'Scheduled', ...(admin ? ['Price'] : [])];
  const rows: CsvCell[][] = jobs.map(j => [
    j.id, j.customer_name, j.service, jobStatusLabel[j.status], j.claimed_by_name, j.scheduled_date,
    ...(admin ? [j.price] : []),
  ]);
  return { headers, rows };
}

export function invoicesCsvTable(invoices: Invoice[]): CsvTable {
  const headers = ['Number', 'Customer', 'Date', 'Status', 'Total'];
  const rows: CsvCell[][] = invoices.map(inv => [
    inv.number, inv.customer_name, inv.issue_date, inv.status, invoiceTotal(inv.items, inv.tax, inv.deposit),
  ]);
  return { headers, rows };
}

export function customersCsvTable(rows: CustomerRow[], admin: boolean): CsvTable {
  const headers = ['ID', 'Name', 'Phone', 'Email', 'Address', 'Type', 'Jobs', ...(admin ? ['Invoices'] : [])];
  const out: CsvCell[][] = rows.map(c => [
    c.id, c.name, c.phone, c.email, c.address, c.type, c.jobs,
    ...(admin ? [c.invoices] : []),
  ]);
  return { headers, rows: out };
}
```

- [ ] **Step 4: Run — unit tests pass**

Run: `npm test`
Expected: `csv.test.ts` PASS (all prior unit suites still green).

- [ ] **Step 5: Add the leads export button (`KanbanBoard`)**

In `components/leads/KanbanBoard.tsx`, add the import (after the `setLeadStatus` import, ~L17):

```tsx
import { toCSV, downloadCSV, leadsCsvTable } from '@/lib/csv';
```

Replace the existing `.scrhead` block (currently just the caption span, ~L59-63):

```tsx
      <div className="scrhead">
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          drag cards between columns to change status
        </span>
        <button
          className="btn sec"
          type="button"
          onClick={() => {
            // Export the committed `leads` prop, NOT the optimistic drag state.
            const t = leadsCsvTable(leads, admin);
            downloadCSV('clearview-leads.csv', toCSV(t.headers, t.rows));
          }}
        >
          ⬇ Export CSV
        </button>
      </div>
```

- [ ] **Step 6: Add the jobs export button (`JobsBoard`)**

In `components/jobs/JobsBoard.tsx`, add the import (after the `claimJob, setJobStatus` import, ~L20):

```tsx
import { toCSV, downloadCSV, jobsCsvTable } from '@/lib/csv';
```

Replace the existing `.scrhead` block (~L106-110):

```tsx
      <div className="scrhead">
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          drag between statuses · claim to lock
        </span>
        <button
          className="btn sec"
          type="button"
          onClick={() => {
            const t = jobsCsvTable(jobs, admin);
            downloadCSV('clearview-jobs.csv', toCSV(t.headers, t.rows));
          }}
        >
          ⬇ Export CSV
        </button>
      </div>
```

- [ ] **Step 7: Add the invoices export button (`InvoicesTable`)**

In `components/invoices/InvoicesTable.tsx`, extend the existing import (L3) to add the csv helpers:

```tsx
import { toCSV, downloadCSV, invoicesCsvTable } from '@/lib/csv';
```

Replace the existing `.scrhead` block (~L10-15):

```tsx
      <div className="scrhead">
        <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: 13 }}>Invoices</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = invoicesCsvTable(invoices);
              downloadCSV('clearview-invoices.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          <button className="btn" type="button" onClick={() => router.push('/invoices?new=1', { scroll: false })}>
            + New invoice
          </button>
        </div>
      </div>
```

- [ ] **Step 8: Add the customers export button (`CustomersTable`)**

In `components/customers/CustomersTable.tsx`, add the import (after the `filterCustomers` import, ~L4):

```tsx
import { toCSV, downloadCSV, customersCsvTable } from '@/lib/csv';
```

Replace the existing `.scrhead` block (~L12-22):

```tsx
      <div className="scrhead">
        <input
          placeholder="🔍 filter customers…"
          style={{ width: 240 }}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              // Export ALL rows, not the search-filtered `shown` subset.
              const t = customersCsvTable(rows, admin);
              downloadCSV('clearview-customers.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          <button className="btn" onClick={() => router.push('/customers?new=1', { scroll: false })}>
            + New customer
          </button>
        </div>
      </div>
```

- [ ] **Step 9: Verify build + tests + lint**

Run: `npm test` — green.
Run: `npm run build` — clean.
Run: `npm run lint` — no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/csv.ts tests/unit/csv.test.ts components/leads/KanbanBoard.tsx components/jobs/JobsBoard.tsx components/invoices/InvoicesTable.tsx components/customers/CustomersTable.tsx
git commit -m "feat(exports): role-aware client-side CSV exports (leads/jobs/invoices/customers)"
```

---

### Task 2: PWA — manifest + icon + service worker + registration + offline page

Hand-roll the PWA: a dynamic manifest, a hand-written SVG app icon, a default-deny allowlist service worker, a production-only registration component mounted in the root layout, and a static offline fallback page outside the auth group.

**Files:**
- Create: `app/manifest.ts`
- Create: `public/icon.svg`
- Create: `public/sw.js`
- Create: `components/shell/SWRegister.tsx`
- Create: `app/offline/page.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `MetadataRoute` (`next`).
- Produces:
  - `app/manifest.ts` default export → `/manifest.webmanifest`.
  - `public/icon.svg` → `/icon.svg`.
  - `public/sw.js` → `/sw.js` (the allowlist SW; cache name `clearview-v1`).
  - `components/shell/SWRegister.tsx`: `function SWRegister(): null`.
  - `app/offline/page.tsx`: static `/offline` route (no auth layout — outside `(app)`).

- [ ] **Step 1: Create the manifest**

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next';

// Served at /manifest.webmanifest. iOS ignores SVG icons (apple-touch-icon PNG is a post-MVP
// follow-up — see the plan's Global Constraints); Chromium/Android honor the SVG at any size.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ClearView CRM',
    short_name: 'ClearView',
    display: 'standalone',
    start_url: '/',
    background_color: '#e9eef3',
    theme_color: '#2f6df6',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 2: Create the app icon**

Create `public/icon.svg` (rounded-square `#2f6df6` background, centered white ◇ diamond with ~20% padding — the diamond spans 102→410 of a 512 viewBox):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" ry="96" fill="#2f6df6"/>
  <path d="M256 102 L410 256 L256 410 L102 256 Z" fill="#ffffff"/>
</svg>
```

- [ ] **Step 3: Create the service worker**

Create `public/sw.js` (default-deny allowlist — the exact cases from the plan's Global Constraints, in order):

```js
const CACHE = 'clearview-v1';
const PRECACHE = ['/offline', '/icon.svg'];

// install: precache ONLY the offline page + icon (never role-specific HTML).
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

// activate: drop any old versioned caches.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // (1) non-GET → do not touch (login POST + server actions must reach the network untouched).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // (2) cross-origin → do not touch (Supabase REST/auth; websockets bypass the SW anyway).
  if (url.origin !== self.location.origin) return;

  // (3) navigations → network-only, fall back to the cached offline page on failure.
  //     NEVER cache navigation HTML — it is role-specific and must not be served to another role.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')));
    return;
  }

  // (4) static assets → cache-first into the versioned cache.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
      )
    );
    return;
  }

  // everything else → no interception (default-deny).
});
```

- [ ] **Step 4: Create the registration component**

Create `components/shell/SWRegister.tsx`:

```tsx
'use client';
import { useEffect } from 'react';

// Registers /sw.js only in production builds (next dev is excluded so a stale SW never shadows
// HMR). updateViaCache:'none' makes the browser always re-fetch sw.js so updates are picked up.
export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);
  return null;
}
```

- [ ] **Step 5: Create the offline page (outside the `(app)` group)**

Create `app/offline/page.tsx` (static, fully inline styles so it renders even when no CSS is cached):

```tsx
// Static fallback served by the SW when a navigation fails offline. It lives OUTSIDE app/(app)
// so it never hits the auth layout, and it inlines all styling so it renders without cached CSS.
export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#e9eef3',
        color: '#0f1a2b',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: '#2f6df6',
          color: '#fff',
          fontSize: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ◇
      </div>
      <h1 style={{ margin: 0, fontSize: 20 }}>You&apos;re offline</h1>
      <p style={{ margin: 0, maxWidth: 320, fontSize: 14, color: '#42506b' }}>
        ClearView needs a connection to load live data. Reconnect and try again.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Mount `SWRegister` in the root layout**

In `app/layout.tsx`, add the import (after the `cookies` import, ~L2):

```tsx
import { SWRegister } from '@/components/shell/SWRegister';
```

Replace the `<body>` line (currently `<body>{children}</body>`, ~L14):

```tsx
        <body>
          {children}
          <SWRegister />
        </body>
```

- [ ] **Step 7: Verify build + lint**

Run: `npm run build` — clean (`app/manifest.ts` compiles to the `/manifest.webmanifest` route; `SWRegister` is a valid client component).
Run: `npm run lint` — no errors.
Run: `npm test` — green (no new unit tests; PWA is verified live in Task 5).

- [ ] **Step 8: Commit**

```bash
git add app/manifest.ts public/icon.svg public/sw.js components/shell/SWRegister.tsx "app/offline/page.tsx" app/layout.tsx
git commit -m "feat(pwa): manifest + app icon + allowlist service worker + prod-only registration + offline page"
```

---

### Task 3: Accessibility pass + dead CSS removal

Focus-visible outline, a keyboard skip link + `<main>` landmark, dialog initial focus, `aria-current` nav, `aria-pressed` statuspick buttons, a labelled chart canvas, keyboard-navigable table rows, and removal of the dead `.claim.mine` selector. All behavior-preserving.

**Files:**
- Modify: `app/globals.css`
- Modify: `app/(app)/layout.tsx`
- Modify: `components/ui/Drawer.tsx`
- Modify: `components/shell/NavLink.tsx`
- Modify: `components/leads/LeadDrawer.tsx`
- Modify: `components/jobs/JobDrawer.tsx`
- Modify: `components/dashboard/RevenueChart.tsx`
- Modify: `components/invoices/InvoicesTable.tsx`
- Modify: `components/customers/CustomersTable.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exported symbols — only ARIA attributes, focus behavior, and CSS.

- [ ] **Step 1: Add `:focus-visible` + `.skip-link` CSS; remove dead `.claim.mine`**

In `app/globals.css`, add the focus-visible + skip-link rules immediately after the input-focus rule (after L44, `input:focus, select:focus, textarea:focus { ... }`):

```css
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.skip-link { position: absolute; left: -9999px; top: 0; z-index: 100; padding: 8px 12px; background: var(--accent); color: #fff; border-radius: 4px; font-size: 12px; }
.skip-link:focus-visible { left: 8px; top: 8px; }
```

Then remove the dead `.claim.mine` selector — replace the rule at L121:

```css
.claim.locked, .claim.mine { background: transparent; color: var(--won); border-color: var(--won); cursor: default; }
```

with:

```css
.claim.locked { background: transparent; color: var(--won); border-color: var(--won); cursor: default; }
```

- [ ] **Step 2: Add the skip link + `<main>` landmark**

In `app/(app)/layout.tsx`, replace the returned JSX tree (~L17-25) — add the skip link as the first child of `.app` and rename the `.main` wrapper to a `<main id="main">`:

```tsx
  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar role={role} name={profile?.full_name ?? 'Unknown'} />
      <main className="main" id="main">
        <Topbar search={<GlobalSearch />} />
        {children}
      </main>
    </div>
  );
```

- [ ] **Step 3: Give the drawer initial focus**

Replace `components/ui/Drawer.tsx` in full:

```tsx
'use client';
import { useEffect, useRef } from 'react';

export function Drawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  // Move focus into the dialog on mount so keyboard users land inside it, not back at the trigger.
  // Calling focus() in an effect is fine — it is a DOM side effect, not a setState loop.
  useEffect(() => {
    ref.current?.focus();
  }, []);
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
      <aside ref={ref} tabIndex={-1} className="drawer box open" role="dialog" aria-modal="true">
        {children}
      </aside>
    </>
  );
}
```

- [ ] **Step 4: Add `aria-current` to the active nav link**

Replace `components/shell/NavLink.tsx` in full:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, num, label }: { href: string; num: string; label: string }) {
  const pathname = usePathname();
  const on = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
      <span className="n">{num}</span> {label}
    </Link>
  );
}
```

- [ ] **Step 5: Add `aria-pressed` to the LeadDrawer statuspick buttons**

In `components/leads/LeadDrawer.tsx`, replace the statuspick `<button>` (~L97-106) — add `aria-pressed={sel}`:

```tsx
                <button
                  key={st}
                  type="button"
                  className={sel ? 'sel' : ''}
                  aria-pressed={sel}
                  disabled={pending}
                  style={sel ? { background: statusColor[st], color: '#fff', borderColor: 'transparent' } : undefined}
                  onClick={() => change(st)}
                >
                  {statusLabel[st]}
                </button>
```

- [ ] **Step 6: Add `aria-pressed` to the JobDrawer statuspick buttons**

In `components/jobs/JobDrawer.tsx`, replace the statuspick `<button>` (~L118-127) — add `aria-pressed={sel}`:

```tsx
              <button
                key={st}
                type="button"
                className={sel ? 'sel' : ''}
                aria-pressed={sel}
                disabled={pending || !allowed}
                style={sel ? { background: jobStatusColor[st], color: '#fff', borderColor: 'transparent' } : undefined}
                onClick={() => change(st)}
              >
                {jobStatusLabel[st]}
              </button>
```

- [ ] **Step 7: Label the revenue chart canvas**

In `components/dashboard/RevenueChart.tsx`, replace the returned canvas (L45):

```tsx
  return <canvas ref={ref} role="img" aria-label="Daily revenue, last 14 days" style={{ width: '100%', height: 160 }} />;
```

- [ ] **Step 8: Make the invoices rows keyboard-activatable**

In `components/invoices/InvoicesTable.tsx`, replace the clickable `<tr>` (~L24):

```tsx
                <tr
                  key={inv.id}
                  data-click=""
                  tabIndex={0}
                  onClick={() => open(inv.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(inv.id); }
                  }}
                >
```

- [ ] **Step 9: Make the customers rows keyboard-activatable**

In `components/customers/CustomersTable.tsx`, replace the clickable `<tr>` (~L37-41):

```tsx
                <tr
                  key={c.id}
                  data-click=""
                  tabIndex={0}
                  onClick={() => router.push(`/customers?c=${c.id}`, { scroll: false })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/customers?c=${c.id}`, { scroll: false });
                    }
                  }}
                >
```

- [ ] **Step 10: Verify `KpiCountUp` already honors reduced-motion (no change)**

Open `components/dashboard/KpiCountUp.tsx` and confirm the effect starts with `if (matchMedia('(prefers-reduced-motion: reduce)').matches) { … setVal(end) … return; }` (Plan 5, ~L19). It does — **no edit**. This step is a verification, not a change.

- [ ] **Step 11: Verify build + tests + lint**

Run: `npm test` — green.
Run: `npm run build` — clean.
Run: `npm run lint` — no errors (note: a focusable `<tr>` with `onKeyDown` satisfies jsx-a11y's click-events-have-key-events / no-noninteractive-tabindex better than the prior click-only row; if lint still flags the row, it was already flagged pre-change — do not suppress, report it).

- [ ] **Step 12: Commit**

```bash
git add app/globals.css "app/(app)/layout.tsx" components/ui/Drawer.tsx components/shell/NavLink.tsx components/leads/LeadDrawer.tsx components/jobs/JobDrawer.tsx components/dashboard/RevenueChart.tsx components/invoices/InvoicesTable.tsx components/customers/CustomersTable.tsx
git commit -m "feat(a11y): focus-visible, skip link + main landmark, dialog focus, aria-current/aria-pressed, labelled chart, keyboard rows; drop dead .claim.mine"
```

---

### Task 4: Dashboard fetch polish (`Promise.all`)

Group the dashboard's independent server fetches into a single `Promise.all` while preserving the admin-only conditional queries and identical rendered output.

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: unchanged (`buildJobs`, `visibleJobs`, `buildLeads`, `revenueMTD`, `overdueTotal`, `chartBuckets14d`, `jobsThisWeek`, `winRate`, `getRole`, `getSession`, `supabaseServer`).
- Produces: no new exports — same JSX, fewer awaited round-trips.

- [ ] **Step 1: Replace the sequential fetch block with `Promise.all`**

In `app/(app)/dashboard/page.tsx`, replace the whole fetch region — from `// ---- everyone: jobs …` through the end of the admin money block (currently ~L25-86, i.e. everything between `const now = new Date();` and the `return (`) — with the grouped version below. The computed values (`jobs`, `visible`, `claimable`, `jpw`, `leads`, `wr`, `pins`, `revenue`, `overdue`, `chart`) are byte-for-byte the same; only the fetching is parallelized.

```tsx
  // Independent reads run concurrently. Admin-only reads (base jobs table for price, invoices,
  // invoice_items) are conditional; non-admins substitute a resolved { data: null } so the tuple
  // shape is stable. Money is still gated behind `if (admin)` below — nothing leaks.
  const jobsQuery = admin
    ? sb.from('jobs').select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,price').order('id')
    : sb.from('jobs_public').select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service').order('id');

  const [jobsRes, csRes, psRes, lpRes, invRes, itemRes] = await Promise.all([
    jobsQuery,
    sb.from('customers').select('id,name,address,phone,email,lat,lng'),
    sb.from('profiles').select('id,full_name'),
    sb.from('leads_public').select('id,customer_id,status,service,stories,panes,note').order('id'),
    admin ? sb.from('invoices').select('id,status,issue_date') : Promise.resolve({ data: null }),
    admin ? sb.from('invoice_items').select('invoice_id,qty,unit_price') : Promise.resolve({ data: null }),
  ]);

  // ---- everyone: jobs (role-split price), leads (win rate + pins), customers ----
  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (admin) {
    const rows = (jobsRes.data ?? []) as Array<JobRow & { price: number | null }>;
    jobRows = rows.map(r => ({
      id: r.id, customer_id: r.customer_id, lead_id: r.lead_id, status: r.status,
      claimed_by: r.claimed_by, scheduled_date: r.scheduled_date, service: r.service,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    jobRows = (jobsRes.data ?? []) as JobRow[];
  }

  const cs = csRes.data;
  const ps = psRes.data;
  const names = new Map((ps ?? []).map(p => [p.id as string, p.full_name as string]));
  const jobs = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const visible = visibleJobs(role, uid, jobs);
  const claimable: ClaimableJob[] = visible
    .filter(j => j.status === 'unclaimed')
    .slice(0, 3)
    .map(j => ({ id: j.id, customer_name: j.customer_name, address: j.address, service: j.service, price: j.price }));
  const jpw = jobsThisWeek(jobs as WeekJob[], now);

  const leads = buildLeads((lpRes.data ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], null);
  const wr = Math.round(winRate(leads as WinLead[]) * 100);
  const pins: Pin[] = leads
    .filter(l => l.lat != null && l.lng != null)
    .map(l => ({
      id: l.id, lat: l.lat as number, lng: l.lng as number, status: l.status,
      label: `${l.customer_name} — ${statusLabel[l.status]}`,
    }));

  // ---- admin-only money (non-admins NEVER fetch invoices or receive these values) ----
  let revenue = 0, overdue = 0, chart: number[] = [];
  if (admin) {
    const totalById = new Map<number, number>();
    for (const it of itemRes.data ?? []) {
      totalById.set(it.invoice_id, (totalById.get(it.invoice_id) ?? 0) + Number(it.qty) * Number(it.unit_price));
    }
    const rev: RevenueInvoice[] = (invRes.data ?? []).map(i => ({
      status: i.status, issue_date: i.issue_date, total: totalById.get(i.id) ?? 0,
    }));
    revenue = revenueMTD(rev, now);
    overdue = overdueTotal(rev, now);
    chart = chartBuckets14d(rev, now);
  }
```

- [ ] **Step 2: Verify build + tests + lint**

Run: `npm test` — green.
Run: `npm run build` — clean.
Run: `npm run lint` — no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "perf(dashboard): parallelize independent server fetches with Promise.all (behavior-preserving)"
```

---

### Task 5: Final MVP verification (headless + live) + ledger

The whole-app sign-off: existing pgTAP (51/51), all unit suites, build, lint, headless CSV/PWA checks, live drive across roles, a regression sweep of every route × 3 roles, and the ledger commit. **No new DB objects or fixtures are added — the pgTAP run confirms no regression.**

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append results)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: verification record + final commit.

- [ ] **Step 1: Full automated suite**

```bash
npx supabase db reset
npx supabase test db     # expect all pgTAP files green (51/51 — no DB changes this plan)
npm test                 # expect all unit suites pass, including csv
npm run build            # expect a clean production build
npm run lint             # expect no errors
```

- [ ] **Step 2: CSV role-column correctness (no DOM — assert the pure builders)**

The role-aware column omission is fully covered by `tests/unit/csv.test.ts` (Task 1) — the `leadsCsvTable`/`jobsCsvTable`/`customersCsvTable` role assertions prove that non-admin `headers` exclude `Value`/`Price`/`Invoices` and the row arity drops by one, **without a browser**. Confirm those specific specs are green in the Step 1 `npm test` output:

```bash
npm test -- csv     # expect: leads/jobs/customers role-omission + invoices Total specs PASS
```

Expected: the "includes Value/Price/Invoices only for admin" specs pass — this is the authoritative CSV role check.

- [ ] **Step 3: Headless PWA checks (against `next start`)**

The service worker registers only in a production build served over `http://localhost` (the `NODE_ENV==='production'` guard excludes `next dev`). Build, start, and probe what is verifiable headless:

```bash
npm run build
npm run start &        # serves http://localhost:3000 (production; SW active)
sleep 3

# manifest served as JSON with the right identity
curl -s -i http://localhost:3000/manifest.webmanifest | head -20   # expect 200; body contains "ClearView CRM" + theme_color #2f6df6
# service worker served and containing the allowlist rules
curl -s http://localhost:3000/sw.js | grep -E "clearview-v1|navigate|/_next/static/|/offline"   # expect all four markers present
# offline page renders standalone
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/offline   # expect 200
# icon served as SVG
curl -s -i http://localhost:3000/icon.svg | head -5   # expect 200; content-type image/svg+xml
# SWRegister present in served HTML for a real route (registration script bundle referenced)
curl -s http://localhost:3000/login | grep -c "serviceWorker" || echo "note: registration is in a client bundle chunk"
```

Expected: manifest 200 with `ClearView CRM`; `sw.js` contains `clearview-v1`, `navigate`, `/_next/static/`, `/offline`; `/offline` → 200; `/icon.svg` → 200 `image/svg+xml`. Stop the server afterward (`kill %1`).

> **Residual manual checks (require a browser — document for the user, do not block the plan):** in Chrome DevTools → Application: (1) Manifest shows "ClearView CRM" + installable, (2) Service Workers shows `/sw.js` activated, (3) toggling "Offline" then navigating shows the `/offline` page, (4) "Add to Home Screen" installs a standalone window. iOS: the SVG icon is ignored (documented `apple-touch-icon` PNG follow-up).

- [ ] **Step 4: Live CSV drive (dev server, browser automation; logins `password123`)**

Run `npm run dev`, then for each export confirm the file downloads and the role-column rule holds by opening the downloaded `.csv`:

1. `admin@clearview.dev` → `/leads` → `⬇ Export CSV` → `clearview-leads.csv` header row includes `Value`; `/jobs` export includes `Price`; `/customers` export includes `Invoices`; `/invoices` export has `Number,Customer,Date,Status,Total`. Each file opens in Excel with intact UTF-8 (BOM) and no cell is interpreted as a formula.
2. `rep@clearview.dev` → `/leads` export button IS present, but `clearview-leads.csv` header row **excludes** `Value` (column omitted, not blank); `/jobs` export **excludes** `Price`; `/customers` export **excludes** `Invoices`. (Rep has no `/invoices` route.)
3. `cleaner@clearview.dev` → `/jobs` export **excludes** `Price`; `/customers` export **excludes** `Invoices`.

Expected: money columns appear only for admin; every file downloads with the `clearview-<entity>.csv` name.

- [ ] **Step 5: Regression sweep — all routes × 3 roles**

With `npm run dev` running, visit each route as each role and confirm HTTP 200 + the correct role guard (browser automation, cookie-injected sessions):

- `admin@clearview.dev`: `/dashboard`, `/customers`, `/leads`, `/jobs`, `/invoices`, `/map` all render (admin sees money everywhere; `/invoices` accessible).
- `rep@clearview.dev`: `/dashboard`, `/customers`, `/leads`, `/jobs`, `/map` render with NO money; `/invoices` in the address bar → redirects to `/dashboard`.
- `cleaner@clearview.dev`: `/dashboard`, `/customers`, `/leads`, `/jobs`, `/map` render with NO money; `/invoices` → redirects to `/dashboard`. Dashboard Revenue/14D panel body is `•••••`; no Revenue-MTD/Overdue KPI cards.

Also confirm a11y wiring by keyboard only: Tab from the top of any `(app)` route reveals the "Skip to content" link (jumps focus to `#main`); a focused customers/invoices row activates on Enter/Space; the active nav item exposes `aria-current="page"`; statuspick buttons expose `aria-pressed`.

Expected: every route 200s for permitted roles; `/invoices` redirects for rep + cleaner; no money leaks to non-admins; skip link + keyboard rows work.

- [ ] **Step 6: Record results + commit ledger**

Append the Plan 6 verification results (pgTAP 51/51, unit suites incl. csv, build, lint, headless PWA probes, live CSV role matrix, regression sweep) to `.superpowers/sdd/progress.md`, then:

```bash
git add .superpowers/sdd/progress.md
git commit -m "chore: plan 6 verification results (exports + PWA + a11y + dashboard polish)"
```

---

## Execution notes (controller)

- Branch: `feat/exports-pwa`. This is the **final MVP plan** — merge to `main` only when Task 5 is fully green.
- **CSV money boundary:** the role-aware column builders in `lib/csv.ts` OMIT money columns (header + cells) for non-admins; `Lead.quote_value`/`Job.price`/`CustomerRow.invoices` are already `null` for non-admins, so even a bug that failed to omit the column would print blanks, not numbers — but omission is the contract and the unit tests enforce it.
- **PWA is build-time:** the SW never runs under `next dev` (production-only guard). If installability/offline ever "doesn't work" in development, that is expected — verify against `npm run build && npm run start`.
- **Default-deny SW:** the fetch handler must keep its early `return`s for non-GET, cross-origin, and non-allowlisted requests. If Supabase auth/REST ever breaks under the SW, confirm the cross-origin `return` (case 2) is intact and navigation HTML is never cached (case 3).
- **iOS icon:** SVG manifest icons are ignored by iOS; an `apple-touch-icon` PNG is the documented post-MVP follow-up. Do not add PNG tooling here.
- After merge, update `docs/superpowers/AUTONOMOUS_RUN.md` status section (mirrors prior handoffs) to mark the MVP complete.
