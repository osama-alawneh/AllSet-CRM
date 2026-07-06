# Plan 10 — Search Everywhere & List Views (grouped global search · per-page filters · board/list toggle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The topbar search finds customers, leads, jobs (and invoices for admins) with grouped results from any page — including the dashboard; each list page also gets a local filter box; Leads and Jobs get a Board ⇄ List view toggle with a clean table view.

**Architecture:** Global search stays a client typeahead but fans out to four parallel role-gated queries against the money-free views; a pure `toHits` mapper (unit-tested) shapes grouped results. Per-page filtering is pure client-side functions over already-fetched rows (the `filterCustomers` precedent). List views are new table components behind a `?view=list` URL param, so views are deep-linkable and the drawers' back-navigation preserves the view.

**Tech Stack:** Next.js 16 App Router, Supabase JS (PostgREST `or()` filters), Vitest.

**Branch:** `feat/search-views` (from `main` after Plan 9 merges — list views render `description`-era types and the drawers' `backTo` handling).

## Global Constraints

- **Role-gated search sources** (MVP item 4 decision, 2026-07-06 — both halves of the user's either/or): topbar search = grouped everything-search from every page (covers the "dashboard searches all three" ask); each page ALSO gets its own local filter input (the "same as customers table" ask). Sources: customers (all roles), leads (admin+rep — cleaners have no leads page), jobs (all roles; deep-link guard already hides foreign jobs from cleaners), invoices by number (admin only).
- Search queries go through `leads_public`/`jobs_public` **only** — never base tables (money).
- PostgREST `or()` input must go through the sanitizer (strip `% _ , ( )`) — extend, don't fork, `lib/search.ts`.
- Keep the 200 ms debounce + stale-response cancellation pattern already in `GlobalSearch`.
- CSV export keeps exporting ALL rows, never the filtered subset (existing convention).
- Gates before merge: `npm test`, `npx supabase test db`, `npm run lint`, `npm run build`, live three-role walkthrough.

---

### Task 1: Pure search/filter helpers (TDD)

**Files:**
- Modify: `lib/search.ts`
- Test: `tests/unit/search.test.ts` (extend)

**Interfaces:**
- Consumes: `Lead` from `lib/leads`, `Job` from `lib/jobs`, `Invoice` from `lib/invoices`.
- Produces:
  - `buildEntityOrFilter(q: string, fields: string[]): string | null` — generic PostgREST `or()` builder (existing `buildOrFilter` becomes `buildEntityOrFilter(q, ['name','phone','address'])` internally and stays exported).
  - `filterLeads(rows: Lead[], q: string): Lead[]` — matches customer_name/address/service/description/note.
  - `filterJobs(rows: Job[], q: string): Job[]` — matches customer_name/address/service/description/claimed_by_name.
  - `filterInvoices(rows: Invoice[], q: string): Invoice[]` — matches number/customer_name.
  - `type SearchHit = { kind: 'customer' | 'lead' | 'job' | 'invoice'; id: number; title: string; sub: string }` and `hitHref(h: SearchHit): string` → `/customers?c=`, `/leads?l=`, `/jobs?j=`, `/invoices?i=`.

- [ ] **Step 1: Write failing tests** (append to `tests/unit/search.test.ts`)

```ts
import { buildEntityOrFilter, filterLeads, filterJobs, filterInvoices, hitHref } from '@/lib/search';

describe('buildEntityOrFilter', () => {
  it('builds an ilike branch per field', () => {
    expect(buildEntityOrFilter('oak', ['service', 'note'])).toBe('service.ilike.%oak%,note.ilike.%oak%');
  });
  it('sanitizes PostgREST delimiters and wildcards', () => {
    expect(buildEntityOrFilter('a,b(c)%_', ['f'])).toBe('f.ilike.%a b c%');
  });
  it('returns null for blank input', () => {
    expect(buildEntityOrFilter('   ', ['f'])).toBeNull();
  });
});

describe('client-side filters', () => {
  const lead = { customer_name: 'Maple St', address: '12 Maple', service: 'In+out', description: 'back panes', note: null } as never;
  it('filterLeads matches description', () => {
    expect(filterLeads([lead], 'back').length).toBe(1);
    expect(filterLeads([lead], 'zzz').length).toBe(0);
    expect(filterLeads([lead], '')).toEqual([lead]);
  });
  const job = { customer_name: 'Oak Co', address: null, service: 'Full', description: null, claimed_by_name: 'Cleo' } as never;
  it('filterJobs matches claimer name', () => {
    expect(filterJobs([job], 'cleo').length).toBe(1);
  });
  const inv = { number: 'INV-1004', customer_name: 'Oak Co' } as never;
  it('filterInvoices matches number', () => {
    expect(filterInvoices([inv], '1004').length).toBe(1);
  });
});

describe('hitHref', () => {
  it('routes each kind to its drawer', () => {
    expect(hitHref({ kind: 'lead', id: 7, title: '', sub: '' })).toBe('/leads?l=7');
    expect(hitHref({ kind: 'job', id: 8, title: '', sub: '' })).toBe('/jobs?j=8');
    expect(hitHref({ kind: 'invoice', id: 9, title: '', sub: '' })).toBe('/invoices?i=9');
    expect(hitHref({ kind: 'customer', id: 1, title: '', sub: '' })).toBe('/customers?c=1');
  });
});
```

Run: `npx vitest run tests/unit/search.test.ts` → new tests FAIL.

- [ ] **Step 2: Implement in `lib/search.ts`**

```ts
import type { Lead } from '@/lib/leads';
import type { Job } from '@/lib/jobs';
import type { Invoice } from '@/lib/invoices';

// Commas/parens delimit or() branches and %/_ are ilike wildcards, so strip them from
// user input; the wildcards we add ourselves are the only ones sent.
const sanitize = (q: string) => q.replace(/[%_,()]/g, ' ').trim().replace(/\s+/g, ' ');

export function buildEntityOrFilter(q: string, fields: string[]): string | null {
  const s = sanitize(q);
  if (!s) return null;
  return fields.map(f => `${f}.ilike.%${s}%`).join(',');
}

// Back-compat: the customers typeahead filter.
export function buildOrFilter(q: string): string | null {
  return buildEntityOrFilter(q, ['name', 'phone', 'address']);
}

const has = (v: string | null | undefined, f: string) => (v ?? '').toLowerCase().includes(f);

export function filterLeads(rows: Lead[], q: string): Lead[] {
  const f = q.trim().toLowerCase();
  if (!f) return rows;
  return rows.filter(r =>
    has(r.customer_name, f) || has(r.address, f) || has(r.service, f) || has(r.description, f) || has(r.note, f));
}

export function filterJobs(rows: Job[], q: string): Job[] {
  const f = q.trim().toLowerCase();
  if (!f) return rows;
  return rows.filter(r =>
    has(r.customer_name, f) || has(r.address, f) || has(r.service, f) || has(r.description, f) || has(r.claimed_by_name, f));
}

export function filterInvoices(rows: Invoice[], q: string): Invoice[] {
  const f = q.trim().toLowerCase();
  if (!f) return rows;
  return rows.filter(r => has(r.number, f) || has(r.customer_name, f));
}

export type SearchHit = { kind: 'customer' | 'lead' | 'job' | 'invoice'; id: number; title: string; sub: string };

export function hitHref(h: SearchHit): string {
  switch (h.kind) {
    case 'customer': return `/customers?c=${h.id}`;
    case 'lead': return `/leads?l=${h.id}`;
    case 'job': return `/jobs?j=${h.id}`;
    case 'invoice': return `/invoices?i=${h.id}`;
  }
}
```

- [ ] **Step 3: Run to verify pass**

Run: `npm test` → all pass (existing `buildOrFilter` tests still green — behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add lib/search.ts tests/unit/search.test.ts
git commit -m "feat(search): generic or-filter builder, per-entity client filters, hit routing (TDD)"
```

---

### Task 2: Grouped global search (topbar, all pages incl. dashboard)

**Files:**
- Modify: `components/search/GlobalSearch.tsx` (full replacement below)
- Modify: `app/(app)/layout.tsx:22` (pass role: `<Topbar search={<GlobalSearch role={role} />} />`)

**Interfaces:**
- Consumes: `buildEntityOrFilter`, `hitHref`, `SearchHit`, `supabaseBrowser`, `Role`.
- Produces: `GlobalSearch({ role }: { role: Role })`.

- [ ] **Step 1: Replace the component**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { buildEntityOrFilter, hitHref, type SearchHit } from '@/lib/search';
import type { Role } from '@/lib/auth';

const GROUP_LABEL: Record<SearchHit['kind'], string> = {
  customer: 'Customers', lead: 'Leads', job: 'Jobs', invoice: 'Invoices',
};
const GROUP_ORDER: SearchHit['kind'][] = ['customer', 'lead', 'job', 'invoice'];

export function GlobalSearch({ role }: { role: Role }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const admin = role === 'admin';
  const canLeads = role === 'admin' || role === 'rep';
  const custFilter = buildEntityOrFilter(q, ['name', 'phone', 'address']);
  const visible = open && custFilter !== null;

  useEffect(() => {
    if (!custFilter) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const sb = supabaseBrowser();
      const leadFilter = buildEntityOrFilter(q, ['service', 'note', 'description'])!;
      const jobFilter = buildEntityOrFilter(q, ['service', 'description'])!;
      const numFilter = buildEntityOrFilter(q, ['number'])!;
      // Role-gated fan-out; money-free views only. Failed/skipped sources yield [].
      const [cs, ls, js, is] = await Promise.all([
        sb.from('customers').select('id,name,phone,address').or(custFilter).limit(5),
        canLeads
          ? sb.from('leads_public').select('id,service,status,description').or(leadFilter).limit(5)
          : Promise.resolve({ data: [] }),
        sb.from('jobs_public').select('id,service,status,scheduled_date,description').or(jobFilter).limit(5),
        admin
          ? sb.from('invoices').select('id,number,status,issue_date').or(numFilter).limit(5)
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      const out: SearchHit[] = [
        ...(cs.data ?? []).map(c => ({
          kind: 'customer' as const, id: c.id, title: c.name, sub: `📞 ${c.phone ?? '—'} · ${c.address ?? '—'}`,
        })),
        ...(ls.data ?? []).map(l => ({
          kind: 'lead' as const, id: l.id, title: l.service ?? `Lead #${l.id}`, sub: `${l.status} · ${l.description ?? '—'}`,
        })),
        ...(js.data ?? []).map(j => ({
          kind: 'job' as const, id: j.id, title: j.service ?? `Job #${j.id}`, sub: `${j.status} · ${j.scheduled_date ?? 'TBD'}`,
        })),
        ...(is.data ?? []).map(i => ({
          kind: 'invoice' as const, id: i.id, title: i.number, sub: `${i.status} · ${i.issue_date}`,
        })),
      ];
      setHits(out);
      setOpen(true);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, custFilter, admin, canLeads]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const pick = (h: SearchHit) => {
    setOpen(false);
    setQ('');
    router.push(hitHref(h), { scroll: false });
  };

  return (
    <div className="search" ref={boxRef}>
      <input
        placeholder="🔍 Search…"
        autoComplete="off"
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => hits && setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && visible && hits?.length) pick(hits[0]);
        }}
        aria-label="Search customers, leads, jobs, invoices"
      />
      <div className={`sresults box ${visible ? 'show' : ''}`}>
        {hits?.length ? (
          GROUP_ORDER.map(kind => {
            const group = hits.filter(h => h.kind === kind);
            if (!group.length) return null;
            return (
              <div key={kind}>
                <div className="lbl" style={{ padding: '6px 10px 2px' }}>{GROUP_LABEL[kind]}</div>
                {group.map(h => (
                  <div className="scard" key={`${h.kind}-${h.id}`} onClick={() => pick(h)}>
                    <b>{h.title}</b>
                    <small>{h.sub}</small>
                  </div>
                ))}
              </div>
            );
          })
        ) : (
          <div className="scard"><small>No match</small></div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass the role from `app/(app)/layout.tsx`**

```tsx
        <Topbar search={<GlobalSearch role={role} />} />
```

- [ ] **Step 3: Verify live**

- Admin on `/dashboard`: type a seed street name → grouped Customers/Leads/Jobs sections (and Invoices when typing `inv`/a number); clicking a lead hit lands on `/leads` with that drawer open; invoice hit opens the invoice.
- Rep: no Invoices group ever; leads group present.
- Cleaner: only Customers + Jobs groups; clicking a foreign job opens `/jobs` with **no** drawer (existing guard) — acceptable.
- Rapid typing: results match the LAST keystroke (cancellation intact).

- [ ] **Step 4: Commit**

```bash
git add components/search/GlobalSearch.tsx "app/(app)/layout.tsx"
git commit -m "feat(search): grouped role-aware global search across entities"
```

---

### Task 3: Local filter inputs on Leads, Jobs, Invoices

**Files:**
- Modify: `components/leads/KanbanBoard.tsx`
- Modify: `components/jobs/JobsBoard.tsx`
- Modify: `components/invoices/InvoicesTable.tsx`

**Interfaces:**
- Consumes: `filterLeads`/`filterJobs`/`filterInvoices` (Task 1).

- [ ] **Step 1: KanbanBoard** — add state + input, filter before grouping (CSV export keeps using the unfiltered `leads` prop):

```tsx
import { filterLeads } from '@/lib/search';
// inside component:
  const [q, setQ] = useState('');
  const grouped = groupByStatus(filterLeads(optimistic, q));
// in .scrhead, before the hint span:
        <input placeholder="🔍 filter leads…" style={{ width: 200 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter leads" />
```

- [ ] **Step 2: JobsBoard** — identical pattern with `filterJobs`:

```tsx
import { filterJobs } from '@/lib/search';
  const [q, setQ] = useState('');
  const grouped = groupJobsByStatus(filterJobs(optimistic, q));
        <input placeholder="🔍 filter jobs…" style={{ width: 200 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter jobs" />
```

- [ ] **Step 3: InvoicesTable** — `filterInvoices` over the mapped rows (CSV export unchanged, full set):

```tsx
import { filterInvoices } from '@/lib/search';
  const [q, setQ] = useState('');
  const shown = filterInvoices(invoices, q);
// replace the <h3>Invoices</h3> with:
        <input placeholder="🔍 filter invoices…" style={{ width: 220 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter invoices" />
// tbody maps over `shown`; empty state: "No invoices match."
```

- [ ] **Step 4: Verify live**

Leads board: typing narrows cards in all four columns simultaneously; clearing restores. Jobs board same (and a realtime ping while filtered keeps the filter applied — state survives `router.refresh()`). Invoices: filtering by `INV-1002` leaves one row; export still downloads everything.

- [ ] **Step 5: Commit**

```bash
git add components/leads/KanbanBoard.tsx components/jobs/JobsBoard.tsx components/invoices/InvoicesTable.tsx
git commit -m "feat(filter): local filter inputs on leads/jobs boards and invoices table"
```

---

### Task 4: Board ⇄ List view toggle for Leads and Jobs

**Files:**
- Create: `components/ui/ViewToggle.tsx`
- Create: `components/leads/LeadsListTable.tsx`
- Create: `components/jobs/JobsListTable.tsx`
- Modify: `app/(app)/leads/page.tsx`, `app/(app)/jobs/page.tsx` (read `?view=`, branch render, view-aware `backTo`)
- Modify: `components/leads/KanbanBoard.tsx`, `components/jobs/JobsBoard.tsx` (mount `ViewToggle`)
- Modify: `components/leads/LeadDrawer.tsx` (`backTo` type widens to `string`), `components/jobs/JobDrawer.tsx` (gains optional `backTo = '/jobs'`)
- Modify: `app/globals.css` (`.viewtoggle` styles)

**Interfaces:**
- Produces: `ViewToggle({ view, base }: { view: 'board' | 'list'; base: '/leads' | '/jobs' })`;
  `LeadsListTable({ leads, admin, onOpen }: { leads: Lead[]; admin: boolean; onOpen: (id: number) => void })`;
  `JobsListTable({ jobs, admin, onOpen }: { jobs: Job[]; admin: boolean; onOpen: (id: number) => void })`.

- [ ] **Step 1: ViewToggle + CSS**

```tsx
// components/ui/ViewToggle.tsx
'use client';
import { useRouter } from 'next/navigation';

export function ViewToggle({ view, base }: { view: 'board' | 'list'; base: '/leads' | '/jobs' }) {
  const router = useRouter();
  const go = (v: 'board' | 'list') =>
    router.push(v === 'list' ? `${base}?view=list` : base, { scroll: false });
  return (
    <div className="viewtoggle" role="group" aria-label="View mode">
      <button type="button" className={view === 'board' ? 'on' : ''} aria-pressed={view === 'board'} onClick={() => go('board')}>⌗ Board</button>
      <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => go('list')}>☰ List</button>
    </div>
  );
}
```

```css
/* view toggle (Plan 10) */
.viewtoggle { display: inline-flex; border: 1.5px solid var(--line); border-radius: 4px; overflow: hidden; }
.viewtoggle button { border: 0; background: transparent; color: var(--muted); padding: 7px 11px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
.viewtoggle button.on { background: var(--ink); color: var(--card); }
[data-theme="dark"] .viewtoggle button.on { background: var(--accent); color: #04101c; }
```

- [ ] **Step 2: LeadsListTable**

```tsx
// components/leads/LeadsListTable.tsx
'use client';
import { useState } from 'react';
import { statusLabel, statusColor, type Lead } from '@/lib/leads';
import { filterLeads } from '@/lib/search';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

export function LeadsListTable({ leads, admin, onOpen }: { leads: Lead[]; admin: boolean; onOpen: (id: number) => void }) {
  const [q, setQ] = useState('');
  const shown = filterLeads(leads, q);
  return (
    <div className="panel box">
      <input placeholder="🔍 filter leads…" style={{ width: 220, marginBottom: 12 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter leads" />
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Service</th><th>Status</th>
              <th>Stories</th><th>Panes</th><th>Created</th>{admin && <th>Quote</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map(l => (
              <tr
                key={l.id} data-click="" tabIndex={0}
                onClick={() => onOpen(l.id)}
                onKeyDown={e => {
                  const t = e.target as HTMLElement;
                  if (t.closest('button, a, input, select, textarea')) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(l.id); }
                }}
              >
                <td>{l.id}</td>
                <td><b>{l.customer_name}</b><br /><small style={{ color: 'var(--muted)' }}>{l.address ?? '—'}</small></td>
                <td>{l.service ?? 'TBD'}</td>
                <td><span className="badge" style={{ background: 'var(--chip)', color: statusColor[l.status] }}>{statusLabel[l.status]}</span></td>
                <td>{l.stories ?? '—'}</td>
                <td>{l.panes ?? '—'}</td>
                <td>{day(l.created_at)}</td>
                {admin && <td style={{ color: 'var(--won)', fontWeight: 700 }}>{l.quote_value ? fmt(l.quote_value) : '—'}</td>}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={admin ? 8 : 7} style={{ color: 'var(--muted)' }}>No leads match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: JobsListTable** (same skeleton; columns `#`, Customer, Service, Date, Status, Claimed by, Created, Price(admin); status uses `jobStatusLabel`/`jobStatusColor`; filter via `filterJobs`):

```tsx
// components/jobs/JobsListTable.tsx
'use client';
import { useState } from 'react';
import { jobStatusLabel, jobStatusColor, type Job } from '@/lib/jobs';
import { filterJobs } from '@/lib/search';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

export function JobsListTable({ jobs, admin, onOpen }: { jobs: Job[]; admin: boolean; onOpen: (id: number) => void }) {
  const [q, setQ] = useState('');
  const shown = filterJobs(jobs, q);
  return (
    <div className="panel box">
      <input placeholder="🔍 filter jobs…" style={{ width: 220, marginBottom: 12 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter jobs" />
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Service</th><th>Date</th>
              <th>Status</th><th>Claimed by</th><th>Created</th>{admin && <th>Price</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map(j => (
              <tr
                key={j.id} data-click="" tabIndex={0}
                onClick={() => onOpen(j.id)}
                onKeyDown={e => {
                  const t = e.target as HTMLElement;
                  if (t.closest('button, a, input, select, textarea')) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(j.id); }
                }}
              >
                <td>{j.id}</td>
                <td><b>{j.customer_name}</b><br /><small style={{ color: 'var(--muted)' }}>{j.address ?? '—'}</small></td>
                <td>{j.service ?? 'TBD'}</td>
                <td>{j.scheduled_date ?? 'TBD'}</td>
                <td><span className="badge" style={{ background: 'var(--chip)', color: jobStatusColor[j.status] }}>{jobStatusLabel[j.status]}</span></td>
                <td>{j.claimed_by_name ?? '—'}</td>
                <td>{day(j.created_at)}</td>
                {admin && <td style={{ color: 'var(--won)', fontWeight: 700 }}>{j.price ? fmt(j.price) : '—'}</td>}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={admin ? 8 : 7} style={{ color: 'var(--muted)' }}>No jobs match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Page branching + view-aware drawer back-navigation**

`app/(app)/leads/page.tsx`:

```tsx
}: { searchParams: Promise<{ l?: string; new?: string; view?: string }> }) {
  const { l: lParam, new: newParam, view } = await searchParams;
  const list = view === 'list';
  const backTo = list ? '/leads?view=list' : '/leads';
// render (LeadsSection wrapper keeps scrhead + toggle in ONE place — put ViewToggle inside
// KanbanBoard's scrhead AND render it above the list table when list):
      {list ? (
        <section className="screen">
          <div className="scrhead">
            <ViewToggle view="list" base="/leads" />
            <div style={{ display: 'flex', gap: 8 }}>{/* same Export CSV + New lead buttons as the board — extract or duplicate the two buttons */}</div>
          </div>
          <LeadsListTable leads={leads} admin={admin} onOpen={/* client nav helper below */} />
        </section>
      ) : (
        <KanbanBoard leads={leads} admin={admin} canEdit={true} />
      )}
      {(selected || isNew) && (
        <LeadDrawer lead={selected} admin={admin} canEdit={true} backTo={backTo} isNew={isNew && !selected} customers={customerOptions} />
      )}
```

`onOpen` needs a client component — **make the list branch a small client wrapper** `components/leads/LeadsListSection.tsx` that owns `router.push(`/leads?view=list&l=${id}`)`, the Export/New buttons, and renders `ViewToggle` + `LeadsListTable`. Mirror with `components/jobs/JobsListSection.tsx` (`/jobs?view=list&j=${id}`). Inside `KanbanBoard`/`JobsBoard` scrheads, mount `<ViewToggle view="board" base="/leads" />` / `base="/jobs"`.

Drawer `backTo` changes:
- `LeadDrawer`: prop type `backTo: string` (was `'/leads' | '/map'`) — map page still passes `/map`.
- `JobDrawer`: add `backTo = '/jobs'` optional prop; `const close = () => router.push(backTo, { scroll: false });` — jobs page passes `list ? '/jobs?view=list' : '/jobs'`.

- [ ] **Step 5: Verify live**

- `/leads?view=list`: table renders with filter, statuses, quotes (admin only); row click opens the drawer **and closing it returns to the list view**; toggle back to Board keeps working; `+ New lead` and CSV work from both views.
- `/jobs?view=list` as cleaner: only claimable+own rows, no Price column, claim still possible from the drawer.
- Realtime: with two windows on `/jobs?view=list`, a claim in one refreshes the other (board-level subscription lives in `JobsBoard` — **move the realtime `useEffect` subscription up into `JobsListSection` too, or simpler: keep a single subscription by mounting it in both sections** — copy the existing `useEffect` block into `JobsListSection`).
- Lint/build/test suite green.

- [ ] **Step 6: Commit**

```bash
git add components/ui/ViewToggle.tsx components/leads components/jobs "app/(app)/leads/page.tsx" "app/(app)/jobs/page.tsx" app/globals.css
git commit -m "feat(views): board/list toggle with clean list tables for leads and jobs"
```

---

### Task 5: Final review & merge

- [ ] Full battery: `npx supabase db reset && npx supabase test db && npm test && npm run lint && npm run build` — all green.
- [ ] Live three-role walkthrough of: grouped search from dashboard, local filters, both view toggles, drawer round-trips preserving view.
- [ ] Whole-branch review (superpowers:requesting-code-review); fix findings.
- [ ] Merge `feat/search-views` → `main`; update `docs/superpowers/AUTONOMOUS_RUN.md` Phase-1.5 status — **Phase 1.5 complete**.

## Self-Review Notes

- Spec coverage: item 4 (search all, page-scoped filters, dashboard multi-entity) → Tasks 1–3; item 8 (list view toggle, "looked at clear") → Task 4.
- Type consistency: `filterLeads/filterJobs/filterInvoices` consume the Plan-8-extended `Lead`/`Job` types (`description`, `created_at` used by the list tables); `SearchHit`/`hitHref` shared between Task 1 tests and Task 2 UI.
- Realtime in list view is called out explicitly (subscription must exist in the list section too) — the reviewer should verify with two windows.
- Invoices list keeps its existing table (already a list); it only gains the filter input — no toggle needed there.
