'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import { CopyButton } from '@/components/ui/CopyButton';
import { CustomerLookup } from '@/components/customers/CustomerLookup';
import type { CustomerOption } from '@/lib/customerLookup';
import {
  JOB_STATUSES, jobStatusLabel, jobStatusColor, canTransition, dayTime, shareOf,
  type Job, type JobStatus, type JobMember,
} from '@/lib/jobs';
import { SERVICE_TYPES } from '@/lib/leads';
import type { Role } from '@/lib/auth';
import { blankMoneyToZero } from '@/lib/forms';
import { rowNav } from '@/lib/rowNav';
import { claimJob, setJobStatus, createJob, updateJob, deleteJob, requestJoin, decideJoin } from '@/app/(app)/jobs/actions';
import { createInvoiceFromJob } from '@/app/(app)/invoices/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

export type LeadDetail = {
  stories: number | null; panes: number | null; note: string | null;
  description: string | null; quote_value: number | null;
};

export function JobDrawer({
  job, role, uid, admin, isNew = false, customers = [], leadDetail = null, backTo = '/jobs', members = [],
}: {
  job: Job | null;
  role: Role;
  uid: string;
  admin: boolean;
  isNew?: boolean;
  customers?: CustomerOption[];
  leadDetail?: LeadDetail | null;
  backTo?: string;
  members?: JobMember[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(isNew);
  const close = () => router.push(backTo, { scroll: false });

  if (!isNew && !job) return null;
  const canClaim = job?.status === 'unclaimed' && (role === 'admin' || role === 'cleaner');
  // admin + rep both see/set job money (owner-locked visibility matrix, 2026-07-08 spec);
  // cleaners see only cleaner_amount, never price — the `canSeeMoney` gate keeps the
  // "Price" kv pair (label included) out of the DOM entirely for cleaners. Same admin/rep
  // split gates the edit form itself (create/update RPCs widened to admin-or-rep, 0025).
  const canSeeMoney = role === 'admin' || role === 'rep';
  const canEdit = canSeeMoney;

  // Members panel derivations (all roles) — mirrors can_decide_join (0024) for the
  // Approve/Reject gate; the RPC re-checks server-side regardless of this client hint.
  const approvedMembers = members.filter(m => m.status === 'approved');
  const pendingMembers = members.filter(m => m.status === 'pending');
  const approvedCount = approvedMembers.length;
  const myMember = members.find(m => m.cleaner_id === uid);
  const myPending = myMember?.status === 'pending';
  const canDecide = role === 'admin' || members.some(m => m.is_owner && m.cleaner_id === uid && m.status === 'approved');
  const perHeadShare = shareOf(job?.cleaner_amount ?? null, approvedCount);
  const myShare = myMember?.status === 'approved' ? perHeadShare : null;
  const showRequestJoin = role === 'cleaner' && !!job && job.claimed_by != null && job.status !== 'done'
    && myMember?.status !== 'approved' && !myPending;

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
  const join = () => {
    if (!job) return;
    setError(null);
    startTransition(async () => {
      const res = await requestJoin(job.id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };
  const decide = (memberId: number, approve: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await decideJoin(memberId, approve);
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
    // Admin/rep blanking the (prefilled) price is a deliberate "clear to $0". The whole job
    // edit form is admin-or-rep-only (Edit button is {canEdit &&}-gated), so a
    // present-but-blank price means clear, not "keep old value". Safe on create too.
    blankMoneyToZero(fd, 'price');
    blankMoneyToZero(fd, 'cleaner_amount');
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
    <Drawer onClose={close} labelId="job-drawer-title">
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: job ? jobStatusColor[job.status] : 'var(--muted)' }}>
            {job ? jobStatusLabel[job.status] : 'NEW'}
          </span>
          <h2 id="job-drawer-title">{isNew ? 'New job' : job!.customer_name}</h2>
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
            <div className="minirow" {...rowNav(router, `/customers?c=${job.customer_id}`)}>
              <span><b>{job.customer_name}</b> · {job.address ?? '—'}</span>
              <span>→</span>
            </div>
            <div className="qa">
              <a href={`tel:${job.phone ?? ''}`}>📞 Call</a>
              <a href={`sms:${job.phone ?? ''}`}>💬 Text</a>
              <a href={`mailto:${job.email ?? ''}`}>✉ Email</a>
              <CopyButton value={job.phone ?? ''} />
            </div>
          </div>

          <div className="sec">
            <span className="lbl">Job details</span>
            <div className="kv">
              <span className="k">Service</span><span className="v">{job.service ?? 'TBD'}</span>
              <span className="k">Description</span><span className="v">{job.description ?? '—'}</span>
              <span className="k">Date</span><span className="v">{job.scheduled_date ? dayTime(job.scheduled_date) : 'TBD'}</span>
              <span className="k">Claimed by</span><span className="v">{job.claimed_by_name ?? '—'}</span>
              {canSeeMoney && (
                <>
                  <span className="k">Price</span>
                  <span className="v" style={{ color: 'var(--won)' }}>{job.price ? fmt(job.price) : '—'}</span>
                </>
              )}
            </div>
          </div>

          {job.claimed_by != null && (
            <div className="sec">
              <span className="lbl">Members</span>
              <div className="kv">
                <span className="k">Pot</span>
                <span className="v">{job.cleaner_amount ? fmt(job.cleaner_amount) : '—'}</span>
                {role === 'cleaner' && (
                  <>
                    <span className="k">Your share</span>
                    <span className="v">{myShare != null ? fmt(myShare) : '—'}</span>
                  </>
                )}
              </div>
              {approvedMembers.map(m => (
                <div className="minirow" style={{ cursor: 'default' }} key={m.id}>
                  <span>{m.cleaner_name}{m.is_owner ? ' ★' : ''}</span>
                  <span>{perHeadShare != null ? fmt(perHeadShare) : '—'}</span>
                </div>
              ))}
              {canDecide && pendingMembers.map(m => (
                <div className="minirow" style={{ cursor: 'default' }} key={m.id}>
                  <span>{m.cleaner_name}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-s" type="button" disabled={pending} onClick={() => decide(m.id, true)}>Approve</button>
                    <button className="btn-s" type="button" disabled={pending} onClick={() => decide(m.id, false)}>Reject</button>
                  </span>
                </div>
              ))}
              {myPending && <p style={{ color: 'var(--muted)', fontSize: 11 }}>Requested · waiting</p>}
              {showRequestJoin && (
                <button className="btn sec" type="button" disabled={pending} onClick={join}>Request to join</button>
              )}
            </div>
          )}

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
              <div className="minirow" {...rowNav(router, `/leads?l=${job.lead_id}`)}>
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
                    style={sel ? { background: jobStatusColor[st], color: 'var(--on-status)', borderColor: 'transparent' } : undefined}
                    onClick={() => change(st)}
                  >
                    {jobStatusLabel[st]}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="form-err" role="alert">{error}</p>}
          <div className="acts">
            {canClaim && (
              <button className="btn-p" type="button" disabled={pending} onClick={claim}>Claim job</button>
            )}
            {canEdit && (
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
                  <CustomerLookup customers={customers} name="customer_id" required />
                ) : (
                  <>
                    <input type="hidden" name="customer_id" value={job!.customer_id} />
                    {job!.customer_name}
                  </>
                )}
              </span>
              <span className="k">Service</span>
              <span className="v">
                <select name="service" required defaultValue={job?.service ?? ''}>
                  <option value="">— select —</option>
                  {job?.service && !SERVICE_TYPES.includes(job.service as never) && (
                    <option value={job.service}>{job.service} (legacy)</option>
                  )}
                  {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </span>
              <span className="k">Date</span>
              <span className="v"><input name="scheduled_date" type="datetime-local" defaultValue={job?.scheduled_date?.slice(0, 16) ?? ''} /></span>
              <span className="k">Price $</span>
              <span className="v"><input name="price" type="number" min={0} step="0.01" defaultValue={job?.price ?? ''} placeholder="0.00" /></span>
              <span className="k">Cleaner pot $</span>
              <span className="v"><input name="cleaner_amount" type="number" step="0.01" className="num" defaultValue={job?.cleaner_amount ?? ''} /></span>
            </div>
          </div>
          <div className="sec">
            <span className="lbl">Description (what exactly to do)</span>
            <textarea name="description" defaultValue={job?.description ?? ''} placeholder="e.g. 22 panes in+out, screens, hard-water treatment on back slider" style={{ width: '100%', minHeight: 70 }} />
          </div>
          {error && <p className="form-err" role="alert">{error}</p>}
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
