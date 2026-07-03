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
