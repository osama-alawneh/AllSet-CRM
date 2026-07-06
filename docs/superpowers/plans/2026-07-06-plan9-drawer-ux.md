# Plan 9 — Drawer UX (edit-mode everywhere · lead/job create+delete UI · job↔lead detail · invoice placeholders) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every entity drawer opens **read-only with an Edit button**; leads and jobs get create ("+ New") and delete (admin, confirmed) UI; the lead drawer leads with Service + Description; the job drawer shows full details plus a quick-view of its origin lead; the invoice drawer stops pre-filling fake values.

**Architecture:** Pure UI layer over Plan 8's RPC-backed Server Actions (`createLead/updateLead/deleteLead/createJob/updateJob/deleteJob`) — **Plan 8 must be merged first**. Each drawer holds a local `editing` state (`isNew` starts true); read mode renders `.kv` text, edit mode renders the form. No new DB objects.

**Tech Stack:** Next.js 16 App Router (Server Actions, `useTransition`), Blueprint+ CSS already in `globals.css`.

**Branch:** `feat/drawer-ux` (from `main` after Plan 8 merges).

## Global Constraints

- **Read-only is the default mode for every existing entity; `isNew` opens in edit mode** (MVP item 11).
- Money admin-only: quote/price inputs and values render only for admins (non-admins keep `•••••`).
- Role matrix: leads editable by admin+rep; jobs editable by **admin only** (cleaner keeps status-picker/claim rights, rep stays view-only); customers editable by admin+rep (unchanged); invoices admin-only (route-guarded already). **Delete = admin only, always behind `confirm()`** (2026-07-06 decision).
- Status transitions keep their existing paths (status picker / kanban / claim) — the edit forms never touch status.
- Field order in the lead drawer: **Service first, then Description**, then Stories/Panes/Quote/Note (MVP item 14).
- All drawers already live on URL params (`?l=`, `?j=`, `?c=`, `?i=`, `?new=1`) — keep that pattern.
- Gates before merge: `npm test`, `npx supabase test db`, `npm run lint`, `npm run build`, live three-role walkthrough.

---

### Task 1: LeadDrawer — read-mode default, edit form, create variant, delete

**Files:**
- Modify: `components/leads/LeadDrawer.tsx` (full replacement below)
- Modify: `app/(app)/leads/page.tsx` (handle `?new=1`, pass `customers`)
- Modify: `components/leads/KanbanBoard.tsx` (add "+ New lead" button)
- Modify: `app/globals.css` (append one `.btn-danger` rule, shared by Tasks 1–3)

**Interfaces:**
- Consumes: `Lead` (now with `description/created_at/updated_at`), `createLead/updateLead/deleteLead/setLeadStatus` actions, `LEAD_STATUSES/statusLabel/statusColor`.
- Produces: `LeadDrawer({ lead, admin, canEdit, backTo, isNew = false, customers = [] })` — `lead: Lead | null`, `customers: { id: number; name: string }[]`. The map page's existing call sites keep compiling because the two new props are optional.

- [ ] **Step 1: Append the danger-button style to `app/globals.css`**

```css
/* destructive action (Plan 9) */
.btn-danger { background: transparent; color: var(--lost); border: 1.5px solid var(--lost); }
.btn-danger:hover { background: var(--lost); color: #fff; }
```

- [ ] **Step 2: Replace `components/leads/LeadDrawer.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import {
  LEAD_STATUSES, statusLabel, statusColor, type Lead, type LeadStatus,
} from '@/lib/leads';
import { setLeadStatus, createLead, updateLead, deleteLead } from '@/app/(app)/leads/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

export function LeadDrawer({
  lead, admin, canEdit, backTo, isNew = false, customers = [],
}: {
  lead: Lead | null;
  admin: boolean;
  canEdit: boolean;
  backTo: '/leads' | '/map';
  isNew?: boolean;
  customers?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(isNew); // item 11: read-only default, edit on demand
  const close = () => router.push(backTo, { scroll: false });

  if (!isNew && !lead) return null;

  const change = (status: LeadStatus) => {
    if (!lead || status === lead.status) return;
    setError(null);
    startTransition(async () => {
      const res = await setLeadStatus(lead.id, status);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };

  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = isNew ? await createLead(fd) : await updateLead(lead!.id, fd);
      if (res?.error) setError(res.error);
      else if (!isNew) { setEditing(false); router.refresh(); }
      // new lead: createLead redirects to /leads?l=<id>
    });
  };

  const remove = () => {
    if (!lead) return;
    if (!window.confirm(`Delete lead #${lead.id} (${lead.service ?? 'no service'})? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteLead(lead.id);
      if (res?.error) setError(res.error);
      else close();
    });
  };

  return (
    <Drawer onClose={close}>
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: lead ? statusColor[lead.status] : 'var(--muted)' }}>
            {lead ? statusLabel[lead.status] : 'NEW'}
          </span>
          <h2>{isNew ? 'New lead' : lead!.service ?? lead!.customer_name}</h2>
        </div>
        <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
      </div>
      {!isNew && (
        <div className="lbl" style={{ marginTop: 4 }}>
          LEAD #{String(lead!.id).padStart(4, '0')} · created {day(lead!.created_at)} · updated {day(lead!.updated_at)}
        </div>
      )}

      {!editing && lead && (
        <>
          <div className="sec">
            <span className="lbl">Customer</span>
            <div className="minirow" onClick={() => router.push(`/customers?c=${lead.customer_id}`, { scroll: false })}>
              <span><b>{lead.customer_name}</b> · {lead.address ?? '—'}</span>
              <span>→</span>
            </div>
            <div className="qa">
              <a href={`tel:${lead.phone ?? ''}`}>📞 Call</a>
              <a href={`sms:${lead.phone ?? ''}`}>💬 Text</a>
              <a href={`mailto:${lead.email ?? ''}`}>✉ Email</a>
            </div>
          </div>

          <div className="sec">
            <span className="lbl">Lead details</span>
            <div className="kv">
              <span className="k">Service</span><span className="v">{lead.service ?? 'TBD'}</span>
              <span className="k">Description</span><span className="v">{lead.description ?? '—'}</span>
              <span className="k">Stories</span><span className="v">{lead.stories ?? '—'}</span>
              <span className="k">Panes</span><span className="v">{lead.panes ?? '—'}</span>
              <span className="k">Quote</span>
              {admin
                ? <span className="v" style={{ color: 'var(--won)' }}>{lead.quote_value ? fmt(lead.quote_value) : '—'}</span>
                : <span className="v money-hidden">•••••</span>}
            </div>
          </div>

          <div className="sec">
            <span className="lbl">Notes</span>
            <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0, color: 'var(--muted)' }}>{lead.note ?? '—'}</p>
          </div>

          {canEdit && (
            <div className="sec">
              <span className="lbl">Change status</span>
              <div className="statuspick">
                {LEAD_STATUSES.map(st => {
                  const sel = st === lead.status;
                  return (
                    <button
                      key={st} type="button" className={sel ? 'sel' : ''} aria-pressed={sel} disabled={pending}
                      style={sel ? { background: statusColor[st], color: '#fff', borderColor: 'transparent' } : undefined}
                      onClick={() => change(st)}
                    >
                      {statusLabel[st]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
          <div className="acts">
            {canEdit && (
              <button className="btn-p" type="button" disabled={pending} onClick={() => { setError(null); setEditing(true); }}>
                ✎ Edit
              </button>
            )}
            {canEdit && lead.status !== 'won' && (
              <button className="btn-s" type="button" disabled={pending} onClick={() => change('won')}>
                Mark won → job
              </button>
            )}
            {admin && (
              <button className="btn-s btn-danger" type="button" disabled={pending} onClick={remove}>
                🗑 Delete
              </button>
            )}
            <button className="btn-s" type="button" onClick={close}>Close</button>
          </div>
        </>
      )}

      {editing && (
        <form action={submit}>
          <div className="sec">
            <span className="lbl">{isNew ? 'New lead' : 'Edit lead'}</span>
            <div className="kv">
              <span className="k">Customer</span>
              <span className="v">
                {isNew ? (
                  <select name="customer_id" required defaultValue="">
                    <option value="" disabled>Select customer…</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <>
                    <input type="hidden" name="customer_id" value={lead!.customer_id} />
                    {lead!.customer_name}
                  </>
                )}
              </span>
              <span className="k">Service</span>
              <span className="v"><input name="service" required defaultValue={lead?.service ?? ''} placeholder="e.g. In + out, screens" /></span>
              <span className="k">Stories</span>
              <span className="v"><input name="stories" type="number" min={0} defaultValue={lead?.stories ?? ''} placeholder="2" /></span>
              <span className="k">Panes</span>
              <span className="v"><input name="panes" type="number" min={0} defaultValue={lead?.panes ?? ''} placeholder="14" /></span>
              {admin && (
                <>
                  <span className="k">Quote $</span>
                  <span className="v"><input name="quote" type="number" min={0} step="0.01" defaultValue={lead?.quote_value ?? ''} placeholder="0.00" /></span>
                </>
              )}
            </div>
          </div>
          <div className="sec">
            <span className="lbl">Description (what exactly to do)</span>
            <textarea name="description" defaultValue={lead?.description ?? ''} placeholder="e.g. 12 front panes, 2nd-story ladder, skip garage" style={{ width: '100%', minHeight: 70 }} />
          </div>
          <div className="sec">
            <span className="lbl">Internal note</span>
            <textarea name="note" defaultValue={lead?.note ?? ''} placeholder="gate code, best call time…" style={{ width: '100%', minHeight: 50 }} />
          </div>
          {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
          <div className="acts">
            <button className="btn-p" type="submit" disabled={pending}>
              {pending ? 'Saving…' : isNew ? 'Create lead' : 'Save'}
            </button>
            <button className="btn-s" type="button" disabled={pending} onClick={() => (isNew ? close() : (setError(null), setEditing(false)))}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
```

- [ ] **Step 3: Wire `?new=1` + customers in `app/(app)/leads/page.tsx`**

```tsx
// searchParams type gains new?: string
}: { searchParams: Promise<{ l?: string; new?: string }> }) {
// after existing fetches:
  const { l: lParam, new: newParam } = await searchParams;
  const isNew = newParam === '1';
  const customerOptions = (cs ?? []).map(c => ({ id: c.id, name: c.name }));
// render:
      {(selected || isNew) && (
        <LeadDrawer
          lead={selected} admin={admin} canEdit={true} backTo="/leads"
          isNew={isNew && !selected} customers={customerOptions}
        />
      )}
```

- [ ] **Step 4: "+ New lead" button in `components/leads/KanbanBoard.tsx`**

In the `.scrhead` div, next to the Export button (wrap both in the same flex group used on `CustomersTable`):

```tsx
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sec" type="button" onClick={/* existing CSV export handler unchanged */}>
            ⬇ Export CSV
          </button>
          {canEdit && (
            <button className="btn" type="button" onClick={() => router.push('/leads?new=1', { scroll: false })}>
              + New lead
            </button>
          )}
        </div>
```

- [ ] **Step 5: Verify live**

`npm run lint && npm run build` clean. Browser:
- Admin: open a lead → read-only, created/updated dates visible, **Service and Description shown first**; Edit → change service+description+quote → Save → drawer returns to read mode with new values; + New lead → create against a customer → drawer opens on it (status `new`, kanban shows it); Delete → confirm → gone (its job, if any, survives).
- Rep: Edit works, **no Quote field**, no Delete button.
- Map page (`/map`, click a pin): drawer still opens read-only — no regression from the new optional props.

- [ ] **Step 6: Commit**

```bash
git add components/leads/LeadDrawer.tsx components/leads/KanbanBoard.tsx "app/(app)/leads/page.tsx" app/globals.css
git commit -m "feat(leads): read-only drawer + edit mode, create/delete UI, service+description first"
```

---

### Task 2: JobDrawer — details parity, origin-lead quick-view, edit/create/delete (admin)

**Files:**
- Modify: `components/jobs/JobDrawer.tsx` (full replacement below)
- Modify: `app/(app)/jobs/page.tsx` (`?new=1`, customers, selected job's lead detail)
- Modify: `components/jobs/JobsBoard.tsx` (add "+ New job" button, admin only)

**Interfaces:**
- Consumes: `Job` (with `description/created_at/updated_at`), `claimJob/setJobStatus/createJob/updateJob/deleteJob`, `createInvoiceFromJob`.
- Produces: `JobDrawer({ job, role, uid, admin, isNew = false, customers = [], leadDetail = null })` with
  `type LeadDetail = { stories: number | null; panes: number | null; note: string | null; description: string | null; quote_value: number | null }` (exported from `JobDrawer.tsx`). `quote_value` is only ever non-null for admins (page enforces).

- [ ] **Step 1: Replace `components/jobs/JobDrawer.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import {
  JOB_STATUSES, jobStatusLabel, jobStatusColor, canTransition, type Job, type JobStatus,
} from '@/lib/jobs';
import type { Role } from '@/lib/auth';
import { claimJob, setJobStatus, createJob, updateJob, deleteJob } from '@/app/(app)/jobs/actions';
import { createInvoiceFromJob } from '@/app/(app)/invoices/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

export type LeadDetail = {
  stories: number | null; panes: number | null; note: string | null;
  description: string | null; quote_value: number | null;
};

export function JobDrawer({
  job, role, uid, admin, isNew = false, customers = [], leadDetail = null,
}: {
  job: Job | null;
  role: Role;
  uid: string;
  admin: boolean;
  isNew?: boolean;
  customers?: { id: number; name: string }[];
  leadDetail?: LeadDetail | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(isNew);
  const close = () => router.push('/jobs', { scroll: false });

  if (!isNew && !job) return null;
  const canClaim = job?.status === 'unclaimed' && (role === 'admin' || role === 'cleaner');

  const change = (status: JobStatus) => {
    if (!job || status === job.status) return;
    setError(null);
    startTransition(async () => {
      const res = await setJobStatus(job.id, status);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };
  const claim = () => {
    if (!job) return;
    setError(null);
    startTransition(async () => {
      const res = await claimJob(job.id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };
  const createInvoice = () => {
    if (!job) return;
    setError(null);
    startTransition(async () => {
      const res = await createInvoiceFromJob(job.id);
      if (res?.error) setError(res.error);
    });
  };
  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = isNew ? await createJob(fd) : await updateJob(job!.id, fd);
      if (res?.error) setError(res.error);
      else if (!isNew) { setEditing(false); router.refresh(); }
    });
  };
  const remove = () => {
    if (!job) return;
    if (!window.confirm(`Delete job #${job.id} (${job.service ?? 'no service'})? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteJob(job.id);
      if (res?.error) setError(res.error);
      else close();
    });
  };

  return (
    <Drawer onClose={close}>
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: job ? jobStatusColor[job.status] : 'var(--muted)' }}>
            {job ? jobStatusLabel[job.status] : 'NEW'}
          </span>
          <h2>{isNew ? 'New job' : job!.customer_name}</h2>
        </div>
        <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
      </div>
      {!isNew && (
        <div className="lbl" style={{ marginTop: 4 }}>
          JOB #{String(job!.id).padStart(4, '0')}
          {job!.lead_id != null ? ` · from lead #${String(job!.lead_id).padStart(4, '0')}` : ''}
          {' · created '}{day(job!.created_at)} · updated {day(job!.updated_at)}
        </div>
      )}

      {!editing && job && (
        <>
          <div className="sec">
            <span className="lbl">Customer</span>
            <div className="minirow" onClick={() => router.push(`/customers?c=${job.customer_id}`, { scroll: false })}>
              <span><b>{job.customer_name}</b> · {job.address ?? '—'}</span>
              <span>→</span>
            </div>
            <div className="qa">
              <a href={`tel:${job.phone ?? ''}`}>📞 Call</a>
              <a href={`sms:${job.phone ?? ''}`}>💬 Text</a>
              <a href={`mailto:${job.email ?? ''}`}>✉ Email</a>
            </div>
          </div>

          <div className="sec">
            <span className="lbl">Job details</span>
            <div className="kv">
              <span className="k">Service</span><span className="v">{job.service ?? 'TBD'}</span>
              <span className="k">Description</span><span className="v">{job.description ?? '—'}</span>
              <span className="k">Date</span><span className="v">{job.scheduled_date ?? 'TBD'}</span>
              <span className="k">Claimed by</span><span className="v">{job.claimed_by_name ?? '—'}</span>
              <span className="k">Price</span>
              {admin
                ? <span className="v" style={{ color: 'var(--won)' }}>{job.price ? fmt(job.price) : '—'}</span>
                : <span className="v money-hidden">•••••</span>}
            </div>
          </div>

          {job.lead_id != null && leadDetail && (
            <div className="sec">
              <span className="lbl">From lead #{String(job.lead_id).padStart(4, '0')} (quick view)</span>
              <div className="kv">
                <span className="k">Stories</span><span className="v">{leadDetail.stories ?? '—'}</span>
                <span className="k">Panes</span><span className="v">{leadDetail.panes ?? '—'}</span>
                {admin && (
                  <>
                    <span className="k">Quoted</span>
                    <span className="v" style={{ color: 'var(--won)' }}>
                      {leadDetail.quote_value ? fmt(leadDetail.quote_value) : '—'}
                    </span>
                  </>
                )}
                <span className="k">Lead note</span><span className="v">{leadDetail.note ?? '—'}</span>
              </div>
              <div className="minirow" onClick={() => router.push(`/leads?l=${job.lead_id}`, { scroll: false })}>
                <span>Open origin lead</span><span>→</span>
              </div>
            </div>
          )}

          <div className="sec">
            <span className="lbl">Change status</span>
            <div className="statuspick">
              {JOB_STATUSES.map(st => {
                const sel = st === job.status;
                const allowed = sel || canTransition(role, uid, job, st);
                return (
                  <button
                    key={st} type="button" className={sel ? 'sel' : ''} aria-pressed={sel}
                    disabled={pending || !allowed}
                    style={sel ? { background: jobStatusColor[st], color: '#fff', borderColor: 'transparent' } : undefined}
                    onClick={() => change(st)}
                  >
                    {jobStatusLabel[st]}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
          <div className="acts">
            {canClaim && (
              <button className="btn-p" type="button" disabled={pending} onClick={claim}>Claim job</button>
            )}
            {admin && (
              <button className="btn-p" type="button" disabled={pending} onClick={() => { setError(null); setEditing(true); }}>
                ✎ Edit
              </button>
            )}
            {admin && (
              <button className="btn-s" type="button" disabled={pending} onClick={createInvoice}>Create invoice</button>
            )}
            {admin && (
              <button className="btn-s btn-danger" type="button" disabled={pending} onClick={remove}>🗑 Delete</button>
            )}
            <button className="btn-s" type="button" onClick={close}>Close</button>
          </div>
        </>
      )}

      {editing && (
        <form action={submit}>
          <div className="sec">
            <span className="lbl">{isNew ? 'New job' : 'Edit job'}</span>
            <div className="kv">
              <span className="k">Customer</span>
              <span className="v">
                {isNew ? (
                  <select name="customer_id" required defaultValue="">
                    <option value="" disabled>Select customer…</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <>
                    <input type="hidden" name="customer_id" value={job!.customer_id} />
                    {job!.customer_name}
                  </>
                )}
              </span>
              <span className="k">Service</span>
              <span className="v"><input name="service" required defaultValue={job?.service ?? ''} placeholder="e.g. Full house" /></span>
              <span className="k">Date</span>
              <span className="v"><input name="scheduled_date" type="date" defaultValue={job?.scheduled_date ?? ''} /></span>
              <span className="k">Price $</span>
              <span className="v"><input name="price" type="number" min={0} step="0.01" defaultValue={job?.price ?? ''} placeholder="0.00" /></span>
            </div>
          </div>
          <div className="sec">
            <span className="lbl">Description (what exactly to do)</span>
            <textarea name="description" defaultValue={job?.description ?? ''} placeholder="e.g. 22 panes in+out, screens, hard-water treatment on back slider" style={{ width: '100%', minHeight: 70 }} />
          </div>
          {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
          <div className="acts">
            <button className="btn-p" type="submit" disabled={pending}>
              {pending ? 'Saving…' : isNew ? 'Create job' : 'Save'}
            </button>
            <button className="btn-s" type="button" disabled={pending} onClick={() => (isNew ? close() : (setError(null), setEditing(false)))}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
```

(Job edit is admin-only, so the edit form may show the price input unconditionally.)

- [ ] **Step 2: Page wiring in `app/(app)/jobs/page.tsx`**

```tsx
// searchParams gains new?: string
}: { searchParams: Promise<{ j?: string; new?: string }> }) {
  const { j: jParam, new: newParam } = await searchParams;
  const isNew = newParam === '1' && admin; // only admins create jobs
// after `selected` is resolved, fetch the origin-lead quick view:
  let leadDetail = null;
  if (selected?.lead_id != null) {
    if (admin) {
      const { data: ld } = await sb
        .from('leads')
        .select('stories,panes,note,description,quote_value')
        .eq('id', selected.lead_id)
        .single();
      leadDetail = ld ? { ...ld, quote_value: Number(ld.quote_value ?? 0) } : null;
    } else {
      const { data: ld } = await sb
        .from('leads_public')
        .select('stories,panes,note,description')
        .eq('id', selected.lead_id)
        .single();
      leadDetail = ld ? { ...ld, quote_value: null } : null; // money structurally absent for non-admins
    }
  }
  const customerOptions = (cs ?? []).map(c => ({ id: c.id, name: c.name }));
// render:
      {(selected || isNew) && (
        <JobDrawer
          job={selected} role={role} uid={uid} admin={admin}
          isNew={isNew && !selected} customers={customerOptions} leadDetail={leadDetail}
        />
      )}
```

- [ ] **Step 3: "+ New job" (admin) in `components/jobs/JobsBoard.tsx`** — same pattern as Task 1 Step 4:

```tsx
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sec" type="button" onClick={/* existing CSV export unchanged */}>
            ⬇ Export CSV
          </button>
          {admin && (
            <button className="btn" type="button" onClick={() => router.push('/jobs?new=1', { scroll: false })}>
              + New job
            </button>
          )}
        </div>
```

- [ ] **Step 4: Verify live**

- Admin: open a lead-born job → Description populated from the lead (Plan 8 trigger), "From lead" quick-view shows stories/panes/quoted/note, "Open origin lead" navigates; Edit → change price/date/description → Save; + New job → create → drawer opens on it, board shows it in Unclaimed; Delete → confirm → gone (any invoice survives, its job link nulled).
- Cleaner: job drawer read-only details **including Description** (that's the "what exactly to do"), price `•••••`, quick-view without Quoted line; can still claim/advance status; no Edit/Delete buttons.
- Rep: view-only, no Edit/Delete.

- [ ] **Step 5: Commit**

```bash
git add components/jobs/JobDrawer.tsx components/jobs/JobsBoard.tsx "app/(app)/jobs/page.tsx"
git commit -m "feat(jobs): job drawer details+lead quick-view, admin edit/create/delete"
```

---

### Task 3: CustomerDrawer — read-only default with Edit toggle

**Files:**
- Modify: `components/customers/CustomerDrawer.tsx`

**Interfaces:**
- Consumes/produces: unchanged props; only internal behavior changes.

- [ ] **Step 1: Add the `editing` state and gate the inputs**

Changes inside the component (structure otherwise untouched — the tab fix landed in Plan 8):

```tsx
  const [editing, setEditing] = useState(isNew);
  // ...
  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = isNew ? await createCustomer(fd) : await saveCustomer(c!.id, fd);
      if (res?.error) setError(res.error);
      else if (!isNew) { setEditing(false); router.refresh(); } // was: close() — keep the drawer open
    });
  };
```

Details section: when NOT editing render plain values, when editing render the existing inputs:

```tsx
        <div className="sec">
          <span className="lbl">Details</span>
          {editing ? (
            <div className="kv">{/* existing name/phone/email/address/type inputs, but with disabled removed —
              the Edit button is already gated by canEdit, so inputs are only reachable by editors */}</div>
          ) : (
            <div className="kv">
              <span className="k">Name</span><span className="v">{c!.name}</span>
              <span className="k">Phone</span><span className="v">{c!.phone ?? '—'}</span>
              <span className="k">Email</span><span className="v">{c!.email ?? '—'}</span>
              <span className="k">Address</span><span className="v">{c!.address ?? '—'}</span>
              <span className="k">Type</span><span className="v">{c!.type}</span>
            </div>
          )}
        </div>
```

Notes textarea: same split (`editing` → textarea, else `<p>` like the LeadDrawer notes block).

Actions row:

```tsx
        <div className="acts">
          {canEdit && !editing && (
            <button className="btn-p" type="button" onClick={() => { setError(null); setEditing(true); }}>✎ Edit</button>
          )}
          {editing && (
            <button className="btn-p" type="submit" disabled={pending}>
              {pending ? 'Saving…' : isNew ? 'Create customer' : 'Save'}
            </button>
          )}
          {editing && !isNew && (
            <button className="btn-s" type="button" disabled={pending} onClick={() => { setError(null); setEditing(false); }}>Cancel</button>
          )}
          <button className="btn-s" type="button" onClick={close}>Close</button>
        </div>
```

- [ ] **Step 2: Verify live**

Admin/rep: customer opens read-only; Edit → inputs; Save keeps the drawer open in read mode with fresh values; Cancel discards. Cleaner: read-only, no Edit. New customer (`?new=1`): opens straight in edit mode. Tabs still work (Plan 8).

- [ ] **Step 3: Commit**

```bash
git add components/customers/CustomerDrawer.tsx
git commit -m "feat(customers): drawer read-only by default with explicit edit mode"
```

---

### Task 4: InvoiceDrawer — placeholders instead of fake defaults + read-only mode

**Files:**
- Modify: `components/invoices/InvoiceDrawer.tsx`
- Modify: `lib/invoices.ts` (`parseInvoiceForm` empty-line rule)
- Test: `tests/unit/invoices.test.ts` (adjust + extend)

**Interfaces:**
- Consumes/produces: props unchanged.

- [ ] **Step 1: Failing test for the new empty-line rule**

The seeded first line changes from `{ description: 'Window cleaning', qty: 1, unit_price: 150 }` to `{ description: '', qty: 1, unit_price: 0 }` — an untouched line must now be DROPPED (before, `qty: 1` kept it alive as a junk `'Item'` row). In `tests/unit/invoices.test.ts` add:

```ts
  it('drops a line with no description and no price regardless of qty', () => {
    const fd = new FormData();
    fd.set('customer_id', '1');
    fd.set('status', 'draft');
    fd.set('items', JSON.stringify([{ description: '', qty: 1, unit_price: 0 }]));
    expect(parseInvoiceForm(fd)).toEqual({ ok: false, error: 'At least one line item is required' });
  });
```

Run: `npx vitest run tests/unit/invoices.test.ts` → the new test FAILS. If an existing test asserts the old `'Item'`-keeping behavior for `{description:'', qty:1, unit_price:0}`, update it to the new rule.

- [ ] **Step 2: Change the rule in `lib/invoices.ts`**

```ts
    if (!description && unit_price === 0) continue; // placeholder-only line: no text, no money — not a real item
```

(replaces `if (!description && qty === 0 && unit_price === 0) continue;`). Run the suite → PASS.

- [ ] **Step 3: Placeholders + read-only mode in `components/invoices/InvoiceDrawer.tsx`**

Seed line + editing state:

```tsx
  const [editing, setEditing] = useState(isNew);
  const [items, setItems] = useState<InvoiceItem[]>(
    invoice?.items.length ? invoice.items : [{ description: '', qty: 1, unit_price: 0 }]
  );
```

Line-item inputs get placeholders, and zero prices render empty (MVP item 12 — background text, not a real value):

```tsx
                <td><input value={it.description} placeholder="Window cleaning" onChange={e => setItem(i, 'description', e.target.value)} /></td>
                <td><input className="num" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} /></td>
                <td><input className="num" value={it.unit_price === 0 ? '' : it.unit_price} placeholder="0.00" onChange={e => setItem(i, 'unit_price', e.target.value)} /></td>
```

Read-only mode: when `!editing`, render Bill-to as text (customer name + phone/address row), items as a plain table (description/qty/price/total text cells, no inputs, no "+ Add line"), status as the existing badge (no select), then actions:

```tsx
      <div className="acts">
        {!editing && (
          <button className="btn-p" type="button" onClick={() => { setError(null); setEditing(true); }}>✎ Edit</button>
        )}
        {editing && (
          <button className="btn-p" type="button" disabled={pending} onClick={save}>Save</button>
        )}
        {editing && !isNew && (
          <button className="btn-s" type="button" disabled={pending}
            onClick={() => { setError(null); setEditing(false); setItems(invoice!.items); setStatus(invoice!.status); setCustomerId(invoice!.customer_id); }}>
            Cancel
          </button>
        )}
        <button className="btn-s" type="button" disabled={pending} onClick={printPdf}>🖨 Print PDF</button>
        <button className="btn-s" type="button" onClick={close}>Close</button>
      </div>
```

and `save`'s success path becomes `else if (!isNew) { setEditing(false); }` (keep drawer open). `printPdf` in read mode must NOT save first — guard: `if (!editing && !isNew) { setPrintPayload({...}); return; }` at the top of `printPdf` (print exactly what's persisted).

- [ ] **Step 4: Verify live (admin)**

- New invoice: first line is EMPTY with grey "Window cleaning"/"0.00" placeholder text; saving untouched → "At least one line item is required"; type a description+price → saves, drawer remounts on `INV-<n>`.
- Existing invoice: opens read-only (badge, text items, totals); Print PDF works without entering edit; Edit → change a line → Save → read mode updates; Cancel discards edits (items snap back).

- [ ] **Step 5: Commit**

```bash
git add components/invoices/InvoiceDrawer.tsx lib/invoices.ts tests/unit/invoices.test.ts
git commit -m "feat(invoices): placeholder seed line + read-only drawer with edit mode"
```

---

### Task 5: Final review & merge

- [ ] Full battery: `npx supabase db reset && npx supabase test db && npm test && npm run lint && npm run build` — all green.
- [ ] Live three-role walkthrough: every drawer (customer/lead/job/invoice) opens read-only → Edit → Save → back to read mode; create + delete flows for leads (admin+rep create / admin delete) and jobs (admin); cleaner sees job description; money never visible to non-admins in any new UI.
- [ ] Whole-branch review (superpowers:requesting-code-review); fix findings.
- [ ] Merge `feat/drawer-ux` → `main`; update `docs/superpowers/AUTONOMOUS_RUN.md` Phase-1.5 status.

## Self-Review Notes

- Spec coverage: item 3 (create/delete UI) → Tasks 1–2; item 10 (edit leads/jobs/invoices) → Tasks 1, 2, 4; item 11 (read-only default + Edit button) → Tasks 1–4; item 12 (invoice placeholders) → Task 4; item 13 (job detail parity via lead quick-view — the user's suggested "quick view coming from the Lead into the Job" option) → Task 2; item 14 (description field + service first) → Task 1 (+ Plan 8 DB).
- Type consistency: form `name=` attributes match Plan 8's parsers exactly (`customer_id/service/description/stories/panes/note/quote` and `customer_id/service/description/scheduled_date/price`).
- The map page's `LeadDrawer` call sites compile unchanged (new props optional with defaults).
