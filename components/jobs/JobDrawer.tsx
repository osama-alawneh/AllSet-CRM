'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import {
  JOB_STATUSES,
  jobStatusLabel,
  jobStatusColor,
  canTransition,
  type Job,
  type JobStatus,
} from '@/lib/jobs';
import type { Role } from '@/lib/auth';
import { claimJob, setJobStatus } from '@/app/(app)/jobs/actions';
import { createInvoiceFromJob } from '@/app/(app)/invoices/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export function JobDrawer({
  job, role, uid, admin,
}: {
  job: Job;
  role: Role;
  uid: string;
  admin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const close = () => router.push('/jobs', { scroll: false });
  const canClaim = job.status === 'unclaimed' && (role === 'admin' || role === 'cleaner');

  const change = (status: JobStatus) => {
    if (status === job.status) return;
    setError(null);
    startTransition(async () => {
      const res = await setJobStatus(job.id, status);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };
  const claim = () => {
    setError(null);
    startTransition(async () => {
      const res = await claimJob(job.id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };
  const createInvoice = () => {
    setError(null);
    startTransition(async () => {
      const res = await createInvoiceFromJob(job.id); // redirects to /invoices?i=<id> on success
      if (res?.error) setError(res.error);
    });
  };

  return (
    <Drawer onClose={close}>
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: jobStatusColor[job.status] }}>
            {jobStatusLabel[job.status]}
          </span>
          <h2>{job.customer_name}</h2>
        </div>
        <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
      </div>
      <div className="lbl" style={{ marginTop: 4 }}>
        JOB #{String(job.id).padStart(4, '0')}
        {job.lead_id != null ? ` · from lead #${String(job.lead_id).padStart(4, '0')}` : ''}
      </div>

      <div className="sec">
        <span className="lbl">Customer</span>
        <div className="minirow" onClick={() => router.push(`/customers?c=${job.customer_id}`, { scroll: false })}>
          <span><b>{job.customer_name}</b> · {job.address ?? '—'}</span>
          <span>→</span>
        </div>
        {job.lead_id != null && (
          <div className="minirow" onClick={() => router.push(`/leads?l=${job.lead_id}`, { scroll: false })}>
            <span>Origin lead #{String(job.lead_id).padStart(4, '0')}</span>
            <span>→</span>
          </div>
        )}
        <div className="qa">
          <a href={`tel:${job.phone ?? ''}`}>📞 Call</a>
          <a href={`sms:${job.phone ?? ''}`}>💬 Text</a>
          <a href={`mailto:${job.email ?? ''}`}>✉ Email</a>
        </div>
      </div>

      <div className="sec">
        <span className="lbl">Job</span>
        <div className="kv">
          <span className="k">Service</span>
          <span className="v">{job.service ?? 'TBD'}</span>
          <span className="k">Date</span>
          <span className="v">{job.scheduled_date ?? 'TBD'}</span>
          <span className="k">Claimed by</span>
          <span className="v">{job.claimed_by_name ?? '—'}</span>
          <span className="k">Price</span>
          {admin ? (
            <span className="v" style={{ color: 'var(--won)' }}>{job.price ? fmt(job.price) : '—'}</span>
          ) : (
            <span className="v money-hidden">•••••</span>
          )}
        </div>
      </div>

      <div className="sec">
        <span className="lbl">Change status</span>
        <div className="statuspick">
          {JOB_STATUSES.map(st => {
            const sel = st === job.status;
            const allowed = sel || canTransition(role, uid, job, st);
            return (
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
            );
          })}
        </div>
      </div>

      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}

      <div className="acts">
        {canClaim && (
          <button className="btn-p" type="button" disabled={pending} onClick={claim}>
            Claim job
          </button>
        )}
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
