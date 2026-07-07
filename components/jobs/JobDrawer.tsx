'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import {
  JOB_STATUSES, jobStatusLabel, jobStatusColor, canTransition, type Job, type JobStatus,
} from '@/lib/jobs';
import type { Role } from '@/lib/auth';
import { blankMoneyToZero } from '@/lib/forms';
import { claimJob, setJobStatus, createJob, updateJob, deleteJob } from '@/app/(app)/jobs/actions';
import { createInvoiceFromJob } from '@/app/(app)/invoices/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

export type LeadDetail = {
  stories: number | null; panes: number | null; note: string | null;
  description: string | null; quote_value: number | null;
};

export function JobDrawer({
  job, role, uid, admin, isNew = false, customers = [], leadDetail = null, backTo = '/jobs',
}: {
  job: Job | null;
  role: Role;
  uid: string;
  admin: boolean;
  isNew?: boolean;
  customers?: { id: number; name: string }[];
  leadDetail?: LeadDetail | null;
  backTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(isNew);
  const close = () => router.push(backTo, { scroll: false });

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
    // Admin blanking the (prefilled) price is a deliberate "clear to $0". The whole job
    // edit form is admin-only (Edit button is {admin &&}-gated), so a present-but-blank
    // price means clear, not "keep old value". Safe on create too.
    blankMoneyToZero(fd, 'price');
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
