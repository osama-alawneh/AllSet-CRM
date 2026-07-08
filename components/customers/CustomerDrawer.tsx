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
  const [editing, setEditing] = useState(isNew);
  const canEdit = role !== 'cleaner';
  const close = () => router.push('/customers', { scroll: false });
  // Keyboard-accessible row nav, mirroring the row pattern in CustomersTable/InvoicesTable.
  const rowNav = (href: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => router.push(href, { scroll: false }),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        router.push(href, { scroll: false });
      }
    },
  });

  if (!isNew && !customer) return null;
  const c = customer;

  const submit = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = isNew ? await createCustomer(fd) : await saveCustomer(c!.id, fd);
      if (res?.error) setError(res.error);
      else if (!isNew) { setEditing(false); router.refresh(); }
    });
  };

  const tabs = [
    {
      key: 'jobs',
      label: `Jobs (${jobs.length})`,
      content: jobs.length ? (
        jobs.map(j => (
          <div className="minirow" key={j.id} {...rowNav(`/jobs?j=${j.id}`)}>
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
              <div className="minirow" key={i.id} {...rowNav(`/invoices?i=${i.id}`)}>
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
          <div className="minirow" key={l.id} {...rowNav(`/leads?l=${l.id}`)}>
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
    <Drawer onClose={close} labelId="customer-drawer-title">
      <form action={submit}>
        <div className="dh">
          <div>
            <span className="badge" style={{ background: 'var(--chip)', color: 'var(--muted)' }}>
              {isNew ? 'NEW' : `CUSTOMER #${String(c!.id).padStart(4, '0')}`}
            </span>
            <h2 id="customer-drawer-title">{isNew ? 'New customer' : c!.name}</h2>
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
          <span className="lbl">Details</span>
          {editing ? (
            <div className="kv">
              <span className="k">Name</span>
              <span className="v"><input name="name" defaultValue={c?.name ?? ''} required /></span>
              <span className="k">Phone</span>
              <span className="v"><input name="phone" defaultValue={c?.phone ?? ''} /></span>
              <span className="k">Email</span>
              <span className="v"><input name="email" defaultValue={c?.email ?? ''} /></span>
              <span className="k">Address</span>
              <span className="v"><input name="address" defaultValue={c?.address ?? ''} /></span>
              <span className="k">Type</span>
              <span className="v">
                <select name="type" defaultValue={c?.type ?? 'residential'}>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                </select>
              </span>
            </div>
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
        {!isNew && <Tabs tabs={tabs} label="Customer records" />}
        <div className="sec">
          <span className="lbl">Notes</span>
          {editing ? (
            <textarea
              name="notes"
              defaultValue={c?.notes ?? ''}
              style={{ width: '100%', minHeight: 90 }}
            />
          ) : (
            <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0, color: 'var(--muted)' }}>{c!.notes ?? '—'}</p>
          )}
        </div>
        {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
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
      </form>
    </Drawer>
  );
}
