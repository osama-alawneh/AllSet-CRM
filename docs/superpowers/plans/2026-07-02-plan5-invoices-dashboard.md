# Plan 5 — Invoices CRUD + Role-Aware Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship admin invoice management (table → drawer editor with live-totalled line items, status, Save, browser-PDF print), "Create invoice" from a job, and the role-aware Dashboard (admin revenue-MTD + overdue KPIs and a real 14-day revenue chart; everyone's jobs/week, win rate, top-3 claimable jobs with Claim, and a mini schematic map).

**Architecture:** Server components fetch per route via `supabaseServer()`; **money is admin-only** — non-admins never receive revenue props at all (the dashboard computes and renders KPI cards + the real chart only for admins; non-admins get a `•••••` placeholder panel body so even the chart's line shape can't leak revenue). Invoice writes go through plain PostgREST `insert`/`update`/`delete` (the `invoices_admin` / `items_admin` `FOR ALL` RLS policies from `0002` already authorize admins — no RPC, no view). The invoice number is a DB-assigned default backed by a dedicated sequence. Printing renders an `#printArea` element into `document.body` via `createPortal` so it is a **sibling of `.app`** — the print CSS hides `.app`/`.drawer` with `display:none`, and ancestor hiding is absolute, so an inline-in-drawer print area would print blank. Pure, DB-free helpers live in `lib/invoices.ts` and `lib/dashboard.ts` (all date logic via `YYYY-MM-DD` string compares) and carry the unit tests.

**Tech Stack:** Next.js 16 (App Router, async `searchParams`), React 19 (`useTransition`, `createPortal`), Supabase (`@supabase/ssr`), Vitest (node env), pgTAP.

## Global Constraints

- **This is NOT the Next.js you know (Next 16).** `searchParams` page prop is a `Promise` (`await searchParams`); `cookies()` is async. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed `AGENTS.md`.
- **Any client component using `useSearchParams` must sit under `<Suspense>`.** We avoid it entirely: read `searchParams` in the server page and pass values down.
- **New write access needs BOTH an RLS policy AND a `grant` to `authenticated`** (local Supabase does not auto-grant). The `invoices_admin`/`items_admin` `FOR ALL` policies already exist (`0002`); `0002` granted only `SELECT` — Plan 5 adds the `insert, update, delete` grants and the sequence grant.
- **Money is admin-only and never travels to non-admins.** Non-admin dashboard requests do not fetch invoices/prices at all; the revenue chart body is a `•••••` placeholder for non-admins (a deliberate deviation from the proto, which only hides `[data-admin]` — even a real line shape leaks revenue). The `/invoices` route is admin-only (redirect to `/dashboard`).
- **`grants on ALL sequences` is a snapshot, not a rule.** `0005`'s `grant usage, select on all sequences in schema public` covered only sequences that existed then; the new `invoice_number_seq` needs its **own explicit** `grant usage, select on sequence invoice_number_seq to authenticated;`.
- **No `paid_at` column exists and you must NOT add one.** Revenue is attributed by `invoices.issue_date`. Every dashboard money function documents this.
- **Print portal MUST be a body sibling.** `InvoicePrint` renders `<div id="printArea">…` via `createPortal(…, document.body)`. Never nest it inside `.drawer`/`.app` — print CSS (`app/globals.css` L210-218) hides those with `display:none!important` and a nested `#printArea` prints blank. The `#printArea`, `.inv-tbl`, `.tot`, `.items`, `.money-hidden` CSS already exists in `app/globals.css` — **no `globals.css` change is required.**
- **pgTAP fixtures** use id range `900000+`, uuids `90000000-…`, emails `t-*@test.dev` (avoid seed collisions). Tests live in `supabase/tests/*.sql`, run with `npx supabase test db` (migrations only — seed.sql is NOT loaded for tests).
- **Design source of truth:** `docs/design/clearview-proto.html` — invoices table (`renderInvoices` ~L534-540), invoice drawer (`renderInvoiceDrawer` ~L627-648), print (`printInvoice` ~L651-660 + print CSS ~L192-202), dashboard markup (~L231-247), count-up + chart (`counts`/`drawChart` ~L416-428), `renderDashJobs` (~L514-517). Mirror its markup/classes/tokens. Invoice-status colors: `paid=var(--paid)`, `sent=var(--sent)`, `draft=var(--draft)`. Money format: `'$' + Number(n||0).toLocaleString()`.
- **Roles:** `admin | rep | cleaner` (`lib/auth.ts` exports `Role`, `getRole()`, `getSession()`). Nav is already role-gated (`lib/nav.ts`): Invoices is admin-only, Dashboard is all-roles. Count-up + chart are theme-aware (theme lives on `document.documentElement.dataset.theme`, set by `components/shell/ThemeToggle.tsx`) and reduced-motion aware.
- **Not-atomic invoice save is an accepted MVP risk** — `saveInvoice` does header write → delete items → insert items (not a transaction). It is commented as such; a transaction/RPC would remove the risk but is out of scope.
- Commands run from repo root `D:\Development\ClearViewCRM`. Unit tests: `npm test`. pgTAP: `npx supabase test db`. Dev DB: `npx supabase start` (Docker running); apply migrations+seed with `npx supabase db reset`. **On Windows PowerShell, quote parenthesised paths** (`"app/(app)/..."`). Every task ends with `npm test` / `npm run build` / `npm run lint` clean where applicable.
- Commit after every task with a conventional message. Branch: `feat/invoices`.

---

## File Structure

- `supabase/migrations/0012_invoice_writes.sql` — write grants + `invoice_number_seq` + defaulted `number`.
- `supabase/tests/invoices_write.sql` — pgTAP: admin CRUD, defaulted number, rep denied, cleaner empty.
- `supabase/seed.sql` (modify) — advance `invoice_number_seq` past seeded `INV-1003`.
- `lib/invoices.ts` — types, status maps, `fmtMoney`, `invoiceTotal`, `parseInvoiceForm`, `buildInvoices`. Pure.
- `lib/dashboard.ts` — `revenueMTD`, `isOverdue`, `overdueTotal`, `chartBuckets14d`, `jobsThisWeek`, `winRate`. Pure.
- `app/(app)/invoices/actions.ts` — `saveInvoice`, `createInvoiceFromJob` server actions.
- `app/(app)/invoices/page.tsx` (replace stub) — admin-guarded fetch + table + drawer.
- `components/invoices/InvoicesTable.tsx`, `InvoiceDrawer.tsx`, `InvoicePrint.tsx`.
- `components/jobs/JobDrawer.tsx` (modify) — activate "Create invoice".
- `app/(app)/jobs/actions.ts` (modify) — add `revalidatePath('/dashboard')`.
- `app/(app)/dashboard/page.tsx` (replace stub) — role-split dashboard.
- `components/dashboard/KpiCountUp.tsx`, `RevenueChart.tsx`, `ClaimableJobs.tsx`, `MiniMap.tsx`.
- `components/map/SchematicMap.tsx` (modify) — optional `height` prop for the mini-map.

> **Deviation from the scope's task sketch (documented):** `InvoicePrint.tsx` is built in **Task 3**, not Task 4, because `InvoiceDrawer` imports it — a drawer with a dangling import would not compile, so the two must ship in the same reviewable unit. Task 4 keeps `createInvoiceFromJob` + the `JobDrawer` wiring.

---

### Task 1: DB writes — migration `0012` + pgTAP + seed sequence advance

Grant invoice/item writes, add the `invoice_number_seq`-backed default `number`, and grant the new sequence explicitly. Advance the sequence in `seed.sql` so the first app-created invoice does not collide with the seeded `INV-1001…INV-1003`.

**Files:**
- Create: `supabase/migrations/0012_invoice_writes.sql`
- Create: `supabase/tests/invoices_write.sql`
- Modify: `supabase/seed.sql` (append one `setval` next to the existing sequence-advance block, ~L73-78)

**Interfaces:**
- Consumes: `auth_role()` (0002), `invoices`/`invoice_items` tables (0001), `invoices_admin`/`items_admin` `FOR ALL` policies + `grant select … to authenticated` (0002).
- Produces:
  - `invoice_number_seq` (start 1001) + `invoices.number` default `'INV-' || nextval('invoice_number_seq')`.
  - `grant insert, update, delete on invoices, invoice_items to authenticated` + `grant usage, select on sequence invoice_number_seq to authenticated`.
  - No new policies, no RPC, no view — admin passes the existing `FOR ALL` policies for insert/update/delete/select.

- [ ] **Step 1: Write the failing pgTAP — `invoices_write.sql`**

Create `supabase/tests/invoices_write.sql`:

```sql
begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('90000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-admin-i@test.dev'),
  ('90000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-rep-i@test.dev'),
  ('90000000-0000-0000-0000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t-cleaner-i@test.dev');
insert into profiles(id,full_name,role) values
  ('90000000-0000-0000-0000-000000000040','Admin Inv','admin'),
  ('90000000-0000-0000-0000-000000000041','Rep Inv','rep'),
  ('90000000-0000-0000-0000-000000000042','Cleaner Inv','cleaner');
insert into customers(id,name) overriding system value values (900040,'Invoice Co');

set local role authenticated;

-- (admin) ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000040"}';
-- 1. admin insert with NO number → the sequence-backed default fills it (INV-<nextval>)
select lives_ok(
  $$ insert into invoices(customer_id) values (900040) $$,
  'admin invoice insert runs (number defaulted from sequence)'
);
-- 2. the defaulted number looks like INV-<digits> (first test-DB insert → INV-1001)
select ok(
  (select number ~ '^INV-\d+$' from invoices where customer_id=900040 order by id desc limit 1),
  'defaulted invoice number matches INV-<digits>'
);
-- 3. admin may add items
select lives_ok(
  $$ insert into invoice_items(invoice_id, description, qty, unit_price)
     values ((select id from invoices where customer_id=900040 order by id desc limit 1),'Window cleaning',1,150) $$,
  'admin invoice_items insert runs'
);
-- 4. admin may update an item
select lives_ok(
  $$ update invoice_items set unit_price=175
      where invoice_id=(select id from invoices where customer_id=900040 order by id desc limit 1) $$,
  'admin item update runs'
);
-- 5. admin may delete items
select lives_ok(
  $$ delete from invoice_items
      where invoice_id=(select id from invoices where customer_id=900040 order by id desc limit 1) $$,
  'admin item delete runs'
);

-- (rep) -----------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000041"}';
-- 6. rep insert violates the invoices_admin WITH CHECK → RLS error 42501
select throws_ok(
  $$ insert into invoices(customer_id) values (900040) $$,
  '42501', null, 'rep invoice insert blocked by RLS'
);

-- (cleaner) -------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"90000000-0000-0000-0000-000000000042"}';
-- 7. cleaner sees no invoices (RLS select filters to zero rows)
select is_empty(
  $$ select 1 from invoices where customer_id=900040 $$,
  'cleaner sees no invoices'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase test db`
Expected: `invoices_write` fails — the `authenticated` role has no `insert`/`update`/`delete` grant on `invoices`/`invoice_items` yet (permission denied), and there is no `number` default so the admin insert would also raise a not-null violation on `number`.

- [ ] **Step 3: Write `0012_invoice_writes.sql`**

Create `supabase/migrations/0012_invoice_writes.sql`:

```sql
-- PRD §6.7: Admin creates/edits/deletes invoices + items. The invoices_admin / items_admin
-- FOR ALL policies (0002) already authorize admins for insert/update/delete/select — no new
-- policy, RPC, or view is needed. Local Supabase does not auto-grant table privileges, and
-- 0002 granted only SELECT, so add the write grants here (RLS still filters non-admin rows).
grant insert, update, delete on invoices, invoice_items to authenticated;

-- Human-facing invoice numbers INV-1001, INV-1002, … are assigned by a sequence-backed
-- column default so the app never computes the next number (no read-modify-write race).
create sequence invoice_number_seq start 1001;
alter table invoices alter column number set default 'INV-' || nextval('invoice_number_seq');

-- 0005 granted USAGE/SELECT on ALL sequences that EXISTED AT THAT TIME — a snapshot, not a
-- standing rule — so it does NOT cover this new sequence. Without this explicit grant an
-- admin insert that fires the default raises "permission denied for sequence invoice_number_seq".
grant usage, select on sequence invoice_number_seq to authenticated;
```

- [ ] **Step 4: Advance the sequence in `seed.sql` (avoid `INV-1001` collision)**

`seed.sql` inserts `INV-1001…INV-1003` with explicit `number` values (the default is not fired), so `invoice_number_seq` stays at 1001. Without this, the first app-created invoice would default to `INV-1001` and collide with the seed's unique `INV-1001`. Append one line to the sequence-advance block at the end of `supabase/seed.sql` (after the `invoice_items` `setval`, ~L78):

```sql
-- invoice_number_seq is NOT an identity sequence; the seed sets number explicitly, so advance
-- it past the highest seeded INV number (INV-1003) → next app-created invoice is INV-1004.
select setval('invoice_number_seq', 1003);
```

- [ ] **Step 5: Apply + run tests**

Run: `npx supabase db reset` then `npx supabase test db`
Expected: all pgTAP files pass — `schema`, `rls_money`, `claim_job` (3/3), `customers_write`, `leads_map`, `jobs_board` (12/12), `invoices_write` (7/7).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0012_invoice_writes.sql supabase/tests/invoices_write.sql supabase/seed.sql
git commit -m "feat(db): invoice write grants + sequence-backed INV-#### number default + pgTAP"
```

---

### Task 2: `lib/invoices.ts` (pure helpers + unit tests)

All pure, DB-free invoice logic: types, status maps, `fmtMoney`, `invoiceTotal` (with tax/deposit), `parseInvoiceForm` (validation + negative rejection), and the `buildInvoices` join helper. No DB view; no server import.

**Files:**
- Create: `lib/invoices.ts`
- Test: `tests/unit/invoices.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type InvoiceStatus = 'draft' | 'sent' | 'paid'`; `const INVOICE_STATUSES: InvoiceStatus[]`.
  - `const invoiceStatusColor: Record<InvoiceStatus,string>`.
  - `type InvoiceItem = { description: string; qty: number; unit_price: number }`.
  - `type Invoice` (incl. `items: InvoiceItem[]`, `tax: number`, `deposit: number`, `customer_name: string`).
  - `type InvoiceRow`, `type InvoiceCustomer`, `type InvoiceInput`.
  - `const fmtMoney: (n: number) => string`.
  - `invoiceTotal(items: InvoiceItem[], tax?: number, deposit?: number): number`.
  - `parseInvoiceForm(fd: FormData): { ok: true; value: InvoiceInput } | { ok: false; error: string }`.
  - `buildInvoices(invoices: InvoiceRow[], itemsByInvoice: Map<number, InvoiceItem[]>, customers: InvoiceCustomer[]): Invoice[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/invoices.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  INVOICE_STATUSES,
  invoiceStatusColor,
  fmtMoney,
  invoiceTotal,
  parseInvoiceForm,
  buildInvoices,
  type InvoiceItem,
  type InvoiceRow,
  type InvoiceCustomer,
} from '@/lib/invoices';

const fd = (o: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('status maps', () => {
  it('lists the three invoice statuses', () => {
    expect(INVOICE_STATUSES).toEqual(['draft', 'sent', 'paid']);
  });
  it('has a CSS-var color for each status', () => {
    expect(invoiceStatusColor.paid).toBe('var(--paid)');
    expect(invoiceStatusColor.sent).toBe('var(--sent)');
    expect(invoiceStatusColor.draft).toBe('var(--draft)');
  });
});

describe('fmtMoney', () => {
  it('formats with a $ prefix and thousands separators', () => {
    expect(fmtMoney(1240)).toBe('$1,240');
    expect(fmtMoney(0)).toBe('$0');
    expect(fmtMoney(NaN)).toBe('$0');
  });
});

describe('invoiceTotal', () => {
  const items: InvoiceItem[] = [
    { description: 'A', qty: 2, unit_price: 100 },
    { description: 'B', qty: 1, unit_price: 25 },
  ];
  it('sums qty * unit_price', () => {
    expect(invoiceTotal(items)).toBe(225);
  });
  it('adds tax and subtracts deposit', () => {
    expect(invoiceTotal(items, 20, 50)).toBe(195); // 225 + 20 - 50
  });
  it('is 0 for no items', () => {
    expect(invoiceTotal([])).toBe(0);
  });
  it('coerces non-numeric qty/price to 0', () => {
    expect(invoiceTotal([{ description: 'x', qty: NaN, unit_price: 10 }])).toBe(0);
  });
});

describe('parseInvoiceForm', () => {
  it('accepts a valid form and coerces item numbers', () => {
    const r = parseInvoiceForm(fd({
      customer_id: '5',
      status: 'sent',
      items: JSON.stringify([{ description: 'Window cleaning', qty: '2', unit_price: '90' }]),
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.customer_id).toBe(5);
      expect(r.value.status).toBe('sent');
      expect(r.value.items).toEqual([{ description: 'Window cleaning', qty: 2, unit_price: 90 }]);
    }
  });
  it('rejects a missing customer', () => {
    const r = parseInvoiceForm(fd({ customer_id: '0', status: 'draft', items: '[]' }));
    expect(r.ok).toBe(false);
  });
  it('rejects an invalid status', () => {
    const r = parseInvoiceForm(fd({ customer_id: '1', status: 'void', items: JSON.stringify([{ description: 'x', qty: '1', unit_price: '1' }]) }));
    expect(r.ok).toBe(false);
  });
  it('rejects negative qty or price', () => {
    const r = parseInvoiceForm(fd({ customer_id: '1', status: 'draft', items: JSON.stringify([{ description: 'x', qty: '-1', unit_price: '5' }]) }));
    expect(r.ok).toBe(false);
    const r2 = parseInvoiceForm(fd({ customer_id: '1', status: 'draft', items: JSON.stringify([{ description: 'x', qty: '1', unit_price: '-5' }]) }));
    expect(r2.ok).toBe(false);
  });
  it('drops fully-empty lines but requires at least one real item', () => {
    const r = parseInvoiceForm(fd({
      customer_id: '1', status: 'draft',
      items: JSON.stringify([{ description: '', qty: '0', unit_price: '0' }, { description: 'Real', qty: '1', unit_price: '50' }]),
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.items).toEqual([{ description: 'Real', qty: 1, unit_price: 50 }]);
    const empty = parseInvoiceForm(fd({ customer_id: '1', status: 'draft', items: JSON.stringify([{ description: '', qty: '0', unit_price: '0' }]) }));
    expect(empty.ok).toBe(false);
  });
  it('rejects malformed items JSON', () => {
    const r = parseInvoiceForm(fd({ customer_id: '1', status: 'draft', items: 'not json' }));
    expect(r.ok).toBe(false);
  });
});

describe('buildInvoices', () => {
  const rows: InvoiceRow[] = [
    { id: 1, customer_id: 10, job_id: null, number: 'INV-1001', issue_date: '2026-06-20', status: 'paid', tax: 0, deposit: 0 },
    { id: 2, customer_id: 99, job_id: 7, number: 'INV-1002', issue_date: '2026-06-25', status: 'sent', tax: null, deposit: null },
  ];
  const items = new Map<number, InvoiceItem[]>([[1, [{ description: 'A', qty: 1, unit_price: 180 }]]]);
  const customers: InvoiceCustomer[] = [{ id: 10, name: 'Sarah Kim' }];
  it('joins customer name, items, and coerces null tax/deposit to 0', () => {
    const out = buildInvoices(rows, items, customers);
    expect(out[0].customer_name).toBe('Sarah Kim');
    expect(out[0].items).toEqual([{ description: 'A', qty: 1, unit_price: 180 }]);
    expect(out[0].tax).toBe(0);
    expect(out[1].customer_name).toBe('Unknown'); // customer 99 absent
    expect(out[1].items).toEqual([]);             // no items row
    expect(out[1].tax).toBe(0);
    expect(out[1].deposit).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/invoices'`.

- [ ] **Step 3: Implement `lib/invoices.ts`**

Create `lib/invoices.ts`:

```ts
export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid'];

export const invoiceStatusColor: Record<InvoiceStatus, string> = {
  paid: 'var(--paid)', sent: 'var(--sent)', draft: 'var(--draft)',
};

export type InvoiceItem = { description: string; qty: number; unit_price: number };

export type Invoice = {
  id: number;
  customer_id: number;
  job_id: number | null;
  number: string;
  issue_date: string;
  status: InvoiceStatus;
  tax: number;
  deposit: number;
  items: InvoiceItem[];
  customer_name: string;
};

// DB shapes the page fetches.
export type InvoiceRow = {
  id: number;
  customer_id: number;
  job_id: number | null;
  number: string;
  issue_date: string;
  status: InvoiceStatus;
  tax: number | null;
  deposit: number | null;
};
export type InvoiceCustomer = { id: number; name: string };

export type InvoiceInput = {
  customer_id: number;
  status: InvoiceStatus;
  items: InvoiceItem[];
};

export const fmtMoney = (n: number) => '$' + Number(n || 0).toLocaleString();

// total = sum(qty * unit_price) + tax - deposit. tax/deposit are Phase-3 fields (default 0).
export function invoiceTotal(items: InvoiceItem[], tax = 0, deposit = 0): number {
  const sub = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  return sub + (Number(tax) || 0) - (Number(deposit) || 0);
}

// Validates the invoice drawer's FormData. items travel as a JSON string field so the whole
// dynamic line-item array survives a single FormData round-trip. Negatives are rejected;
// fully-empty lines are dropped; at least one real line is required.
export function parseInvoiceForm(
  fd: FormData
): { ok: true; value: InvoiceInput } | { ok: false; error: string } {
  const customer_id = Number(fd.get('customer_id'));
  if (!Number.isFinite(customer_id) || customer_id <= 0) return { ok: false, error: 'Customer is required' };

  const status = String(fd.get('status') ?? '');
  if (!INVOICE_STATUSES.includes(status as InvoiceStatus)) return { ok: false, error: 'Invalid status' };

  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get('items') ?? '[]'));
  } catch {
    return { ok: false, error: 'Invalid line items' };
  }
  if (!Array.isArray(raw)) return { ok: false, error: 'Invalid line items' };

  const items: InvoiceItem[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    const description = String(r?.description ?? '').trim();
    const qty = Number(r?.qty) || 0;
    const unit_price = Number(r?.unit_price) || 0;
    if (qty < 0 || unit_price < 0) return { ok: false, error: 'Quantities and prices cannot be negative' };
    if (!description && qty === 0 && unit_price === 0) continue; // skip empty lines
    items.push({ description: description || 'Item', qty, unit_price });
  }
  if (items.length === 0) return { ok: false, error: 'At least one line item is required' };

  return { ok: true, value: { customer_id, status: status as InvoiceStatus, items } };
}

// Join helper: attach each invoice's items (from a Map) and its customer name. No DB view.
export function buildInvoices(
  invoices: InvoiceRow[],
  itemsByInvoice: Map<number, InvoiceItem[]>,
  customers: InvoiceCustomer[]
): Invoice[] {
  const byId = new Map(customers.map(c => [c.id, c]));
  return invoices.map(inv => ({
    id: inv.id,
    customer_id: inv.customer_id,
    job_id: inv.job_id,
    number: inv.number,
    issue_date: inv.issue_date,
    status: inv.status,
    tax: Number(inv.tax ?? 0),
    deposit: Number(inv.deposit ?? 0),
    items: itemsByInvoice.get(inv.id) ?? [],
    customer_name: byId.get(inv.customer_id)?.name ?? 'Unknown',
  }));
}
```

- [ ] **Step 4: Run — tests pass**

Run: `npm test`
Expected: `invoices.test.ts` PASS (all prior unit tests still green).

- [ ] **Step 5: Commit**

```bash
git add lib/invoices.ts tests/unit/invoices.test.ts
git commit -m "feat(invoices): pure invoice helpers (status maps, invoiceTotal, parseInvoiceForm, buildInvoices)"
```

---

### Task 3: Invoices route — actions + print + drawer + table + page

The admin `/invoices` screen: a table (# / customer / date / amount / status / 🖨 PDF), a deep-linked `?i=<id>` / `?new=1` drawer editor (customer select, live-totalled editable line items + add line, status select, Save, Print PDF), and browser-PDF printing via a `document.body` portal.

**Files:**
- Create: `app/(app)/invoices/actions.ts` (`saveInvoice` only — `createInvoiceFromJob` is Task 4)
- Create: `components/invoices/InvoicePrint.tsx`
- Create: `components/invoices/InvoiceDrawer.tsx`
- Create: `components/invoices/InvoicesTable.tsx`
- Modify: `app/(app)/invoices/page.tsx` (full replace of the Plan-4 stub)

**Interfaces:**
- Consumes: `Invoice`, `InvoiceItem`, `InvoiceStatus`, `InvoiceRow`, `InvoiceCustomer`, `INVOICE_STATUSES`, `invoiceStatusColor`, `fmtMoney`, `invoiceTotal`, `buildInvoices`, `parseInvoiceForm` (Task 2); `getRole` (`lib/auth`); `supabaseServer()`; `Drawer` (`components/ui/Drawer.tsx`).
- Produces:
  - `app/(app)/invoices/actions.ts`: `saveInvoice(id: number | null, fd: FormData): Promise<{ error?: string }>` (create redirects to `/invoices?i=<id>`; edit returns `{}`).
  - `components/invoices/InvoicePrint.tsx`: `type PrintData`; `function InvoicePrint({ data }: { data: PrintData })` rendering `<div id="printArea">`.
  - `components/invoices/InvoiceDrawer.tsx`: `type InvoiceCustomerFull`; `function InvoiceDrawer({ invoice, isNew, customers })`.
  - `components/invoices/InvoicesTable.tsx`: `function InvoicesTable({ invoices }: { invoices: Invoice[] })`.

- [ ] **Step 1: Write the `saveInvoice` server action**

Create `app/(app)/invoices/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { parseInvoiceForm } from '@/lib/invoices';

// Save an invoice header + its line items. id === null → create (number/issue_date/status
// defaults fill from the DB; 0012 sets number = INV-<nextval>). Authorization is the
// invoices_admin / items_admin FOR ALL RLS policies (0002) — a non-admin's writes are
// rejected (insert: 42501; update: 0 rows).
//
// NOT ATOMIC (accepted MVP risk): header write → delete all items → re-insert items. If the
// process dies between the delete and the insert, the invoice keeps its header but loses its
// items; an admin can simply re-save. A transaction/RPC would remove this risk — out of scope.
export async function saveInvoice(id: number | null, fd: FormData): Promise<{ error?: string }> {
  const parsed = parseInvoiceForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const { customer_id, status, items } = parsed.value;
  const sb = await supabaseServer();

  let invoiceId = id;
  if (id === null) {
    const { data, error } = await sb
      .from('invoices')
      .insert({ customer_id, status })
      .select('id')
      .single();
    if (error) return { error: error.message };
    invoiceId = data.id;
  } else {
    const { data, error } = await sb
      .from('invoices')
      .update({ customer_id, status })
      .eq('id', id)
      .select('id');
    if (error) return { error: error.message };
    if (!data?.length) return { error: 'Save failed: not permitted or invoice not found' };
  }

  const { error: delErr } = await sb.from('invoice_items').delete().eq('invoice_id', invoiceId);
  if (delErr) return { error: delErr.message };
  const { error: insErr } = await sb.from('invoice_items').insert(
    items.map(it => ({
      invoice_id: invoiceId,
      description: it.description,
      qty: it.qty,
      unit_price: it.unit_price,
    }))
  );
  if (insErr) return { error: insErr.message };

  revalidatePath('/invoices');
  revalidatePath('/customers');
  revalidatePath('/dashboard');
  if (id === null) redirect(`/invoices?i=${invoiceId}`);
  return {};
}
```

- [ ] **Step 2: Build `InvoicePrint` (body-portal target)**

Create `components/invoices/InvoicePrint.tsx` (markup mirrors `printInvoice` in the proto, ~L651-660; the `#printArea`/`.inv-tbl`/`.tot` CSS already exists in `app/globals.css`):

```tsx
'use client';
import { fmtMoney, invoiceTotal, type InvoiceItem } from '@/lib/invoices';

export type PrintData = {
  number: string;
  issue_date: string;
  customer_name: string;
  customer_address: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  items: InvoiceItem[];
  tax: number;
  deposit: number;
};

// Rendered by InvoiceDrawer via createPortal(…, document.body) so it is a SIBLING of .app.
// Print CSS hides .app/.drawer with display:none!important and shows #printArea — a nested
// #printArea would inherit the ancestor's display:none and print blank.
export function InvoicePrint({ data }: { data: PrintData }) {
  const total = invoiceTotal(data.items, data.tax, data.deposit);
  return (
    <div id="printArea">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>ClearView</h1>
          <div style={{ fontSize: 11 }}>Window Cleaning Co.</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>INVOICE</div>
          <div>{data.number}</div>
          <div>{data.issue_date}</div>
        </div>
      </div>
      <div style={{ marginTop: 24, fontSize: 12 }}>
        <b>Bill to:</b>
        <br />{data.customer_name}
        <br />{data.customer_address ?? ''}
        <br />{data.customer_phone ?? ''} · {data.customer_email ?? ''}
      </div>
      <table className="inv-tbl">
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => (
            <tr key={i}>
              <td>{it.description}</td>
              <td>{it.qty}</td>
              <td>{fmtMoney(it.unit_price)}</td>
              <td>{fmtMoney(it.qty * it.unit_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tot">Total due: {fmtMoney(total)}</div>
      <div style={{ marginTop: 40, fontSize: 11, color: '#555' }}>
        Thank you for your business. Payment due within 14 days.
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build `InvoiceDrawer`**

Create `components/invoices/InvoiceDrawer.tsx` (mirrors `renderInvoiceDrawer`, proto ~L627-648):

```tsx
'use client';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import {
  INVOICE_STATUSES,
  invoiceStatusColor,
  fmtMoney,
  invoiceTotal,
  type Invoice,
  type InvoiceItem,
  type InvoiceStatus,
} from '@/lib/invoices';
import { saveInvoice } from '@/app/(app)/invoices/actions';
import { InvoicePrint, type PrintData } from './InvoicePrint';

export type InvoiceCustomerFull = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export function InvoiceDrawer({
  invoice, isNew, customers,
}: {
  invoice: Invoice | null;
  isNew: boolean;
  customers: InvoiceCustomerFull[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<number>(invoice?.customer_id ?? customers[0]?.id ?? 0);
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? 'draft');
  const [items, setItems] = useState<InvoiceItem[]>(
    invoice?.items.length ? invoice.items : [{ description: 'Window cleaning', qty: 1, unit_price: 150 }]
  );
  const [printPayload, setPrintPayload] = useState<PrintData | null>(null);

  const close = () => router.push('/invoices', { scroll: false });
  const cust = customers.find(c => c.id === customerId) ?? null;
  const total = invoiceTotal(items, invoice?.tax ?? 0, invoice?.deposit ?? 0);
  const number = invoice?.number ?? 'INV-—';
  const issueDate = invoice?.issue_date ?? 'pending';

  const setItem = (i: number, f: keyof InvoiceItem, v: string) =>
    setItems(prev => prev.map((it, idx) =>
      idx === i ? { ...it, [f]: f === 'description' ? v : (Number(v) || 0) } : it
    ));
  const addLine = () => setItems(prev => [...prev, { description: '', qty: 1, unit_price: 0 }]);

  const buildFd = () => {
    const fd = new FormData();
    fd.set('customer_id', String(customerId));
    fd.set('status', status);
    fd.set('items', JSON.stringify(items));
    return fd;
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveInvoice(isNew ? null : invoice!.id, buildFd());
      // New invoices redirect inside the action (this frame does not return); only the
      // edit path returns {} — mirror CustomerDrawer: close only on edit.
      if (res?.error) setError(res.error);
      else if (!isNew) close();
    });
  };

  const printPdf = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveInvoice(isNew ? null : invoice!.id, buildFd());
      if (res?.error) { setError(res.error); return; }
      // A brand-new invoice redirects to /invoices?i=<id> above; the drawer remounts on the
      // persisted invoice and the admin prints from there. For an existing invoice, print now.
      if (isNew) return;
      setPrintPayload({
        number,
        issue_date: issueDate,
        customer_name: cust?.name ?? 'Customer',
        customer_address: cust?.address ?? null,
        customer_phone: cust?.phone ?? null,
        customer_email: cust?.email ?? null,
        items,
        tax: invoice?.tax ?? 0,
        deposit: invoice?.deposit ?? 0,
      });
    });
  };

  // Print once the #printArea portal has mounted as a body sibling; the small delay lets the
  // browser lay it out before the print dialog snapshots the page.
  useEffect(() => {
    if (!printPayload) return;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [printPayload]);

  return (
    <Drawer onClose={close}>
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: invoiceStatusColor[status] }}>{status}</span>
          <h2>{number}</h2>
        </div>
        <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
      </div>

      <div className="sec">
        <span className="lbl">Bill to</span>
        <select value={customerId} onChange={e => setCustomerId(Number(e.target.value))} style={{ width: '100%' }}>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="minirow" style={{ cursor: 'default' }}>
          <span style={{ color: 'var(--muted)' }}>📞 {cust?.phone ?? '—'} · {cust?.address ?? '—'}</span>
        </div>
      </div>

      <div className="sec">
        <span className="lbl">Line items</span>
        <table className="items">
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Price</th><th style={{ textAlign: 'right' }}>Total</th></tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td><input value={it.description} onChange={e => setItem(i, 'description', e.target.value)} /></td>
                <td><input className="num" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} /></td>
                <td><input className="num" value={it.unit_price} onChange={e => setItem(i, 'unit_price', e.target.value)} /></td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(it.qty * it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn sec" type="button" onClick={addLine} style={{ marginTop: 8 }}>+ Add line</button>
      </div>

      <div className="sec">
        <div className="kv">
          <span className="k">Status</span>
          <span className="v">
            <select value={status} onChange={e => setStatus(e.target.value as InvoiceStatus)}>
              {INVOICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </span>
          <span className="k">Total</span>
          <span className="v" style={{ color: 'var(--won)', fontSize: 15 }}>{fmtMoney(total)}</span>
        </div>
      </div>

      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}

      <div className="acts">
        <button className="btn-p" type="button" disabled={pending} onClick={save}>Save</button>
        <button className="btn-s" type="button" disabled={pending} onClick={printPdf}>🖨 Print PDF</button>
        <button className="btn-s" type="button" onClick={close}>Close</button>
      </div>

      {printPayload && createPortal(<InvoicePrint data={printPayload} />, document.body)}
    </Drawer>
  );
}
```

- [ ] **Step 4: Build `InvoicesTable`**

Create `components/invoices/InvoicesTable.tsx` (mirrors `renderInvoices`, proto ~L534-540). **Deviation from proto (documented):** the per-row 🖨 button opens the drawer (`?i=<id>`) rather than printing directly, so printing always happens after fonts/layout are ready inside the drawer's portal — avoids a print-before-fonts flash.

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { fmtMoney, invoiceTotal, invoiceStatusColor, type Invoice } from '@/lib/invoices';

export function InvoicesTable({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();
  const open = (id: number) => router.push(`/invoices?i=${id}`, { scroll: false });
  return (
    <section className="screen">
      <div className="scrhead">
        <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: 13 }}>Invoices</h3>
        <button className="btn" type="button" onClick={() => router.push('/invoices?new=1', { scroll: false })}>
          + New invoice
        </button>
      </div>
      <div className="panel box">
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} data-click="" onClick={() => open(inv.id)}>
                  <td><b>{inv.number}</b></td>
                  <td>{inv.customer_name}</td>
                  <td>{inv.issue_date}</td>
                  <td>{fmtMoney(invoiceTotal(inv.items, inv.tax, inv.deposit))}</td>
                  <td>
                    <span className="badge" style={{ background: 'var(--chip)', color: invoiceStatusColor[inv.status] }}>
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sec" type="button" onClick={e => { e.stopPropagation(); open(inv.id); }}>
                      🖨 PDF
                    </button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="cap" style={{ color: 'var(--muted)' }}>No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Replace the invoices page**

Replace `app/(app)/invoices/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildInvoices, type InvoiceRow, type InvoiceItem, type InvoiceCustomer } from '@/lib/invoices';
import { InvoicesTable } from '@/components/invoices/InvoicesTable';
import { InvoiceDrawer, type InvoiceCustomerFull } from '@/components/invoices/InvoiceDrawer';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string; new?: string }>;
}) {
  const { i: iParam, new: newParam } = await searchParams;
  const role = await getRole();
  if (role !== 'admin') redirect('/dashboard'); // money is admin-only
  const sb = await supabaseServer();

  const { data: invRows } = await sb
    .from('invoices')
    .select('id,customer_id,job_id,number,issue_date,status,tax,deposit')
    .order('id', { ascending: false });
  const { data: itemRows } = await sb
    .from('invoice_items')
    .select('invoice_id,description,qty,unit_price');
  const { data: custRows } = await sb
    .from('customers')
    .select('id,name,address,phone,email')
    .order('name');

  const itemsByInvoice = new Map<number, InvoiceItem[]>();
  for (const it of itemRows ?? []) {
    const arr = itemsByInvoice.get(it.invoice_id) ?? [];
    arr.push({ description: it.description, qty: Number(it.qty), unit_price: Number(it.unit_price) });
    itemsByInvoice.set(it.invoice_id, arr);
  }

  const invoices = buildInvoices(
    (invRows ?? []) as InvoiceRow[],
    itemsByInvoice,
    (custRows ?? []) as InvoiceCustomer[]
  );
  const customers: InvoiceCustomerFull[] = (custRows ?? []).map(c => ({
    id: c.id, name: c.name, address: c.address, phone: c.phone, email: c.email,
  }));

  const isNew = newParam === '1';
  const selected = iParam ? invoices.find(v => v.id === Number(iParam)) ?? null : null;

  return (
    <>
      <InvoicesTable invoices={invoices} />
      {(isNew || selected) && (
        <InvoiceDrawer invoice={selected} isNew={isNew} customers={customers} />
      )}
    </>
  );
}
```

- [ ] **Step 6: Verify build + tests + lint**

Run: `npm test` — green (no new unit tests; the drawer/print flow is exercised in Task 6's live drive).
Run: `npm run build` — clean (server page + client actions; no Suspense/searchParams errors).
Run: `npm run lint` — no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/invoices/actions.ts" "app/(app)/invoices/page.tsx" components/invoices/InvoicePrint.tsx components/invoices/InvoiceDrawer.tsx components/invoices/InvoicesTable.tsx
git commit -m "feat(invoices): admin invoices table + drawer editor + saveInvoice + body-portal PDF print"
```

---

### Task 4: Create invoice from a job — `createInvoiceFromJob` + `JobDrawer` wiring

Add the `createInvoiceFromJob` server action and turn the `JobDrawer`'s disabled Plan-5 "Create invoice" stub into an active admin-only button.

**Files:**
- Modify: `app/(app)/invoices/actions.ts` (append `createInvoiceFromJob`)
- Modify: `components/jobs/JobDrawer.tsx` (activate the button; ~L14, ~L127-144)

**Interfaces:**
- Consumes: `getRole` (`lib/auth`); `supabaseServer()`; base `jobs` table (admin passes `jobs_admin` SELECT); `invoices`/`invoice_items` write grants (Task 1).
- Produces: `createInvoiceFromJob(jobId: number): Promise<{ error?: string }>` — redirects to `/invoices?i=<id>` on success.

- [ ] **Step 1: Append `createInvoiceFromJob` to the invoices actions**

Add to `app/(app)/invoices/actions.ts` (new imports + function). Update the import block at the top to include `redirect` (already present from Task 3) and add `getRole`:

```ts
import { getRole } from '@/lib/auth';
```

Append at the end of the file:

```ts
// Create a draft invoice seeded from a job: one line item "<service> — window cleaning" at the
// job's price. Explicit admin check (defence in depth on top of the invoices_admin RLS policy)
// so a non-admin gets a clean error instead of a raw RLS failure. Reads the BASE jobs table
// (admin passes jobs_admin SELECT) for customer_id + price. number/status/issue_date default.
export async function createInvoiceFromJob(jobId: number): Promise<{ error?: string }> {
  const role = await getRole();
  if (role !== 'admin') return { error: 'Not authorized' };
  const sb = await supabaseServer();

  const { data: job, error: jErr } = await sb
    .from('jobs')
    .select('id,customer_id,service,price')
    .eq('id', jobId)
    .single();
  if (jErr || !job) return { error: jErr?.message ?? 'Job not found' };

  const { data: inv, error: iErr } = await sb
    .from('invoices')
    .insert({ customer_id: job.customer_id, job_id: job.id })
    .select('id')
    .single();
  if (iErr) return { error: iErr.message };

  const { error: itErr } = await sb.from('invoice_items').insert({
    invoice_id: inv.id,
    description: (job.service ?? 'Service') + ' — window cleaning',
    qty: 1,
    unit_price: Number(job.price ?? 0),
  });
  if (itErr) return { error: itErr.message };

  revalidatePath('/invoices');
  revalidatePath('/customers');
  revalidatePath('/dashboard');
  redirect(`/invoices?i=${inv.id}`);
}
```

- [ ] **Step 2: Wire the `JobDrawer` "Create invoice" button**

In `components/jobs/JobDrawer.tsx`, add the import (after the existing `claimJob, setJobStatus` import, ~L14):

```tsx
import { createInvoiceFromJob } from '@/app/(app)/invoices/actions';
```

Add a handler next to `claim` (after the `claim` function, ~L48):

```tsx
  const createInvoice = () => {
    setError(null);
    startTransition(async () => {
      const res = await createInvoiceFromJob(job.id); // redirects to /invoices?i=<id> on success
      if (res?.error) setError(res.error);
    });
  };
```

Replace the disabled button + the trailing caption (~L133-144) — the whole block from the `{admin && (` disabled button through the closing `)}` of the caption paragraph:

```tsx
        {admin && (
          <button className="btn-s" type="button" disabled={pending} onClick={createInvoice}>
            Create invoice
          </button>
        )}
        <button className="btn-s" type="button" onClick={close}>Close</button>
      </div>
    </Drawer>
  );
}
```

(This removes the `Invoicing … arrives in Plan 5.` caption entirely and drops the old `disabled title="Invoicing arrives in Plan 5"` button.)

- [ ] **Step 3: Verify build + tests + lint**

Run: `npm test` — green.
Run: `npm run build` — clean.
Run: `npm run lint` — no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/invoices/actions.ts" components/jobs/JobDrawer.tsx
git commit -m "feat(invoices): create invoice from job + activate JobDrawer Create-invoice button"
```

---

### Task 5: `lib/dashboard.ts` (pure metrics + unit tests)

All pure dashboard metrics. Every function takes `now: Date | string` and does date logic via `YYYY-MM-DD` string compares (UTC-normalized, no timezone math). Revenue is attributed by `issue_date` — **there is no `paid_at` column and you must not add one.**

**Files:**
- Create: `lib/dashboard.ts`
- Test: `tests/unit/dashboard.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type RevenueInvoice = { status: string; issue_date: string; total: number }`.
  - `type WeekJob = { scheduled_date: string | null }`; `type WinLead = { status: string }`.
  - `revenueMTD(invoices: RevenueInvoice[], now: Date | string): number`.
  - `isOverdue(inv: RevenueInvoice, now: Date | string): boolean`.
  - `overdueTotal(invoices: RevenueInvoice[], now: Date | string): number`.
  - `chartBuckets14d(invoices: RevenueInvoice[], now: Date | string): number[]` (length 14, index 13 = today).
  - `jobsThisWeek(jobs: WeekJob[], now: Date | string): number`.
  - `winRate(leads: WinLead[]): number` (fraction 0..1; 0 when denominator is 0).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/dashboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  revenueMTD,
  isOverdue,
  overdueTotal,
  chartBuckets14d,
  jobsThisWeek,
  winRate,
  type RevenueInvoice,
} from '@/lib/dashboard';

const now = '2026-07-02';

describe('revenueMTD', () => {
  const inv: RevenueInvoice[] = [
    { status: 'paid', issue_date: '2026-07-01', total: 100 },
    { status: 'paid', issue_date: '2026-07-31', total: 50 },  // same month, later day
    { status: 'paid', issue_date: '2026-06-30', total: 999 }, // previous month → excluded
    { status: 'sent', issue_date: '2026-07-02', total: 40 },  // not paid → excluded
  ];
  it('sums paid invoices issued in the now-month only', () => {
    expect(revenueMTD(inv, now)).toBe(150);
  });
  it('is 0 when nothing is paid this month', () => {
    expect(revenueMTD([{ status: 'paid', issue_date: '2026-06-01', total: 100 }], now)).toBe(0);
  });
});

describe('isOverdue / overdueTotal (sent > 30d by issue_date)', () => {
  it('is overdue strictly older than 30 days', () => {
    // now = 2026-07-02 → cutoff = 2026-06-02. Older than cutoff = overdue.
    expect(isOverdue({ status: 'sent', issue_date: '2026-05-28', total: 10 }, now)).toBe(true);
    expect(isOverdue({ status: 'sent', issue_date: '2026-06-25', total: 10 }, now)).toBe(false);
  });
  it('the 30-day boundary itself is NOT overdue', () => {
    expect(isOverdue({ status: 'sent', issue_date: '2026-06-02', total: 10 }, now)).toBe(false);
  });
  it('only sent invoices count', () => {
    expect(isOverdue({ status: 'paid', issue_date: '2026-01-01', total: 10 }, now)).toBe(false);
    expect(isOverdue({ status: 'draft', issue_date: '2026-01-01', total: 10 }, now)).toBe(false);
  });
  it('sums overdue totals', () => {
    const inv: RevenueInvoice[] = [
      { status: 'sent', issue_date: '2026-05-28', total: 165 },
      { status: 'sent', issue_date: '2026-06-25', total: 210 }, // not overdue
      { status: 'paid', issue_date: '2026-01-01', total: 999 }, // not sent
    ];
    expect(overdueTotal(inv, now)).toBe(165);
  });
});

describe('chartBuckets14d', () => {
  it('returns 14 daily paid totals with index 13 = today', () => {
    const inv: RevenueInvoice[] = [
      { status: 'paid', issue_date: '2026-07-02', total: 25 }, // today → index 13
      { status: 'paid', issue_date: '2026-06-19', total: 10 }, // 13 days ago → index 0
      { status: 'paid', issue_date: '2026-06-18', total: 99 }, // out of window (14 days ago)
      { status: 'sent', issue_date: '2026-07-02', total: 40 }, // not paid → ignored
    ];
    const out = chartBuckets14d(inv, now);
    expect(out).toHaveLength(14);
    expect(out[13]).toBe(25);
    expect(out[0]).toBe(10);
    expect(out.reduce((s, n) => s + n, 0)).toBe(35); // 99 excluded, 40 excluded
  });
  it('buckets correctly across a month boundary', () => {
    // now = 2026-03-05 → window 2026-02-20 … 2026-03-05
    const inv: RevenueInvoice[] = [
      { status: 'paid', issue_date: '2026-02-28', total: 7 },
      { status: 'paid', issue_date: '2026-03-01', total: 3 },
    ];
    const out = chartBuckets14d(inv, '2026-03-05');
    expect(out[8]).toBe(7);  // 2026-02-28 is 5 days before today's index 13 → 13-5=8
    expect(out[9]).toBe(3);  // 2026-03-01
    expect(out.reduce((s, n) => s + n, 0)).toBe(10);
  });
});

describe('jobsThisWeek', () => {
  it('counts jobs scheduled in the trailing 7-day window (inclusive)', () => {
    // now = 2026-07-02 → window 2026-06-26 … 2026-07-02
    const jobs = [
      { scheduled_date: '2026-07-02' }, // in
      { scheduled_date: '2026-06-26' }, // in (boundary)
      { scheduled_date: '2026-06-25' }, // out (too old)
      { scheduled_date: '2026-07-03' }, // out (future)
      { scheduled_date: null },         // out (unscheduled)
    ];
    expect(jobsThisWeek(jobs, now)).toBe(2);
  });
});

describe('winRate', () => {
  it('is won / (won + lost)', () => {
    expect(winRate([{ status: 'won' }, { status: 'won' }, { status: 'lost' }, { status: 'follow' }])).toBeCloseTo(2 / 3);
  });
  it('is 0 when there are no won or lost leads (zero-division convention)', () => {
    expect(winRate([{ status: 'new' }, { status: 'follow' }])).toBe(0);
    expect(winRate([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/dashboard'`.

- [ ] **Step 3: Implement `lib/dashboard.ts`**

Create `lib/dashboard.ts`:

```ts
// Pure dashboard metrics. All date logic is YYYY-MM-DD string comparison, normalized through
// UTC so there is no timezone drift. Revenue is attributed by invoices.issue_date — there is
// NO paid_at column and one must NOT be added.

export type RevenueInvoice = { status: string; issue_date: string; total: number };
export type WeekJob = { scheduled_date: string | null };
export type WinLead = { status: string };

function toYMD(now: Date | string): string {
  return (typeof now === 'string' ? now : now.toISOString()).slice(0, 10);
}
function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

// Sum of paid invoices issued in the same calendar month as `now`.
export function revenueMTD(invoices: RevenueInvoice[], now: Date | string): number {
  const month = toYMD(now).slice(0, 7); // YYYY-MM
  return invoices
    .filter(i => i.status === 'paid' && i.issue_date.slice(0, 7) === month)
    .reduce((s, i) => s + i.total, 0);
}

// A 'sent' invoice is overdue when it was issued strictly more than 30 days before `now`.
export function isOverdue(inv: RevenueInvoice, now: Date | string): boolean {
  if (inv.status !== 'sent') return false;
  const cutoff = addDaysYMD(toYMD(now), -30);
  return inv.issue_date.slice(0, 10) < cutoff;
}

export function overdueTotal(invoices: RevenueInvoice[], now: Date | string): number {
  return invoices.filter(i => isOverdue(i, now)).reduce((s, i) => s + i.total, 0);
}

// 14 daily paid-revenue totals for the window ending today: index 0 = 13 days ago, 13 = today.
export function chartBuckets14d(invoices: RevenueInvoice[], now: Date | string): number[] {
  const today = toYMD(now);
  const idx = new Map<string, number>();
  for (let i = 0; i < 14; i++) idx.set(addDaysYMD(today, i - 13), i);
  const out = new Array(14).fill(0);
  for (const inv of invoices) {
    if (inv.status !== 'paid') continue;
    const i = idx.get(inv.issue_date.slice(0, 10));
    if (i !== undefined) out[i] += inv.total;
  }
  return out;
}

// Jobs scheduled in the trailing 7-day window [now-6, now] (inclusive). Unscheduled jobs
// (null scheduled_date) do not count.
export function jobsThisWeek(jobs: WeekJob[], now: Date | string): number {
  const today = toYMD(now);
  const start = addDaysYMD(today, -6);
  return jobs.filter(
    j => j.scheduled_date != null && j.scheduled_date.slice(0, 10) >= start && j.scheduled_date.slice(0, 10) <= today
  ).length;
}

// won / (won + lost); 0 when the denominator is 0 (convention: no decided leads → 0%).
export function winRate(leads: WinLead[]): number {
  const won = leads.filter(l => l.status === 'won').length;
  const lost = leads.filter(l => l.status === 'lost').length;
  const denom = won + lost;
  return denom === 0 ? 0 : won / denom;
}
```

- [ ] **Step 4: Run — tests pass**

Run: `npm test`
Expected: `dashboard.test.ts` PASS (all prior unit tests still green).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard.ts tests/unit/dashboard.test.ts
git commit -m "feat(dashboard): pure metrics (revenueMTD, overdue, 14d buckets, jobsThisWeek, winRate)"
```

---

### Task 6: Dashboard page + components + revalidate tweak + full verification

The role-aware `/dashboard`: admin-only revenue-MTD + overdue KPIs and the real 14-day chart; everyone's jobs/week, win rate, top-3 claimable jobs with Claim, and a mini schematic map. **Non-admins receive no money props at all** and get a `•••••` chart placeholder. Add `revalidatePath('/dashboard')` to the two jobs actions. Then a full end-to-end verification pass.

**Files:**
- Create: `components/dashboard/KpiCountUp.tsx`, `RevenueChart.tsx`, `ClaimableJobs.tsx`, `MiniMap.tsx`
- Modify: `components/map/SchematicMap.tsx` (add optional `height` prop)
- Modify: `app/(app)/jobs/actions.ts` (add `revalidatePath('/dashboard')` to `claimJob` + `setJobStatus`)
- Modify: `app/(app)/dashboard/page.tsx` (full replace of the stub)
- Modify: `.superpowers/sdd/progress.md` (append verification results)

**Interfaces:**
- Consumes: `revenueMTD`, `overdueTotal`, `chartBuckets14d`, `jobsThisWeek`, `winRate`, `RevenueInvoice`, `WeekJob`, `WinLead` (Task 5); `fmtMoney` (Task 2); `buildJobs`, `visibleJobs`, `JobRow`, `JobCustomer` (`lib/jobs`); `buildLeads`, `statusLabel`, `Pin`, `LeadPublicRow`, `CustomerGeo` (`lib/leads`); `SchematicMap` (`components/map`); `claimJob` (`app/(app)/jobs/actions`); `getRole`, `getSession` (`lib/auth`); `supabaseServer()`.
- Produces:
  - `KpiCountUp({ end, prefix?, suffix?, format? })`.
  - `RevenueChart({ data }: { data: number[] })`.
  - `ClaimableJobs({ jobs })` + `type ClaimableJob`.
  - `MiniMap({ pins }: { pins: Pin[] })`.
  - `SchematicMap` gains optional `height?: number | string`.

- [ ] **Step 1: Add `revalidatePath('/dashboard')` to the jobs actions**

In `app/(app)/jobs/actions.ts`, add `revalidatePath('/dashboard');` immediately after each existing `revalidatePath('/jobs');` (one in `claimJob`, one in `setJobStatus`). Result:

```ts
export async function claimJob(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('claim_job', { p_job_id: id });
  if (error) return { error: error.message };
  revalidatePath('/jobs');
  revalidatePath('/dashboard');
  return {};
}

export async function setJobStatus(id: number, status: JobStatus): Promise<{ error?: string }> {
  if (!JOB_STATUSES.includes(status)) return { error: 'Invalid status' };
  const sb = await supabaseServer();
  const { error } = await sb.rpc('set_job_status', { p_job_id: id, p_status: status });
  if (error) return { error: error.message };
  revalidatePath('/jobs');
  revalidatePath('/dashboard');
  return {};
}
```

- [ ] **Step 2: Add an optional `height` prop to `SchematicMap`**

In `components/map/SchematicMap.tsx`, add `height?: number | string;` to `MapImplProps`, accept it in the destructure, and merge it into the root `.map` div's inline style (existing `MapView` callers pass nothing → the CSS default height is unchanged):

```tsx
export type MapImplProps = {
  pins: Pin[];
  canCreate: boolean;
  overlay: React.ReactNode;
  onMapClick: (lat: number, lng: number, xPct: number, yPct: number) => void;
  onPinClick: (id: number) => void;
  height?: number | string;
};

export function SchematicMap({ pins, canCreate, overlay, onMapClick, onPinClick, height }: MapImplProps) {
```

and the root element (was `style={{ cursor: canCreate ? 'crosshair' : 'default' }}`):

```tsx
    <div
      className="map"
      onClick={handleClick}
      style={{ cursor: canCreate ? 'crosshair' : 'default', ...(height != null ? { height } : {}) }}
    >
```

- [ ] **Step 3: Build `KpiCountUp`**

Create `components/dashboard/KpiCountUp.tsx` (rAF cubic ease-out port of proto `counts`, ~L416-418; reduced-motion → jump to end):

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';

export function KpiCountUp({
  end, prefix = '', suffix = '', format,
}: {
  end: number;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
}) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(end);
      return;
    }
    let t0: number | null = null;
    const step = (t: number) => {
      if (t0 === null) t0 = t;
      const p = Math.min((t - t0) / 900, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(end * e);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [end]);
  const shown = format ? format(val) : String(Math.round(val));
  return <span>{prefix}{shown}{suffix}</span>;
}
```

- [ ] **Step 4: Build `RevenueChart`**

Create `components/dashboard/RevenueChart.tsx` (canvas port of proto `drawChart`, ~L419-428; colors from `document.documentElement`; redraw on mount/resize + a MutationObserver on `data-theme`; devicePixelRatio scaling):

```tsx
'use client';
import { useEffect, useRef } from 'react';

export function RevenueChart({ data }: { data: number[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const cs = getComputedStyle(document.documentElement);
      const acc = cs.getPropertyValue('--accent').trim();
      const ink = cs.getPropertyValue('--ink').trim();
      const gl = cs.getPropertyValue('--line').trim();
      const dpr = devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      const c = cv.getContext('2d');
      if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      const d = data.length ? data : new Array(14).fill(0);
      const max = Math.max(30, ...d), pad = 4;
      const X = (i: number) => (i / (d.length - 1)) * (w - pad * 2) + pad;
      const Y = (v: number) => h - 10 - (v / max) * (h - 24);
      c.strokeStyle = gl; c.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = 10 + (i * (h - 24)) / 4;
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      }
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, acc + '55'); g.addColorStop(1, acc + '00');
      c.beginPath(); c.moveTo(X(0), Y(d[0])); d.forEach((v, i) => c.lineTo(X(i), Y(v)));
      c.lineTo(X(d.length - 1), h); c.lineTo(X(0), h); c.closePath();
      c.fillStyle = g; c.fill();
      c.beginPath(); c.moveTo(X(0), Y(d[0])); d.forEach((v, i) => c.lineTo(X(i), Y(v)));
      c.lineWidth = 2; c.strokeStyle = acc; c.stroke();
      d.forEach((v, i) => { c.beginPath(); c.rect(X(i) - 2, Y(v) - 2, 4, 4); c.fillStyle = ink; c.fill(); });
    };
    draw();
    addEventListener('resize', draw);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { removeEventListener('resize', draw); mo.disconnect(); };
  }, [data]);
  return <canvas ref={ref} style={{ width: '100%', height: 160 }} />;
}
```

- [ ] **Step 5: Build `ClaimableJobs`**

Create `components/dashboard/ClaimableJobs.tsx` (mirrors `renderDashJobs`, proto ~L514-517; `useTransition` + `router.refresh()` like `JobDrawer`; `price` is null for non-admins):

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { claimJob } from '@/app/(app)/jobs/actions';
import { fmtMoney } from '@/lib/invoices';

export type ClaimableJob = {
  id: number;
  customer_name: string;
  address: string | null;
  service: string | null;
  price: number | null; // null = non-admin (money is admin-only)
};

export function ClaimableJobs({ jobs }: { jobs: ClaimableJob[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const claim = (id: number) => {
    setError(null);
    startTransition(async () => {
      const res = await claimJob(id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };
  if (jobs.length === 0) {
    return <div className="cap" style={{ color: 'var(--muted)' }}>All jobs claimed 🎉</div>;
  }
  return (
    <div className="rowlist">
      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
      {jobs.map(j => (
        <div className="lrow" key={j.id}>
          <div className="pin-sq" style={{ background: 'var(--sched)' }} />
          <div className="info">
            <b>{j.customer_name}</b>
            <small>{j.address ?? '—'} · {j.service ?? 'TBD'}{j.price != null ? ` · ${fmtMoney(j.price)}` : ''}</small>
          </div>
          <button className="claim" type="button" disabled={pending} onClick={() => claim(j.id)}>Claim</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Build `MiniMap`**

Create `components/dashboard/MiniMap.tsx` (reuses `SchematicMap` with `canCreate=false`, `height=190`; a pin → `/map?l=<id>` (pin click stops propagation), the panel background → `/map`):

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { SchematicMap } from '@/components/map/SchematicMap';
import type { Pin } from '@/lib/leads';

export function MiniMap({ pins }: { pins: Pin[] }) {
  const router = useRouter();
  return (
    <div style={{ cursor: 'pointer' }} onClick={() => router.push('/map')}>
      <SchematicMap
        pins={pins}
        canCreate={false}
        overlay={null}
        height={190}
        onMapClick={() => {}}
        onPinClick={id => router.push(`/map?l=${id}`)}
      />
    </div>
  );
}
```

- [ ] **Step 7: Replace the dashboard page (role-split)**

Replace `app/(app)/dashboard/page.tsx` (markup mirrors proto ~L231-247). **Non-admins never receive `revenue`/`overdue`/`chart` — those are computed and rendered only inside `if (admin)`; the non-admin chart body is a `•••••` placeholder.**

```tsx
import { redirect } from 'next/navigation';
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildJobs, visibleJobs, type JobRow, type JobCustomer } from '@/lib/jobs';
import { buildLeads, statusLabel, type LeadPublicRow, type CustomerGeo, type Pin } from '@/lib/leads';
import {
  revenueMTD, overdueTotal, chartBuckets14d, jobsThisWeek, winRate,
  type RevenueInvoice, type WeekJob, type WinLead,
} from '@/lib/dashboard';
import { fmtMoney } from '@/lib/invoices';
import { KpiCountUp } from '@/components/dashboard/KpiCountUp';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { ClaimableJobs, type ClaimableJob } from '@/components/dashboard/ClaimableJobs';
import { MiniMap } from '@/components/dashboard/MiniMap';

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect('/login');
  const role = await getRole();
  if (!role) redirect('/login');
  const uid = user.id;
  const admin = role === 'admin';
  const sb = await supabaseServer();
  const now = new Date(); // server "today"; all metrics compare YYYY-MM-DD (UTC-normalized)

  // ---- everyone: jobs (role-split price), leads (win rate + pins), customers ----
  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (admin) {
    const { data } = await sb
      .from('jobs')
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,price')
      .order('id');
    const rows = data ?? [];
    jobRows = rows.map(r => ({
      id: r.id, customer_id: r.customer_id, lead_id: r.lead_id, status: r.status,
      claimed_by: r.claimed_by, scheduled_date: r.scheduled_date, service: r.service,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    const { data } = await sb
      .from('jobs_public')
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service')
      .order('id');
    jobRows = (data ?? []) as JobRow[];
  }

  const { data: cs } = await sb.from('customers').select('id,name,address,phone,email,lat,lng');
  const { data: ps } = await sb.from('profiles').select('id,full_name');
  const names = new Map((ps ?? []).map(p => [p.id as string, p.full_name as string]));
  const jobs = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const visible = visibleJobs(role, uid, jobs);
  const claimable: ClaimableJob[] = visible
    .filter(j => j.status === 'unclaimed')
    .slice(0, 3)
    .map(j => ({ id: j.id, customer_name: j.customer_name, address: j.address, service: j.service, price: j.price }));
  const jpw = jobsThisWeek(jobs as WeekJob[], now);

  const { data: lp } = await sb
    .from('leads_public')
    .select('id,customer_id,status,service,stories,panes,note')
    .order('id');
  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], null);
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
    const { data: invRows } = await sb.from('invoices').select('id,status,issue_date');
    const { data: itemRows } = await sb.from('invoice_items').select('invoice_id,qty,unit_price');
    const totalById = new Map<number, number>();
    for (const it of itemRows ?? []) {
      totalById.set(it.invoice_id, (totalById.get(it.invoice_id) ?? 0) + Number(it.qty) * Number(it.unit_price));
    }
    const rev: RevenueInvoice[] = (invRows ?? []).map(i => ({
      status: i.status, issue_date: i.issue_date, total: totalById.get(i.id) ?? 0,
    }));
    revenue = revenueMTD(rev, now);
    overdue = overdueTotal(rev, now);
    chart = chartBuckets14d(rev, now);
  }

  return (
    <section className="screen">
      <div className="kpis">
        {admin && (
          <div className="kpi box">
            <span className="tag">▚ ADMIN</span>
            <div className="lbl">Revenue · MTD</div>
            <div className="val"><KpiCountUp end={revenue} format={n => fmtMoney(Math.round(n))} /></div>
            <div className="sub up">▲ paid this month</div>
          </div>
        )}
        <div className="kpi box">
          <span className="tag">wk</span>
          <div className="lbl">Jobs / week</div>
          <div className="val"><KpiCountUp end={jpw} /></div>
          <div className="sub up">▲ scheduled 7d</div>
        </div>
        <div className="kpi box">
          <span className="tag">%</span>
          <div className="lbl">Win rate</div>
          <div className="val"><KpiCountUp end={wr} suffix="%" /></div>
          <div className="sub up">▲ lead → won</div>
        </div>
        {admin && (
          <div className="kpi box">
            <span className="tag">$</span>
            <div className="lbl">Overdue invoices</div>
            <div className="val"><KpiCountUp end={overdue} format={n => fmtMoney(Math.round(n))} /></div>
            <div className="sub bad">● sent &gt; 30d</div>
          </div>
        )}
      </div>

      <div className="grid2">
        <div className="panel box">
          <h3>Revenue / 14D</h3>
          <p className="cap">daily · USD{admin ? ' · admin view' : ''}</p>
          {admin ? (
            <RevenueChart data={chart} />
          ) : (
            <div
              className="money-hidden"
              style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 22 }}
            >
              •••••
            </div>
          )}
        </div>
        <div className="panel box">
          <h3>Claimable jobs</h3>
          <p className="cap">claim = lock</p>
          <ClaimableJobs jobs={claimable} />
        </div>
      </div>

      <div className="panel box">
        <h3>Neighborhood snapshot</h3>
        <p className="cap">tap to open full map →</p>
        <MiniMap pins={pins} />
        <div className="legend">
          <span><i className="lg" style={{ background: 'var(--won)' }} /> WON</span>
          <span><i className="lg" style={{ background: 'var(--follow)' }} /> FOLLOW-UP</span>
          <span><i className="lg" style={{ background: 'var(--lost)' }} /> LOST</span>
          <span><i className="lg" style={{ background: 'var(--new)' }} /> NEW</span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Verify build + tests + lint**

Run: `npm test` — green (invoices + dashboard unit suites plus all prior).
Run: `npm run build` — clean.
Run: `npm run lint` — no errors.

- [ ] **Step 9: Commit the feature**

```bash
git add components/dashboard "app/(app)/dashboard/page.tsx" "app/(app)/jobs/actions.ts" components/map/SchematicMap.tsx
git commit -m "feat(dashboard): role-aware KPIs, 14d revenue chart, claimable jobs, mini map + /dashboard revalidate"
```

- [ ] **Step 10: Full automated suite**

```bash
npx supabase db reset
npx supabase test db     # expect: schema, rls_money, claim_job (3/3), customers_write, leads_map, jobs_board (12/12), invoices_write (7/7)
npm test                 # expect all unit suites pass (…, jobs, invoices, dashboard)
npm run build            # expect clean production build
npm run lint             # expect no errors
```

- [ ] **Step 11: DB-layer invoice matrix (psql, no app)**

```bash
DBURL="$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')"

# admin: insert an invoice with NO number → default assigns INV-1004 (seed advanced the seq to 1003)
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"11111111-1111-1111-1111-111111111111\"}'; insert into invoices(customer_id) values (1) returning number;"

# admin: add an item, then read the invoice back
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"11111111-1111-1111-1111-111111111111\"}'; insert into invoice_items(invoice_id,description,qty,unit_price) values ((select max(id) from invoices),'Test line',2,60);"

# rep: insert blocked by RLS (invoices_admin WITH CHECK) → 42501
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"22222222-2222-2222-2222-222222222222\"}'; insert into invoices(customer_id) values (1);" || echo "OK: rep invoice insert blocked"

# cleaner: sees zero invoices (RLS select)
psql "$DBURL" -c "set role authenticated; set request.jwt.claims='{\"sub\":\"33333333-3333-3333-3333-333333333333\"}'; select count(*) from invoices;"   # expect 0
```
Expected: admin insert returns `INV-1004`; admin item insert succeeds; rep prints `OK: rep invoice insert blocked`; cleaner count is `0`. Reset afterward: `npx supabase db reset`.

- [ ] **Step 12: Dashboard role-split — non-admin RSC carries NO revenue**

Run `npm run dev`. Confirm the non-admin dashboard payload never contains money:

```bash
# Log in as cleaner via the app first (browser automation, password123), then fetch the
# dashboard as an RSC and confirm no revenue leaks. As cleaner the body must show the •••••
# placeholder and NO $ figures / "Revenue · MTD" / "Overdue" card.
# (Manual/automated: view cleaner /dashboard source — grep -c '\$[0-9]' == 0 and no "Revenue · MTD".)
```
Expected: cleaner + rep dashboards render Jobs/week, Win rate, Claimable jobs, mini-map; NO Revenue-MTD or Overdue KPI cards; the Revenue/14D panel body is `•••••`; the served markup contains no dollar amounts.

- [ ] **Step 13: Live drive (dev server)**

Verify against `http://localhost:3000` (browser automation; logins password `password123`):

1. `admin@clearview.dev` `/dashboard`: four KPI cards count up (Revenue MTD, Jobs/week, Win rate `80%`, Overdue invoices `$165`); the Revenue/14D chart draws real bars; toggle theme → chart redraws with new colors; top-3 Claimable jobs list with Claim buttons; mini-map shows pins; clicking a pin → `/map?l=<id>`, clicking the map background → `/map`. With reduced-motion enabled, KPIs jump straight to final values.
2. `/invoices` (admin): table lists `INV-1001…1003` with correct amounts/status colors. Click a row → drawer opens; edit a line item → Total updates live; `+ Add line` adds a row; change status → badge color updates. Save → drawer closes, table reflects changes. Reopen → `🖨 Print PDF` → browser print dialog shows the ClearView invoice (bill-to, line items, total) and the app chrome is hidden. `+ New invoice` → `?new=1` drawer; Save → redirects to `?i=<new id>` (number `INV-1004`).
3. `/jobs` (admin): open a job drawer → `Create invoice` is enabled → click → redirects to `/invoices?i=<id>` with one seeded line `"<service> — window cleaning"` at the job price.
4. `cleaner@clearview.dev` + `rep@clearview.dev`: `/invoices` in the address bar redirects to `/dashboard`; `/dashboard` shows no revenue (per Step 12). Claim a job from the dashboard Claimable list → it disappears (revalidated).

- [ ] **Step 14: Record results + commit ledger**

Append verification results to `.superpowers/sdd/progress.md`, then:

```bash
git add .superpowers/sdd/progress.md
git commit -m "chore: plan 5 verification results"
```

---

## Execution notes (controller)

- Branch: `feat/invoices`. Merge to `main` only when Task 6 is fully green.
- **Money boundary:** the `invoices_admin`/`items_admin` RLS policies are the authorization boundary for invoice writes; the `/invoices` route guard and the non-admin dashboard's total absence of money props are defence-in-depth. Never rely on client checks for security.
- **Sequence collision:** the seed's `setval('invoice_number_seq', 1003)` is load-bearing — without it the first app-created invoice defaults to `INV-1001` and collides with the seeded unique `INV-1001`. pgTAP does not load seed, so its first insert is `INV-1001` (correct there).
- **Not-atomic save:** `saveInvoice` replaces items via delete-then-insert without a transaction (documented MVP risk). If invoice items ever appear to vanish after a crash mid-save, this is the cause; the fix is to move the body into a `security definer` RPC.
- **Print portal:** `#printArea` must remain a `document.body` sibling. If a print ever comes out blank, verify `createPortal` targets `document.body` and not a drawer-nested node.
- After merge, update `docs/superpowers/AUTONOMOUS_RUN.md` status section (mirrors prior handoffs).
